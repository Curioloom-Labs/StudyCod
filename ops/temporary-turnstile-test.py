#!/usr/bin/env python3
"""Operator-authorised temporary toggle with a server-side restoration timer."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/root/studycod-auth-capacity-20261009')
ENV = Path('/var/www/studycod/backend/.env')
KEYS = ('TURNSTILE_ENFORCE_AUTH', 'TURNSTILE_ENFORCE_CONTEST_SUBMIT')
def restart():
    command = 'PATH=/opt/nodejs/current/bin:/usr/local/bin:/usr/bin:/bin PM2_HOME=/home/studycod/.pm2 pm2 restart studycod-backend --update-env'
    subprocess.run(['su', '-s', '/bin/bash', 'studycod', '-c', command], check=True, stdout=subprocess.DEVNULL)
def replace(lines):
    source = ENV.read_text()
    for key, original in lines.items():
        source = re.sub(r'^' + key + r'=.*\n?', '', source, flags=re.M)
        if original is not None:
            source = source.rstrip('\n') + '\n' + original + '\n'
    stat = ENV.stat()
    temporary = ENV.with_name('.env.turnstile-test.tmp')
    temporary.write_text(source)
    os.chmod(temporary, stat.st_mode & 0o777)
    os.chown(temporary, stat.st_uid, stat.st_gid)
    os.replace(temporary, ENV)
if os.getuid() != 0:
    raise SystemExit('root required')
action = sys.argv[1]
if action == 'disable':
    ROOT.mkdir(mode=0o700, exist_ok=False)
    source = ENV.read_text()
    originals = {key: (re.search(r'^' + key + r'=.*$', source, re.M).group(0)
                 if re.search(r'^' + key + r'=.*$', source, re.M) else None) for key in KEYS}
    recovery = ROOT / 'turnstile-original.private.json'
    recovery.write_text(json.dumps(originals))
    os.chmod(recovery, 0o600)
    # Recovery survives the external generator or SSH connection disappearing.
    subprocess.run(['systemd-run', '--unit=studycod-turnstile-test-recovery', '--on-active=3h',
                    '/usr/bin/python3', str(Path(__file__).resolve()), 'restore'], check=True)
    replace({key: key + '=false' for key in KEYS})
    restart()
    print('Turnstile temporarily disabled; recovery timer armed for 3 hours.')
elif action == 'resume':
    if ROOT.is_symlink() or ROOT.resolve() != ROOT or ROOT.stat().st_uid != 0:
        raise RuntimeError('Original root-owned test directory required')
    originals = json.loads((ROOT / 'turnstile-original.private.json').read_text())
    source = ENV.read_text()
    for key, original in originals.items():
        match = re.search(r'^' + key + r'=.*$', source, re.M)
        if (match.group(0) if match else None) != original:
            raise RuntimeError('Original enforcement must be restored before resuming')
    subprocess.run(['systemd-run', '--unit=studycod-turnstile-test-recovery', '--on-active=3h',
                    '/usr/bin/python3', str(Path(__file__).resolve()), 'restore'], check=True)
    (ROOT / 'turnstile-restored.json').unlink(missing_ok=True)
    replace({key: key + '=false' for key in KEYS})
    restart()
    print('Authorised test resumed; original settings retained and recovery armed for 3 hours.')
elif action == 'restore':
    replace(json.loads((ROOT / 'turnstile-original.private.json').read_text()))
    restart()
    (ROOT / 'turnstile-restored.json').write_text(json.dumps({'restored': True}))
    print('Original Turnstile enforcement restored.')
else:
    raise SystemExit('Use disable, resume or restore')
