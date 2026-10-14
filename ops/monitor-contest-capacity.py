#!/usr/bin/env python3
"""Low overhead VPS resource evidence, with a hard swap guard for test runners."""
import json
from pathlib import Path
import sys
import time

output = Path(sys.argv[1])
duration = int(sys.argv[2]) if len(sys.argv) > 2 else 3600
start = time.monotonic()
with output.open('w', buffering=1) as log:
    while time.monotonic() - start < duration:
        memory = {}
        for line in Path('/proc/meminfo').read_text().splitlines():
            key, value = line.split(':', 1)
            memory[key] = int(value.strip().split()[0])
        row = {'at': time.time(), 'ramUsedKb': memory['MemTotal'] - memory['MemAvailable'],
               'swapUsedKb': memory['SwapTotal'] - memory['SwapFree'],
               'load': Path('/proc/loadavg').read_text().strip(),
               'executionGroups': len(list(Path('/sys/fs/cgroup/studycod-executions').glob('exec-*')))}
        cpu = Path('/proc/stat').read_text().splitlines()[0].split()[1:]
        row['cpuTicks'] = [int(x) for x in cpu]
        log.write(json.dumps(row) + '\n')
        if row['swapUsedKb'] > 1536 * 1024:
            log.write(json.dumps({'failure': 'SWAP_LIMIT_EXCEEDED', 'at': time.time()}) + '\n')
        time.sleep(1)
