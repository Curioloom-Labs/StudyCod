/** Remove only the dedicated organiser and the issued users' cache keys, after API cleanup. */
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire('/var/www/studycod/backend/package.json');
require('dotenv').config({path:'/var/www/studycod/backend/.env',quiet:true});require('reflect-metadata');
const {AppDataSource:db}=require('/var/www/studycod/backend/dist/backend/src/data-source.js');
const {getSharedRedisClient,redisKey,getRedisKeyPrefix,shutdownRedis}=require('/var/www/studycod/backend/dist/backend/src/services/redis/sharedRedis.js');
const root='/root/studycod-auth-capacity-20261009';
if(process.getuid()!==0)throw new Error('root required');
const manifest=JSON.parse(await readFile(`${root}/fixture-manifest.json`,'utf8'));
const organiser=JSON.parse(await readFile(`${root}/admin.private.json`,'utf8'));
if(manifest.contestId!==20||!manifest.title.startsWith('Capacity test ')||manifest.userIds.length!==100||!/^capacity_\d+$/.test(organiser.username))throw new Error('Dedicated fixture identity required');
if(![...manifest.userIds,...manifest.taskIds,organiser.userId].every(n=>Number.isSafeInteger(n)&&n>0))throw new Error('Invalid identifiers');
await db.initialize();
try{
  const [pending]=await db.query("SELECT COUNT(*) count FROM contest_execution_jobs WHERE state IN ('queued','running')");
  if(Number(pending.count))throw new Error('Accepted work still pending');
  const [contest]=await db.query('SELECT COUNT(*) count FROM contests WHERE id=?',[manifest.contestId]);
  const [users]=await db.query('SELECT COUNT(*) count FROM users WHERE id IN (?)',[manifest.userIds]);
  const [tasks]=await db.query('SELECT COUNT(*) count FROM library_tasks WHERE id IN (?)',[manifest.taskIds]);
  if([contest,users,tasks].some(row=>Number(row.count)))throw new Error('Finish normal API fixture cleanup first');
  const [user]=await db.query('SELECT id,username,role FROM users WHERE id=?',[organiser.userId]);
  if(user&&(user.username!==organiser.username||user.role!=='SYSTEM_ADMIN'))throw new Error('Organiser identity changed');
  if(user){
    const [owned]=await db.query('SELECT (SELECT COUNT(*) FROM contests WHERE created_by_user_id=?)+(SELECT COUNT(*) FROM library_tasks WHERE author_user_id=?) count',[user.id,user.id]);
    if(Number(owned.count))throw new Error('Organiser still owns data');
    await db.query('DELETE FROM users WHERE id=? AND username=?',[user.id,user.username]);
  }
  let keysDeleted=0;
  const redis=await getSharedRedisClient();
  if(redis){
    for(const id of [...manifest.userIds,organiser.userId]){
      const keys=[redisKey('auth','user',id),...['short','long','inflight'].map(window=>redisKey('submission-rate',`user:${id}`,window))];
      for await(const batch of redis.scanIterator({MATCH:`${getRedisKeyPrefix()}ratelimit:*:user:${id}`,COUNT:100}))keys.push(...(Array.isArray(batch)?batch:[batch]));
      keysDeleted+=await redis.del([...new Set(keys)]);
    }
  }
  const report={at:new Date().toISOString(),contestRemoved:true,issuedUsersRemoved:100,libraryTasksRemoved:manifest.taskIds.length,
    organiserRemoved:true,testRedisKeysRemoved:keysDeleted,pendingJobs:0};
  await writeFile(`${root}/cleanup-accounts.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await db.destroy();await shutdownRedis();}
