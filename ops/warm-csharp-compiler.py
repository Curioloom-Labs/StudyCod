#!/usr/bin/env python3
"""Capture the installed SDK's compiler options from a trusted project, once."""
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile
import time

if os.geteuid() != 0:
    raise SystemExit('Root is required')
rootfs = Path('/sandbox/rootfs')
destination = rootfs / 'usr/local/lib/studycod/csharp-build'
project = '''<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>'''
environment = ['DOTNET_ROOT=/usr/share/dotnet', 'DOTNET_CLI_HOME=/work/.dotnet', 'NUGET_PACKAGES=/work/.nuget',
    'HOME=/work', 'TMPDIR=/work', 'DOTNET_MULTILEVEL_LOOKUP=0', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1',
    'DOTNET_NOLOGO=1', 'DOTNET_CLI_TELEMETRY_OPTOUT=1', 'DOTNET_GCConserveMemory=9', 'DOTNET_EnableWriteXorExecute=0']
with open('/run/lock/studycod-judge.lock', 'a') as gate:
    fcntl.flock(gate, fcntl.LOCK_EX)
    memory = {line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()}
    if memory['SwapTotal'] - memory['SwapFree'] > 1536 * 1024:
        raise SystemExit('Swap limit exceeded; compiler preparation deferred')
    work = Path(tempfile.mkdtemp(prefix='studycod-csharp-warm-'))
    group = Path('/sys/fs/cgroup/studycod-executions') / f'exec-{os.getpid()}-csharp-warmup'
    try:
        work.chmod(0o700); os.chown(work, 999, 987)
        for name, content in [('App.csproj', project), ('Program.cs', 'Console.WriteLine(42);')]:
            file = work/name; file.write_text(content); os.chown(file, 999, 987); file.chmod(0o600)
        group.mkdir()
        for name,value in [('memory.max',768*1048576),('memory.swap.max',0),('pids.max',512),('memory.oom.group',1)]:
            (group/name).write_text(str(value))
        args = ['/usr/bin/nsjail','--config','/usr/local/lib/studycod-judge/sandbox/nsjail.cfg',
            '--bindmount',f'{work}:/work','--time_limit','65','--rlimit_cpu','60','--rlimit_as','inf',
            '--rlimit_fsize','256','--nice_level','5','--env','PATH=/usr/local/bin:/usr/bin:/bin',
            '--','/usr/bin/env',*environment,'/usr/share/dotnet/dotnet','build','-c','Release',
            '-p:GenerateDocumentationFile=false','-p:UseSharedCompilation=false','-p:RunAnalyzersDuringBuild=false',
            '--','/m:1','/nodeReuse:false','/p:BuildInParallel=false','-v:diag']
        result = subprocess.run(['/bin/sh','-c','printf "%s" "$$" > "$1/cgroup.procs" || exit 125; shift; exec "$@"',
            'warmup',str(group),*args],capture_output=True,text=True,timeout=70)
        if result.returncode:
            raise RuntimeError(f'Trusted SDK build failed: {result.returncode}\n{result.stdout}\n{result.stderr}')
        lines = [line.strip() for line in result.stdout.splitlines() if '/Roslyn/bincore/csc.dll' in line and '/out:' in line]
        if len(lines) != 1:
            raise RuntimeError(f'Expected one compiler invocation, got {len(lines)}')
        command = shlex.split(re.sub(r'\s*\(TaskId:\d+\)\s*$', '', lines[0]))
        compiler = next(i for i,arg in enumerate(command) if arg.endswith('/Roslyn/bincore/csc.dll'))
        command = command[:compiler+1] + command[compiler+1:]
        stage = destination.with_name('csharp-build.next')
        if stage.exists(): shutil.rmtree(stage)
        stage.mkdir(parents=True, mode=0o755)
        captured = []
        for arg in command[compiler+1:]:
            if arg.startswith('/refout:'): continue
            if arg.startswith('/out:'):
                captured.append('/out:bin/Release/net8.0/App.dll'); continue
            prefix, value = (arg.split(':',1) if arg.startswith('/analyzerconfig:') else ('',arg))
            if value.startswith('obj/'):
                source = work/value
                if not source.is_file(): raise RuntimeError(f'Generated SDK input missing: {value}')
                name = source.name
                shutil.copyfile(source,stage/name)
                captured.append((prefix+':' if prefix else '')+'/usr/local/lib/studycod/csharp-build/'+name)
            else:
                captured.append(arg)
        if 'Program.cs' not in captured:
            raise RuntimeError('Compiler command has no participant source')
        for name in ['App.runtimeconfig.json','App.deps.json']:
            shutil.copyfile(work/'bin/Release/net8.0'/name,stage/name)
        direct = ['/usr/bin/env',*environment,*command[:compiler+1],*captured]
        wrapper = '#!/bin/sh\nset -eu\nmkdir -p bin/Release/net8.0\n'
        wrapper += 'cp /usr/local/lib/studycod/csharp-build/App.runtimeconfig.json /usr/local/lib/studycod/csharp-build/App.deps.json bin/Release/net8.0/\n'
        wrapper += 'exec '+shlex.join(direct)+'\n'
        (stage/'compile').write_text(wrapper)
        (stage/'compiler-options.json').write_text(json.dumps({'command':direct,'sdkCommand':command,'created':time.time()},indent=2))
        for file in stage.iterdir(): file.chmod(0o644)
        (stage/'compile').chmod(0o755)
        if destination.exists(): shutil.rmtree(destination)
        stage.rename(destination)
        print(json.dumps({'wrapper':str(destination/'compile'),'options':len(captured),'source':'installed SDK trusted project'}))
    finally:
        if group.exists():
            (group/'cgroup.kill').write_text('1')
            deadline=time.monotonic()+3
            while 'populated 1' in (group/'cgroup.events').read_text():
                if time.monotonic()>deadline: raise RuntimeError('Warmup process tree did not drain')
                time.sleep(.01)
            group.rmdir()
        shutil.rmtree(work)
