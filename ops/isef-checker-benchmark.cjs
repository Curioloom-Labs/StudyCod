/* Independent labelled examples: a finite correctness corpus, not population accuracy. */
const fs = require('node:fs');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isef-local-test-key-only-2026-10-12-not-production';
const {compareOutputWithChecker} = require('../backend/dist/backend/src/services/codeExecutionService.js');
const {checkExact} = require('../judge/dist/checkers/exact.js');
const {checkWhitespace} = require('../judge/dist/checkers/whitespace.js');
const {checkFloat} = require('../judge/dist/checkers/float.js');
const {checkNonEmpty} = require('../judge/dist/checkers/nonempty.js');
const rows=[];
function add(id,type,actual,expected,want,epsilon=1e-6){rows.push({id,checker:{type,...(type==='float'?{epsilon}:{})},actual,expected,want});}
add('exact-leading-space','exact',' 42','42',false);
add('exact-interior-empty-line','exact','a\n\nb','a\nb',false);
add('exact-line-leading-space','exact','a\n b','a\nb',false);
add('exact-crlf','exact','a\r\nb\r\n','a\nb\n',true);
add('exact-final-newline','exact','42\n','42',true);
add('exact-inner-space','exact','4 2','42',false);
add('ws-token-boundary','whitespace','1 2','12',false);
add('ws-punctuation-boundary','whitespace','1, 2','1,2',false);
add('ws-layout-only','whitespace',' \t1\n  2\r\n','1 2',true);
add('ws-zero-not-missing','whitespace','0','',false);
add('float-relative','float','1000000.5','1000000',true);
add('float-outside-relative','float','1000002','1000000',false);
add('float-hex-is-text','float','0x10','16',false);
add('float-binary-is-text','float','0b10','2',false);
add('float-scientific','float','1e3','1000',true);
add('float-label-case','float','Yes 1','yes 1',false);
add('float-token-count','float','1 2','1',false);
add('float-infinity-text','float','Infinity','Infinity',true);
add('float-infinity-different','float','Infinity','1e999',false);
add('nonempty-space','nonempty',' \n\t','',false);
add('nonempty-zero','nonempty','0','',true);
add('nonempty-zero-width','nonempty','\u200B','',true);
add('unicode-apostrophe','exact','п’ять','п\'ять',true);
add('unicode-nfc','exact','і\u0308','ї',true);
for(let i=1;i<=50;i++){
  add(`tokens-${i}-accept`,'whitespace',`${i}\t${i+1}\n`,`${i} ${i+1}`,true);
  add(`tokens-${i}-reject`,'whitespace',`${i}${i+1}`,`${i} ${i+1}`,false);
  add(`numeric-${i}-accept`,'float',String(i+0.0000001),String(i),true);
  add(`numeric-${i}-reject`,'float',String(i+0.01),String(i),false);
}
const actualRows=rows.map(r=>{
 const local=compareOutputWithChecker(r.actual,r.expected,r.checker);
 const worker=r.checker.type==='exact'?checkExact(r.actual,r.expected):r.checker.type==='whitespace'?checkWhitespace(r.actual,r.expected):r.checker.type==='float'?checkFloat(r.actual,r.expected,r.checker.epsilon):checkNonEmpty(r.actual);
 return {...r,local,worker,localPass:local===r.want,workerPass:worker===r.want,parity:local===worker};
});
const report={schemaVersion:1,atUtc:new Date().toISOString(),label:process.argv[2]||'current',cases:actualRows.length,localPass:actualRows.filter(r=>r.localPass).length,workerPass:actualRows.filter(r=>r.workerPass).length,parityPass:actualRows.filter(r=>r.parity).length,limitations:['Labelled synthetic examples only; neither unbounded correctness nor security proof.','No machine-learning model is evaluated by this corpus.'],rows:actualRows};
const out=path.resolve(process.argv[3]||'outputs/isef-2027/evidence/checker-current.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({cases:report.cases,localPass:report.localPass,workerPass:report.workerPass,parityPass:report.parityPass,failedIds:actualRows.filter(r=>!r.localPass||!r.workerPass).map(r=>r.id)}));
if(report.localPass!==report.cases||report.workerPass!==report.cases||report.parityPass!==report.cases)process.exitCode=1;
