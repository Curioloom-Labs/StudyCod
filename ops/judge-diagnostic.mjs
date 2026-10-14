import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { program, languages } from './contest-programs.mjs';
const parallel = Number(process.argv[2] || 1);
let language = process.argv[3] || 'cpp';
const output = process.argv[4] || `outputs/contest-capacity/diagnostic-${Date.now()}`;
await mkdir(output, { recursive: true });
async function run(index) {
  const request = { submission_id: `diagnostic_${Date.now()}_${index}`, language,
    source: program(language,index), tests: [{id:1,input:'21\n',output:'42\n'}],
    limits: {time_limit_ms:2000,memory_limit_mb:language === 'csharp' ? 1024 : 256,output_limit_kb:64},
    checker: {type:'whitespace'},run_all:true,debug:true };
  const started = performance.now();
  const child = spawn('ssh',['-o','BatchMode=yes','root@195.191.24.47',process.argv[5] || '/usr/bin/time -v /usr/local/sbin/studycod-judge-worker']);
  let stdout='',stderr='';
  child.stdout.on('data',data=>stdout+=data); child.stderr.on('data',data=>stderr+=data);
  child.stdin.end(JSON.stringify(request));
  const exit = await new Promise(resolve=>child.on('close',resolve));
  let result;try{result=JSON.parse(stdout);}catch{result={parseError:stdout};}
  const row={index,language,exit,wallMs:performance.now()-started,result,stderr};
  await writeFile(`${output}/${language}-${index}.json`,JSON.stringify(row,null,2));
  return {index,language,wallMs:Math.round(row.wallMs),verdict:result.verdict,error:result.compile?.message ?? result.error};
}
if (language === 'all') {
  for (const current of languages) { language=current; console.log(JSON.stringify(await run(0))); }
} else {
  if (!languages.includes(language)) throw new Error('unknown language');
  console.log(JSON.stringify(await Promise.all(Array.from({length:parallel},(_,i)=>run(i))),null,2));
}
