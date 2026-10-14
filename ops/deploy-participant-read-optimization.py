#!/usr/bin/env python3
"""Install fresh indexed participant reads only after the host queue drains."""
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
members = ['src/routes/contests.ts', 'dist/backend/src/routes/contests.js',
           'src/services/contest/participantReads.ts', 'dist/backend/src/services/contest/participantReads.js']
subprocess.run(['/opt/nodejs/current/bin/node', '/var/www/studycod/ops/assert-queue-drained.mjs'], check=True)
backup = task / 'before-participant-optimization'
candidate = task / 'participant-candidate'
backup.mkdir(mode=0o700, exist_ok=False)
candidate.mkdir(mode=0o700, exist_ok=False)
with tarfile.open(task / 'participant-optimization-candidate.tgz') as archive:
    actual = archive.getmembers()
    if len(actual) != len(members) or {m.name for m in actual} != set(members) or any(not m.isfile() for m in actual):
        raise RuntimeError('Unexpected deployment archive')
    archive.extractall(candidate, filter='data')
for member in members:
    destination = backend / member
    stat = destination.stat() if destination.exists() else backend.stat()
    if destination.exists():
        previous = backup / member
        previous.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, previous)
    shutil.copy2(candidate / member, destination)
    os.chown(destination, stat.st_uid, stat.st_gid)
    os.chmod(destination, 0o644)
command = 'PATH=/opt/nodejs/current/bin:/usr/local/bin:/usr/bin:/bin PM2_HOME=/home/studycod/.pm2 pm2 restart studycod-backend --update-env'
subprocess.run(['su', '-s', '/bin/bash', 'studycod', '-c', command], check=True, stdout=subprocess.DEVNULL)
print(json.dumps({'deployed': True, 'backup': str(backup)}))
