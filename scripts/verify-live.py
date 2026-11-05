#!/usr/bin/env python3
"""Run the HTTP acceptance script without exposing administrator credentials in shell history."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import subprocess
import sys
from config_utils import read_env

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--env-file',type=Path,default=ROOT/'.env')
p.add_argument('--base-url')
p.add_argument('--report',type=Path,default=ROOT/'artifacts'/'http-e2e.json')
p.add_argument('--require-n8n',action='store_true')
p.add_argument('--require-live-model',action='store_true')
args=p.parse_args()
if not args.env_file.is_file():
    p.error('Configuration file not found.')
config=read_env(args.env_file)
if not config.get('FLOWPILOT_ADMIN_PASSWORD'):
    p.error('Administrator password is not configured.')
env=os.environ.copy()
env['FLOWPILOT_ADMIN_PASSWORD']=config['FLOWPILOT_ADMIN_PASSWORD']
command=[sys.executable,str(ROOT/'scripts'/'e2e.py'),'--base-url',args.base_url or config.get('PUBLIC_BASE_URL','http://localhost:3000'),'--report',str(args.report)]
if args.require_n8n: command.append('--require-n8n')
if args.require_live_model: command.append('--require-live-model')
raise SystemExit(subprocess.run(command,cwd=ROOT,env=env).returncode)
