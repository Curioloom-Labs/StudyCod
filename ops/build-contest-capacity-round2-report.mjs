import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {languages} from './contest-programs.mjs';
const root='outputs/contest-capacity/round2';
const read=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const fifteen=await read('queue-mixed-15-final.json'),seventy=await read('queue-mixed-70-final.json');
if(!fifteen.correct||!seventy.correct)throw new Error('Complete correct queue evidence required');
const p95=r=>r.jobs.map(j=>j.admissionMs).sort((a,b)=>a-b)[95];
const diagnostics=row=>JSON.parse(row.diagnostics);
const cpu=row=>{const d=diagnostics(row);return(d.compile?.diagnostics?.cpu_time_ms||0)+d.tests.reduce((s,t)=>s+(t.cpu_time_ms||0),0);};
const totalCPU=report=>report.results.reduce((s,r)=>s+cpu(r),0);
const sec=ms=>(ms/1000).toFixed(3);
const rows=languages.map(language=>{
 const stats=report=>{const ids=new Set(report.jobs.filter(j=>j.language===language).map(j=>j.id));return report.results.filter(r=>ids.has(r.job_id));};
 const a=stats(fifteen),b=stats(seventy);
 const peak=Math.max(...[...a,...b].flatMap(r=>{const d=diagnostics(r);return[d.compile?.memory_kb||0,...d.tests.map(t=>t.memory_kb||0)];}));
 return `| ${language} | ${a.length}/AC | ${b.length}/AC | ${sec(a.reduce((s,r)=>s+cpu(r),0)/a.length)} | ${sec(b.reduce((s,r)=>s+cpu(r),0)/b.length)} | ${(peak/1024).toFixed(1)} |`;
}).join('\n');
const ordinary=await read('public-api-ordinary.json'),ordinary70=await read('public-api-ordinary-70.json'),connections=await read('public-api-connections.json');
const samples=(await readFile(path.join(root,'resources-final.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x)).filter(r=>r.ramUsedKb!=null);
const peakRam=Math.max(...samples.map(r=>r.ramUsedKb))/1024,peakSwap=Math.max(...samples.map(r=>r.swapUsedKb))/1024;
const regressions=await Promise.all((await readdir(path.join(root,'compiler-regressions'))).filter(x=>x.endsWith('.json')).map(async name=>JSON.parse(await readFile(path.join(root,'compiler-regressions',name),'utf8'))));
const cleanup=await read('cleanup-final.json'),health=await read('health-final.json');
const report=`# Повторна оптимізація контесту: фактичні результати

## Стан

**100 змішаних відправок на 15 тестах пройшли межу 300 секунд. Повна готовність до 100 учасників залишається непідтвердженою: сплеск на 70 тестах перевищив межу.**

Ці перевірки використовують реальний MySQL, приймання, довговічну чергу, єдиний backend, привілейованого суддю, завершення результатів і збереження відправок. Учасники синтетичні, без звичайного входу через HTTP. Вони не замінюють 100 авторизованих акаунтів, CSRF, SSE та перевірки прав. Turnstile залишена ввімкненою за рішенням користувача.

## Впроваджені зміни

- nsjail: правильні одиниці й усі попередні обмеження збережено; INFO замість великого DEBUG-журналу, nice=5 замість 19.
- JavaScript: сумісний встановлений Node 22.23.2 замість Node 12 усередині rootfs; звичайний fs/stdin і readline залишаються доступними.
- Kotlin 1.9: прямий запуск встановленого компілятора, приватна підготовка класів JVM з довіреного прикладу, C1 для самого компілятора. Мова та JIT програми учасника не змінювалися.
- javac: малий стартовий heap, Serial GC і C1 тільки для компілятора. Ліміти та runtime учасника збережено.
- C#: той самий Roslyn, параметри Release та згенеровані файли встановленого SDK. Для одного файла пропущено повторне виконання MSBuild; для кількох файлів SDK-шлях збережено. Перевірено C# 12, implicit usings, символи NET8_0/RELEASE, версію збірки, кілька файлів і синтаксичні помилки.
- Приймання: до 32 запитів на одну довговічну транзакцію, окремі savepoint, підтвердження лише після COMMIT. Налаштування надійного запису MySQL не послаблено.
- Список контестів: потрібні поля автора/класу, об'єднання однакових запитів тільки під час їх виконання; перевірка доступу окрема для кожного запиту.

Паралельність лишається 1. Попередній режим 2 спричиняв хибну CE коректного Kotlin-коду; підстав для його ввімкнення немає. Вердикти не кешуються, усі офіційні роботи проходять увесь набір тестів. Swap-файл 4 ГБ збережено.

## Сплески через робочу чергу

| Сценарій | Приймання всіх 100 | p95 приймання в БД | Правильні результати | Останній результат від приймання | CPU компіляторів і всіх тестів |
|---|---:|---:|---:|---:|---:|
| 100 різних програм, 15 тестів | ${sec(fifteen.admissionFinished-fifteen.admissionStarted)} с | ${p95(fifteen)} мс | 100/100, усі 15 тестів | ${sec(fifteen.lastResultMs)} с | ${sec(totalCPU(fifteen))} с |
| 100 різних програм, 70 тестів | ${sec(seventy.admissionFinished-seventy.admissionStarted)} с | ${p95(seventy)} мс | 100/100, усі 70 тестів | ${sec(seventy.lastResultMs)} с | ${sec(totalCPU(seventy))} с |

Для обох: рівно 100 відправок, максимум спроба ${Math.max(...fifteen.results.map(r=>r.attempt),...seventy.results.map(r=>r.attempt))}, повтор ключа повернув те саме завдання; змінений код із тим самим ключем відхилено. В офіційних роботах немає інфраструктурних CE, помилкових TLE, OOM чи пропущених тестів.

15-тестова серія включала звичайні та граничні читання API й чотири короткі регресійні виклики судді під час черги. 70-тестова серія виконувалася без перезапуску чи додаткового навантаження судді, зі звичайними читаннями API. Компіляційні артефакти холодні: різні власники та різний код. Стандартні залежності й класи компіляторів прогріті, як передбачено планом.

Попередня однакова діагностична серія судді: 360,344 с; кандидат після першої хвилі змін: 286,484 с. Це порівняння однакового діагностичного шляху, не HTTP. Після впровадження реальна черга спочатку дала 321,590 с; групове приймання без останніх змін компіляторів — 335,683 с. У звіті залишені невдалі проміжні вимірювання.

## За мовами

CPU включає компіляцію та всі тести; наведене середнє для однієї програми. Пікова пам'ять — фактичний максимум cgroup компіляції/одного тесту.

| Мова | 15 тестів | 70 тестів | CPU/робота, 15 тестів, с | CPU/робота, 70 тестів, с | Пік, MiB |
|---|---:|---:|---:|---:|---:|
${rows}

Дефіцит для сплеску на 70 тестах: **${sec(seventy.lastResultMs-300000)} с понад межу**. Сам лише виміряний CPU цих 100 коректних перевірок — ${sec(totalCPU(seventy))} с. На одному ядрі це ${(totalCPU(seventy)/300000).toFixed(2)} разу більше за 300 секунд, ще до CPU backend, MySQL і зовнішнього координатора. Це пояснює невиконаний критерій поточного режиму; збільшення кількості одночасних суддів не додає CPU.

## API, пам'ять і коректність

- 100 звичайних публічних читань за 5 секунд із однієї зовнішньої IP, активний суддя: 100/100 відповідей HTTP 200; p95 ${ordinary.p95Ms.toFixed(1)} мс на 15 тестах і ${ordinary70.p95Ms.toFixed(1)} мс на 70 тестах.
- Окремий граничний сплеск 100 одночасних читань: p95 холодного TLS ${connections.cold.p95Ms.toFixed(1)} мс; наступний сплеск на встановлених з'єднаннях ${connections.warm.p95Ms.toFixed(1)} мс. Граничний одночасний сплеск ще не проходить 2 секунди; його не приховано серед звичайних читань.
- Повне спостереження фінальних сплесків: RAM ${peakRam.toFixed(1)} MiB; використаний swap ${peakSwap.toFixed(1)} MiB. Перевищень 1536 MiB немає.
- ${regressions.filter(r=>r.passed).length}/${regressions.length} порівнянь C#/Kotlin зі старим суддею пройшли; збережено повні повідомлення й часові/CPU/пам'яттєві діагностики.
- Інфраструктурно відсутній тест -> system_error, офіційний verdict NULL, без штрафу; навмисне перевищення пам'яті -> MLE; дерево нескінченних процесів -> TLE, завершене повністю. Ці три помилки навмисні, не відмови сплесків.
- Backend: 510 тестів, 503 пройшли, 7 пропущено, 0 помилок. Judge: 9/9. Збирання backend/judge й перевірка різниці пройшли.

## Що залишається непідтвердженим

30 хвилин зі 100 авторизованими акаунтами/SSE/CSRF, повні окремі сплески кожної мови/компілятора, усі 15/45/70 cold/warm матриці та задачі майбутнього контесту, авторизовані права/замороження/від'єднання клієнта. Попередню перевірку відновлення черги після перезапуску та 100 Python/45 тестів збережено в першому звіті. Їх не видаємо за нову повну перевірку всіх сценаріїв.

## Очищення та стан після нього

Експортовано результати й моніторинг, завершено прийняті роботи, видалено лише створені приватні контести 16–19 з їхніми синтетичними записами, тимчасові кандидати/архіви/діагностичні файли й кеш компіляцій під загальним замком. Звільнено ${(cleanup.freedBytes/1048576).toFixed(1)} MiB. Усі прийняті реальні роботи та незмінні тестові дані збережено. Прогріті інструменти Node/Kotlin/C# і стандартний Go-кеш залишені для контесту.

Резервні копії: /root/studycod-contest-backup-20261009-163647, додаткові попередні артефакти в round2-before. Черга після очищення: ${JSON.stringify(health.queue)}; cgroup виконання: ${health.executionGroups}; /ready: ${health.ready}; /health/judge: ${health.judge}; Nginx: ${health.nginx}; таймер очищення: ${health.cacheTimer}.

**Оголошувати повну готовність до 100 учасників не можна. Сценарій 100/15 уже вкладається в п'ять хвилин; 100/70 — ні.**
`;
await writeFile(path.join(root,'REPORT.md'),report);console.log(JSON.stringify({last15:fifteen.lastResultMs,last70:seventy.lastResultMs,cpu70:totalCPU(seventy),peakRam,peakSwap}));
