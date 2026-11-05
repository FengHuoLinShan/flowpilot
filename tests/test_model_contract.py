"""Real HTTP protocol tests against an explicitly artificial local model service.

These test provider integration and validation, never model quality.
"""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading

import pytest

from app.config import Settings
from app.errors import FlowError
from app.llm import LLMClient
from app.rules import classify
from app.schemas import Extraction


FACTS = {'name': 'Alice', 'company': 'Example Manufacturing', 'email': 'alice@example.com',
         'phone': None, 'requirement': 'CRM automation for a B2B sales department',
         'budget': 120000, 'currency': 'CNY', 'intent': 'inquiry', 'timeline': None,
         'urgency': 'normal', 'confidence': 0.95, 'ambiguities': []}


@contextmanager
def provider_server(replies):
    recorded = []
    sequence = list(replies)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            raw = self.rfile.read(int(self.headers.get('Content-Length', '0')))
            recorded.append({'path': self.path, 'body': json.loads(raw)})
            status, payload = sequence.pop(0) if sequence else (500, {'error': 'No further fixture response'})
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            return

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}', recorded
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=2)


def ollama_reply(facts=FACTS):
    return {'message': {'content': json.dumps(facts)}}


def test_ollama_calls_real_http_and_passes_json_schema():
    with provider_server([(200, ollama_reply())]) as (url, recorded):
        client = LLMClient(Settings(llm_provider='ollama', llm_base_url=url, llm_model='protocol-test'))
        result = client._call(Extraction, {'task': 'extract_lead'})
    assert result.name == 'Alice'
    assert recorded[0]['path'] == '/api/chat'
    schema = recorded[0]['body']['format']
    assert schema['additionalProperties'] is False
    assert set(schema['required']) == set(schema['properties'])
    assert recorded[0]['body']['stream'] is False


def test_openai_compatible_transport_uses_structured_output():
    envelope = {'choices': [{'message': {'content': json.dumps(FACTS)}}]}
    with provider_server([(200, envelope)]) as (url, recorded):
        client = LLMClient(Settings(llm_provider='openai_compatible', llm_base_url=url + '/v1',
                                    llm_api_key='local-protocol-fixture-only', llm_model='protocol-test'))
        result = client._call(Extraction, {'task': 'extract_lead'})
    assert result.email == 'alice@example.com'
    assert recorded[0]['path'] == '/v1/chat/completions'
    assert recorded[0]['body']['response_format']['json_schema']['strict'] is True


@pytest.mark.parametrize('content', ['not JSON', '{"name":', json.dumps({**FACTS, 'confidence': 7}),
                                   json.dumps({**FACTS, 'approval': 'approved', 'priority': 'high'})])
def test_illegal_model_output_never_becomes_a_valid_extraction(content):
    with provider_server([(200, {'message': {'content': content}})]) as (url, _):
        client = LLMClient(Settings(llm_provider='ollama', llm_base_url=url, llm_model='protocol-test'))
        with pytest.raises(FlowError) as error:
            client._call(Extraction, {'task': 'extract_lead'})
    assert error.value.code == 'MODEL_INVALID_JSON'


def test_rate_limit_is_retried_then_succeeds():
    with provider_server([(429, {'error': 'Rate limited'}), (200, ollama_reply())]) as (url, recorded):
        client = LLMClient(Settings(llm_provider='ollama', llm_base_url=url,
                                    llm_model='protocol-test', llm_max_retries=1))
        result = client._call(Extraction, {'task': 'extract_lead'})
    assert result.budget == 120000
    assert len(recorded) == 2


def test_retries_are_bounded_and_provider_error_body_is_sanitized():
    with provider_server([(503, {'secret': 'provider-body-must-not-leak'})] * 2) as (url, recorded):
        client = LLMClient(Settings(llm_provider='ollama', llm_base_url=url,
                                    llm_model='protocol-test', llm_max_retries=1))
        with pytest.raises(FlowError) as error:
            client._call(Extraction, {'task': 'extract_lead'})
    assert len(recorded) == 2
    assert error.value.retryable is True
    assert 'provider-body-must-not-leak' not in str(error.value)


def test_bad_model_credentials_are_not_retried():
    with provider_server([(401, {'error': 'sensitive-provider-message'})]) as (url, recorded):
        client = LLMClient(Settings(llm_provider='ollama', llm_base_url=url,
                                    llm_model='protocol-test', llm_max_retries=3))
        with pytest.raises(FlowError) as error:
            client._call(Extraction, {'task': 'extract_lead'})
    assert error.value.code == 'MODEL_AUTH_FAILED'
    assert len(recorded) == 1
    assert 'sensitive-provider-message' not in error.value.message


def test_explicit_form_values_override_model_guesses():
    with provider_server([(200, ollama_reply())]) as (url, _):
        client = LLMClient(Settings(llm_provider='ollama', llm_base_url=url, llm_model='protocol-test'))
        result = client.extract({'name': 'Verified Name', 'email': 'verified@example.com',
                                 'company': 'Verified Company', 'budget': 3000, 'currency': 'USD',
                                 'message': 'Our name and contact details are in the submitted form.'}, attempt=1)
    assert result.name == 'Verified Name'
    assert result.email == 'verified@example.com'
    assert result.budget == 3000 and result.currency == 'USD'


def test_rules_use_fixed_per_currency_thresholds():
    high = classify(Extraction.model_validate(FACTS))
    normal = classify(Extraction.model_validate({**FACTS, 'budget': 10000, 'currency': 'USD'}))
    assert high['priority'] == 'high'
    assert normal['priority'] == 'normal'
    assert high['policy_version'] and high['reasons']
    assert high['rules']['external_send_requires_human'] is True


def test_low_confidence_and_unknown_intent_always_require_review():
    decision = classify(Extraction.model_validate({**FACTS, 'confidence': 0.2, 'intent': 'unknown'}))
    assert decision['needs_review'] is True
    assert len(decision['review_reasons']) >= 2
