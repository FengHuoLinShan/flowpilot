"""Concurrency and interruption regressions for irreversible-action invariants.

These use actual application transactions and the explicitly labelled fixture
model. They do not claim to validate model quality or external SMTP delivery.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import threading

from sqlalchemy import select

from app.db import Execution, now
from app.errors import FlowError
from app.services import Services
from conftest import pending, process, submit


def simultaneous(*operations):
    gate = threading.Barrier(len(operations))

    def invoke(operation):
        gate.wait(timeout=10)
        try:
            return "ok", operation()
        except FlowError as error:
            return "rejected", error

    with ThreadPoolExecutor(max_workers=len(operations)) as pool:
        futures = [pool.submit(invoke, operation) for operation in operations]
        return [future.result(timeout=30) for future in futures]


def test_correction_racing_approval_has_one_authoritative_outcome(runtime, lead):
    client, service, _ = runtime
    event = process(client, service, submit(client, lead)["event"]["id"])
    approval = pending(event)
    results = simultaneous(
        lambda: service.correct_event(event["id"], {"name": "人工复核后的联系人"}, "电话核实了联系人姓名"),
        lambda: service.decide_approval(approval["id"], {
            "decision": "approve", "expected_version": approval["version"], "delivery_mode": "test"}),
    )
    assert [result[0] for result in results].count("ok") == 1
    rejected = next(value for status, value in results if status == "rejected")
    assert rejected.status == 409
    service.tick()
    current = service.event_detail(event["id"])
    original = next(item for item in current["approvals"] if item["id"] == approval["id"])
    if results[0][0] == "ok":
        assert original["status"] == "invalidated"
        assert current["current_execution_id"] != event["current_execution_id"]
        assert current["status"] == "waiting_approval"
        assert service.list_outbox()["total"] == 0
    else:
        assert original["status"] == "test_saved"
        assert current["current_execution_id"] == event["current_execution_id"]
        assert current["status"] == "succeeded"
        assert service.list_outbox()["total"] == 1


def test_concurrent_draft_edits_use_compare_and_set(runtime, lead):
    client, service, _ = runtime
    approval = pending(process(client, service, submit(client, lead)["event"]["id"]))
    edits = [
        {"subject": "Reviewed by operator A", "body": "Operator A reviewed and approved this detailed draft for later consideration.", "expected_version": approval["version"]},
        {"subject": "Reviewed by operator B", "body": "Operator B made a different proposed change to this email draft for consideration.", "expected_version": approval["version"]},
    ]
    results = simultaneous(*(lambda values=values: service.edit_approval(approval["id"], values) for values in edits))
    assert [result[0] for result in results].count("ok") == 1
    winner = next(index for index, result in enumerate(results) if result[0] == "ok")
    stored = next(item for item in service.list_approvals()["items"] if item["id"] == approval["id"])
    assert stored["version"] == approval["version"] + 1
    assert stored["subject"] == edits[winner]["subject"]
    assert stored["body"] == edits[winner]["body"]
    assert stored["status"] == "pending"
    assert service.list_outbox()["total"] == 0


def test_distinct_events_for_one_contact_can_process_concurrently(runtime, lead):
    client, service, settings = runtime
    settings.retry_delay_seconds = 0
    first = submit(client, lead)["event"]["id"]
    second = submit(client, {**lead, "message": lead["message"] + " 这是第二个独立部门的项目需求。"})["event"]["id"]
    second_worker = Services(settings)
    try:
        results = simultaneous(service.tick, second_worker.tick)
        assert all(status == "ok" for status, _ in results)
        for _ in range(12):
            service.tick()
            second_worker.tick()
            if all(service.event_detail(event_id)["status"] == "waiting_approval" for event_id in [first, second]):
                break
        assert all(service.event_detail(event_id)["status"] == "waiting_approval" for event_id in [first, second])
        assert service.list_crm("contacts")["total"] == 1
        assert service.list_crm("companies")["total"] == 1
        assert service.list_crm("leads")["total"] == 2
        assert service.list_crm("tasks")["total"] == 2
        assert service.list_approvals(status="pending")["total"] == 2
        assert service.list_outbox()["total"] == 0
    finally:
        second_worker.close()


def test_restart_after_approved_side_effect_does_not_repeat_delivery(runtime, lead):
    client, service, settings = runtime
    settings.retry_delay_seconds = 0
    event = process(client, service, submit(client, lead)["event"]["id"])
    approval = pending(event)
    service.decide_approval(approval["id"], {"decision": "approve", "expected_version": approval["version"], "delivery_mode": "test"})
    job = service._take_next()
    service.claim(job["run_id"], job["phase"], job["dispatch_token"], "interrupted-test-worker")
    service.run_step(job["run_id"], "deliver", job["phase"], job["dispatch_token"], "interrupted-test-worker")
    original_message = service.list_outbox()["items"][0]
    # Simulate the worker disappearing after the durable side effect but before
    # the finish node, then start a new service instance against the same DB.
    with service.db.session() as session, session.begin():
        run = session.get(Execution, job["run_id"])
        run.lease_until = now() - timedelta(seconds=1)
    restarted = Services(settings)
    try:
        assert restarted.recover_stale() == 1
        restarted.tick()
        final = restarted.event_detail(event["id"])
        assert final["status"] == "succeeded"
        messages = restarted.list_outbox()["items"]
        assert len(messages) == 1
        assert messages[0]["id"] == original_message["id"]
        assert messages[0]["message_id"] == original_message["message_id"]
        assert len([log for log in final["logs"] if log["action"] == "test_outbox_saved"]) == 1
    finally:
        restarted.close()
