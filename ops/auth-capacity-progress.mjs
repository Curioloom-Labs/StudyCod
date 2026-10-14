import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2]||'outputs/contest-capacity/authenticated-20261009';
const files=(await readdir(directory)).filter(n=>/^acceptance-.*\.json$/.test(n)).sort();
const report=JSON.parse(await readFile(path.join(directory,files.at(-1)),'utf8'));
const references=report.scenarios.filter(s=>s.name?.startsWith('reference-'));
const bursts=report.scenarios.filter(s=>s.name?.startsWith('burst-'));
const reads=report.requests.filter(r=>r.method==='GET'&&!r.path.includes('/jobs/')).map(r=>r.ms).sort((a,b)=>a-b);
const admissions=report.requests.filter(r=>r.path.endsWith('/check')&&r.status===202).map(r=>r.ms).sort((a,b)=>a-b);
console.log(JSON.stringify({startedAt:report.startedAt,finishedAt:report.finishedAt,sseReady:report.sseReady,references:references.length,lastReference:references.at(-1)?.name,
  bursts:bursts.map(s=>({name:s.name,completed:s.results.length,correct:s.correct,lastResultMs:s.lastResultMs,unique:s.unique})),
  otherResults:report.scenarios.length-references.length-bursts.length,errors:report.errors.slice(-3),transportErrors:report.transportErrors?.length||0,
  reads:reads.length,p95ReadMs:reads[Math.floor(reads.length*.95)],admissions:admissions.length,p95AdmissionMs:admissions[Math.floor(admissions.length*.95)]}));
