/** Confirm enforcement through the live login path, plus production health. */
import {writeFile} from 'node:fs/promises';
const base=process.env.CONTEST_TEST_URL||'https://studycod.space';
const csrf=await fetch(`${base}/api/csrf-token`);
if(!csrf.ok)throw new Error(`CSRF ${csrf.status}`);
const cookies=new Map(csrf.headers.getSetCookie().map(cookie=>{
 const pair=cookie.split(';')[0],index=pair.indexOf('=');return [pair.slice(0,index),pair.slice(index+1)];
}));
const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',
 Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),'X-XSRF-TOKEN':decodeURIComponent(cookies.get('XSRF-TOKEN')||'')},
 body:JSON.stringify({username:'capacity-restoration-probe',password:'invalid-capacity-test-password'})});
const result=await login.json();
const health={};
for(const endpoint of ['/ready','/health/judge']) {
 const response=await fetch(`${base}/api${endpoint}`,{signal:AbortSignal.timeout(30000)});
 health[endpoint]={status:response.status,body:await response.json()};
}
const report={at:new Date().toISOString(),turnstileRestored:login.status===400&&result.message==='TURNSTILE_REQUIRED',loginStatus:login.status,loginMessage:result.message,health};
await writeFile(process.argv[2],JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(!report.turnstileRestored||Object.values(health).some(h=>h.status!==200))process.exitCode=1;
