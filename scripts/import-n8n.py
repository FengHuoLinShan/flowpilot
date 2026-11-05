#!/usr/bin/env python3
"""Import, publish and activate FlowPilot's dedicated Compose n8n workflow."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shlex
import subprocess
import sys
import time
from uuid import uuid4

from config_utils import read_env

ROOT = Path(__file__).resolve().parents[1]
READY_MARKER = b'FLOWPILOT_WEBHOOK_READY'

# This deliberately supplies no credential and no valid dispatch. The bundled
# trigger authenticates before emitting workflow data, so its precise rejection
# confirms registration without creating a business execution or exposing a key.
REGISTRATION_PROBE = r"""
(async () => {
  try {
    const response = await fetch('http://127.0.0.1:5678/webhook/flowpilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 401 && payload?.error === 'UNAUTHORIZED') {
      process.stdout.write('FLOWPILOT_WEBHOOK_READY\n');
    } else {
      process.stderr.write('FLOWPILOT_WEBHOOK_NOT_READY\n');
      process.exitCode = 1;
    }
  } catch {
    process.stderr.write('FLOWPILOT_WEBHOOK_UNAVAILABLE\n');
    process.exitCode = 1;
  }
})();
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=ROOT / '.env')
    parser.add_argument('--project-id', help='Optional existing n8n project for credential/workflow ownership')
    parser.add_argument('--ready-timeout', type=float, default=120,
                        help='Seconds to wait for the authenticated production webhook after restart (1–600; default 120)')
    args = parser.parse_args(argv)
    if not 1 <= args.ready_timeout <= 600:
        parser.error('--ready-timeout must be between 1 and 600 seconds.')
    if not args.env_file.is_file():
        parser.error('Configuration file not found; run scripts/bootstrap.py first.')
    try:
        config = read_env(args.env_file)
    except (OSError, ValueError):
        parser.error('Configuration file could not be read or has invalid dotenv syntax.')
    key = config.get('FLOWPILOT_INTERNAL_KEY', '')
    if len(key) < 24:
        parser.error('FLOWPILOT_INTERNAL_KEY must be configured with at least 24 characters.')

    compose = ['docker', 'compose', '--env-file', str(args.env_file.resolve()),
               '-f', str(ROOT / 'docker-compose.yml')]
    restart = compose + ['restart', '--no-deps', '--timeout', '30', 'n8n']
    probe = compose + ['exec', '-T', 'n8n', 'node', '-e', REGISTRATION_PROBE]
    token = uuid4().hex
    creds_path = f'/tmp/flowpilot-credentials-{token}.json'
    workflow_path = f'/tmp/flowpilot-workflow-{token}.json'
    cleanup = compose + ['exec', '-T', 'n8n', 'rm', '-f', creds_path, workflow_path]
    credentials = [{'id': 'flowpilotInternalHeader1', 'name': 'FlowPilot internal API',
                    'type': 'httpHeaderAuth',
                    'data': {'name': 'x-flowpilot-internal', 'value': key}}]
    secrets = sorted((value for name, value in config.items()
                      if value and any(part in name for part in ('PASSWORD', 'SECRET', 'KEY'))),
                     key=len, reverse=True)

    def run(command, input_data=None, check=True, timeout=120):
        try:
            result = subprocess.run(command, input=input_data, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, cwd=ROOT, timeout=timeout)
        except FileNotFoundError as exc:
            raise RuntimeError('Docker Compose is unavailable. Install Docker Desktop/Engine with Compose v2.') from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError('Docker Compose command exceeded its time limit; completion was not confirmed.') from exc
        if check and result.returncode:
            message = (result.stdout + result.stderr).decode('utf-8', errors='replace')
            # Redact before truncating, so a secret cannot be exposed as a cut prefix.
            for secret in secrets:
                message = message.replace(secret, '[REDACTED]')
            raise RuntimeError(message[-3000:] or 'Docker Compose command failed.')
        return result

    def activation_recovery():
        print('Inspect this deployment, then restart n8n in a maintenance window:', file=sys.stderr)
        print(shlex.join(compose + ['logs', '--tail', '60', 'n8n']), file=sys.stderr)
        print(shlex.join(restart), file=sys.stderr)
        retry = [sys.executable, str(Path(__file__).resolve()), '--env-file', str(args.env_file.resolve()),
                 '--ready-timeout', str(args.ready_timeout)]
        if args.project_id:
            retry += ['--project-id', args.project_id]
        print('After fixing the cause, rerun the importer to verify activation:', file=sys.stderr)
        print(shlex.join(retry), file=sys.stderr)

    print('This deployment operation restarts the dedicated Compose n8n service. '
          'Active executions may be interrupted; use a maintenance window.', flush=True)
    cleanup_ok = False
    import_error = None
    try:
        run(compose + ['exec', '-T', 'n8n', 'sh', '-c', f'umask 077; cat > {creds_path}'],
            json.dumps(credentials).encode())
        run(compose + ['cp', str(ROOT / 'n8n' / 'lead-pipeline.json'), f'n8n:{workflow_path}'])
        scope = ['--projectId', args.project_id] if args.project_id else []
        run(compose + ['exec', '-T', 'n8n', 'n8n', 'import:credentials', f'--input={creds_path}', *scope])
        run(compose + ['exec', '-T', 'n8n', 'n8n', 'import:workflow', f'--input={workflow_path}', *scope])
        run(compose + ['exec', '-T', 'n8n', 'n8n', 'publish:workflow', '--id=flowpilotLeadPipelineV1'])
    except RuntimeError as exc:
        import_error = str(exc)
    finally:
        try:
            cleanup_ok = run(cleanup, check=False, timeout=30).returncode == 0
        except RuntimeError:
            pass

    if import_error:
        print(f'Import failed: {import_error}', file=sys.stderr)
        print('Check n8n health, first-run owner/project setup and importer permissions.', file=sys.stderr)
    if not cleanup_ok:
        print('Import incomplete: temporary credential-file cleanup was not confirmed. '
              'No restart or activation check was attempted.', file=sys.stderr)
        print('Remove the temporary files before rerunning the importer:', file=sys.stderr)
        print(shlex.join(cleanup), file=sys.stderr)
        return 1
    if import_error:
        return 1

    # n8n 2.46.6 publish:workflow only updates the database. Its CLI explicitly
    # requires a restart before a running instance observes the published version.
    print('Import and publication completed; temporary container files removed. Restarting n8n…', flush=True)
    try:
        run(restart)
    except RuntimeError as exc:
        print(f'Activation failed during n8n restart: {exc}', file=sys.stderr)
        activation_recovery()
        return 1

    print(f'Checking authenticated production webhook registration (up to {args.ready_timeout:g}s)…', flush=True)
    deadline = time.monotonic() + args.ready_timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            result = run(probe, check=False, timeout=min(8.0, remaining))
            if result.returncode == 0 and result.stdout.strip() == READY_MARKER:
                print('FlowPilot workflow imported, published, restarted and verified active.')
                print('Unauthenticated production probe returned the expected 401 rejection. '
                      'No secret or valid dispatch was sent.')
                return 0
        except RuntimeError:
            # Container startup or a bounded exec timeout may be transient.
            pass
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(2.0, remaining))

    print('Activation failed: the authenticated production webhook did not become ready within the deadline. '
          'Imported configuration remains persisted; deployment success is not confirmed.', file=sys.stderr)
    activation_recovery()
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
