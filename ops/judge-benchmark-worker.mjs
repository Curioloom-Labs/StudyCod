/** Diagnostic capacity benchmark only. This does not replace authenticated API acceptance. */
import { spawn } from 'node:child_process';
import { readFile,writeFile,rename } from 'node:fs/promises';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const batch=JSON.parse(raw);
if(batch.detached)while(process.ppid!==1)await new Promise(resolve=>setTimeout(resolve,25));
const started=Date.now(),results=[];
let next=0,failed=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let saving=Promise.resolve();
async function save(complete=false){
  if(!batch.reportPath)return;
  saving=saving.then(async()=>{
    const report={started,finished:Date.now(),concurrency:batch.concurrency,failed,complete,results};
    await writeFile(batch.reportPath+'.tmp',JSON.stringify(report));await rename(batch.reportPath+'.tmp',batch.reportPath);
    await writeFile(batch.reportPath+'.progress.tmp',JSON.stringify({complete,failed,finished:results.length,last:results.at(-1)?{index:results.at(-1).index,verdict:results.at(-1).result?.verdict,elapsedMs:results.at(-1).elapsedMs}:null}));
    await rename(batch.reportPath+'.progress.tmp',batch.reportPath+'.progress');
  });
  return saving;
}
await save();
async function worker(){
  while(next<batch.requests.length&&!failed){
    const index=next++,request=batch.requests[index];
    const acceptedAt=started+index*90;
    await sleep(Math.max(0,acceptedAt-Date.now()));
    const memory=await readFile('/proc/meminfo','utf8');
    const swap=Number(memory.match(/^SwapTotal:\s+(\d+)/m)[1])-Number(memory.match(/^SwapFree:\s+(\d+)/m)[1]);
    if(swap>1536*1024){failed=true;results.push({index,error:'SWAP_LIMIT_EXCEEDED',swapKb:swap});break;}
    const executionStarted=Date.now();
    const child=spawn(batch.command[0],batch.command.slice(1),{env:{...process.env,NODE_ENV:'production',NSJAIL_USE_CONFIG:'1',NSJAIL_CONFIG:'/usr/local/lib/studycod-judge/sandbox/nsjail.cfg'}});
    let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
    child.stdin.end(JSON.stringify(request));
    const exit=await new Promise(resolve=>child.on('close',resolve));
    let result;try{result=JSON.parse(stdout);}catch{result={error:stdout};}
    const row={index,language:request.language,acceptedAt,executionStarted,finishedAt:Date.now(),elapsedMs:Date.now()-acceptedAt,executionMs:Date.now()-executionStarted,exit,result,stderr};
    results.push(row);process.stderr.write(JSON.stringify({index,language:request.language,elapsedMs:row.elapsedMs,verdict:result.verdict,error:result.error})+'\n');
    await save();
  }
}
await Promise.all(Array.from({length:batch.concurrency},worker));
await save(true);
process.stdout.write(JSON.stringify({started,finished:Date.now(),concurrency:batch.concurrency,failed,results}));
