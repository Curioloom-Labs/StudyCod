#!/usr/bin/env python3
"""Install the measured auth/status changes after accepted work has drained."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

if os.getuid() != 0:
    raise SystemExit('root required')
task = Path('/root/studycod-auth-capacity-20261009')
backend = Path('/var/www/studycod/backend')
members = ['dist/backend/src/index.js', 'dist/backend/src/middleware/authMiddleware.js',
           'dist/backend/src/utils/verifyAuthJwt.js', 'dist/backend/src/services/contest/executionQueue.js',
           'src/index.ts', 'src/middleware/authMiddleware.ts', 'src/utils/verifyAuthJwt.ts',
           'src/services/contest/executionQueue.ts']
subprocess.run(['/opt/nodejs/current/bin/node', '/var/www/studycod/ops/assert-queue-drained.mjs'], check=True)
backup = task / 'before-auth-optimization'
backup.mkdir(mode=0o700, exist_ok=False)
candidate = task / 'auth-candidate'
candidate.mkdir(mode=0o700, exist_ok=False)
with tarfile.open(task / 'auth-optimization-candidate.tgz') as archive:
    actual = archive.getmembers()
    if len(actual) != len(members) or {m.name for m in actual} != set(members) or any(not m.isfile() for m in actual):
        raise RuntimeError('Unexpected deployment archive')
    archive.extractall(candidate, filter='data')

site = Path('/etc/nginx/sites-available/studycod')
upstream = Path('/etc/nginx/conf.d/studycod-contest-upstream.conf')
if upstream.exists():
    raise RuntimeError('Refusing to replace an existing upstream configuration')
original = site.read_text()
shutil.copy2(site, backup / 'nginx-studycod.conf')
begin = original.index('    location ^~ /api/ {')
end = original.index('    # Keep the non-API judge health', begin)
block = original[begin:end]
if block.count('proxy_pass http://localhost:4000;') != 2 or block.count("proxy_set_header Connection 'upgrade';") != 1:
    raise RuntimeError('API configuration changed')
block = block.replace('proxy_pass http://localhost:4000;', 'proxy_pass http://studycod_contest_backend;')
block = block.replace("proxy_set_header Connection 'upgrade';", 'proxy_set_header Connection $studycod_api_connection;')
upstream.write_text('map $http_upgrade $studycod_api_connection {\n    default upgrade;\n    "" "";\n}\n'
                    'upstream studycod_contest_backend {\n    server 127.0.0.1:4000;\n    keepalive 64;\n}\n')
os.chmod(upstream, 0o644)
site.write_text(original[:begin] + block + original[end:])
check = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
(task / 'nginx-validation.txt').write_text(check.stdout + check.stderr)
if check.returncode:
    site.write_text(original)
    upstream.unlink()
    raise RuntimeError('Nginx validation failed; original configuration preserved')

backend_stat = backend.stat()
for member in members:
    destination = backend / member
    existed = destination.exists()
    stat = destination.stat() if existed else backend_stat
    if existed:
        previous = backup / member
        previous.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, previous)
    shutil.copy2(candidate / member, destination)
    os.chown(destination, stat.st_uid, stat.st_gid)
    os.chmod(destination, 0o644)
command = 'PATH=/opt/nodejs/current/bin:/usr/local/bin:/usr/bin:/bin PM2_HOME=/home/studycod/.pm2 pm2 restart studycod-backend --update-env'
subprocess.run(['su', '-s', '/bin/bash', 'studycod', '-c', command], check=True, stdout=subprocess.DEVNULL)
subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
print(json.dumps({'deployed': True, 'nginxKeepalive': 64, 'backup': str(backup)}))
