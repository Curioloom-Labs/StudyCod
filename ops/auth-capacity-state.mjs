/** Small read-only live queue observation; does not load the backend. */
import {createRequire} from 'node:module';
const require=createRequire('/var/www/studycod/backend/package.json');
require('dotenv').config({path:'/var/www/studycod/backend/.env',quiet:true});
const mysql=require('mysql2/promise');
const connection=await mysql.createConnection(process.env.DATABASE_URL||{host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),
 user:process.env.DB_USER||'root',password:process.env.DB_PASS||'',database:process.env.DB_NAME||'studycod'});
try{
 const [states]=await connection.query('SELECT state,COUNT(*) jobs,MAX(attempt) maxAttempt FROM contest_execution_jobs WHERE contest_id=? GROUP BY state',[Number(process.argv[2])]);
 console.log(JSON.stringify({at:new Date().toISOString(),states,turnstileAuth:process.env.TURNSTILE_ENFORCE_AUTH,turnstileSubmit:process.env.TURNSTILE_ENFORCE_CONTEST_SUBMIT}));
}finally{await connection.end();}
