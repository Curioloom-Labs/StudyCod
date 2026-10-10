import { createRequire } from 'node:module';
import path from 'node:path';
const root = process.env.ROOT || '/var/www/studycod';
const require = createRequire(path.join(root, 'backend/package.json'));
require('dotenv').config({path:path.join(root,'backend/.env'),quiet:true});
const mysql = require('mysql2/promise');
let connection;
try {
  connection = await mysql.createConnection(process.env.DATABASE_URL || {
    host:process.env.DB_HOST || 'localhost',port:Number(process.env.DB_PORT || 3306),
    user:process.env.DB_USER || 'root',password:process.env.DB_PASS || '',database:process.env.DB_NAME || 'studycod',
    connectTimeout:5000
  });
  const [rows] = await connection.query("SELECT COUNT(*) count FROM contest_execution_jobs WHERE state IN ('queued','running')");
  if(Number(rows[0].count)) throw new Error(`${rows[0].count} accepted contest jobs remain. Keep the compatible worker running before rollback.`);
} catch(error) {
  if(error.code !== 'ER_NO_SUCH_TABLE') { console.error(error.message);process.exitCode=1; }
} finally { await connection?.end(); }
