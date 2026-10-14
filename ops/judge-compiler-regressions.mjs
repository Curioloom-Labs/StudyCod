import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const directory='outputs/contest-capacity/round2/compiler-regressions';await mkdir(directory,{recursive:true});
const candidate='/usr/bin/flock /run/lock/studycod-judge.lock /usr/bin/env NODE_ENV=production NSJAIL_USE_CONFIG=1 NSJAIL_CONFIG=/root/studycod-judge-candidate/nsjail-info.cfg JUDGE_KOTLIN_COMPILER_JAR=/opt/kotlinc/kotlinc/lib/kotlin-compiler.jar JUDGE_KOTLIN_CDS_ARCHIVE=/usr/local/lib/studycod/kotlin-compiler.jsa JUDGE_CSHARP_COMPILER_WRAPPER=/usr/local/lib/studycod/csharp-build/compile /opt/nodejs/current/bin/node /root/studycod-judge-candidate/judge/dist/index.js';
const cases=[
 {name:'csharp-sdk-flags-assembly',language:'csharp',source:'#if !NET8_0 || !RELEASE\n#error SDK flags missing\n#endif\nusing System.Reflection; record Box(long Value); class Program {static void Main(){Console.WriteLine($"{Assembly.GetExecutingAssembly().GetName().Version}:{new Box(long.Parse(Console.ReadLine()!)).Value*2}");}}',output:'1.0.0.0:42',verdict:'AC'},
 {name:'csharp-top-level-csharp12',language:'csharp',source:'await Task.Yield(); List<int> values=[int.Parse(Console.ReadLine()!)]; Console.WriteLine(values.Select(x=>x*2).Single());',output:'42',verdict:'AC'},
 {name:'csharp-multifile',language:'csharp',files:[{path:'Program.cs',content:'Console.WriteLine(Helper.Twice(long.Parse(Console.ReadLine()!)));'},{path:'Helper.cs',content:'static class Helper { public static long Twice(long x)=>x*2; }'}],output:'42',verdict:'AC'},
 {name:'csharp-real-syntax-error',language:'csharp',source:'class Program { static void Main(){ this is invalid code; }}',output:'42',verdict:'CE'},
 {name:'kotlin-generics-sequences',language:'kotlin',source:'data class Box(val n: Long)\nfun main(){val n=readln().toLong();println(sequenceOf(Box(n)).map{it.n*2}.single())}',output:'42',verdict:'AC'},
 {name:'kotlin-multifile',language:'kotlin',files:[{path:'Main.kt',content:'fun main(){println(twice(readln().toLong()))}'},{path:'Helper.kt',content:'fun twice(x:Long)=x*2'}],output:'42',verdict:'AC'},
 {name:'kotlin-real-syntax-error',language:'kotlin',source:'fun main(){ this is invalid code }',output:'42',verdict:'CE'},
];
for(const scenario of cases){
 const rows=[];
 for(const [mode,command] of [['reference','/usr/local/sbin/studycod-judge-worker'],['candidate',candidate]]){
  const request={submission_id:`regression_${Date.now()}`,language:scenario.language,source:scenario.source,files:scenario.files,
   tests:[{id:1,input:'21\n',output:scenario.output+'\n'}],limits:{time_limit_ms:2000,memory_limit_mb:scenario.language==='csharp'?1024:256,output_limit_kb:64},checker:{type:'whitespace'},run_all:true,debug:true};
  const started=Date.now(),child=spawn('ssh',['-o','BatchMode=yes','root@195.191.24.47',command]);let stdout='',stderr='';
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.end(JSON.stringify(request));
  const exit=await new Promise(resolve=>child.on('close',resolve));let result;try{result=JSON.parse(stdout);}catch{result={error:stdout};}
  rows.push({mode,exit,result,stderr,wallMs:Date.now()-started});
 }
 const passed=rows.every(r=>r.exit===0&&r.result.verdict===scenario.verdict)&&JSON.stringify(rows[0].result.tests?.map(t=>[t.verdict,t.actual]))===JSON.stringify(rows[1].result.tests?.map(t=>[t.verdict,t.actual]));
 await writeFile(`${directory}/${scenario.name}.json`,JSON.stringify({scenario,passed,rows},null,2));
 console.log(JSON.stringify({name:scenario.name,passed,wallMs:rows.map(r=>r.wallMs),verdicts:rows.map(r=>r.result.verdict)}));if(!passed)process.exitCode=1;
}
