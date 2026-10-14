/** External, sequential regression cases through the production root worker. */
import { spawn } from 'node:child_process';
import { mkdir,writeFile } from 'node:fs/promises';
const directory=process.argv[2]||'outputs/contest-capacity/safety-final';await mkdir(directory,{recursive:true});
const cases=[
  {name:'private-log-fd',language:'python',source:'import os\ntry:\n os.fstat(3)\n print("LOG_FD_EXPOSED")\nexcept OSError:\n print(42)',expected:'AC',tests:1},
  {name:'participant-stderr-not-infrastructure',language:'python',source:'import sys\nprint("nsjail mount failed: Permission denied",file=sys.stderr)\nprint(42)',expected:'AC',tests:1},
  {name:'full-wrong-test-set',language:'python',source:'print(43)',expected:'WA',tests:70},
  {name:'compiler-syntax-error',language:'cpp',source:'int main() { this is invalid C++; }',expected:'CE',tests:1},
];
for(const scenario of cases){
  const child=spawn('ssh',['-o','BatchMode=yes','root@195.191.24.47','/usr/local/sbin/studycod-judge-worker']);
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const start=Date.now();child.stdin.end(JSON.stringify({submission_id:`safety_${Date.now()}`,language:scenario.language,source:scenario.source,
    tests:Array.from({length:scenario.tests},(_,i)=>({id:i+1,input:'',output:'42\n'})),
    limits:{time_limit_ms:1000,memory_limit_mb:128,output_limit_kb:64},checker:{type:'whitespace'},run_all:true,debug:true}));
  const exit=await new Promise(resolve=>child.on('close',resolve));
  let result;try{result=JSON.parse(stdout);}catch{result={error:stdout};}
  const passed=exit===0&&result.verdict===scenario.expected&&(scenario.expected==='CE'||result.tests?.length===scenario.tests);
  await writeFile(`${directory}/${scenario.name}.json`,JSON.stringify({scenario,passed,exit,wallMs:Date.now()-start,result,stderr},null,2));
  console.log(JSON.stringify({name:scenario.name,passed,verdict:result.verdict}));if(!passed)process.exitCode=1;
}
