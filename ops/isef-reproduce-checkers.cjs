/* Paired, side-effect-free replay of frozen checker functions and labelled data. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(process.argv[2] || 'outputs/isef-2027');
const repo = process.cwd();
const ts = require(path.join(repo, 'backend/node_modules/typescript'));
const baselineCommit = '4123fe9170bee81a426ab9e98d6cff965b830bdb';
const legacyRoot = path.join(root, 'reproducibility/baseline', baselineCommit);
const currentRoot = path.join(root, 'reproducibility');
const backendFile = 'backend/src/services/codeExecutionService.ts';
const legacyFiles = [backendFile, ...['exact','whitespace','float','nonempty','normalize'].map(n=>`judge/checkers/${n}.ts`)];
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const originFile = path.join(legacyRoot, 'origin.json');
if (!fs.existsSync(originFile)) {
  const origin = {baselineGitCommit:baselineCommit, files:[]};
  for (const file of legacyFiles) {
    const bytes = execFileSync('git', ['show',`${baselineCommit}:${file}`], {cwd:repo,maxBuffer:1024*1024});
    const target = path.join(legacyRoot,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
    origin.files.push({file,sha256:sha(bytes)});
  }
  fs.writeFileSync(originFile,JSON.stringify(origin,null,2));
}
const origin = JSON.parse(fs.readFileSync(originFile,'utf8'));
if (origin.baselineGitCommit !== baselineCommit) throw new Error('Unexpected baseline revision');
for (const entry of origin.files) {
  if (sha(fs.readFileSync(path.join(legacyRoot,entry.file))) !== entry.sha256) throw new Error(`Baseline drift: ${entry.file}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root,'evidence/manifest.json'),'utf8'));
for (const entry of manifest.source_files.filter(x=>x.path===backendFile || x.path.startsWith('judge/checkers/'))) {
  if (sha(fs.readFileSync(path.join(currentRoot,entry.path))) !== entry.sha256) throw new Error(`Current snapshot drift: ${entry.path}`);
}
const selectedFunctions = new Set(['compareModeFromChecker','compareOutputWithChecker','compareFloatTokens','compareOutput']);
function checkerModule(filename, cache) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename);
  const fullSource = fs.readFileSync(filename,'utf8');
  let source = fullSource;
  if (filename.endsWith(path.normalize(backendFile))) {
    const ast = ts.createSourceFile(filename,fullSource,ts.ScriptTarget.ES2021,true);
    source = ast.statements.filter(statement =>
      (ts.isFunctionDeclaration(statement) && selectedFunctions.has(statement.name?.text)) ||
      (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.endsWith('judge/checkers/common'))
    ).map(statement=>statement.getText(ast)).join('\n');
  }
  const output = ts.transpileModule(source, {fileName:filename, reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2021,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
  const errors = (output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>repo,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
  const module = {exports:{}};cache.set(filename,module.exports);
  const requireChecker = spec => {
    if (!spec.startsWith('.')) throw new Error(`Unexpected non-checker dependency: ${spec}`);
    const target = path.resolve(path.dirname(filename),`${spec}.ts`);
    if (!target.includes(`${path.sep}judge${path.sep}checkers${path.sep}`)) throw new Error(`Unexpected dependency: ${spec}`);
    return checkerModule(target,cache);
  };
  const compiled = vm.compileFunction(output.outputText,['exports','require','module'],{filename});
  compiled(module.exports,requireChecker,module);
  cache.set(filename,module.exports);
  return module.exports;
}
function implementation(sourceRoot) {
  const cache = new Map();
  const local = checkerModule(path.join(sourceRoot,backendFile),cache).compareOutputWithChecker;
  const worker = Object.fromEntries(['exact','whitespace','float','nonempty'].map(type =>
    [type,checkerModule(path.join(sourceRoot,`judge/checkers/${type}.ts`),cache)[`check${type==='nonempty'?'NonEmpty':type[0].toUpperCase()+type.slice(1)}`]]));
  return {local,worker};
}
const legacy = implementation(legacyRoot);
const current = implementation(currentRoot);
const before = JSON.parse(fs.readFileSync(path.join(root,'evidence/checker-before.json'),'utf8'));
const after = JSON.parse(fs.readFileSync(path.join(root,'evidence/checker-after.json'),'utf8'));
const corpus = before.rows.map(({id,checker,actual,expected,want})=>({id,checker,actual,expected,want}));
const afterCorpus = after.rows.map(({id,checker,actual,expected,want})=>({id,checker,actual,expected,want}));
if (JSON.stringify(corpus)!==JSON.stringify(afterCorpus)) throw new Error('Before and after used different input corpora');
function replay(impl,row) {
  const local = impl.local(row.actual,row.expected,row.checker);
  const worker = row.checker.type==='float' ? impl.worker.float(row.actual,row.expected,row.checker.epsilon) :
    row.checker.type==='nonempty' ? impl.worker.nonempty(row.actual) : impl.worker[row.checker.type](row.actual,row.expected);
  return {local,worker,localPass:local===row.want,workerPass:worker===row.want,parity:local===worker};
}
const rows = corpus.map((row,i)=>{
  const old = replay(legacy,row), now = replay(current,row);
  return {...row,before:old,after:now,archivedBeforeMatches:old.local===before.rows[i].local&&old.worker===before.rows[i].worker,
    archivedAfterMatches:now.local===after.rows[i].local&&now.worker===after.rows[i].worker};
});
const metrics = label => ({cases:rows.length,localPass:rows.filter(r=>r[label].localPass).length,
  workerPass:rows.filter(r=>r[label].workerPass).length,parityPass:rows.filter(r=>r[label].parity).length,
  discrepancies:rows.filter(r=>!r[label].parity).length});
const report = {schemaVersion:1,atUtc:new Date().toISOString(),runtime:process.version,typescriptVersion:ts.version,
  baselineGitCommit:baselineCommit,baselineFiles:origin.files,corpusSha256:sha(JSON.stringify(corpus)),
  currentFiles:manifest.source_files.filter(x=>x.path===backendFile||x.path.startsWith('judge/checkers/')),
  before:metrics('before'),after:metrics('after'),archivedBeforeMismatches:rows.filter(r=>!r.archivedBeforeMatches).length,
  archivedAfterMismatches:rows.filter(r=>!r.archivedAfterMatches).length,
  scope:'Replay actual pure checker functions extracted with the TypeScript AST; no server, database, env or judge process is invoked.',
  limitations:['This finite corpus was created during the audit, not a blinded external evaluation.','Replay proves reproducibility of these checker results; it does not verify the entire backend or production deployment.'],rows};
fs.writeFileSync(path.join(root,'evidence/checker-paired-replay.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({before:report.before,after:report.after,archivedBeforeMismatches:report.archivedBeforeMismatches,archivedAfterMismatches:report.archivedAfterMismatches,baselineGitCommit:baselineCommit}));
if (report.archivedBeforeMismatches||report.archivedAfterMismatches||report.before.discrepancies!==59||report.after.discrepancies!==0||report.after.localPass!==224||report.after.workerPass!==224) process.exitCode=1;
