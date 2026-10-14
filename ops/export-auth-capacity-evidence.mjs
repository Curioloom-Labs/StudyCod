/** Read-only fixture evidence. Source code, credentials and cookies are excluded. */
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire('/var/www/studycod/backend/package.json');
require('dotenv').config({path:'/var/www/studycod/backend/.env',quiet:true});require('reflect-metadata');
const {AppDataSource:db}=require('/var/www/studycod/backend/dist/backend/src/data-source.js');
const contestId=Number(process.argv[2]),output=process.argv[3];
if(process.getuid()!==0||!Number.isSafeInteger(contestId)||!output?.startsWith('/root/'))throw new Error('Private root output and fixture ID required');
await db.initialize();
try {
  const [contest]=await db.query('SELECT id,title FROM contests WHERE id=?',[contestId]);
  if(!contest?.title.startsWith('Capacity test '))throw new Error('Dedicated fixture required');
  const jobs=await db.query(`SELECT j.job_id,j.submission_id,j.participant_id,j.problem_id,j.state,j.attempt,j.created_at,j.started_at,j.finished_at,
    TIMESTAMPDIFF(MICROSECOND,j.created_at,j.finished_at)/1000 elapsedMs,j.result,j.diagnostics,j.error,
    s.language,s.verdict,s.execution_status,s.created_at submissionAcceptedAt FROM contest_execution_jobs j
    LEFT JOIN contest_submissions s ON s.id=j.submission_id WHERE j.contest_id=? ORDER BY j.created_at,j.job_id`,[contestId]);
  const participants=await db.query('SELECT COUNT(*) count,COUNT(DISTINCT user_id) users FROM contest_participants WHERE contest_id=?',[contestId]);
  await writeFile(output,JSON.stringify({at:new Date().toISOString(),contest,participants,jobs:jobs.map(job=>({...job,
    result:job.result?JSON.parse(job.result):null,diagnostics:job.diagnostics?JSON.parse(job.diagnostics):null}))},null,2),{mode:0o600});
  console.log(JSON.stringify({jobs:jobs.length,participants,pending:jobs.filter(j=>['queued','running'].includes(j.state)).length}));
} finally {await db.destroy();}
