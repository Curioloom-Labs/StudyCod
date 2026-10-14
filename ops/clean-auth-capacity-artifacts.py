#!/usr/bin/env python3
"""Clear the private compilation cache after accepted jobs finish; retain toolchains."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

if os.getuid() != 0:
    raise SystemExit('root required')
task = Path('/root/studycod-auth-capacity-20261009')
subprocess.run(['/opt/nodejs/current/bin/node', '/var/www/studycod/ops/assert-queue-drained.mjs'], check=True)
with open('/run/lock/studycod-judge.lock', 'a') as gate:
    fcntl.flock(gate, fcntl.LOCK_EX)
    root = Path('/var/cache/studycod/compile')
    if root.is_symlink() or root.resolve() != root or not root.is_dir() or root.stat().st_uid != 0:
        raise RuntimeError('Unexpected cache root')
    entries = 0
    freed = 0
    for entry in root.iterdir():
        if not re.fullmatch(r'[a-f0-9]{64}|\.tmp-[a-f0-9-]+', entry.name):
            raise RuntimeError('Unexpected cache entry')
        if entry.is_symlink() or not entry.is_dir() or entry.stat().st_uid != 0:
            raise RuntimeError('Unexpected cache ownership/type')
        freed += sum(p.lstat().st_blocks * 512 for p in entry.rglob('*') if p.is_file() and not p.is_symlink())
        shutil.rmtree(entry)
        entries += 1
    # A gate held through process cleanup plus empty execution cgroups permits
    # removal of abandoned trees from this judge's exact namespace. The root
    # judge makes its workdir writable by its fixed sandbox uid/gid.
    groups = list(Path('/sys/fs/cgroup/studycod-executions').glob('exec-*'))
    if groups:
        raise RuntimeError('Execution cgroups still present')
    sandbox_count = 0
    for entry in Path('/tmp').glob('studycod-judge-*'):
        name = re.fullmatch(r'studycod-judge-(\d+)-[A-Za-z0-9]+', entry.name)
        if not name or Path(f'/proc/{name.group(1)}').exists():
            continue
        if entry.is_symlink() or not entry.is_dir():
            continue
        stat = entry.stat()
        if stat.st_uid not in (0, 999) or (stat.st_uid == 999 and stat.st_gid != 987):
            continue
        shutil.rmtree(entry)
        sandbox_count += 1
report = {'compileEntriesRemoved': entries, 'compileDiskBytesFreed': freed,
          'orphanJudgeTreesRemoved': sandbox_count, 'executionCgroupsRemaining': 0,
          'judgeTreesRemaining': len(list(Path('/tmp').glob('studycod-judge-*'))),
          'swapFilePreserved': True, 'preparedToolchainsPreserved': True}
(task / 'cleanup-cache.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
