/** Read-only production evidence; never includes configuration secrets. */
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir } from 'node:fs/promises';
const require=createRequire('/var/www/studycod/backend/package.json');
require('dotenv').config({path:'/var/www/studycod/backend/.env',quiet:true});require('reflect-metadata');
const {AppDataSource:db}=require('/var/www/studycod/backend/dist/backend/src/data-source.js');
await db.initialize();
try {
  const contestId=Number(process.argv[3]||14);
  const report={at:new Date().toISOString(),
    queue:await db.query('SELECT state,COUNT(*) count FROM contest_execution_jobs GROUP BY state'),
    standingsIndexes:await db.query('SHOW INDEX FROM contest_submissions'),
    standingsPlan:await db.query(`EXPLAIN SELECT id,participant_id,problem_id,verdict,COALESCE(score,0),created_at
      FROM contest_submissions WHERE contest_id=? AND phase='CONTEST' AND verdict IS NOT NULL AND execution_status='completed'
      ORDER BY created_at,id`,[contestId]),
    admissionPlan:await db.query("EXPLAIN SELECT COUNT(*) FROM contest_execution_jobs WHERE state IN ('queued','running')"),
    participantIndexes:await db.query('SHOW INDEX FROM contest_participants'),
    participantPlan:await db.query('EXPLAIN SELECT id FROM contest_participants WHERE contest_id=? AND user_id=? LIMIT 1',[contestId,1]),
    testFixtureJobs:await db.query('SELECT state,COUNT(*) count FROM contest_execution_jobs WHERE contest_id=? GROUP BY state',[contestId]),
    turnstileEnabled:process.env.TURNSTILE_ENFORCE_AUTH==='true'||process.env.TURNSTILE_ENFORCE_AUTH==='1',
    globalConcurrency:process.env.MAX_GLOBAL_CONCURRENT_EXECUTIONS,
    cgroups:await readdir('/sys/fs/cgroup/studycod-executions'),
    meminfo:await readFile('/proc/meminfo','utf8')};
  await writeFile(process.argv[2],JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({queue:report.queue,fixture:report.testFixtureJobs,turnstileEnabled:report.turnstileEnabled,globalConcurrency:report.globalConcurrency}));
}finally{await db.destroy();}
