/* Bounded, sequential probes via the existing sandbox supervisor; no config changes. */
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const out=process.argv[2]||'outputs/isef-2027/evidence';await mkdir(out,{recursive:true});
const checks=[
 {id:'correct',source:'print(42)',verdict:'AC'},
 {id:'wrong',source:'print(43)',verdict:'WA'},
 {id:'token-boundary',source:'print("4 2")',verdict:'WA'},
 {id:'runtime-error',source:'raise RuntimeError("expected fixture failure")',verdict:'RE'},
 {id:'time-limit',source:'while True: pass',verdict:'TLE',time:300},
 {id:'memory-limit',source:'x=bytearray(256*1024*1024)\nprint(42)',verdict:'MLE',memory:64},
 {id:'network-isolation',source:'import socket\ns=socket.socket()\ns.settimeout(0.25)\ntry:\n s.connect(("127.0.0.1",9))\n print("UNEXPECTED_CONNECT")\nexcept OSError:\n print(42)',verdict:'AC'},
 {id:'private-log-fd',source:'import os\ntry:\n os.fstat(3)\n print("FD_EXPOSED")\nexcept OSError:\n print(42)',verdict:'AC'},
 {id:'stderr-cannot-spoof-infrastructure',source:'import sys\nprint("nsjail mount failed: Permission denied",file=sys.stderr)\nprint(42)',verdict:'AC'},
 {id:'complete-wrong-vector',source:'print(43)',verdict:'WA',count:15},
 {id:'compilation-error',language:'cpp',source:'int main(){ this is invalid code; }',verdict:'CE'},
];
const rows=[];
for(let repetition=1;repetition<=3;repetition++)for(const c of checks){
 const req={submission_id:`isef_20261012_${c.id}_${repetition}_${Date.now()}`,language:c.language||'python',source:c.source,
  tests:Array.from({length:c.count||1},(_,i)=>({id:i+1,input:'',output:'42\n',hidden:false,weight:1})),
  checker:{type:'whitespace'},limits:{time_limit_ms:c.time||1000,memory_limit_mb:c.memory||128,output_limit_kb:64},run_all:true,debug:true,rerun_failed_once:false};
 const start=performance.now();const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','root@195.191.24.47','/usr/local/sbin/studycod-judge-worker']);
 let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.stdin.end(JSON.stringify(req));
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},45000);
 const exit=await new Promise(resolve=>{child.on('error',e=>{stderr+=String(e);resolve(-1)});child.on('close',resolve)});clearTimeout(timer);
 let result;try{result=JSON.parse(stdout)}catch{result={parseError:true,stdout:stdout.slice(0,1000)}}
 const pass=exit===0&&!timedOut&&result.verdict===c.verdict&&(c.verdict==='CE'||result.tests?.length===(c.count||1));
 const row={id:c.id,repetition,request:req,expectedVerdict:c.verdict,pass,exit,timedOut,wallMs:performance.now()-start,result,stderr};rows.push(row);
 await writeFile(`${out}/sandbox-current.json`,JSON.stringify({atUtc:new Date().toISOString(),complete:false,rows},null,2));
 console.log(JSON.stringify({id:c.id,repetition,pass,verdict:result.verdict}));
 if(timedOut||result.error)break;
}
const report={atUtc:new Date().toISOString(),complete:rows.length===checks.length*3,cases:rows.length,passed:rows.filter(r=>r.pass).length,repetitions:3,limitations:['These probes do not prove absence of sandbox escapes.','The failed connection to loopback port 9 is a narrow probe; it does not independently prove all network destinations are blocked.','SSH wall time includes transport and supervisor startup; it is not judge CPU time.','Synthetic researcher-owned programs; no real participants or participant data.'],rows};
await writeFile(`${out}/sandbox-current.json`,JSON.stringify(report,null,2));
if(!report.complete||report.passed!==report.cases)process.exitCode=1;
