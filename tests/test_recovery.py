from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest

from app.db import Event, Execution, NodeRun, now
from app.errors import FlowError
from conftest import pending, process, submit


@pytest.mark.parametrize('fault,error_code', [
    ('llm_timeout_once', 'MODEL_TIMEOUT'),
    ('llm_rate_limit_once', 'MODEL_RATE_LIMITED'),
    ('crm_failure_once', 'CRM_TEMPORARY_FAILURE'),
])
def test_transient_failure_retries_without_repeating_crm(runtime, lead, fault, error_code):
    client, service, settings = runtime
    settings.retry_delay_seconds = 0
    lead['fault'] = fault
    event_id = submit(client, lead)['event']['id']
    service.tick()
    failed = client.get(f'/api/events/{event_id}').json()
    assert failed['status'] == 'failed'
    assert failed['current_execution']['error_code'] == error_code
    assert client.get('/api/crm/leads').json()['total'] == 0
    event = process(client, service, event_id)
    assert event['current_execution']['attempt'] == 2
    assert client.get('/api/crm/contacts').json()['total'] == 1
    assert client.get('/api/crm/leads').json()['total'] == 1
    assert client.get('/api/crm/tasks').json()['total'] == 1
    assert any(x['action'] == 'step_failed' for x in event['logs'])


def test_invalid_model_json_fails_closed_and_human_correction_resumes(runtime, lead):
    client, service, _ = runtime
    lead['fault'] = 'llm_invalid_json'
    event_id = submit(client, lead)['event']['id']
    service.tick()
    failed = client.get(f'/api/events/{event_id}').json()
    assert failed['status'] == 'failed'
    assert failed['current_execution']['error_code'] == 'MODEL_INVALID_JSON'
    assert client.get('/api/crm/leads').json()['total'] == 0
    assert client.get('/api/approvals').json()['total'] == 0
    response = client.post(f'/api/events/{event_id}/correct', json={
        'fields': {'intent': 'inquiry', 'confidence': 1.0, 'ambiguities': []},
        'reason': '人工核验原始表单后补齐结构化字段'})
    assert response.status_code == 200, response.text
    recovered = process(client, service, event_id)
    assert recovered['status'] == 'waiting_approval'
    assert client.get('/api/crm/leads').json()['total'] == 1


def test_permanent_crm_error_has_bounded_retries_and_manual_retry(runtime, lead):
    client, service, settings = runtime
    settings.retry_delay_seconds = 0
    lead['fault'] = 'crm_failure_always'
    created = submit(client, lead)
    for _ in range(8):
        service.tick()
    event = client.get(f'/api/events/{created["event"]["id"]}').json()
    assert event['status'] == 'failed'
    assert event['current_execution']['attempt'] == settings.max_run_attempts
    assert client.get('/api/crm/leads').json()['total'] == 0
    response = client.post(f'/api/executions/{created["execution"]["id"]}/retry', json={})
    assert response.status_code == 200
    assert response.json()['execution']['attempt'] == settings.max_run_attempts + 1


def test_crash_after_crm_commit_resumes_without_duplicate_mutations(runtime, lead):
    client, service, settings = runtime
    settings.retry_delay_seconds = 0
    created = submit(client, lead)
    event_id, run_id = created['event']['id'], created['execution']['id']
    work = service._take_next()
    native_id = 'interrupted-native-run'
    service.claim(run_id, work['phase'], work['dispatch_token'], native_id)
    for step in ('extract', 'classify', 'crm'):
        service.run_step(run_id, step, work['phase'], work['dispatch_token'], native_id)
    assert client.get('/api/crm/leads').json()['total'] == 1
    with service.db.session() as session, session.begin():
        run = session.get(Execution, run_id)
        run.lease_until = now() - timedelta(seconds=5)
    from app.services import Services
    restarted = Services(settings)
    try:
        event = process(client, restarted, event_id)
        assert event['current_execution']['attempt'] == 2
        assert any(x['action'] == 'execution_recovered' for x in event['logs'])
        assert client.get('/api/crm/leads').json()['total'] == 1
        assert client.get('/api/crm/contacts').json()['total'] == 1
        assert client.get('/api/crm/tasks').json()['total'] == 1
        with pytest.raises(FlowError) as stale:
            restarted.run_step(run_id, 'draft', work['phase'], work['dispatch_token'], native_id)
        assert stale.value.code == 'STALE_DISPATCH'
    finally:
        restarted.close()


def test_direct_delivery_before_approval_is_rejected(runtime, lead):
    client, service, _ = runtime
    created = submit(client, lead)
    work = service._take_next()
    run_id = created['execution']['id']
    service.claim(run_id, 'pipeline', work['dispatch_token'], 'native-test')
    with pytest.raises(FlowError) as error:
        service.run_step(run_id, 'deliver', 'pipeline', work['dispatch_token'], 'native-test')
    assert error.value.code == 'APPROVAL_REQUIRED'
    assert client.get('/api/outbox').json()['total'] == 0


def test_second_native_execution_cannot_take_over_dispatch(runtime, lead):
    client, service, settings = runtime
    settings.engine = 'n8n'
    created = submit(client, lead)
    work = service._take_next()
    run_id = created['execution']['id']
    assert service.claim(run_id, 'pipeline', work['dispatch_token'], 'first-native')['proceed'] is True
    assert service.claim(run_id, 'pipeline', work['dispatch_token'], 'second-native')['proceed'] is False
    with pytest.raises(FlowError) as error:
        service.run_step(run_id, 'extract', 'pipeline', work['dispatch_token'], 'second-native')
    assert error.value.code == 'DUPLICATE_ENGINE_EXECUTION'


def test_parallel_duplicate_events_create_one_durable_execution(runtime, lead):
    client, service, _ = runtime
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _i: service.ingest(lead, 'parallel-same-key'), range(16)))
    assert len({r['event']['id'] for r in results}) == 1
    assert client.get('/api/events').json()['total'] == 1
    assert client.get('/api/executions').json()['total'] == 1


def test_contact_identity_conflict_requires_review_without_overwriting_contact(runtime, lead):
    client, service, _ = runtime
    original = process(client, service, submit(client, lead)['event']['id'])
    original_contact = client.get('/api/crm/contacts').json()['items'][0]
    lead['phone'] = '+8613900005678'
    lead['message'] += ' 同一邮箱，但现在提供了不同的电话号码。'
    second = submit(client, lead)
    review = process(client, service, second['event']['id'], wanted='needs_review')
    assert review['current_execution']['error_code'] == 'CONTACT_PHONE_CONFLICT'
    contacts = client.get('/api/crm/contacts').json()['items']
    assert len(contacts) == 1 and contacts[0]['phone'] == original_contact['phone']
    assert client.get('/api/crm/leads').json()['total'] == 1


def test_public_form_is_real_but_receipt_does_not_disclose_customer_data(runtime, lead):
    client, service, _ = runtime
    client.cookies.clear()
    form = client.get('/api/public/form')
    assert form.status_code == 200 and form.json()['enabled'] is True
    public_payload = {k: v for k, v in lead.items() if k not in ('source', 'is_test')}
    receipt = client.post('/api/public/leads', json=public_payload)
    assert receipt.status_code == 202, receipt.text
    assert receipt.json()['received'] is True
    assert lead['email'] not in receipt.text
    assert 'extraction' not in receipt.text
    assert client.get('/api/events/' + receipt.json()['event_id']).status_code == 401
    service.tick()
    with service.db.session() as session:
        event = session.get(Event, receipt.json()['event_id'])
        assert event.status == 'waiting_approval' and event.is_test is True


def test_public_form_cannot_inject_test_faults(runtime, lead):
    client, _, _ = runtime
    client.cookies.clear()
    public_payload = {k: v for k, v in lead.items() if k not in ('source', 'is_test')}
    public_payload['fault'] = 'llm_invalid_json'
    assert client.post('/api/public/leads', json=public_payload).status_code == 422


def test_public_form_honeypot_and_rate_limit(runtime, lead):
    client, _, _ = runtime
    client.cookies.clear()
    public_payload = {k: v for k, v in lead.items() if k not in ('source', 'is_test')}
    assert client.post('/api/public/leads', json={**public_payload, 'website': 'spam.invalid'}).status_code == 400
    for _ in range(9):
        assert client.post('/api/public/leads', json=public_payload).status_code == 202
    assert client.post('/api/public/leads', json=public_payload).status_code == 429
