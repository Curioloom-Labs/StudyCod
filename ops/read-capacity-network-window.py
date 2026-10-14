#!/usr/bin/env python3
"""Aggregate only this private contest's access statuses around an observed client reset."""
from collections import Counter
import json
from pathlib import Path
import re
import subprocess

counts = Counter()
for line in Path('/var/log/nginx/studycod-access.log').open(errors='replace'):
    match = re.search(r'\[09/Oct/2026:23:(4[12]):(\d\d) \+0300\].*"(?:GET|POST) /api/contests/20(?:/|\s)[^" ]* HTTP/[^" ]+" (\d+) ', line)
    if match:
        counts[(match[1], match[2], match[3])] += 1
pid = int(Path('/home/studycod/.pm2/pids/studycod-backend-1.pid').read_text())
process = subprocess.check_output(['ps', '-p', str(pid), '-o', 'pid,lstart,etime,args'], text=True).strip()
report = {'windowUtc': '2026-10-09T20:41:00Z to 20:43:00Z', 'backendProcess': process,
          'statusCountsByLocalMinuteSecond': {':'.join(key): value for key, value in sorted(counts.items())},
          'scope': 'Only contest 20; no IPs, cookies, passwords or unrelated request paths exported'}
Path('/root/studycod-auth-capacity-20261009/network-window.json').write_text(json.dumps(report, indent=2))
print(json.dumps({'statuses': dict(Counter({status: sum(n for (_, _, s), n in counts.items() if s == status) for status in {s for _, _, s in counts}})),
                  'backendPid': pid}))
