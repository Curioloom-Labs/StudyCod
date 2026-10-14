/** Consolidate the authenticated external test without exposing private accounts. */
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {languages} from './contest-programs.mjs';
const directory=process.argv[2]||'outputs/contest-capacity/authenticated-20261009';
const names=await readdir(directory);
const runs=await Promise.all(names.filter(n=>/^acceptance-.*\.json$/.test(n)).sort().map(async n=>({name:n,data:JSON.parse(await readFile(path.join(directory,n),'utf8'))})));
const run=runs.filter(r=>r.data.finishedAt).at(-1);
if(!run)throw new Error('Finished authenticated test required');
const report=run.data;
const evidence=JSON.parse(await readFile(path.join(directory,'server-evidence.json'),'utf8'));
const jobs=new Map(evidence.jobs.map(j=>[j.job_id,j]));
const percentile=rows=>{const sorted=rows.map(r=>r.ms).sort((a,b)=>a-b);return sorted[Math.floor(sorted.length*.95)]?.toFixed(1)??'—';};
const seconds=ms=>(ms/1000).toFixed(3);
const resourceFiles=names.filter(name=>/^resources(?:-[a-zA-Z0-9-]+)?\.jsonl$/.test(name));
const samples=(await Promise.all(resourceFiles.map(name=>readFile(path.join(directory,name),'utf8'))))
 .flatMap(contents=>contents.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))).filter(row=>row.ramUsedKb!=null);
const peakRam=Math.max(...samples.map(row=>row.ramUsedKb))/1024,peakSwap=Math.max(...samples.map(row=>row.swapUsedKb))/1024;
const bursts=report.scenarios.filter(s=>s.name?.startsWith('burst-'));
const baseline=runs.find(r=>r.data.scenarios.some(s=>s.name==='burst-mixed-15-cold')&&r!==run)?.data;
const baselineBurst=baseline?.scenarios.find(s=>s.name==='burst-mixed-15-cold');
const baselineReadP95=baseline?percentile(baseline.requests.filter(r=>r.method==='GET'&&!r.path.includes('/jobs/'))):'—';
const baselineAdmissionP95=baseline?percentile(baseline.requests.filter(r=>r.path.endsWith('/check')&&r.status===202)):'—';
const burstRows=bursts.map((s,index)=>{
 const exact=s.results.map(r=>jobs.get(r.jobId)?.elapsedMs).filter(ms=>ms!=null).map(Number);
 const end=bursts[index+1]?.startedAt??s.startedAt+Math.max(...s.results.map(r=>r.elapsedMs))+15000;
 const requests=report.requests.filter(r=>r.at>=s.startedAt&&r.at<=end);
 return `| ${s.name} | ${s.results.length}/100 | ${s.unique} | ${s.correct?'так':'НІ'} | ${seconds(Math.max(...exact))} | ${seconds(s.lastResultMs)} | ${percentile(requests.filter(r=>r.method==='GET'&&!r.path.includes('/jobs/')))} | ${percentile(requests.filter(r=>r.method==='POST'&&r.path.endsWith('/check')&&r.status===202))} |`;
});
const deficitRows=bursts.map(s=>{
 const exact=s.results.map(r=>jobs.get(r.jobId));
 const last=Math.max(...exact.map(j=>Number(j?.elapsedMs)||0));
 const cpu=exact.reduce((sum,j)=>sum+Number(j?.diagnostics?.compile?.diagnostics?.cpu_time_ms||0)
   +(j?.diagnostics?.tests||[]).reduce((n,t)=>n+Number(t.cpu_time_ms||0),0),0);
 return `| ${s.name} | ${exact.filter(j=>Number(j?.elapsedMs)>300000).length} | ${seconds(Math.max(0,last-300000))} | ${seconds(cpu)} | ${(last/300000).toFixed(2)} |`;
});
const languageRows=languages.map(language=>{
 const references=report.scenarios.filter(s=>s.name?.startsWith('reference-')&&s.result?.language===language).map(s=>s.result);
 const concurrent=bursts.flatMap(s=>s.results).filter(r=>r.language===language);
 const correct=r=>r.status==='completed'&&r.result?.verdict===r.expected&&r.result.tests?.length===r.result.testsTotal;
 return `| ${language} | ${references.filter(correct).length}/${references.length} | ${concurrent.filter(correct).length}/${concurrent.length} | ${seconds(Math.max(...concurrent.map(r=>Number(jobs.get(r.jobId)?.elapsedMs)||0)))} |`;
});
const cleanup=JSON.parse(await readFile(path.join(directory,'cleanup-final.json'),'utf8'));
const postNames=names.filter(name=>/^post-optimization-.*\.json$/.test(name)).sort();
const post=postNames.length?JSON.parse(await readFile(path.join(directory,postNames.at(-1)),'utf8')):null;
const postBursts=post?.scenarios.filter(s=>s.name?.startsWith('burst-'))||[];
const sustainResults=report.scenarios.filter(s=>s.jobId&&s.status);
const sustainServerTimes=sustainResults.map(s=>Number(jobs.get(s.jobId)?.elapsedMs));
const probeNames=names.filter(name=>/^run-probe-.*\.json$/.test(name)).sort();
const probe=probeNames.length?JSON.parse(await readFile(path.join(directory,probeNames.at(-1)),'utf8')):null;
const postRows=postBursts.map(s=>`| ${s.name} | ${s.results.length}/100 | ${s.unique} | ${s.correct?'так':'НІ'} | ${seconds(Math.max(...s.results.map(r=>Number(jobs.get(r.jobId)?.elapsedMs)||0)))} | ${seconds(s.lastResultMs)} |`);
if(post&&!post.finishedAt)throw new Error('Finish the participant optimization test before reporting');
const ready=bursts.length===6&&bursts.every(s=>s.results.length===100&&s.correct&&s.results.every(r=>Number(jobs.get(r.jobId)?.elapsedMs)<=300000))&&report.errors.length===0&&peakSwap<=1536&&report.p95ReadMs<=2000&&report.p95AdmissionMs<=2000;
const output=`# Зовнішній навантажувальний тест із 100 акаунтами

Період: ${report.startedAt} — ${report.finishedAt}. Генератор працював на окремому комп’ютері; усі 100 учасників використовували одну зовнішню IP-адресу. Вхід, паролі, cookies, CSRF, права доступу, приймання, черга, SSE та таблиця результатів проходили через звичайний HTTPS API. Turnstile тимчасово вимкнено за дозволом користувача; відновлення: **${cleanup.turnstileRestored?'підтверджено':'НЕ підтверджено'}**.

**${ready?'Виконані сценарії пройшли перевірку; повну готовність визначають усі вимоги плану.':'Ціль 100 учасників до 300 секунд не пройшла всі критерії.'}**

## Виявлене під навантаженням і зміни

Початковий автентифікований сплеск на 15 тестах: ${baselineBurst?`${baselineBurst.results.length}/100 правильних результатів, останній клієнтський результат за ${seconds(baselineBurst.lastResultMs)} с`:'не записаний у цьому каталозі'}. p95 читань ${baselineReadP95} мс; приймання ${baselineAdmissionP95} мс. Помилки: ${JSON.stringify(baseline?.errors||[])}. Причину HTTP 500 підтвердив backend: **Queue limit reached** у пулі MySQL. Після першого повного сплеску генератор зупинено, залишок уже прийнятих робіт завершено; збої не вилучено з доказів.

Впроваджено об’єднання одночасних читань запису контесту, опису задачі й незмінного знімка тестів; прибрано повторне читання автора й опису задачі, вибираються лише потрібні поля зв’язаних сутностей. Перевірки доступу залишаються окремими для кожного запиту, об’єднання не зберігає застарілих значень. Обмеження очікування з’єднання MySQL збільшено зі 100 до 400 при незмінних 10 з’єднаннях. Збірка та 15 перевірок доступу/кешу пройшли. Таблиці нижче — новий прогін після цих змін.

Додатково повторна перевірка того самого JWT у межах одного HTTP-запиту використовує вже перевірені дані та підготовлений ключ HMAC; термін дії перевіряється повторно, відкликання й поточні права перевіряються як раніше. Контестний акаунт без персонального enrollment більше не завантажує його на кожному запиті. Опитування завдання вибирає лише стан, власника й результат. Nginx повторно використовує з’єднання з backend; SSE залишається без буферизації. Збірка й 23 цільові тести пройшли; весь backend після цих змін: 518 тестів, 511 успішних, 7 пропущених, 0 помилок. Проміжний сплеск після першої оптимізації читань також збережено (532,483 с до останнього результату).

${report.backendVersion==='participant-reads'?'Перед цією повною матрицею встановлено також свіжі параметризовані запити за зовнішніми ключами для членства User, власника завдання та пошуку повторного запиту. Зайві ORM-з’єднання прибрано; перевірки прав не кешуються, Student зберігає свій попередній шлях. Остання збірка успішна; весь backend: 522 тести, 515 успішних, 7 пропущених, 0 помилок. Повна матриця нижче виконана з усіма цими змінами.':'Повна матриця нижче виконана після додаткових змін авторизації й HTTP.'}

Перерваний прогін від 2026-10-09T20:11:44.405Z збережений окремо. Після переривання зовнішній генератор зупинився, сервер завершив усі 1059 уже прийнятих робіт; автоматичне повернення Turnstile спрацювало. Частково виконаний сценарій 70 тестів і відсутній 30-хвилинний сценарій того прогону не зараховані до повної матриці. Дані: interruption-recovery.json та server-evidence-before-resume.json.

## Сплески по 100 унікальних відправок

Кожен сплеск містив усі 19 мов зі стандартним компілятором для кожної: 90 правильних і 10 помилкових програм. Запити починалися протягом приблизно 8,9 секунди; час отримання відповіді про приймання вимірюється окремо. Для холодного кешу код унікальний; прогрітий повторює код того самого учасника. Стандартні залежності й підготовлені компілятори залишаються прогрітими. Вердикти не кешуються. Повні набори — 15, 45 і 70 тестів. Паралельно відкриті 100 SSE; кожна сторінка повторно читає опис задачі й таблицю кожні 5–6 секунд. Це інтенсивніше, ніж завантаження опису лише під час відкриття редактора.

| Сценарій | Завершено | Унікальні відправки | Коректність | Останній результат від приймання, с (MySQL) | Побачено клієнтом, с | p95 читань, мс | p95 приймання, мс |
|---|---:|---:|---|---:|---:|---:|---:|
${burstRows.join('\n')}

Час MySQL — finished_at − created_at; клієнтський час включає мережу й резервне опитування. Час початкового запиту не підміняє час приймання.

| Сценарій | Результати пізніше 300 с | Перевищення останнього результату, с | Сума CPU судді, с | Час останнього / 300 с |
|---|---:|---:|---:|---:|
${deficitRows.join('\n')}

Сума CPU включає компіляцію й усі тести; робота API, бази, системи та очікування сюди не входять. Співвідношення часу до 300 с описує виміряний дефіцит; воно не є гарантією прискорення при зміні VPS.

Окрема діагностика завершених сервером 100 робіт на 70 тестах із перерваного HTTP-прогону: 380,622 с CPU лише на тести та 98,656 с CPU на компіляцію. Всі 100 мають повні вектори по 70 тестів. Це вже перевищує 300 с процесорного часу одного ядра без витрат API й системи; навіть повністю усунена компіляція залишила б дефіцит щонайменше 80,622 с. Діагностика cpu-budget-diagnosis.json не зарахована до повної матриці навантаження.

## Мови

| Мова | Послідовні еталони AC/WA | Коректні результати сплесків | Найдовше очікування у сплесках, с |
|---|---:|---:|---:|
${languageRows.join('\n')}

Послідовні еталони: ${report.referenceEvidence?`114 результатів з прогону ${report.referenceEvidence.startedAt} повторно використані для тієї самої незмінної тестової бази та незмінного судді/версій компіляторів. Файл доказів: ${path.basename(report.referenceEvidence.file)}. Метрики HTTP попереднього прогону до поточних не додавалися.`:'виконані в цьому прогоні.'} Кожен коректний результат має повний вектор тестів, включно з помилковими програмами.

## Додаткова оптимізація перевірок учасника

${post?`Після завершення матриці й спорожнення черги встановлено свіжі запити за зовнішніми ключами для членства User та власника завдання. Додаткові ORM-з’єднання прибрано з перевірок ідемпотентності та читання статусу; персональні й Student-перевірки зберігають свої правила. Жодних прав доступу не кешується. Збірка успішна; весь backend: 522 тести, 515 успішних, 7 пропущених, 0 помилок.

Окремий прогін ${post.startedAt} — ${post.finishedAt}:

| Сценарій | Завершено | Унікальні | Коректність | Останній результат від приймання, с | Побачено клієнтом, с |
|---|---:|---:|---|---:|---:|
${postRows.join('\n')}

p95 звичайних читань ${post.p95ReadMs.toFixed(1)} мс; приймання ${post.p95AdmissionMs.toFixed(1)} мс. Тривала робота ${seconds(post.sustainDurationMs||0)} с; готові SSE ${post.sseReady}/100. Події особистих завдань: ${JSON.stringify(post.sseJobDelivery)}. Розриви SSE: ${(post.sseDisconnections||[]).length}, транспортні повтори: ${(post.transportErrors||[]).length}; помилки: ${JSON.stringify(post.errors)}. Повторені замороження, ізоляція власника, завершення контесту, від’єднання та ідемпотентність: ${post.scenarios.some(s=>s.name==='freeze-owner-isolation-end-disconnection-idempotency')?'пройдено':'НЕ пройдено'}.

Ці результати не підміняють повну матрицю 15/45/70 вище: після останньої оптимізації повторено лише 15 тестів, тривалу роботу на 45 тестах і сценарій завершення на 70.`:report.backendVersion==='participant-reads'?'Ця оптимізація встановлена перед усією повною матрицею 15/45/70 і 30-хвилинним сценарієм вище. Окремий додатковий прогін після неї не потрібен.':'Додаткова оптимізація не встановлювалась у цьому прогоні.'}

## Тривала робота й збої

- Готові особисті SSE: ${report.sseReady}/100; витоки чужих завдань перевірені.
- Читання задач і таблиці для 100 сторінок тривало 1800 с. Разом із завершенням уже прийнятих робіт цей сценарій тривав ${seconds(report.sustainDurationMs||0)} с. Відправки в ньому — на 45 тестах: ${sustainResults.length}, усі коректні: ${sustainResults.every(s=>s.status==='completed'&&s.result.verdict===s.expected&&s.result.tests.length===45)?'так':'НІ'}. Останній серверний результат від приймання: ${seconds(Math.max(...sustainServerTimes))} с; пізніше 300 с: ${sustainServerTimes.filter(ms=>ms>300000).length}.
- Перевірка замороження, особистого доступу, повтору після завершення контесту й від’єднання: ${report.scenarios.some(s=>s.name==='freeze-owner-isolation-end-disconnection-idempotency')?'виконана':'НЕ виконана'}.
- p95 усіх звичайних читань: ${report.p95ReadMs?.toFixed(1)} мс; приймання: ${report.p95AdmissionMs?.toFixed(1)} мс.
- Помилки поточного прогону: ${report.errors.length}. Транспортні повтори: ${report.transportErrors?.length||0}.
- У попередньому перерваному прогоні під час мережевих reset о 20:42 UTC backend зберіг той самий процес, запущений о 20:10:39 UTC. Nginx зареєстрував 5443 відповідей HTTP 200 для тестового контесту у вікні 20:41–20:43 UTC, без інших статусів; дані збережені у network-window.json. Це не встановлює точну причину розриву між генератором і сервером. Втрачені SSE та повтори HTTP залишені в доказах. Новий генератор відновлює SSE, зберігаючи кожен розрив у журналі.
- Перший перерваний прогін збережений: тайм-аут TCP-з’єднання генератора; його не включено до успішного прогону.
- Пікова RAM: ${peakRam.toFixed(1)} МіБ; використаний swap: ${peakSwap.toFixed(1)} МіБ (межа 1536). Піки охоплюють усі збережені прогони, підготовку й очищення.
- Особисті події SSE: ${JSON.stringify(report.sseJobDelivery||null)}. Розриви й відновлення SSE в останньому прогоні: ${(report.sseDisconnections||[]).length}.
- Неправильний пароль відхилено HTTP 401; запит без CSRF — HTTP 403; чужий статус — HTTP 404; змінений код із прийнятим ключем — HTTP 409. Очікувані негативні перевірки не зараховані до системних помилок.
- Окремий пробний запуск через /run: ${probe?.finishedAt&&probe.errors.length===0&&probe.scenarios.some(s=>s.name==='trial-run-async-sync-idempotency-owner'&&s.correct)?'пройдено асинхронний і синхронний режими, власника, повтор ключа та конфлікт іншого вводу; офіційна відправка не створюється':'НЕ підтверджено'}.

## Точні помилки

\`\`\`json
${JSON.stringify({errors:report.errors,transportErrors:report.transportErrors||[],sseDisconnections:report.sseDisconnections||[],runProbeErrors:probe?.errors||[],cleanupInitialError:{status:400,message:'CONFIRM_TITLE_REQUIRED',reason:'Native HTTPS DELETE omitted body framing. Explicit Content-Length added; retry succeeded without deleting any wrong object.'},serverErrors:evidence.jobs.filter(j=>j.state==='system_error').map(j=>({jobId:j.job_id,error:j.error,diagnostics:j.diagnostics}))},null,2)}
\`\`\`

## Межі висновку

Це синтетичні задачі, а не задачі майбутнього контесту. Окремі сплески по 100 відправок кожною мовою не входять до цього прогону. Перезапуск backend і збій судді перевірені попередніми окремими прогонами довговічної черги (round2/REPORT.md); вони не додавалися до вимірювання пропускної здатності цього тесту. Повну готовність за всім планом цим звітом не оголошено.

## Завершення

${JSON.stringify(cleanup,null,2)}

Приватні облікові дані й тестові об’єкти видалено після завершення прийнятих завдань. Звіти залишено для перевірки.
`;
await writeFile(path.join(directory,'REPORT.md'),output);
await writeFile(path.join(directory,'SUMMARY.json'),JSON.stringify({run:run.name,backendVersion:report.backendVersion,ready,errors:report.errors,
  p95ReadMs:report.p95ReadMs,p95AdmissionMs:report.p95AdmissionMs,peakRamMib:peakRam,peakSwapMib:peakSwap,
  bursts:bursts.map(s=>({name:s.name,completed:s.results.length,correct:s.correct,unique:s.unique,
    serverLastMs:Math.max(...s.results.map(r=>Number(jobs.get(r.jobId)?.elapsedMs)||0)),clientLastMs:s.lastResultMs})),
  sustain:{readerDurationMs:1800000,totalDurationMs:report.sustainDurationMs,submissions:sustainResults.length,
    serverLastMs:Math.max(...sustainServerTimes),serverOver300:sustainServerTimes.filter(ms=>ms>300000).length},
  sseJobDelivery:report.sseJobDelivery,transportRetries:(report.transportErrors||[]).length,
  postOptimization:post&&{p95ReadMs:post.p95ReadMs,p95AdmissionMs:post.p95AdmissionMs,errors:post.errors,
    sustainDurationMs:post.sustainDurationMs,bursts:postBursts.map(s=>({name:s.name,correct:s.correct,clientLastMs:s.lastResultMs,
      serverLastMs:Math.max(...s.results.map(r=>Number(jobs.get(r.jobId)?.elapsedMs)||0))}))},cleanup},null,2));
console.log(JSON.stringify({report:path.resolve(directory,'REPORT.md'),bursts:bursts.length,errors:report.errors.length,peakRam,peakSwap,ready}));
