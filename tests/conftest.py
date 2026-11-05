from __future__ import annotations

import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import Settings
from app.main import create_app


@pytest.fixture
def runtime(tmp_path):
    database_url = os.environ.get('FLOWPILOT_TEST_DATABASE_URL')
    management = None
    schema = None
    if database_url:
        url = make_url(database_url)
        if url.drivername not in ('postgresql', 'postgresql+psycopg'):
            raise ValueError('FLOWPILOT_TEST_DATABASE_URL must be a disposable PostgreSQL test database.')
        url = url.set(drivername='postgresql+psycopg')
        schema = 'flowpilot_test_' + uuid4().hex
        management = create_engine(url)
        with management.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        database_url = url.update_query_dict({'options': '-csearch_path=' + schema}).render_as_string(hide_password=False)
    else:
        database_url = f'sqlite:///{tmp_path / "flowpilot.db"}'
    try:
        settings = Settings(database_url=database_url, test_mode=True, llm_provider='fixture', engine='local',
                            allow_faults=True, demo_data_path=str(__import__('pathlib').Path(__file__).resolve().parents[1] / 'data/leads.json'))
        app = create_app(settings)
        with TestClient(app) as client:
            login = client.post('/api/login', json={'password': settings.admin_password})
            assert login.status_code == 200, login.text
            client.headers['X-CSRF-Token'] = login.json()['csrf_token']
            yield client, app.state.services, settings
    finally:
        if management is not None and schema is not None:
            with management.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            management.dispose()


@pytest.fixture
def lead():
    return {
        'name': '陈晓', 'company': '星河制造（虚构）', 'email': 'chen@example.com',
        'phone': '+8613800001234', 'budget': 120000, 'currency': 'CNY',
        'message': '我们需要为 B2B 销售团队部署 CRM 线索自动化和 AI 客服集成。预算 120000 元，希望两周内上线，请提供演示和报价。',
        'is_test': True, 'source': 'form',
    }


def submit(client, payload, key=None):
    response = client.post('/api/events', json=payload,
                           headers={'Idempotency-Key': key} if key else {})
    assert response.status_code in (200, 201, 202), response.text
    return response.json()


def process(client, services, event_id, wanted='waiting_approval', ticks=5):
    for _ in range(ticks):
        services.tick()
        response = client.get(f'/api/events/{event_id}')
        assert response.status_code == 200
        data = response.json()
        if data['status'] == wanted:
            return data
    raise AssertionError(f'Expected {wanted}, got {data["status"]}: {data.get("current_execution")}')


def pending(event):
    return next(x for x in event['approvals'] if x['status'] == 'pending')
