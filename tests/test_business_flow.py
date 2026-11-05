"""Application integration tests; fixture model outputs are explicitly not live LLM evidence."""
import pytest

from conftest import pending, process, submit


@pytest.mark.integration
def test_submit_crm_edit_approve_and_exactly_one_outbox(runtime, lead):
    client, service, _ = runtime
    initial = submit(client, lead, 'journey-1')
    event_id = initial['event']['id']
    event = process(client, service, event_id)
    assert event['extraction'] and event['classification'] and event['crm_changes']
    assert len(client.get('/api/crm/contacts').json()['items']) == 1
    assert len(client.get('/api/crm/leads').json()['items']) == 1
    assert len(client.get('/api/crm/tasks').json()['items']) == 1
    assert client.get('/api/outbox').json()['total'] == 0
    approval = pending(event)
    edited = client.patch(f'/api/approvals/{approval["id"]}', json={
        'expected_version': approval['version'], 'subject': '人工确认后的主题',
        'body': '这是一封已审核的测试邮件，仅用于内部端到端自动化验收。'})
    assert edited.status_code == 200, edited.text
    a = edited.json().get('approval', edited.json())
    decision = {'decision': 'approve', 'expected_version': a['version'], 'delivery_mode': 'test'}
    first = client.post(f'/api/approvals/{a["id"]}/decision', json=decision)
    assert first.status_code == 200, first.text
    process(client, service, event_id, wanted='succeeded')
    again = client.post(f'/api/approvals/{a["id"]}/decision', json=decision)
    assert again.status_code in (200, 409)
    service.tick()
    messages = client.get('/api/outbox').json()['items']
    assert len(messages) == 1
    assert messages[0]['mode'] == 'test'
    assert messages[0]['subject'] == '人工确认后的主题'
    assert messages[0]['body'] == '这是一封已审核的测试邮件，仅用于内部端到端自动化验收。'


def test_same_event_key_and_fingerprint_are_idempotent(runtime, lead):
    client, service, _ = runtime
    first = submit(client, lead, 'one')
    second = submit(client, lead, 'one')
    other_key = submit(client, lead, 'another-key')
    assert second['duplicate'] and other_key['duplicate']
    assert first['event']['id'] == second['event']['id'] == other_key['event']['id']
    process(client, service, first['event']['id'])
    assert client.get('/api/crm/leads').json()['total'] == 1


def test_same_key_different_payload_is_conflict(runtime, lead):
    client, _, _ = runtime
    submit(client, lead, 'one')
    lead['message'] += ' 额外的订单内容。'
    response = client.post('/api/events', json=lead, headers={'Idempotency-Key': 'one'})
    assert response.status_code == 409


def test_same_contact_new_requirement_matches_contact(runtime, lead):
    client, service, _ = runtime
    first = submit(client, lead)
    process(client, service, first['event']['id'])
    lead['message'] += ' 这是第二次独立咨询，需要再增加一个仓库的 CRM 集成。'
    second = submit(client, lead)
    assert second['event']['id'] != first['event']['id']
    process(client, service, second['event']['id'])
    assert client.get('/api/crm/contacts').json()['total'] == 1
    assert client.get('/api/crm/leads').json()['total'] == 2


def test_rejection_records_decision_and_never_sends(runtime, lead):
    client, service, _ = runtime
    event = process(client, service, submit(client, lead)['event']['id'])
    a = pending(event)
    response = client.post(f'/api/approvals/{a["id"]}/decision', json={
        'decision': 'reject', 'expected_version': a['version'], 'reason': '资料仍需核实'})
    assert response.status_code == 200, response.text
    service.tick()
    current = client.get(f'/api/events/{event["id"]}').json()
    assert current['status'] == 'rejected'
    assert current['approvals'][0]['decision_reason'] == '资料仍需核实'
    assert client.get('/api/outbox').json()['total'] == 0


def test_save_draft_has_no_delivery(runtime, lead):
    client, service, _ = runtime
    event = process(client, service, submit(client, lead)['event']['id'])
    a = pending(event)
    response = client.post(f'/api/approvals/{a["id"]}/decision', json={
        'decision': 'save', 'expected_version': a['version']})
    assert response.status_code == 200, response.text
    service.tick()
    assert client.get('/api/outbox').json()['total'] == 0
    assert client.get(f'/api/events/{event["id"]}').json()['status'] == 'succeeded'


def test_stale_draft_edit_is_rejected(runtime, lead):
    client, service, _ = runtime
    event = process(client, service, submit(client, lead)['event']['id'])
    a = pending(event)
    edit = {'expected_version': a['version'], 'subject': 'Version 2', 'body': 'A reviewed message with enough useful detail.'}
    assert client.patch(f'/api/approvals/{a["id"]}', json=edit).status_code == 200
    stale = client.patch(f'/api/approvals/{a["id"]}', json=edit)
    assert stale.status_code == 409
    stale_approve = client.post(f'/api/approvals/{a["id"]}/decision', json={
        'decision': 'approve', 'expected_version': a['version']})
    assert stale_approve.status_code == 409


def test_approved_draft_cannot_be_modified(runtime, lead):
    client, service, _ = runtime
    a = pending(process(client, service, submit(client, lead)['event']['id']))
    response = client.post(f'/api/approvals/{a["id"]}/decision', json={
        'decision': 'approve', 'expected_version': a['version']})
    assert response.status_code == 200
    changed = client.patch(f'/api/approvals/{a["id"]}', json={
        'expected_version': a['version'], 'subject': 'Changed after approval', 'body': 'A changed message that was never approved by the reviewer.'})
    assert changed.status_code == 409


def test_test_event_can_never_send_through_smtp(runtime, lead):
    client, service, _ = runtime
    a = pending(process(client, service, submit(client, lead)['event']['id']))
    response = client.post(f'/api/approvals/{a["id"]}/decision', json={
        'decision': 'approve', 'expected_version': a['version'],
        'delivery_mode': 'smtp', 'authorize_external_send': True})
    assert response.status_code in (400, 403, 409, 422)
    assert client.get('/api/outbox').json()['total'] == 0


def test_missing_contact_goes_to_review_and_can_be_corrected(runtime, lead):
    client, service, _ = runtime
    lead.update(name=None, email=None, phone=None)
    event = process(client, service, submit(client, lead)['event']['id'], wanted='needs_review')
    assert client.get('/api/crm/contacts').json()['total'] == 0
    corrected = client.post(f'/api/events/{event["id"]}/correct', json={
        'fields': {'name': '已确认联系人', 'email': 'verified@example.com', 'phone': '+8613800099999',
                   'confidence': 1, 'ambiguities': []}, 'reason': '客户补充了联系人信息'})
    assert corrected.status_code == 200, corrected.text
    updated = process(client, service, event['id'])
    assert updated['extraction']['email'] == 'verified@example.com'
    assert len(updated['executions']) >= 2


def test_crm_lead_and_task_updates_are_persistent(runtime, lead):
    client, service, _ = runtime
    process(client, service, submit(client, lead)['event']['id'])
    record = client.get('/api/crm/leads').json()['items'][0]
    response = client.patch(f'/api/crm/leads/{record["id"]}', json={'status': 'qualified', 'owner': '销售一组'})
    assert response.status_code == 200
    updated = client.get('/api/crm/leads').json()['items'][0]
    assert updated['status'] == 'qualified' and updated['owner'] == '销售一组'
    task = client.get('/api/crm/tasks').json()['items'][0]
    assert client.patch(f'/api/crm/tasks/{task["id"]}', json={'status': 'done'}).status_code == 200
    assert client.get('/api/crm/tasks').json()['items'][0]['status'] == 'done'


def test_restart_preserves_queued_work_and_history(runtime, lead):
    from app.services import Services
    client, _, settings = runtime
    event_id = submit(client, lead)['event']['id']
    recovered_service = Services(settings)
    event = process(client, recovered_service, event_id)
    assert event['status'] == 'waiting_approval'
    detail = client.get(f'/api/executions/{event["current_execution"]["id"]}').json()
    assert len(detail['nodes']) >= 4
    assert all(n['status'] == 'succeeded' for n in detail['nodes'])
