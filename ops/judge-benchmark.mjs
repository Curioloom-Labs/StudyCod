/** External driver for CPU/resource diagnosis; no fabricated API coverage. */
import { spawn } from 'node:child_process';
import { writeFile,mkdir,readFile } from 'node:fs/promises';
import { program,languages } from './contest-programs.mjs';
const concurrency=Number(process.argv[2]||1),language=process.argv[3]||'mixed',count=Number(process.argv[4]||100),tests=Number(process.argv[5]||15);
if(![1,2].includes(concurrency)||!Number.isInteger(count)||count<1||count>200||![15,45,70].includes(tests))throw new Error('Invalid diagnostic size');
const out=process.argv[6]||'outputs/contest-capacity';await mkdir(out,{recursive:true});
const warm=process.argv[7]==='warm';
const requests=Array.from({length:count},(_,index)=>{
  const lang=language==='mixed'?languages[index%languages.length]:language==='all'?languages[index]:language;
  if(!lang)throw new Error('invalid language/index');
  return {submission_id:`benchmark_${Date.now()}_${index}`,language:lang,source:program(lang,`bench-${language}-${tests}-${index}`),
    cache_owner:warm?`benchmark_${index}`:`cold_${Date.now()}_${index}`,
    tests:Array.from({length:tests},(_,t)=>({id:t+1,input:`${t+1}\n`,output:`${(t+1)*2}\n`,weight:1})),
    limits:{time_limit_ms:2000,memory_limit_mb:lang==='csharp'?1024:256,output_limit_kb:64},checker:{type:'whitespace'},debug:true,run_all:true};
});
const batch={requests,concurrency,command:concurrency===1?['/usr/local/sbin/studycod-judge-worker']:['/opt/nodejs/current/bin/node','/root/studycod-judge-candidate/judge/dist/index.js']};
if(process.env.JUDGE_BENCHMARK_CANDIDATE==='1'){
  if(concurrency!==1)throw new Error('Candidate serial profile only');
  batch.command=['/usr/bin/flock','/run/lock/studycod-judge.lock','/usr/bin/env','NODE_ENV=production','NSJAIL_USE_CONFIG=1',
    'NSJAIL_CONFIG=/root/studycod-judge-candidate/nsjail-info.cfg','JUDGE_BIN_NODE=/usr/local/bin/node-contest',
    'JUDGE_KOTLIN_COMPILER_JAR=/opt/kotlinc/kotlinc/lib/kotlin-compiler.jar',
    'JUDGE_KOTLIN_CDS_ARCHIVE=/usr/local/lib/studycod/kotlin-compiler.jsa','/opt/nodejs/current/bin/node','/root/studycod-judge-candidate/judge/dist/index.js'];
}
const stamp=Date.now(),stem=`benchmark-${language}-${count}-${tests}-${concurrency}-${warm?'warm':'cold'}-${stamp}`;
const remote=`/root/studycod-judge-candidate/${stem}`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function command(binary,args){
  const child=spawn(binary,args);let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const exit=await new Promise(resolve=>child.on('close',resolve));if(exit)throw new Error(`${binary} exited ${exit}: ${stderr}`);return stdout;
}
const ssh=['-o','BatchMode=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=6','root@195.191.24.47'];
batch.detached=true;batch.reportPath=remote+'.json';
await command('ssh',[...ssh,'install -d -m 700 /root/studycod-judge-candidate']);
await command('scp',['-q','ops/judge-benchmark-worker.mjs','root@195.191.24.47:/root/studycod-judge-candidate/judge-benchmark-worker.mjs']);
await writeFile(`${out}/${stem}.request.json`,JSON.stringify(batch));
await command('scp',['-q',`${out}/${stem}.request.json`,`root@195.191.24.47:${remote}.request.json`]);
const launch=`import subprocess,json
from pathlib import Path
command=['/opt/nodejs/current/bin/node','/root/studycod-judge-candidate/judge-benchmark-worker.mjs']
if ${concurrency} == 2: command=['/usr/bin/flock','/run/lock/studycod-judge.lock']+command
p=subprocess.Popen(command,stdin=open('${remote}.request.json'),stdout=open('${remote}.stdout','w'),stderr=open('${remote}.stderr','w'),start_new_session=True)
print(json.dumps({'pid':p.pid,'report':'${remote}.json'}))
`;
console.log(await command('ssh',[...ssh,`echo ${Buffer.from(launch).toString('base64')} | base64 -d | python3`]));
let last=-1;
while(true){
  await sleep(5000);
  try{
    const progress=JSON.parse(await command('ssh',[...ssh,`cat ${remote}.json.progress`]));
    if(progress.finished!==last){last=progress.finished;console.log(JSON.stringify(progress));}
    if(progress.complete)break;
  }catch(error){console.log(`Progress connection interrupted; the server batch remains saved: ${error.message}`);await sleep(5000);}
}
await command('scp',['-q',`root@195.191.24.47:${remote}.json`,`${out}/${stem}.json`]);
await command('scp',['-q',`root@195.191.24.47:${remote}.stderr`,`${out}/${stem}.stderr`]);
const result=JSON.parse(await readFile(`${out}/${stem}.json`,'utf8'));
console.log(JSON.stringify({finished:result.results.length,totalMs:result.finished-result.started,lastResultMs:Math.max(...result.results.map(r=>r.elapsedMs||0)),correct:result.results.every(r=>r.result?.verdict==='AC'&&r.result.tests.length===tests),failed:result.failed}));
