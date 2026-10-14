/** Run from a machine outside the VPS. Credentials stay in *.private.json files. */
import { readFile, writeFile, mkdir, open, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import https from 'node:https';
import { Readable } from 'node:stream';
import { program, languages } from './contest-programs.mjs';

const base = process.env.CONTEST_TEST_URL || 'https://studycod.space';
const mode = process.argv[2] || 'smoke';
const directory = process.argv[3] || 'outputs/contest-capacity';
const report = { startedAt: new Date().toISOString(), base, mode, requests: [], scenarios: [], errors: [] };
report.backendVersion=process.env.CONTEST_BACKEND_VERSION||'unspecified';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const agent=new https.Agent({keepAlive:true,maxSockets:220,maxFreeSockets:100,scheduling:'lifo'});
// Keep the 100 SSE sockets separate from reusable ordinary API connections.
function transport(url, options) {
  return new Promise((resolve,reject)=>{
    const headers={...options.headers,...(options.body===undefined?{}:{'Content-Length':Buffer.byteLength(options.body)})};
    const request=https.request(url,{method:options.method||'GET',headers,signal:options.signal,agent},response=>{
      const headers=new Headers();
      for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
      const empty=[204,205,304].includes(response.statusCode);
      if(empty)response.resume();
      resolve(new Response(empty?null:Readable.toWeb(response),{status:response.statusCode,headers}));
    });
    request.on('error',reject);
    request.setTimeout(350_000,()=>request.destroy(Object.assign(new Error('API transport timeout'),{code:'ETIMEDOUT'})));
    request.end(options.body);
  });
}
await mkdir(directory, { recursive: true });

class Client {
  cookies = new Map();
  constructor(account) { this.account = account; }
  headers(extra = {}) {
    return { Origin: base, Cookie: [...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),
      ...(this.cookies.has('XSRF-TOKEN') ? {'X-XSRF-TOKEN':decodeURIComponent(this.cookies.get('XSRF-TOKEN'))} : {}), ...extra };
  }
  async request(path, method='GET', body, headers={}) {
    const start = performance.now();
    let response,text;
    for(let attempt=0;;attempt++) {
      try {
        response=await transport(`${base}/api${path}`, {method, headers:this.headers({'Content-Type':'application/json',...headers}),
          body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(350_000)});
        text=await response.text();break;
      }catch(error){
        (report.transportErrors??=[]).push({path,method,attempt,error:String(error),at:Date.now()});
        if(attempt>=2||(method!=='GET'&&!headers['Idempotency-Key']))throw error;
        await sleep(500+Math.random()*500);
      }
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair=cookie.split(';')[0], pos=pair.indexOf('=');
      this.cookies.set(pair.slice(0,pos),pair.slice(pos+1));
    }
    let data; try{data=JSON.parse(text);}catch{data={text};}
    report.requests.push({path,method,status:response.status,ms:performance.now()-start,at:Date.now()});
    if (!response.ok) throw Object.assign(new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`),{status:response.status,data});
    return data;
  }
  async login(contestId, organiser=false) {
    await this.request('/csrf-token');
    await this.request(organiser ? '/auth/login' : '/auth/contest-login','POST',
      {username:this.account.username,password:this.account.password,...(this.account.turnstileToken ? {turnstileToken:this.account.turnstileToken} : {}),...(organiser ? {} : {contestId})});
    await this.request('/csrf-token');
  }
  async sse(contestId, signal, onEvent=()=>{}) {
    const response=await transport(`${base}/api/contests/${contestId}/events`,{headers:this.headers(),signal});
    if (!response.ok) throw new Error(`SSE ${response.status}`);
    const reader=response.body.getReader(), decoder=new TextDecoder();
    let buffer='';
    while (!signal.aborted) {
      const chunk=await reader.read();
      if(chunk.done){if(!signal.aborted)throw new Error('SSE closed before the scenario ended');break;}
      buffer+=decoder.decode(chunk.value,{stream:true});
      let end;
      while((end=buffer.indexOf('\n\n'))>=0){ const event=buffer.slice(0,end);buffer=buffer.slice(end+2);onEvent(event); }
    }
  }
}

let fixture;
if (mode === 'setup') {
  const credentials=JSON.parse(await readFile(`${directory}/admin.private.json`,'utf8'));
  const admin=new Client(credentials);await admin.login(null,true);
  // Reserve the recovery file before creating anything; never overwrite a fixture.
  const handle=await open(`${directory}/fixture.private.json`,'wx',0o600);
  const persist=async()=>{await handle.truncate(0);await handle.write(JSON.stringify(fixture),0,'utf8');await handle.sync();};
  try {
  const title=`Capacity test ${new Date().toISOString()}`;
  const contest=await admin.request('/contests','POST',{title,
    visibility:'TEMPORARY_ACCOUNTS',participantAccessMode:'ISSUED_ACCOUNTS',isPublished:true,allowUpsolve:false,
    startsAt:new Date(Date.now()-60_000).toISOString(),endsAt:new Date(Date.now()+24*3600_000).toISOString(),scoringMode:'ICPC'});
  const problems={};
  fixture={contestId:contest.id,title,problems,createdLibraryTaskIds:[],accounts:[],admin:credentials};await persist();
  for(const count of [15,45,70]) {
    const tests=Array.from({length:count},(_,i)=>({input:`${i+1}\n`,expectedOutput:`${(i+1)*2}\n`,isHidden:i>0,points:1}));
    const problem=await admin.request(`/contests/${contest.id}/problems`,'POST',{mode:'CREATE',title:`Double ${count} tests`,
      description:'Read an integer and print twice its value.',template:program('java','template'),tests});
    problems[count]=problem.problemId;
    fixture.createdLibraryTaskIds.push(problem.libraryTaskId);
    await persist();
  }
  const accounts=await admin.request(`/contests/${contest.id}/admin/accounts/generate`,'POST',
    {entries:Array.from({length:100},(_,i)=>({fullName:`Capacity participant ${i+1}`}))});
  fixture.accounts=accounts.created;await persist();
  console.log(JSON.stringify({contestId:contest.id,problems,accounts:accounts.created.length}));
  } finally {await handle.close();}
  process.exit(0);
}
fixture=JSON.parse(await readFile(`${directory}/fixture.private.json`,'utf8'));
if(mode==='cleanup') {
  const organiser=new Client(fixture.admin);await organiser.login(null,true);
  if(!fixture.title?.startsWith('Capacity test '))throw new Error('Refusing cleanup of a different contest');
  if(!fixture.contestDeleted){
    const current=await organiser.request(`/contests/${fixture.contestId}`);
    if(current.contest?.title!==fixture.title)throw new Error('Refusing cleanup of a different contest');
    // The API refuses deletion with pending jobs and removes its issued accounts.
    await organiser.request(`/contests/${fixture.contestId}`,'DELETE',{confirmTitle:fixture.title});
    fixture.contestDeleted=true;await writeFile(`${directory}/fixture.private.json`,JSON.stringify(fixture),{mode:0o600});
  }
  for(const id of fixture.createdLibraryTaskIds||[]) {
    if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid fixture task identifier');
    try{await organiser.request(`/library/tasks/${id}`,'DELETE');}catch(error){if(error.status!==404)throw error;}
  }
  await saveCleanupReport();
  await rm(`${directory}/fixture.private.json`);
  console.log('Private fixture and its issued accounts removed');process.exit(0);
}
async function saveCleanupReport(){await writeFile(`${directory}/cleanup-${Date.now()}.json`,JSON.stringify({contestId:fixture.contestId,deletedAt:new Date().toISOString()}));}
const users=fixture.accounts.map(account=>new Client(account));
// Same external IP for all users. Login remains paced under the separate IP guard.
for(let i=0;i<users.length;i++) { await users[i].login(fixture.contestId); if(i%10===0)console.log(`Logged in ${i+1}/100`);await sleep(210); }
const admin=new Client(fixture.admin);await admin.login(null,true);
const eventAbort=new AbortController();
const ready=new Set(), received=new Map();
const eventOwners=new Map(), jobOwners=new Map();
const acceptedJobs=new Map();
function recordEvent(index,event) {
  if(event.startsWith('event: ready'))ready.add(index);
  if(event.startsWith('event: job')) {const payload=event.match(/data: (.*)/)?.[1];if(payload){const job=JSON.parse(payload);received.set(job.jobId,job.status);
    const owners=eventOwners.get(job.jobId)||new Set();owners.add(index);eventOwners.set(job.jobId,owners);}}
}
const streams=users.map(async(client,index)=>{
  let failures=0;
  while(!eventAbort.signal.aborted) {
    try{await client.sse(fixture.contestId,eventAbort.signal,event=>recordEvent(index,event));}
    catch(error){
      if(eventAbort.signal.aborted)break;
      (report.sseDisconnections??=[]).push({ownerIndex:index,at:Date.now(),error:String(error)});
      if(++failures>=5){report.errors.push(`SSE owner ${index}: five failed streams: ${error}`);break;}
      // Match browser EventSource recovery; preserve every interruption in evidence.
      await sleep(1000+Math.random()*4000);
    }
  }
});
for(let until=Date.now()+60_000;ready.size<users.length&&Date.now()<until;)await sleep(100);
report.sseReady=ready.size;

async function submit(client, problemId, language, salt, wrong=false, key=randomUUID()) {
  const body={code:program(language,salt,wrong),language,compiler:language};
  const start=Date.now();
  const receipt=await client.request(`/contests/${fixture.contestId}/problems/${problemId}/check`,'POST',body,
    {Prefer:'respond-async','Idempotency-Key':key});
  jobOwners.set(receipt.jobId,users.indexOf(client));
  const job={client,body,key,start,language,expected:wrong?'WA':'AC',receipt,acceptedAt:Date.now(),
    testCount:Number(Object.entries(fixture.problems).find(([,id])=>id===problemId)?.[0])};
  acceptedJobs.set(receipt.jobId,job);
  await writeFile(`${directory}/accepted-${receipt.jobId}.json`,JSON.stringify({receipt,start,acceptedAt:job.acceptedAt,
    ownerIndex:users.indexOf(client),language,key,expected:job.expected,testCount:job.testCount}));
  return job;
}
async function finish(job) {
  let status;
  const until=Date.now()+30*60_000;
  while(Date.now()<until) {
    status=await job.client.request(job.receipt.statusUrl);
    if(status.status==='completed'||status.status==='system_error')break;
    if (received.delete(job.receipt.jobId)) await sleep(50);
    else await sleep(5000+Math.random()*500);
  }
  const result={jobId:job.receipt.jobId,submissionId:job.receipt.submissionId,language:job.language,
    elapsedMs:Date.now()-job.start,admissionMs:job.acceptedAt-job.start,status:status?.status,result:status?.result,expected:job.expected};
  if(status?.status!=='completed'||status.result?.verdict!==job.expected||status.result?.testsTotal!==job.testCount
    ||status.result?.tests?.length!==job.testCount)
    report.errors.push(JSON.stringify(result));
  if(status?.status==='completed'||status?.status==='system_error')acceptedJobs.delete(job.receipt.jobId);
  await writeFile(`${directory}/result-${job.receipt.jobId}.json`,JSON.stringify(result));
  return result;
}
const cacheSalts=new Map();
async function burst(count, language='mixed', warm=false) {
  const scenario={name:`burst-${language}-${count}-${warm?'warm':'cold'}`,startedAt:Date.now()};
  let reading=true;
  const readers=users.map(async(client)=>{
    await sleep(Math.random()*5000);
    while(reading){
      try{await client.request(`/contests/${fixture.contestId}/problems/${fixture.problems[count]}`);await client.request(`/contests/${fixture.contestId}/standings`);}
      catch(error){report.errors.push(`Burst read: ${error}`);}
      await sleep(5000+Math.random()*1000);
    }
  });
  const cacheKey=`${language}-${count}`;
  if(!warm)cacheSalts.set(cacheKey,randomUUID());
  const salt=cacheSalts.get(cacheKey)||randomUUID();
  const admissions=await Promise.allSettled(users.map(async(client,index)=>{
    await sleep(index*90);
    const lang=language==='mixed'?languages[index%languages.length]:language;
    const job=await submit(client,fixture.problems[count],lang,`${salt}-${index}`,index%10===0);
    job.testCount=count;return job;
  }));
  const jobs=admissions.filter(item=>item.status==='fulfilled').map(item=>item.value);
  scenario.admissionErrors=admissions.filter(item=>item.status==='rejected').map(item=>String(item.reason));
  report.errors.push(...scenario.admissionErrors);
  scenario.admissionWindowMs=Math.max(...jobs.map(j=>j.acceptedAt))-Math.min(...jobs.map(j=>j.start));
  scenario.results=await Promise.all(jobs.map(finish));
  reading=false;await Promise.all(readers);
  scenario.lastResultMs=Math.max(...scenario.results.map(r=>r.elapsedMs));
  scenario.correct=jobs.length===100&&scenario.results.every(r=>r.status==='completed'&&r.result.verdict===r.expected&&r.result.testsTotal===count);
  scenario.unique=new Set(scenario.results.map(r=>r.submissionId)).size;
  scenario.within300s=scenario.results.every(r=>r.elapsedMs<=300_000);
  report.scenarios.push(scenario);await saveReport();
  console.log(JSON.stringify({name:scenario.name,lastResultMs:scenario.lastResultMs,correct:scenario.correct,unique:scenario.unique,within300s:scenario.within300s}));
}
async function saveReport(){await writeFile(`${directory}/${mode}-${report.startedAt.replaceAll(':','-')}.json`,JSON.stringify(report,null,2));}
async function expectStatus(action, expected) {
  try { await action();throw new Error(`Expected HTTP ${expected}`); }
  catch(error){if(error.status!==expected)throw error;}
}
async function faults() {
  // Use only the dedicated fixture: record and restore its original end time.
  const before=await admin.request(`/contests/${fixture.contestId}`);
  const originalEnd=before.contest?.endsAt??before.endsAt;
  if(!originalEnd)throw new Error('Fixture must have an end time');
  try {
    const invalidPassword=new Client({...fixture.accounts[0],password:randomUUID()});
    await expectStatus(()=>invalidPassword.login(fixture.contestId),401);
    await expectStatus(()=>admin.request(`/contests/${fixture.contestId}`,'PATCH',{endsAt:originalEnd},
      {'X-XSRF-TOKEN':''}),403);
    await admin.request(`/contests/${fixture.contestId}`,'PATCH',{endsAt:new Date(Date.now()+30*60_000).toISOString()});
    const [participantBoard,managerBoard]=await Promise.all([
      users[0].request(`/contests/${fixture.contestId}/standings`),admin.request(`/contests/${fixture.contestId}/standings`)]);
    if(!participantBoard.freeze?.frozen||managerBoard.freeze?.frozen||!managerBoard.freeze?.isManagerView)
      throw new Error('Freeze/access projection mismatch');
    const job=await submit(users[0],fixture.problems[70],'kotlin',randomUUID());job.testCount=70;
    await expectStatus(()=>users[1].request(job.receipt.statusUrl),404);
    await admin.request(`/contests/${fixture.contestId}`,'PATCH',{endsAt:new Date(Date.now()-1000).toISOString()});
    // Stopping all client streams cannot cancel already accepted work.
    eventAbort.abort();await Promise.allSettled(streams);
    const retry=await users[0].request(`/contests/${fixture.contestId}/problems/${fixture.problems[70]}/check`,'POST',job.body,
      {Prefer:'respond-async','Idempotency-Key':job.key});
    if(retry.jobId!==job.receipt.jobId)throw new Error('Accepted job changed after contest end/disconnection');
    await expectStatus(()=>users[0].request(`/contests/${fixture.contestId}/problems/${fixture.problems[70]}/check`,'POST',
      {...job.body,code:job.body.code+'\n '},{Prefer:'respond-async','Idempotency-Key':job.key}),409);
    await expectStatus(()=>submit(users[1],fixture.problems[70],'python',randomUUID()),403);
    report.scenarios.push({name:'freeze-owner-isolation-end-disconnection-idempotency',result:await finish(job)});
  } finally { await admin.request(`/contests/${fixture.contestId}`,'PATCH',{endsAt:originalEnd}); }
}
async function sustain(durationSeconds=1800) {
  const start=Date.now(),duration=durationSeconds*1000;
  const readers=users.map(async(client)=>{
    await sleep(Math.random()*5000);
    while(Date.now()-start<duration) {
      await client.request(`/contests/${fixture.contestId}/problems/${fixture.problems[45]}`);
      await client.request(`/contests/${fixture.contestId}/standings`);
      await sleep(5000+Math.random()*1000);
    }
  });
  const senders=users.map(async(client,index)=>{
    let nextSubmit=start+20_000+index*15_000;
    while(Date.now()-start<duration) {
      await sleep(Math.min(1000,Math.max(0,nextSubmit-Date.now())));
      if(Date.now()-start>=duration)break;
      if(Date.now()>=nextSubmit){const job=await submit(client,fixture.problems[45],languages[index%languages.length],`sustain-${index}-${nextSubmit}`);job.testCount=45;
        report.scenarios.push(await finish(job));nextSubmit=Date.now()+180_000;await saveReport();}
    }
  });
  await Promise.all([...readers,...senders]);
  report.sustainDurationMs=Date.now()-start;
}
try {
  if (mode==='smoke') {
    for(const [index, language] of languages.entries()) {
      const job=await submit(users[index],fixture.problems[15],language,`smoke-${language}`);job.testCount=15;
      const retry=await job.client.request(`/contests/${fixture.contestId}/problems/${fixture.problems[15]}/check`,'POST',job.body,
        {Prefer:'respond-async','Idempotency-Key':job.key});
      if(retry.jobId!==job.receipt.jobId)throw new Error('duplicate job');
      try {await job.client.request(`/contests/${fixture.contestId}/problems/${fixture.problems[15]}/check`,'POST',{...job.body,code:job.body.code+'\n '},
        {Prefer:'respond-async','Idempotency-Key':job.key});throw new Error('conflict accepted');}catch(e){if(e.status!==409)throw e;}
      const result=await finish(job);report.scenarios.push(result);console.log(JSON.stringify(result));
      await sleep(3200);
    }
  } else if(mode==='faults') await faults();
  else if(mode==='run-probe') {
    const body={code:program('python',randomUUID()),language:'python',compiler:'python',input:'7\n'};
    const key=randomUUID(),endpoint=`/contests/${fixture.contestId}/problems/${fixture.problems[15]}/run`;
    const receipt=await users[0].request(endpoint,'POST',body,{Prefer:'respond-async','Idempotency-Key':key});
    jobOwners.set(receipt.jobId,0);
    if(receipt.submissionId!==null)throw new Error('Trial run created an official submission');
    const replay=await users[0].request(endpoint,'POST',body,{Prefer:'respond-async','Idempotency-Key':key});
    if(replay.jobId!==receipt.jobId)throw new Error('Trial run replay changed job');
    await expectStatus(()=>users[1].request(receipt.statusUrl),404);
    await expectStatus(()=>users[0].request(endpoint,'POST',{...body,input:'9\n'},
      {Prefer:'respond-async','Idempotency-Key':key}),409);
    let status;
    const until=Date.now()+30*60_000;
    do{status=await users[0].request(receipt.statusUrl);if(!['completed','system_error'].includes(status.status))await sleep(5000);}
    while(!['completed','system_error'].includes(status.status)&&Date.now()<until);
    if(status.status!=='completed'||status.result?.stdout.trim()!=='14'||!status.result.success)
      throw new Error(`Trial run failed: ${JSON.stringify(status)}`);
    const synchronous=await users[0].request(endpoint,'POST',{...body,input:'9\n'}, {'Idempotency-Key':randomUUID()});
    if(synchronous.stdout?.trim()!=='18'||!synchronous.success)throw new Error('Synchronous trial adapter failed');
    report.scenarios.push({name:'trial-run-async-sync-idempotency-owner',jobId:receipt.jobId,correct:true,result:status.result,synchronous});
  }
  else if(mode==='sequential') {
    for(const count of [15,45,70])for(const [index,language] of languages.entries())for(const wrong of [false,true]) {
      const job=await submit(users[index],fixture.problems[count],language,`reference-${count}-${language}-${wrong}`,wrong);job.testCount=count;
      report.scenarios.push({name:`reference-${count}-${language}-${wrong}`,result:await finish(job)});await saveReport();
    }
  } else if(mode==='burst') await burst(Number(process.argv[4]||15),process.argv[5]||'mixed');
  else if(mode==='post-optimization') {
    await burst(15,'mixed',false);await burst(15,'mixed',true);
    console.log('Starting 30-minute session after participant read optimization');await sustain(1800);
    await faults();
  }
  else if(mode==='acceptance') {
    // Every language has a sequential reference before concurrent comparisons.
    if(process.env.CONTEST_REFERENCE_REPORT) {
      const previous=JSON.parse(await readFile(process.env.CONTEST_REFERENCE_REPORT,'utf8'));
      const references=previous.scenarios.filter(s=>s.name?.startsWith('reference-'));
      if(references.length!==114||references.some(s=>s.result?.status!=='completed'||s.result?.result?.verdict!==s.result?.expected
        ||s.result.result.tests.length!==Number(s.name.split('-')[1])))throw new Error('Complete correct reference evidence required');
      report.referenceEvidence={file:process.env.CONTEST_REFERENCE_REPORT,startedAt:previous.startedAt,
        reason:'Same retained fixture tests and unchanged root judge/toolchain; only HTTP/auth/read performance changed'};
      report.scenarios.push(...references);await saveReport();
    } else {
    for(const count of [15,45,70])for(const [index,language] of languages.entries())for(const wrong of [false,true]) {
      const job=await submit(users[index],fixture.problems[count],language,`reference-${count}-${language}-${wrong}`,wrong);job.testCount=count;
      const result=await finish(job);report.scenarios.push({name:`reference-${count}-${language}-${wrong}`,result});await saveReport();
      console.log(JSON.stringify({reference:language,count,wrong,status:result.status,verdict:result.result?.verdict}));
    }
    }
    for(const count of [15,45,70]) {await burst(count,'mixed',false);await burst(count,'mixed',true);}
    console.log('Starting 30-minute authenticated session scenario');await sustain(1800);
    await faults();
  }
  else if(mode==='suite') {
    for(const count of [15,45,70])for(const language of ['mixed',...languages]) {
      await burst(count,language,false);await burst(count,language,true);
    }
  } else if(mode==='sustain') {
    await sustain(Number(process.argv[4]||1800));
  } else throw new Error(`Unknown mode: ${mode}`);
} catch(error) { report.errors.push(String(error));console.error(error);process.exitCode=1; }
finally {
  // An unrelated HTTP failure never abandons already admitted durable jobs.
  for(const job of acceptedJobs.values()) {
    try{report.scenarios.push({name:'drain-after-error',result:await finish(job)});}catch(error){report.errors.push(`Drain: ${error}`);}
  }
  report.sseReady=ready.size;eventAbort.abort();await Promise.allSettled(streams);
  for(const [jobId,owners] of eventOwners)if(jobOwners.has(jobId)&&[...owners].some(owner=>owner!==jobOwners.get(jobId)))
    report.errors.push(`SSE job leaked to a different account: ${jobId}`);
  report.sseJobDelivery={jobs:eventOwners.size,owners:new Set([...eventOwners.values()].flatMap(owners=>[...owners])).size,
    acceptedJobs:jobOwners.size,ownJobsWithEvents:[...jobOwners].filter(([jobId,owner])=>eventOwners.get(jobId)?.has(owner)).length};
  const reads=report.requests.filter(r=>r.method==='GET'&&!r.path.includes('/jobs/')).map(r=>r.ms).sort((a,b)=>a-b);
  const admissions=report.requests.filter(r=>r.path.endsWith('/check')&&r.status===202).map(r=>r.ms).sort((a,b)=>a-b);
  report.p95ReadMs=reads[Math.floor(reads.length*.95)];report.p95AdmissionMs=admissions[Math.floor(admissions.length*.95)];
  report.finishedAt=new Date().toISOString();await saveReport();
  agent.destroy();
  if(report.errors.length)process.exitCode=1;
  console.log(JSON.stringify({errors:report.errors.length,sseReady:ready.size,p95ReadMs:report.p95ReadMs,p95AdmissionMs:report.p95AdmissionMs}));
}
