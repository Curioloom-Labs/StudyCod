/** Operator CPU diagnostic; inspector is local-only and closed after sampling. */
import {readFile,writeFile} from 'node:fs/promises';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.getuid()!==0)throw new Error('root required');
const pid=Number((await readFile('/home/studycod/.pm2/pids/studycod-backend-1.pid','utf8')).trim());
const command=await readFile(`/proc/${pid}/cmdline`,'utf8');
if(!command.includes('/var/www/studycod/backend'))throw new Error('Backend process identity mismatch');
try{await fetch('http://127.0.0.1:9229/json',{signal:AbortSignal.timeout(500)});throw new Error('Inspector already active');}
catch(error){if(error.message==='Inspector already active')throw error;}
process.kill(pid,'SIGUSR1');
let target;
for(let i=0;i<30;i++){
 try{target=(await(await fetch('http://127.0.0.1:9229/json')).json())[0];if(target)break;}catch{}
 await sleep(100);
}
if(!target?.webSocketDebuggerUrl?.startsWith('ws://127.0.0.1:9229/'))throw new Error('Expected local inspector');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
const pending=new Map();let sequence=0;
socket.addEventListener('message',event=>{
 const response=JSON.parse(event.data);if(response.id){const callbacks=pending.get(response.id);pending.delete(response.id);
 if(response.error)callbacks?.reject(new Error(JSON.stringify(response.error)));else callbacks?.resolve(response.result);}
});
const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
try{
 await rpc('Profiler.enable');await rpc('Profiler.setSamplingInterval',{interval:1000});await rpc('Profiler.start');await sleep(15000);
 const {profile}=await rpc('Profiler.stop');
 await writeFile(process.argv[2],JSON.stringify(profile),{mode:0o600});
 const nodes=new Map(profile.nodes.map(node=>[node.id,node]));const totals=new Map();
 for(let i=0;i<profile.samples.length;i++){const frame=nodes.get(profile.samples[i]).callFrame;const name=`${frame.functionName||'(anonymous)'} @ ${frame.url}:${frame.lineNumber+1}`;
 totals.set(name,(totals.get(name)||0)+profile.timeDeltas[i]);}
 console.log(JSON.stringify({sampledSeconds:(profile.endTime-profile.startTime)/1e6,top:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([name,microseconds])=>({name,ms:microseconds/1000}))}));
}finally{
 await rpc('Runtime.evaluate',{expression:"setTimeout(() => process.getBuiltinModule('node:inspector').close(), 100); 'closing'"});
 socket.close();await sleep(300);
}
