#!/usr/bin/env python3
"""Run as root under the same host gate as the judge. Never touch test-data pins."""
import fcntl
import json
from pathlib import Path
import re
import shutil
import time

with open('/run/lock/studycod-judge.lock', 'a') as gate:
    try:
        fcntl.flock(gate, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit(0)
    root = Path('/var/cache/studycod/compile')
    entries = []
    if root.is_dir() and not root.is_symlink():
        for entry in root.iterdir():
            if entry.is_symlink() or not entry.is_dir():
                continue
            valid = re.fullmatch(r'[a-f0-9]{64}', entry.name)
            if not valid and not re.fullmatch(r'\.tmp-[a-f0-9-]+', entry.name):
                continue
            try:
                manifest = json.loads((entry / 'manifest.json').read_text()) if valid else {}
                expired = not valid or time.time() * 1000 - manifest['created'] > 3600000
                size = int(manifest.get('bytes', 0))
                if size < 0 or size > 512 * 1024 * 1024:
                    expired = True
            except (OSError, ValueError, KeyError, TypeError):
                expired = True
            if expired:
                shutil.rmtree(entry)
            else:
                entries.append((entry.stat().st_mtime, size, entry))
        total = sum(item[1] for item in entries)
        for _, size, entry in sorted(entries):
            if total <= 512 * 1024 * 1024:
                break
            shutil.rmtree(entry)
            total -= size
