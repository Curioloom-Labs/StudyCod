/* Static source provenance, not an assertion about the deployed January platform. */
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFileSync}=require('node:child_process');
const repo=process.cwd();const root=path.resolve(process.argv[2]||'outputs/isef-2027');
const commit='022499a2c7c9f23309cff57a1ce025cc739939ae';
const git=(...args)=>execFileSync('git',args,{cwd:repo,maxBuffer:8*1024*1024});
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const oldPaths=new Set(git('ls-tree','-r','--name-only',commit).toString('utf8').trim().split('\n'));
const selected=['backend/src/services/codeExecutionService.ts','backend/src/routes/edu.ts','backend/src/routes/contests.ts','backend/src/services/contest/executionQueue.ts','backend/src/services/judgeWorker/testCache.ts','judge/checkers/exact.ts','judge/checkers/whitespace.ts','judge/checkers/float.ts','judge/checkers/nonempty.ts','judge/checkers/common.ts'];
const files=selected.map(file=>{
 const old=oldPaths.has(file)?git('show',`${commit}:${file}`):null;
 const nowFile=path.join(repo,file);const now=fs.existsSync(nowFile)?fs.readFileSync(nowFile):null;
 if(old){const dest=path.join(root,'reproducibility/season-candidate',commit,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,old);}
 return {file,presentAtJanuaryCandidate:!!old,presentInCurrentWorkspace:!!now,januarySha256:old?sha(old):null,currentSha256:now?sha(now):null};
});
const meta=git('show','-s','--format=%H%n%cI%n%s',commit).toString('utf8').trim().split('\n');
const oldService=git('show',`${commit}:backend/src/services/codeExecutionService.ts`).toString('utf8');
const currentService=fs.readFileSync(path.join(repo,'backend/src/services/codeExecutionService.ts'),'utf8');
const report={schemaVersion:1,atUtc:new Date().toISOString(),januaryCandidate:{commit:meta[0],committedAt:meta[1],subject:meta[2],selection:'Most recent accessible commit before 27 January 2026 by committer date; not verified as the submission/deployment revision.'},
 currentHead:git('rev-parse','HEAD').toString('utf8').trim(),currentWorkspaceHasUncommittedCode:true,files,
 observations:{localCheckerSpecMappingInJanuary:/export function compareOutputWithChecker\(/.test(oldService),localCheckerSpecMappingCurrent:/export function compareOutputWithChecker\(/.test(currentService),
 januaryWorkerAlreadyHadExactWhitespaceFloat:['exact','whitespace','float'].every(n=>oldPaths.has(`judge/checkers/${n}.ts`)),januaryEduRouteAlreadyExisted:oldPaths.has('backend/src/routes/edu.ts'),
 contestFilesAreNewRelativeToCandidate:['backend/src/routes/contests.ts','backend/src/services/contest/executionQueue.ts'].every(n=>!oldPaths.has(n)&&fs.existsSync(path.join(repo,n)))},
 limitations:['Source-file presence is not a runtime capability or performance measurement.','Commit dates and hashes do not prove which revision was submitted or deployed, or who independently authored all code.','The 59-to-0 experiment uses the October 11 pre-fix revision, not this January candidate.','Missing files may represent relocation; this audit only states the selected paths and method mapping.']};
fs.writeFileSync(path.join(root,'evidence/season-source-audit.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({januaryCandidate:report.januaryCandidate,observations:report.observations,selectedFiles:files.length}));
