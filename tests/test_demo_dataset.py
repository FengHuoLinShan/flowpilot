from conftest import process


def test_run_demo_ingests_real_batch_and_repeated_click_is_idempotent(runtime):
    client, service, settings = runtime
    settings.retry_delay_seconds = 0
    first = client.post('/api/demo/run', json={})
    assert first.status_code == 200, first.text
    report = first.json()
    assert report['accepted'] >= 20
    assert report['duplicates'] >= 1
    assert report['rejected'] >= 1
    assert len(report['results']) >= 20
    for _ in range(report['accepted'] * 4):
        service.tick()
    events = client.get('/api/events?limit=500').json()['items']
    assert len(events) == report['accepted']
    assert all(event['is_test'] is True for event in events)
    states = {event['status'] for event in events}
    assert {'waiting_approval', 'needs_review', 'failed', 'succeeded'} <= states
    assert client.get('/api/outbox').json()['total'] == 0
    second = client.post('/api/demo/run', json={}).json()
    assert second['accepted'] == 0
    assert client.get('/api/events?limit=500').json()['total'] == report['accepted']
