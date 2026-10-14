/** Root-only integration evidence. Synthetic DB participants are NOT authenticated API accounts. */
import { createRequire } from 'node:module';
import { writeFile,readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { program,languages } from './contest-programs.mjs';
const root='/var/www/studycod',require=createRequire(`${root}/backend/package.json`);
require('dotenv').config({path:`${root}/backend/.env`,quiet:true});require('reflect-metadata');
const {AppDataSource:db}=require(`${root}/backend/dist/backend/src/data-source.js`);
const {enqueueContestJob,requestHash}=require(`${root}/backend/dist/backend/src/services/contest/executionQueue.js`);
const {Contest}=require(`${root}/backend/dist/backend/src/entities/Contest.js`);
const {ContestProblem}=require(`${root}/backend/dist/backend/src/entities/ContestProblem.js`);
const {ContestParticipant}=require(`${root}/backend/dist/backend/src/entities/ContestParticipant.js`);
const {LibraryTask}=require(`${root}/backend/dist/backend/src/entities/LibraryTask.js`);
const {User}=require(`${root}/backend/dist/backend/src/entities/User.js`);
const {ContestSubmission}=require(`${root}/backend/dist/backend/src/entities/ContestSubmission.js`);
const output=process.argv[2],mode=process.argv[3]||'admit',language=process.argv[4]||'python',testCount=Number(process.argv[5]||45);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.getuid()!==0||!output.startsWith('/root/')||!output.endsWith('.json'))throw new Error('root private output required');
await db.initialize();
try {
  if(mode==='admit'){
    const user=await db.getRepository(User).findOne({where:{role:'SYSTEM_ADMIN'},select:{id:true}});
    const task=await db.getRepository(LibraryTask).findOne({where:{},select:{id:true}});
    const contest=await db.getRepository(Contest).save(db.getRepository(Contest).create({createdBy:user,title:`Internal queue integration ${randomUUID()}`,
      visibility:'PRIVATE_CODE',joinCode:randomUUID(),isPublished:false,allowUpsolve:false,endsAt:new Date(Date.now()+3600000)}));
    const problem=await db.getRepository(ContestProblem).save(db.getRepository(ContestProblem).create({contest,libraryTask:task,order:0}));
    const participants=await db.getRepository(ContestParticipant).save(Array.from({length:100},(_,i)=>db.getRepository(ContestParticipant).create({contest,principalType:'USER',displayName:`Internal synthetic participant ${i}`})));
    const report={kind:'DB queue integration; authentication/CSRF not covered',contestId:contest.id,problemId:problem.id,testCount,language,jobs:[],admissionStarted:Date.now()};
    await writeFile(output,JSON.stringify(report),{mode:0o600});
    report.jobs=await Promise.all(participants.map(async(participant,index)=>{
      await sleep(index*90);const lang=language==='mixed'?languages[index%languages.length]:language;
      const source=program(lang,`queue-${contest.id}-${index}`),key=randomUUID();
      const payload={request:{submission_id:`queue_${index}`,language:lang,source,
        tests:Array.from({length:testCount},(_,t)=>({id:t+1,input:`${t+1}\n`,output:`${(t+1)*2}\n`,weight:1})),
        limits:{time_limit_ms:2000,memory_limit_mb:lang==='csharp'?1024:256,output_limit_kb:64},checker:{type:'whitespace'},debug:true,run_all:true},
        context:{contestId:contest.id,problemId:problem.id,participantId:participant.id,maxScore:testCount,problemPoints:null,submissionPhase:'CONTEST',
          tests:Array.from({length:testCount},(_,t)=>({id:t+1,points:1,isHidden:t>0,expectedOutput:`${(t+1)*2}\n`}))}};
      const input={contestId:contest.id,problemId:problem.id,participantId:participant.id,kind:'check',key,fingerprint:requestHash({source,lang}),payload,
        submission:{contest,problem,participant,language:lang,submittedCode:source,phase:'CONTEST',maxScore:testCount}};
      const start=Date.now(),job=await enqueueContestJob(input);
      if(index===99){
        const retry=await enqueueContestJob(input);if(retry.job_id!==job.job_id)throw new Error('duplicate idempotent job');
        try{await enqueueContestJob({...input,fingerprint:requestHash('changed')});throw new Error('conflict accepted');}catch(e){if(e.statusCode!==409)throw e;}
        report.idempotencyPassed=true;
      }
      return {id:job.job_id,submissionId:job.submission_id,language:lang,admissionMs:Date.now()-start,acceptedAt:job.created_at};
    }));
    report.admissionFinished=Date.now();await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify({contestId:report.contestId,jobs:report.jobs.length,idempotencyPassed:report.idempotencyPassed,
      admittedInMs:report.admissionFinished-report.admissionStarted,p95AdmissionMs:report.jobs.map(j=>j.admissionMs).sort((a,b)=>a-b)[95]}));
  }else{
    const report=JSON.parse(await readFile(output,'utf8'));
    if(mode==='wait'){
      for(let step=0;step<720;step++){
        const rows=await db.query('SELECT job_id,state,attempt,created_at,started_at,finished_at,result,diagnostics,error FROM contest_execution_jobs WHERE contest_id=?',[report.contestId]);
        const unfinished=rows.filter(r=>['queued','running'].includes(r.state));
        if(!unfinished.length){report.results=rows;break;}
        if(step%12===0)console.log(JSON.stringify({remaining:unfinished.length,states:rows.reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{})}));
        await sleep(5000);
      }
      report.correct=report.results?.length===100&&report.results.every(r=>r.state==='completed'&&JSON.parse(r.result).verdict==='AC'&&JSON.parse(r.result).testsTotal===report.testCount);
      report.lastResultMs=Math.max(...(report.results||[]).map(r=>new Date(r.finished_at)-new Date(r.created_at)));
      const submissions=await db.getRepository(ContestSubmission).count({where:{contest:{id:report.contestId}}});
      report.uniqueSubmissions=submissions;await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});
      console.log(JSON.stringify({correct:report.correct,lastResultMs:report.lastResultMs,uniqueSubmissions:submissions,maxAttempt:Math.max(...(report.results||[]).map(r=>r.attempt))}));
    }else if(mode==='faults'){
      const participant=await db.getRepository(ContestParticipant).findOne({where:{contest:{id:report.contestId}},select:{id:true}});
      const cases=[{name:'missing immutable test file',kind:'check',source:'print(2)',
        tests:[{id:1,input_path:'/var/lib/studycod/judge-cache/capacity-missing-file',output_path:'/var/lib/studycod/judge-cache/capacity-missing-file'}],expected:'system_error'},
        {name:'runtime memory exhaustion',kind:'run',source:'x=bytearray(400*1024*1024)',tests:[{id:1,input:'',output:''}],expected:'MLE'},
        {name:'forked infinite loop',kind:'run',source:'import os\nos.fork()\nwhile True: pass',tests:[{id:1,input:'',output:''}],expected:'TLE'}];
      report.faults=[];
      for(const scenario of cases){
        const job=await enqueueContestJob({contestId:report.contestId,problemId:report.problemId,participantId:participant.id,kind:scenario.kind,key:randomUUID(),fingerprint:requestHash(scenario),
          payload:{request:{submission_id:randomUUID(),language:'python',source:scenario.source,tests:scenario.tests,limits:{time_limit_ms:1000,memory_limit_mb:128,output_limit_kb:64},checker:{type:'whitespace'},debug:true,run_all:true},
            context:{contestId:report.contestId,problemId:report.problemId,participantId:participant.id,maxScore:1,problemPoints:null,submissionPhase:'CONTEST',tests:[{id:1,points:1,isHidden:true,expectedOutput:''}]}},
          ...(scenario.kind==='check'?{submission:{contest:{id:report.contestId},problem:{id:report.problemId},participant:{id:participant.id},language:'python',submittedCode:scenario.source,phase:'CONTEST',maxScore:1}}:{})});
        let row;
        for(let i=0;i<30;i++){[row]=await db.query('SELECT state,result,error FROM contest_execution_jobs WHERE job_id=?',[job.job_id]);if(!['queued','running'].includes(row.state))break;await sleep(2000);}
        const result=row.result?JSON.parse(row.result):null;
        const verdict=scenario.expected==='system_error'?row.state:result?.verdict;
        const submission=job.submission_id?await db.getRepository(ContestSubmission).findOne({where:{id:job.submission_id},select:{verdict:true,executionStatus:true}}):null;
        const passed=verdict===scenario.expected&&(!submission||submission.verdict===null);
        report.faults.push({name:scenario.name,passed,row,submission});console.log(JSON.stringify({name:scenario.name,passed,verdict}));
      }
      await writeFile(output,JSON.stringify(report,null,2),{mode:0o600});
    }else if(mode==='cleanup'){
      const [row]=await db.query("SELECT COUNT(*) count FROM contest_execution_jobs WHERE contest_id=? AND state IN ('queued','running')",[report.contestId]);
      if(Number(row.count))throw new Error('refusing to delete unfinished jobs');
      await db.getRepository(Contest).delete({id:report.contestId});console.log('private integration fixture removed');
    }else throw new Error('unknown mode');
  }
}finally{await db.destroy();}
