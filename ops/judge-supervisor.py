#!/usr/bin/env python3
"""Root owned host admission gate; keep the lock until every sandbox has exited."""
import ctypes
import fcntl
import os
from pathlib import Path
import signal
import shutil
import re
import subprocess
import sys
import time

if len(sys.argv) != 1:
    sys.exit(64)
caller = os.getppid()
def parent_of(pid):
    try:
        return int(Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[1])
    except (OSError, ValueError, IndexError):
        return None

caller_parent = parent_of(caller)
def caller_alive():
    # sudo can survive its original backend parent, so watch both links.
    return os.getppid() == caller and parent_of(caller) == caller_parent
stopping = False
def stop(signum, frame):
    global stopping
    stopping = True
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
lock = open('/run/lock/studycod-judge.lock', 'a')
while True:
    if stopping or not caller_alive():
        sys.exit(75)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        time.sleep(0.05)

def child_setup():
    # The judge cannot survive a killed supervisor. Its cgroups are swept below/on the next call.
    ctypes.CDLL(None).prctl(1, signal.SIGKILL, 0, 0, 0)

cgroup_root = Path('/sys/fs/cgroup/studycod-executions')
cgroup_root.mkdir(exist_ok=True)
(cgroup_root / 'cgroup.subtree_control').write_text('+memory +pids +cpu')
def kill_cgroups(prefix):
    for group in cgroup_root.glob(prefix):
        try:
            (group / 'cgroup.kill').write_text('1')
            deadline = time.monotonic() + 2
            while 'populated 1' in (group / 'cgroup.events').read_text():
                if time.monotonic() >= deadline:
                    raise RuntimeError(f'Sandbox processes did not exit: {group.name}')
                time.sleep(0.01)
            group.rmdir()
        except OSError:
            pass

# No other judge holds the gate. Clean remnants of a previous hard crash first.
kill_cgroups('exec-*')

def clean_workdirs(worker_pid=None):
    for directory in Path('/tmp').glob('studycod-judge-*'):
        match = re.fullmatch(r'studycod-judge-(\d+)-[A-Za-z0-9]+', directory.name)
        if not match or directory.is_symlink() or not directory.is_dir():
            continue
        pid = int(match[1])
        if (worker_pid is not None and pid != worker_pid) or (worker_pid is None and Path(f'/proc/{pid}').exists()):
            continue
        shutil.rmtree(directory, ignore_errors=True)

clean_workdirs()
env = dict(os.environ)
env.update(NODE_ENV='production', NSJAIL_USE_CONFIG='1',
           NSJAIL_CONFIG='/usr/local/lib/studycod-judge/sandbox/nsjail.cfg')
if Path('/sandbox/rootfs/usr/local/bin/node-contest').is_file():
    env['JUDGE_BIN_NODE'] = '/usr/local/bin/node-contest'
compiler_jar = '/opt/kotlinc/kotlinc/lib/kotlin-compiler.jar'
if Path('/sandbox/rootfs' + compiler_jar).is_file():
    env['JUDGE_KOTLIN_COMPILER_JAR'] = compiler_jar
if Path('/sandbox/rootfs/usr/local/lib/studycod/kotlin-compiler.jsa').is_file():
    env['JUDGE_KOTLIN_CDS_ARCHIVE'] = '/usr/local/lib/studycod/kotlin-compiler.jsa'
if Path('/sandbox/rootfs/usr/local/lib/studycod/csharp-build/compile').is_file():
    env['JUDGE_CSHARP_COMPILER_WRAPPER'] = '/usr/local/lib/studycod/csharp-build/compile'
child = subprocess.Popen(['/opt/nodejs/current/bin/node', '/usr/local/lib/studycod-judge/dist/index.js'],
                         env=env, start_new_session=True, preexec_fn=child_setup)
try:
    while child.poll() is None:
        if stopping or not caller_alive():
            kill_cgroups(f'exec-{child.pid}-*')
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
            break
        time.sleep(0.05)
finally:
    kill_cgroups(f'exec-{child.pid}-*')
    clean_workdirs(child.pid)
sys.exit(child.returncode if child.returncode is not None and child.returncode >= 0 else 75)
