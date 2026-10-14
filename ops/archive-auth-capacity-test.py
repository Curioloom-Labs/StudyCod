#!/usr/bin/env python3
"""Archive evidence and rollback files, then remove this task's private scratch directory."""
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess

task = Path('/root/studycod-auth-capacity-20261009')
backup = Path('/root/studycod-contest-backup-20261009-163647')
helper = Path('/root/studycod-temporary-turnstile-test.py')
if os.getuid() != 0 or task.is_symlink() or task.resolve() != task or task.stat().st_uid != 0:
    raise SystemExit('Exact root-owned task directory required')
health = json.loads((task / 'health-final.json').read_text())
accounts = json.loads((task / 'cleanup-accounts.json').read_text())
cache = json.loads((task / 'cleanup-cache.json').read_text())
originals = json.loads((task / 'turnstile-original.private.json').read_text())
current = Path('/var/www/studycod/backend/.env').read_text()
if not health.get('turnstileRestored') or any(h['status'] != 200 for h in health['health'].values()):
    raise RuntimeError('Live restoration and health required')
for key, original in originals.items():
    value = re.search(r'^' + key + r'=.*$', current, re.M)
    if (value.group(0) if value else None) != original:
        raise RuntimeError('Enforcement setting differs from its original value')
if accounts.get('pendingJobs') != 0 or not accounts.get('organiserRemoved') or cache.get('executionCgroupsRemaining') != 0:
    raise RuntimeError('Finish fixture and artifact cleanup first')
subprocess.run(['/opt/nodejs/current/bin/node', '/var/www/studycod/ops/assert-queue-drained.mjs'], check=True)
subprocess.run(['systemctl', 'stop', 'studycod-turnstile-test-recovery.timer'], check=True)
if subprocess.run(['systemctl', 'is-active', '--quiet', 'studycod-turnstile-test-recovery.service']).returncode == 0:
    raise RuntimeError('Recovery service is still running')
pid = int((task / 'monitor-final.pid').read_text().strip())
process = Path(f'/proc/{pid}/cmdline')
if process.exists():
    command = process.read_bytes()
    if b'monitor-contest-capacity.py' not in command or str(task / 'resources-final.jsonl').encode() not in command:
        raise RuntimeError('Monitor PID was reused; refusing to signal')
    os.kill(pid, signal.SIGTERM)
if backup.is_symlink() or backup.resolve() != backup or not backup.is_dir() or backup.stat().st_uid != 0:
    raise RuntimeError('Original root-owned rollback backup required')
archive = backup / 'authenticated-reports'
archive.mkdir(mode=0o700, exist_ok=False)
for entry in task.iterdir():
    if entry.is_file() and not entry.is_symlink() and entry.name != 'admin.private.json' and (
        entry.suffix in ('.json', '.jsonl', '.cpuprofile', '.log', '.txt', '.md')):
        target = archive / entry.name
        shutil.copy2(entry, target)
        os.chmod(target, 0o600)
for name in ('before-read-optimization', 'before-auth-optimization', 'before-participant-optimization'):
    previous = task / name
    if previous.exists():
        target = archive / name
        shutil.copytree(previous, target)
        os.chmod(target, 0o700)
        for config in target.rglob('*.private'):
            source = config.read_text()
            for key, original in originals.items():
                source = re.sub(r'^' + key + r'=.*\n?', '', source, flags=re.M)
                if original is not None:
                    source = source.rstrip('\n') + '\n' + original + '\n'
            config.write_text(source)
            os.chmod(config, 0o600)
(archive / 'ROLLBACK.md').write_text('Preserve accepted work and drain the durable queue before rollback. '
    'Saved environment enforcement flags have been restored to their pre-test values. '
    'No test account passwords were archived.\n')
if helper.is_symlink() or helper.resolve() != helper or helper.stat().st_uid != 0:
    raise RuntimeError('Unexpected temporary recovery helper')
helper.unlink()
shutil.rmtree(task)
report = {'temporaryRootRemoved': str(task), 'recoveryTimerStopped': True, 'monitorStopped': True,
          'privateCredentialsRemovedFromVps': True, 'rollbackAndEvidenceArchive': str(archive)}
(archive / 'scratch-cleanup.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
