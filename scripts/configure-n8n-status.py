#!/usr/bin/env python3
"""Save a validated n8n public API key through a hidden local prompt."""
from __future__ import annotations
import argparse
import getpass
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request
from urllib.parse import urlparse
from config_utils import read_env
from bootstrap import dotenv_value

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--env-file',type=Path,default=ROOT/'.env')
p.add_argument('--n8n-url',help='Browser-accessible n8n base URL; defaults to the local N8N_PORT')
args=p.parse_args()
path=args.env_file.absolute()
if not path.is_file() or path.is_symlink():
    p.error('Use an existing regular, non-symlink local env file.')
config=read_env(path)
base=(args.n8n_url or f"http://127.0.0.1:{config.get('N8N_PORT','5678')}").rstrip('/')
u=urlparse(base)
if u.scheme not in {'http','https'} or not u.hostname or u.username or u.password:
    p.error('n8n URL must be HTTP(S) without embedded credentials.')
key=getpass.getpass('n8n public API key (input hidden): ').strip()
if not key or '\n' in key or '\r' in key:
    p.error('A valid single-line API key is required.')
request=urllib.request.Request(base+'/api/v1/executions?limit=1&includeData=false',headers={'X-N8N-API-KEY':key,'Accept':'application/json'})
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

try:
    with urllib.request.build_opener(NoRedirect).open(request,timeout=15) as response:
        if response.status != 200:
            p.error('The n8n API did not accept this key.')
        response.read(1024)
except urllib.error.HTTPError as exc:
    p.error(f'n8n returned HTTP {exc.code}; verify key validity and execution read permission.')
except (urllib.error.URLError, TimeoutError):
    p.error('Cannot reach n8n. Check its URL and health before retrying.')
lines=path.read_text(encoding='utf-8').splitlines()
replacement='N8N_API_KEY='+dotenv_value(key)
found=False
for i,line in enumerate(lines):
    if line.startswith('N8N_API_KEY='):
        lines[i]=replacement; found=True
if not found:
    lines.append(replacement)
fd,temp=tempfile.mkstemp(prefix='.flowpilot-env-',dir=path.parent)
try:
    os.fchmod(fd,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as f:
        f.write('\n'.join(lines)+'\n')
        f.flush(); os.fsync(f.fileno())
    os.replace(temp,path)
finally:
    if os.path.exists(temp):
        os.unlink(temp)
print('Validated execution-read access and saved N8N_API_KEY. No secret was printed.')
print('Recreate api and worker with the same --env-file so they load the new value.')
