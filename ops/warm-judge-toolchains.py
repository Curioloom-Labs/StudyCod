#!/usr/bin/env python3
"""Prepare trusted compiler classes before a contest; no submitted code is used."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

if os.geteuid() != 0:
    raise SystemExit('Run the toolchain warmup as root before accepting contest work')
rootfs = Path('/sandbox/rootfs')
java = '/usr/lib/jvm/java-17-openjdk-amd64/bin/java'
jar = '/opt/kotlinc/kotlinc/lib/kotlin-compiler.jar'
archive = rootfs / 'usr/local/lib/studycod/kotlin-compiler.jsa'
metadata = archive.with_suffix('.json')
def digest(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

with open('/run/lock/studycod-judge.lock', 'a') as gate:
    fcntl.flock(gate, fcntl.LOCK_EX)
    memory = {line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()}
    if memory['SwapTotal'] - memory['SwapFree'] > 1536 * 1024:
        raise SystemExit('Swap limit exceeded; warmup deferred')
    node = rootfs / 'usr/local/bin/node-contest'
    node.parent.mkdir(parents=True, exist_ok=True)
    host_node = Path('/opt/nodejs/current/bin/node')
    if not node.exists() or digest(node) != digest(host_node):
        shutil.copyfile(host_node, node.with_suffix('.next'))
        node.with_suffix('.next').chmod(0o755)
        node.with_suffix('.next').replace(node)
    inputs = {'compiler':digest(rootfs / jar.lstrip('/')), 'java':digest(rootfs / java.lstrip('/')),
              'base':digest(rootfs / 'usr/lib/jvm/java-17-openjdk-amd64/lib/server/classes.jsa')}
    try:
        saved = json.loads(metadata.read_text())
    except (OSError, ValueError):
        saved = {}
    if not archive.exists() or saved.get('inputs') != inputs or saved.get('archive') != digest(archive):
        work = Path(tempfile.mkdtemp(prefix='studycod-toolchain-warm-'))
        group = Path('/sys/fs/cgroup/studycod-executions') / f'exec-{os.getpid()}-warmup'
        try:
            work.chmod(0o700);os.chown(work,999,987)
            source = work / 'Main.kt'
            source.write_text('data class Value(val n: Long)\nfun main() { println(Value(readln().toLong()).n * 2) }\n')
            os.chown(source,999,987);source.chmod(0o600)
            group.mkdir()
            for name,value in [('memory.max',768*1048576),('memory.swap.max',0),('pids.max',512),('memory.oom.group',1)]:
                (group/name).write_text(str(value))
            command = ['/usr/bin/nsjail','--config','/usr/local/lib/studycod-judge/sandbox/nsjail.cfg',
                '--bindmount',f'{work}:/work','--time_limit','65','--rlimit_cpu','60','--rlimit_as','inf',
                '--rlimit_fsize','256','--nice_level','5','--',java,'-Xmx256M','-Xms32M','-XX:+UseSerialGC',
                '-XX:-UsePerfData','-XX:ArchiveClassesAtExit=/work/compiler.jsa',
                '--add-opens','java.base/java.util=ALL-UNNAMED','-Dkotlin.home=/opt/kotlinc/kotlinc',
                '-cp',jar,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','Main.kt','-include-runtime','-d','app.jar']
            result = subprocess.run(['/bin/sh','-c','printf "%s" "$$" > "$1/cgroup.procs" || exit 125; shift; exec "$@"',
                'warmup',str(group),*command],capture_output=True,text=True,timeout=70)
            if result.returncode or not (work/'compiler.jsa').is_file():
                raise RuntimeError(f'Compiler warmup failed: {result.returncode}\n{result.stdout}\n{result.stderr}')
            archive.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(work/'compiler.jsa',archive.with_suffix('.next'))
            archive.with_suffix('.next').chmod(0o644)
            archive.with_suffix('.next').replace(archive)
            metadata.write_text(json.dumps({'inputs':inputs,'archive':digest(archive),'created':time.time()},indent=2))
            metadata.chmod(0o644)
        finally:
            if group.exists():
                (group/'cgroup.kill').write_text('1')
                deadline=time.monotonic()+3
                while 'populated 1' in (group/'cgroup.events').read_text():
                    if time.monotonic()>deadline:raise RuntimeError('Warmup cgroup failed to drain')
                    time.sleep(.01)
                group.rmdir()
            shutil.rmtree(work)
    print(json.dumps({'node':str(node),'compilerArchive':str(archive),'bytes':archive.stat().st_size}))
