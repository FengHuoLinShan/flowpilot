#!/usr/bin/env python3
"""Create an ignored, private deployment env file; never print secret values."""
from __future__ import annotations
import argparse
import base64
import getpass
import os
from pathlib import Path
import secrets

ROOT=Path(__file__).resolve().parents[1]

def dotenv_value(value: str) -> str:
    if '\n' in value or '\r' in value or '\x00' in value:
        raise ValueError('Configuration values must be single-line text.')
    # Compose double-quoted values decode backslashes and $$ escapes interpolation.
    escaped=value.replace("\\", "\\\\").replace('"', '\\"').replace("$", "$$")
    return '"'+escaped+'"'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--test',action='store_true',help='Explicit isolated fixture-test deployment, never real LLM verification')
    p.add_argument('--env-file',type=Path,help='Defaults to .env or .env.test')
    p.add_argument('--non-interactive',action='store_true',help='Generate an admin password into the private env file instead of prompting')
    args=p.parse_args()
    target=args.env_file or ROOT/('.env.test' if args.test else '.env')
    target=target.absolute()
    if target.exists():
        p.error(f'{target.name} already exists. It was not overwritten. Keep existing secrets when restarting a deployment.')
    if not target.parent.exists():
        p.error('The target directory must already exist.')
    if args.non_interactive:
        admin_password=secrets.token_urlsafe(24)
    else:
        admin_password=getpass.getpass('FlowPilot administrator password (12+ characters, hidden): ')
        confirmation=getpass.getpass('Repeat password (hidden): ')
        if admin_password != confirmation:
            p.error('Passwords do not match.')
        if len(admin_password)<12:
            p.error('Use at least 12 characters.')
    generated={key:secrets.token_urlsafe(32) for key in ['POSTGRES_PASSWORD','FLOWPILOT_DB_PASSWORD','N8N_DB_PASSWORD','FLOWPILOT_SESSION_SECRET','FLOWPILOT_WEBHOOK_KEY','FLOWPILOT_INTERNAL_KEY','N8N_ENCRYPTION_KEY']}
    generated['FLOWPILOT_ENCRYPTION_KEY']=base64.urlsafe_b64encode(os.urandom(32)).decode('ascii')
    generated['FLOWPILOT_ADMIN_PASSWORD']=admin_password
    if args.test:
        generated.update({'COMPOSE_PROJECT_NAME':'flowpilot_test','APP_PORT':'3001','N8N_PORT':'5679',
                          'PUBLIC_BASE_URL':'http://localhost:3001','FLOWPILOT_TEST_MODE':'true',
                          'FLOWPILOT_ALLOW_FAULTS':'true','LLM_PROVIDER':'fixture','SMTP_ENABLED':'false'})
    lines=[]
    for line in (ROOT/'.env.example').read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#') and '=' in line:
            key, value=line.split('=',1)
            line=f'{key}={dotenv_value(generated.get(key,value))}'
        lines.append(line)
    fd=os.open(target, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        f.write('\n'.join(lines)+'\n')
    print(f'Created private configuration {target.name}; no secret values were printed.')
    if args.non_interactive:
        print('The administrator password is stored in that private file. Read it only in your local editor.')
    print('Mode: explicit fixture tests (not real AI inference).' if args.test else 'Mode: real-model deployment; configure Ollama or an OpenAI-compatible service before processing.')
    print('Next: follow README.md for Docker startup and n8n workflow import.')

if __name__=='__main__':
    main()
