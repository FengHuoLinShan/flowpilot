import json

import pytest

from conftest import submit


def test_admin_endpoints_require_authentication(runtime):
    client, _, _ = runtime
    client.cookies.clear()
    for path in ('/api/events', '/api/crm/contacts', '/api/settings', '/api/approvals', '/api/outbox'):
        assert client.get(path).status_code in (401, 403)


def test_mutation_requires_csrf_token(runtime, lead):
    client, _, _ = runtime
    del client.headers['X-CSRF-Token']
    assert client.post('/api/events', json=lead).status_code == 403


def test_cross_origin_write_is_blocked(runtime, lead):
    client, _, _ = runtime
    response = client.post('/api/events', json=lead, headers={'Origin': 'https://attacker.invalid'})
    assert response.status_code == 403


def test_webhook_authentication(runtime, lead):
    client, _, settings = runtime
    assert client.post('/api/webhooks/leads', json=lead).status_code in (401, 403)
    assert client.post('/api/webhooks/leads', json=lead, headers={'X-Webhook-Key': 'wrong'}).status_code in (401, 403)
    response = client.post('/api/webhooks/leads', json=lead, headers={'X-Webhook-Key': settings.webhook_key})
    assert response.status_code in (200, 201, 202), response.text


@pytest.mark.parametrize('changes', [
    {'email': 'not-an-email'}, {'message': ''}, {'budget': -1},
    {'currency': 'INVALID'}, {'message': 'x' * 100001},
])
def test_invalid_payload_never_creates_crm(runtime, lead, changes):
    client, service, _ = runtime
    lead.update(changes)
    response = client.post('/api/events', json=lead)
    assert response.status_code == 422, response.text
    service.tick()
    assert client.get('/api/crm/contacts').json()['total'] == 0


def test_csv_mixed_valid_and_invalid_rows(runtime):
    client, service, _ = runtime
    csv = ('name,company,email,message,budget,currency\n'
           'Alice,Example Manufacturing,alice@example.com,Need CRM automation for our sales team,50000,CNY\n'
           'Bob,Other,bad-email,Need a proposal,30000,CNY\n')
    response = client.post('/api/import/csv', files={'file': ('leads.csv', csv.encode(), 'text/csv')},
                           data={'is_test': 'true'})
    assert response.status_code == 200, response.text
    assert response.json()['accepted'] == 1
    assert response.json()['rejected'] == 1


def test_settings_do_not_return_secrets(runtime):
    client, _, settings = runtime
    response = client.get('/api/settings')
    assert response.status_code == 200
    text = response.text
    for secret in (settings.admin_password, settings.internal_key, settings.webhook_key, settings.session_secret):
        assert secret not in text
    updated = client.patch('/api/settings', json={'llm_api_key': 'never-return-this-test-key'})
    assert updated.status_code == 200, updated.text
    assert 'never-return-this-test-key' not in updated.text
    assert 'never-return-this-test-key' not in client.get('/api/settings').text


def test_internal_endpoint_requires_independent_auth(runtime, lead):
    client, _, _ = runtime
    execution_id = submit(client, lead)['execution']['id']
    for step in ('claim', 'steps/deliver', 'failure'):
        response = client.post(f'/api/internal/executions/{execution_id}/{step}', json={
            'dispatch_token': 'guessed', 'n8n_execution_id': '1', 'phase': 'delivery'})
        assert response.status_code in (401, 403)


def test_stale_dispatch_cannot_claim_work(runtime, lead):
    client, _, settings = runtime
    execution_id = submit(client, lead)['execution']['id']
    response = client.post(f'/api/internal/executions/{execution_id}/claim', json={
        'dispatch_token': 'stale-token', 'n8n_execution_id': '1', 'phase': 'pipeline'},
        headers={'X-FlowPilot-Internal': settings.internal_key})
    assert response.status_code in (403, 409)


def test_fault_injection_rejected_for_real_events(runtime, lead):
    client, _, _ = runtime
    lead.update(is_test=False, fault='crm_failure_once')
    response = client.post('/api/events', json=lead)
    assert response.status_code in (400, 403, 422)

