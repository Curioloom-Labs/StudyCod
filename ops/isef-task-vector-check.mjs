// Optional existing junior task bundle; not assumed to be the October 18 contest.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const bundle='outputs/junior-league-2026-10-09';
const rows=[]; const dir='outputs/isef-2027/evidence'; await mkdir(dir,{recursive:true});
async function remotePython(code,input='') {
 const child=spawn('ssh',['-o','BatchMode=yes','root@195.191.24.47',`python3 -c '${code.replaceAll("'", "'\\''")}'`]);
 let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.stdin.end(input);
 const exit=await new Promise(r=>{child.on('error',()=>r(-1));child.on('close',r)});if(exit!==0)throw new Error(err);return out.trim();
}
if(process.argv[2]==='resume-H') {
 const prior=JSON.parse(await readFile(`${dir}/task-vector-current.json`,'utf8'));
 await writeFile(`${dir}/task-vector-inline-attempt.json`,JSON.stringify(prior,null,2));
 rows.push(...prior.rows.filter(r=>r.task!=='H'));
}
for(const task of (process.argv[2]==='resume-H'?'H':'ABCDEFGH')) for(const language of ['python','cpp']) {
 const data=await readFile(`${bundle}/tasks/${task}/tests.json`,'utf8');
 const source=await readFile(`${bundle}/organizer/${task}/solution.${language==='python'?'py':'cpp'}`,'utf8');
 let tests=JSON.parse(data).map((t,i)=>({id:i+1,input:t.input,output:t.expectedOutput,weight:t.points,hidden:false}));
 let remoteDir=null;
 if(tests.some(t=>Buffer.byteLength(t.input)>1048576)) {
  remoteDir=await remotePython('import sys,json,tempfile,pathlib; d=pathlib.Path(tempfile.mkdtemp(prefix="isef-vector-")); tests=json.load(sys.stdin); [( (d/(str(t["id"])+".in")).write_text(t["input"]), (d/(str(t["id"])+".out")).write_text(t["output"]) ) for t in tests]; print(d)',JSON.stringify(tests));
  if(!/^\/tmp\/isef-vector-[A-Za-z0-9_-]+$/.test(remoteDir))throw new Error('unexpected temporary directory');
  tests=tests.map(t=>({id:t.id,input_path:`${remoteDir}/${t.id}.in`,output_path:`${remoteDir}/${t.id}.out`,weight:t.weight,hidden:t.hidden}));
 }
 const request={submission_id:`isef_vector_${task}_${language}_${Date.now()}`,language,source,tests,checker:{type:'whitespace'},limits:{time_limit_ms:1000,memory_limit_mb:256,output_limit_kb:64},run_all:true,debug:true,rerun_failed_once:false};
 const child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','root@195.191.24.47','/usr/local/sbin/studycod-judge-worker']);
 let stdout='',stderr='',timedOut=false; child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);child.stdin.end(JSON.stringify(request));
 const timer=setTimeout(()=>{timedOut=true;child.kill()},60000);const exit=await new Promise(r=>{child.on('error',e=>{stderr+=e;r(-1)});child.on('close',r)});clearTimeout(timer);
 let result;try{result=JSON.parse(stdout)}catch{result={parseError:true}};
 const pass=!timedOut&&exit===0&&result.verdict==='AC'&&result.tests?.length===tests.length;
 if(remoteDir)await remotePython(`import shutil; shutil.rmtree("${remoteDir}")`);
 rows.push({task,language,transport:remoteDir?'file-references':'inline',testCount:tests.length,sourceSha256:createHash('sha256').update(source).digest('hex'),testsSha256:createHash('sha256').update(data).digest('hex'),pass,result,stderr,exit,timedOut});
 await writeFile(`${dir}/task-vector-current.json`,JSON.stringify({atUtc:new Date().toISOString(),bundle,complete:false,rows},null,2));
 console.log(JSON.stringify({task,language,pass,verdict:result.verdict,tests:result.tests?.length}));
 if(timedOut||exit!==0)break;
}
const report={atUtc:new Date().toISOString(),bundle,complete:rows.length===16,jobs:rows.length,passedJobs:rows.filter(x=>x.pass).length,testExecutions:rows.reduce((n,x)=>n+(x.result.tests?.length||0),0),limitations:['Sequential reference programs only; not concurrent load, adversarial security proof or validation of the unknown October 18 task set.'],rows};
await writeFile(`${dir}/task-vector-current.json`,JSON.stringify(report,null,2));if(!report.complete||report.passedJobs!==report.jobs)process.exitCode=1;
