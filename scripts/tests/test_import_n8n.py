"""Deployment-helper checks with a controlled Docker CLI, not a container test."""
from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location('flowpilot_import_n8n', SCRIPTS / 'import-n8n.py')
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)
TEST_KEY = 'synthetic-internal-key-for-import-unit-tests'


class Clock:
    value = 0.0

    def monotonic(self):
        return self.value

    def sleep(self, seconds):
        self.value += seconds


def command_kind(command):
    for marker, name in [('publish:workflow', 'publish'), ('import:workflow', 'workflow'),
                         ('import:credentials', 'credential'), ('restart', 'restart'),
                         ('rm', 'cleanup'), ('node', 'probe'), ('cp', 'copy')]:
        if marker in command:
            return name
    return 'write'


class ImportActivationTests(unittest.TestCase):
    def invoke(self, behavior):
        calls = []
        clock = Clock()
        output = io.StringIO()

        def controlled_cli(command, **kwargs):
            kind = command_kind(command)
            calls.append((kind, command, kwargs))
            self.assertGreater(kwargs['timeout'], 0)
            self.assertNotIn(TEST_KEY, ' '.join(command))
            return behavior(kind, command, kwargs, calls)

        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'deployment.env'
            config.write_text('FLOWPILOT_INTERNAL_KEY="' + TEST_KEY + '"\n')
            with patch.object(IMPORTER.subprocess, 'run', side_effect=controlled_cli), \
                    patch.object(IMPORTER.time, 'monotonic', side_effect=clock.monotonic), \
                    patch.object(IMPORTER.time, 'sleep', side_effect=clock.sleep), \
                    redirect_stdout(output), redirect_stderr(output):
                code = IMPORTER.main(['--env-file', str(config), '--ready-timeout', '5'])
        return code, output.getvalue(), calls, clock.value

    @staticmethod
    def ok(command, stdout=b''):
        return subprocess.CompletedProcess(command, 0, stdout, b'')

    def test_success_requires_cleanup_restart_and_actual_probe_marker(self):
        def behavior(kind, command, kwargs, calls):
            if kind == 'probe':
                if sum(c[0] == 'probe' for c in calls) == 1:
                    return subprocess.CompletedProcess(command, 1, b'', b'FLOWPILOT_WEBHOOK_NOT_READY\n')
                return self.ok(command, IMPORTER.READY_MARKER + b'\n')
            return self.ok(command)

        code, output, calls, elapsed = self.invoke(behavior)
        kinds = [c[0] for c in calls]
        self.assertEqual(code, 0)
        self.assertEqual(kinds, ['write', 'copy', 'credential', 'workflow', 'publish',
                                 'cleanup', 'restart', 'probe', 'probe'])
        self.assertIn('verified active', output)
        self.assertNotIn(TEST_KEY, output)
        self.assertEqual(elapsed, 2)
        credential = json.loads(calls[0][2]['input'])
        self.assertEqual(credential[0]['data']['value'], TEST_KEY)
        self.assertTrue(all(c[2]['input'] is None for c in calls[1:]))
        self.assertIn('--no-deps', calls[6][1])
        self.assertEqual(calls[6][1][-1], 'n8n')

    def test_cleanup_failure_prevents_restart_and_success(self):
        def behavior(kind, command, _kwargs, _calls):
            return subprocess.CompletedProcess(command, 1 if kind == 'cleanup' else 0, b'', b'')

        code, output, calls, _ = self.invoke(behavior)
        self.assertEqual(code, 1)
        self.assertNotIn('restart', [c[0] for c in calls])
        self.assertNotIn('probe', [c[0] for c in calls])
        self.assertNotIn('verified active', output)
        self.assertIn('cleanup was not confirmed', output)
        self.assertIn('rm -f /tmp/flowpilot-credentials-', output)

    def test_restart_timeout_is_nonzero_and_has_recovery_commands(self):
        def behavior(kind, command, kwargs, _calls):
            if kind == 'restart':
                raise subprocess.TimeoutExpired(command, kwargs['timeout'])
            return self.ok(command)

        code, output, calls, _ = self.invoke(behavior)
        self.assertEqual(code, 1)
        self.assertNotIn('probe', [c[0] for c in calls])
        self.assertIn('Activation failed during n8n restart', output)
        self.assertIn('logs --tail 60 n8n', output)
        self.assertIn('restart --no-deps --timeout 30 n8n', output)
        self.assertNotIn('verified active', output)

    def test_registration_wait_is_bounded_and_empty_success_is_not_ready(self):
        code, output, calls, elapsed = self.invoke(lambda _kind, command, _kwargs, _calls: self.ok(command))
        self.assertEqual(code, 1)
        self.assertEqual(elapsed, 5)
        self.assertEqual(sum(c[0] == 'probe' for c in calls), 3)
        self.assertIn('did not become ready within the deadline', output)
        self.assertNotIn('verified active', output)

    def test_publish_failure_cleans_up_and_redacts_credentials(self):
        def behavior(kind, command, _kwargs, _calls):
            if kind == 'publish':
                return subprocess.CompletedProcess(command, 1, b'', ('synthetic CLI error ' + TEST_KEY).encode())
            return self.ok(command)

        code, output, calls, _ = self.invoke(behavior)
        self.assertEqual(code, 1)
        self.assertEqual(calls[-1][0], 'cleanup')
        self.assertNotIn('restart', [c[0] for c in calls])
        self.assertIn('[REDACTED]', output)
        self.assertNotIn(TEST_KEY, output)

    def test_probe_accepts_only_custom_trigger_unauthorized_response(self):
        # Execute the shipped probe JavaScript against a controlled fetch response.
        # No browser, network request, Docker container or real key is involved.
        for status, payload, expected in [
            (401, {'error': 'UNAUTHORIZED'}, 0),
            (401, {'error': 'OTHER_LOGIN_WALL'}, 1),
            (404, {'error': 'UNAUTHORIZED'}, 1),
            (200, {'error': 'UNAUTHORIZED'}, 1),
        ]:
            with self.subTest(status=status, payload=payload):
                fixture = (
                    "globalThis.fetch = async (url, options) => {"
                    "if (url !== 'http://127.0.0.1:5678/webhook/flowpilot' || "
                    "options.method !== 'POST' || options.body !== '{}' || "
                    "JSON.stringify(options.headers) !== JSON.stringify({'Content-Type':'application/json'})) "
                    "throw new Error('Probe was not credential-free');"
                    f"return {{status:{status}, json:async()=>({json.dumps(payload)})}};"
                    "};\n"
                )
                result = subprocess.run(['node', '-e', fixture + IMPORTER.REGISTRATION_PROBE],
                                        capture_output=True, timeout=8)
                self.assertEqual(result.returncode, expected, result.stderr.decode())
                self.assertEqual(IMPORTER.READY_MARKER in result.stdout, expected == 0)


if __name__ == '__main__':
    unittest.main()
