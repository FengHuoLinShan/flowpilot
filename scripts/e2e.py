#!/usr/bin/env python3
"""A real HTTP journey against a running FlowPilot deployment.

No services are mocked by this script. The configured provider/engine are recorded
in the report so a fixture run cannot be mistaken for a real LLM acceptance run.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://localhost:8080')
    parser.add_argument('--report', default='artifacts/http-e2e.json')
    parser.add_argument('--timeout', type=float, default=240)
    parser.add_argument('--require-live-model', action='store_true')
    parser.add_argument('--require-n8n', action='store_true')
    args = parser.parse_args()
    password = os.environ.get('FLOWPILOT_ADMIN_PASSWORD')
    if not password:
        print('Set FLOWPILOT_ADMIN_PASSWORD in the process environment. No password is printed.')
        return 2
    report: dict = {'started_at': datetime.now(timezone.utc).isoformat(), 'checks': [], 'passed': False}
    client = httpx.Client(base_url=args.base_url, timeout=60)

    def request(method: str, path: str, **kwargs):
        response = client.request(method, path, **kwargs)
        if response.status_code >= 400:
            raise AssertionError(f'{method} {path}: HTTP {response.status_code}')
        return response.json()

    def check(name, condition, **data):
        report['checks'].append({'name': name, 'passed': bool(condition), **data})
        if not condition:
            raise AssertionError(name)

    def wait_event(event_id, expected):
        deadline = time.monotonic() + args.timeout
        while time.monotonic() < deadline:
            event = request('GET', f'/api/events/{event_id}')
            if event['status'] in expected:
                return event
            if event['status'] in {'failed', 'needs_review', 'rejected'}:
                raise AssertionError(f'Unexpected event state: {event["status"]}; inspect event {event_id}')
            time.sleep(0.5)
        raise AssertionError(f'Timed out waiting for event {event_id}')

    try:
        session = request('POST', '/api/login', json={'password': password})
        client.headers['X-CSRF-Token'] = session['csrf_token']
        settings = request('GET', '/api/settings')
        report['runtime'] = {k: settings.get(k) for k in ('engine', 'llm_provider', 'llm_model', 'test_mode')}
        if args.require_live_model:
            check('live_model_required', settings['llm_provider'] not in {'fixture', 'mock', 'disabled'})
        if args.require_n8n:
            check('n8n_required', settings['engine'] == 'n8n')
        nonce = uuid.uuid4().hex[:12]
        payload = {'name': '陈晨', 'company': '星河制造（虚构）',
                   'email': f'e2e-{nonce}@example.com', 'phone': '+86 13800001234',
                   'message': '我们是一家 B2B 制造企业，需要 CRM 销售线索自动化和 AI 客服集成。'
                              '预算为 120000 人民币，希望两周内启动，请安排方案演示。',
                   'budget': 120000, 'currency': 'CNY', 'source': 'api', 'is_test': True}
        key = f'e2e-{nonce}'
        initial = request('POST', '/api/events', json=payload, headers={'Idempotency-Key': key})
        event_id = initial['event']['id']
        report['event_id'] = event_id
        duplicate = request('POST', '/api/events', json=payload, headers={'Idempotency-Key': key})
        check('same_event_deduplicated', duplicate['duplicate'] and duplicate['event']['id'] == event_id)
        event = wait_event(event_id, {'waiting_approval'})
        check('crm_persisted', bool(event['crm_changes']))
        check('structured_extraction', isinstance(event['extraction'], dict) and bool(event['extraction']))
        check('rule_reasons_recorded', bool(event['classification']))
        execution = request('GET', f'/api/executions/{event["current_execution"]["id"]}')
        check('node_history_persisted', len(execution['nodes']) >= 4)
        if args.require_n8n:
            check('real_n8n_execution_id', bool(execution.get('n8n_execution_id')))
        approval = next(a for a in event['approvals'] if a['status'] == 'pending')
        outbox_before = request('GET', '/api/outbox')['items']
        check('nothing_sent_before_approval', not any(x['event_id'] == event_id for x in outbox_before))
        edited = request('PATCH', f'/api/approvals/{approval["id"]}', json={
            'expected_version': approval['version'], 'subject': f'FlowPilot 验收 {nonce}',
            'body': approval['body'] + '\n\n（此邮件由人工验收流程确认，仅保存到测试发件箱。）'})
        approval = edited.get('approval', edited)
        decision = {'decision': 'approve', 'expected_version': approval['version'], 'delivery_mode': 'test'}
        request('POST', f'/api/approvals/{approval["id"]}/decision', json=decision)
        repeat = client.post(f'/api/approvals/{approval["id"]}/decision', json=decision)
        check('repeat_approval_safe', repeat.status_code in (200, 409))
        event = wait_event(event_id, {'succeeded'})
        messages = [x for x in request('GET', '/api/outbox')['items'] if x['event_id'] == event_id]
        check('exactly_one_test_message', len(messages) == 1 and messages[0]['mode'] == 'test')
        check('edited_draft_delivered', messages[0]['subject'] == f'FlowPilot 验收 {nonce}')
        if args.require_n8n:
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                native = request('GET', f'/api/executions/{event["current_execution"]["id"]}')
                if native.get('n8n_status') == 'success':
                    break
                time.sleep(.5)
            check('native_n8n_success_observed', native.get('n8n_status') == 'success')
        # A new request from the same contact must create a new business event,
        # while matching the previously persisted contact.
        payload['message'] += ' 另外请报价第二个销售团队的部署。'
        second = request('POST', '/api/events', json=payload, headers={'Idempotency-Key': key + '-second'})
        second_id = second['event']['id']
        next_event = wait_event(second_id, {'waiting_approval'})
        contacts = request('GET', '/api/crm/contacts')['items']
        check('same_contact_matched', sum(c['email'] == payload['email'] for c in contacts) == 1)
        reject = next(a for a in next_event['approvals'] if a['status'] == 'pending')
        request('POST', f'/api/approvals/{reject["id"]}/decision', json={
            'decision': 'reject', 'expected_version': reject['version'], 'reason': '验收拒绝分支'})
        rejected = request('GET', f'/api/events/{second_id}')
        check('rejection_recorded', rejected['status'] == 'rejected')
        check('rejection_sends_nothing', not any(x['event_id'] == second_id for x in request('GET', '/api/outbox')['items']))
        report['passed'] = True
    except Exception as exc:
        report['error'] = f'{type(exc).__name__}: {exc}'
    finally:
        client.close()
        report['finished_at'] = datetime.now(timezone.utc).isoformat()
        destination = Path(args.report)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
