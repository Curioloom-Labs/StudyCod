/** Sequential candidate profiling, outside production admission. */
import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
import { program } from './contest-programs.mjs';
const label=process.argv[2]||'baseline',directory='outputs/contest-capacity/round2';await mkdir(directory,{recursive:true});
const config='/root/studycod-judge-candidate/nsjail-info.cfg';
for(const language of label.startsWith('kotlin-')?['kotlin']:['cpp','python','java','js','kotlin']){
  const request={submission_id:`profile_${label}_${language}`,language,source:program(language,`profile-${language}`),
    tests:Array.from({length:45},(_,i)=>({id:i+1,input:`${i+1}\n`,output:`${(i+1)*2}\n`})),
    limits:{time_limit_ms:2000,memory_limit_mb:256,output_limit_kb:64},checker:{type:'whitespace'},run_all:true,debug:true};
  const start=Date.now(),child=spawn('ssh',['-o','BatchMode=yes','root@195.191.24.47',
    `/usr/bin/flock /run/lock/studycod-judge.lock /usr/bin/env NODE_ENV=production NSJAIL_USE_CONFIG=1 NSJAIL_CONFIG=${config} JUDGE_PROFILE_PHASES=1 ${label.startsWith('kotlin-')?'JUDGE_KOTLIN_COMPILER_JAR=/opt/kotlinc/kotlinc/lib/kotlin-compiler.jar':''} ${label==='kotlin-dump'?'JUDGE_KOTLIN_CDS_DUMP=/kotlin-cds/compiler.jsa':''} ${label==='kotlin-shared'||label==='kotlin-c1'?'JUDGE_KOTLIN_CDS_ARCHIVE=/usr/local/lib/studycod/kotlin-compiler.jsa':''} ${label==='tools-tuned'?'JUDGE_BIN_NODE=/usr/local/bin/node-contest':''} /opt/nodejs/current/bin/node /root/studycod-judge-candidate/judge/dist/index.js`]);
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.end(JSON.stringify(request));
  const exit=await new Promise(resolve=>child.on('close',resolve));let result;try{result=JSON.parse(stdout);}catch{result={error:stdout};}
  const phases=stderr.split('\n').filter(x=>x.startsWith('[judge-profile] ')).map(x=>JSON.parse(x.slice(16)));
  const row={label,language,wallMs:Date.now()-start,exit,result,phases,stderr};
  await writeFile(`${directory}/${label}-${language}.json`,JSON.stringify(row,null,2));
  const tests=phases.filter(x=>x.stage!=='compile'),total=k=>tests.reduce((s,r)=>s+r[k],0);
  console.log(JSON.stringify({label,language,verdict:result.verdict,wallMs:row.wallMs,testSetupMs:total('setupMs'),testProcessMs:total('processMs'),testCleanupMs:total('cleanupMs'),testCpuMs:total('cpuTimeMs')}));
}
