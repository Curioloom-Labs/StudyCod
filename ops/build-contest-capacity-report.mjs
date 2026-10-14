/** Consolidate saved evidence; no network access or production mutation. */
import { readFile,readdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { languages } from './contest-programs.mjs';
const directory=process.argv[2]||'outputs/contest-capacity';
const names=await readdir(directory);
async function read(name){return JSON.parse(await readFile(path.join(directory,name),'utf8'));}
async function batches(prefix){const rows=[];for(const name of names.filter(n=>n.startsWith(prefix)&&n.endsWith('.json')&&!n.endsWith('.request.json')).sort()){
  try {const data=await read(name);if(data.results?.length)rows.push({name,data});}catch{/* Interrupted diagnostics are excluded. */}
}return rows;}
const cold=(await batches('benchmark-mixed-100-15-1-cold')).filter(x=>x.data.results.length===100).at(-1);
const seventy=await batches('benchmark-all-19-70-1-warm');
if(!cold||seventy.length<2)throw new Error('Complete final cold/70-test evidence required');
const [first,warm]=seventy.slice(-2);
const queue=await read('queue-python-45-final.json'),restart=await read('queue-python-45.json');
const resources=(await readFile(path.join(directory,'resources.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x));
const samples=resources.filter(r=>r.ramUsedKb!=null),peakRAM=Math.max(...samples.map(r=>r.ramUsedKb))/1024,
 peakSwap=Math.max(...samples.map(r=>r.swapUsedKb))/1024;
const cleanup=await read('cleanup.json'),state=await read('state-after-cleanup.json');
const parallel=(await batches('benchmark-mixed-19-45-2')).at(-1),serial=(await batches('benchmark-mixed-19-45-1')).at(-1);
const kotlin=parallel.data.results.find(r=>r.language==='kotlin');
const api=await read('public-api-100.json');
const last=Math.max(...cold.data.results.map(r=>r.elapsedMs)),deficit=last-300000;
const sum=(rows,key)=>rows.reduce((s,r)=>s+(r[key]||0),0),seconds=ms=>(ms/1000).toFixed(3);
const cpu=cold.data.results.reduce((s,r)=>s+(r.result.compile?.diagnostics?.cpu_time_ms||0)+sum(r.result.tests,'cpu_time_ms'),0);
const rows=languages.map(language=>{
  const cohort=cold.data.results.filter(r=>r.language===language),a=first.data.results.find(r=>r.language===language),b=warm.data.results.find(r=>r.language===language);
  const compile=cohort.map(r=>r.result.compile?.diagnostics).filter(Boolean),peak=Math.max(...cohort.flatMap(r=>[r.result.compile?.memory_kb||0,...r.result.tests.map(t=>t.memory_kb||0)]),a.result.compile?.memory_kb||0,...a.result.tests.map(t=>t.memory_kb||0));
  return `| ${language} | ${cohort.length}/AC | ${seconds(sum(compile,'cpu_time_ms')/cohort.length)} | ${seconds(a.executionMs)} / ${seconds(b.executionMs)} | ${(peak/1024).toFixed(1)} |`;
}).join('\n');
const report=`# Звіт: контест на 100 учасників, 9 жовтня 2026

## Підсумок

**Готовність не підтверджена; ціль 100 учасників із результатом до 300 секунд залишається невиконаною.**

На остаточній версії один суддя правильно виконав 100 унікальних програм зі змішаним набором 19 мов, по 15 тестів. Остання робота завершилася через **${seconds(last)} с** від умовного приймання: перевищення **${seconds(deficit)} с (${(deficit/3000).toFixed(1)}%)**. Уся серія тривала ${seconds(cold.data.finished-cold.data.started)} с. Жодних тестів або мов не вилучено. Цей діагностичний запуск використовував привілейований виробничий суддя та умовні моменти приймання протягом 8,91 с; він не є перевіркою HTTP, авторизації або черги MySQL.

Turnstile для входу залишена ввімкненою за рішенням користувача. Звичайний запит із CSRF отримує **400 TURNSTILE_REQUIRED**. Автоматичного входу 100 акаунтів через обхід перевірки не було. Повний сценарій із 100 авторизованими учасниками, SSE, таблицею і 30 хвилинами роботи не виконаний.

## Що впроваджено на VPS

- Довговічна черга MySQL: одна транзакція для коду й завдання, час приймання, компілятор, незмінна версія задачі/тестів, ідемпотентність, оренда 60 с/оновлення 10 с, номер спроби й захист повторного запису результату. Місткість 200, резерв 100 офіційним перевіркам, на учасника дві перевірки й один пробний запуск. Чергування учасників; після перезапуску прийнята робота відновлюється.
- Асинхронні /check і /run, приватний статус роботи, старий синхронний адаптер. HTTP очікує до 330 с; завершення очікування не видаляє роботу. Інфраструктурна помилка не стає CE та не додає штраф. Видалення контесту з незавершеними роботами заборонене.
- Єдиний локальний планувальник і привілейований замок для всіх запусків та перезапусків. Виробнича паралельність **1**. Окремі cgroup v2, реальна пам’ять, CPU і завершення дерева; виправлено одиниці nsjail та передчасні зупинки на межі секунди. Службові повідомлення судді відокремлено від stderr учасника.
- Приватний перевірений кеш компіляції, максимум 512 MiB, строк 1 година; вердикти не кешуються. Версії тестів утримуються для незавершених завдань. Go використовує спільні стандартні залежності лише під час компіляції. Dart компілюється один раз у kernel; C# отримав сумісні налаштування пам’яті; відновлено відсутній відповідний SBCL core; виправлено JavaScript stdin.
- Редактор відображає чергу/перевірку/готовність і відновлює очікування після перезавантаження, використовує приватні SSE та резервне опитування близько 5 с. Серверний LSP у контестному редакторі вимкнений.
- Кеш таблиці розділяє звичайний, заморожений та організаторський перегляд після перевірки доступу; одночасні розрахунки об’єднуються. Події таблиці об’єднуються за 2 с, клієнт оновлюється не частіше разу на 5 с. Запити не читають коди та великі результати; додано відсутній складений індекс. EXPLAIN збережено: для маленької тестової таблиці MySQL обрав повний перегляд 104 рядків; індекс доступний. Для приймання використовує індекс стану.
- Nginx пристосовано до сплеску з однієї IP, окремі обмеження входу та облікових записів збережено, SSE без буферизації. Redis не зберігає прийняті роботи. Файл swap 4 ГБ збережений.

## Виміри та критерії

| Сценарій | Результат | Обмеження висновку |
|---|---|---|
| Остаточна версія, 100 змішаних програм, 15 тестів, холодний кеш | 100/100 AC; остання ${seconds(last)} с — **не проходить 300 с** | Прямий суддя; умовне приймання, без HTTP/авторизації |
| Остаточна черга, 100 Python, по 45 тестів | ${queue.correct?'100/100 коректних результатів':'Перевірка не пройшла'}; остання ${seconds(queue.lastResultMs)} с; ${queue.uniqueSubmissions} унікальних відправок | Синтетичні учасники без входу, справжній координатор MySQL |
| Приймання цих 100 робіт | ${(queue.admissionFinished-queue.admissionStarted)/1000} с; p95 ${queue.jobs.map(j=>j.admissionMs).sort((a,b)=>a-b)[95]} мс | Вимір запису в чергу; p95 HTTP не доведений |
| Перезапуск backend із 74 незавершеними роботами | 100/100 коректних, без втрат/дублів; остання ${seconds(restart.lastResultMs)} с, спроб максимум 2 | До остаточної оптимізації приймання; також перевищив 300 с |
| По одній програмі кожної з 19 мов, повні 70 тестів | 19/19 AC, холодне заповнення ${seconds(first.data.finished-first.data.started)} с; повтор ${seconds(warm.data.finished-warm.data.started)} с | Не є сплеском 100 робіт для кожної мови |
| 100 звичайних публічних API читань з однієї зовнішньої IP | 100 відповідей 200; p95 ${Number(api.p95Ms??api.p95??api.p95ReadMs??0).toFixed(1)} мс | Без авторизованої таблиці та 100 SSE |
| RAM / використаний swap за весь моніторинг | Пік ${peakRAM.toFixed(1)} MiB / ${peakSwap.toFixed(1)} MiB; перевищень 1536 MiB swap: ${resources.filter(r=>r.failure).length} | Піки системи, а не лише судді |
| Збій тестового файла / перевищення пам’яті / нескінченний дочірній процес | system_error без CE/штрафу / MLE / TLE; усі 3 очікувані | Контрольовані негативні перевірки |
| Повтор ідемпотентного запиту / інший вміст із тим самим ключем | Та сама робота / 409; перевірено | Реальна функція приймання MySQL, не HTTP |
| 30 хвилин 100 учасників, фактичні задачі майбутнього контесту, HTTP від’єднання/завершення/замороження, повні 100 сплески окремо кожної мови | **Не перевірено** | Відсутній звичайний автоматичний вхід через ввімкнену Turnstile; результати не підмінено внутрішньою діагностикою |

## Результати за мовами

У колонці CPU — середній час компіляції у холодній серії зі 100 робіт. Якщо компіляції немає, значення 0. Час 70 тестів включає запуск судді й компіляцію/відновлення кешу, але не очікування інших робіт. «Холодне» — перше заповнення кешу цього коду; «тепле» — повтор. Усі ці вердикти AC. Перевірено типовий встановлений компілятор кожної мовної сім’ї; всі окремі альтернативні версії компіляторів не пройшли повну матрицю навантаження.

| Мова | Робіт у сплеску 100 | CPU компіляції, с | 70 тестів, холодне / тепле, с | Пік компіляції або тесту, MiB |
|---|---:|---:|---:|---:|
${rows}

CPU компіляції та тестів у остаточному змішаному сплеску сумарно **${seconds(cpu)} с**; решта тривалості включає запуск, ізоляцію, I/O, планування та інше навантаження VPS. Для цього конкретного сплеску результат перевищує межу на ${(deficit/3000).toFixed(1)}%. Це виміряний дефіцит поточного режиму, а не обіцянка, що додавання саме такої кількості ресурсів забезпечить будь-які задачі.

## Чому залишено один суддя

Порівняння змішаних 19 робіт по 45 тестів: один — ${seconds(serial.data.finished-serial.data.started)} с, два — ${seconds(parallel.data.finished-parallel.data.started)} с, приріст пропускної здатності ${(100*((serial.data.finished-serial.data.started)/(parallel.data.finished-parallel.data.started)-1)).toFixed(1)}%. У режимі двох правильний Kotlin-код отримав **CE, Compilation timed out**: CPU ${seconds(kotlin.result.compile.diagnostics.cpu_time_ms)} с, тривалість ${seconds(kotlin.result.compile.diagnostics.wall_time_ms)} с, пік ${(kotlin.result.compile.diagnostics.peak_memory_kb/1024).toFixed(1)} MiB, SIGKILL, причина timeout; stdout/stderr компілятора порожні. Умова коректності не виконана; цей режим не ввімкнений.

## Діагностика та перевірка змін

Попередній запуск шести C++ одночасно дав 6/6 CE з повідомленням Compilation timed out. Це не доводило апаратний ліміт пам’яті. Повні сирі дані збережені. Виявлені й усунуті: байти замість MiB у лімітах nsjail; відсутній SBCL core; обмеження розміру файла під час .NET W^X резервування; JavaScript мосту stdin; округлення часу nsjail, яке могло передчасно завершувати програму.

Backend: 503 тести, 496 пройшли, 7 пропущено, 0 помилок; збірка успішна. Judge: 6 тестів пройшли; frontend: успішна production збірка й перевірка бюджету пакетів. Чотири додаткові сценарії пройшли: приватний log FD закритий для програми; stderr учасника не може підмінити інфраструктурний збій; помилкова програма виконує всі 70 тестів і отримує WA; справжня синтаксична помилка отримує CE з діагностикою. Після прибирання /ready та привілейований /health/judge повернули 200, nginx -t успішний, таймер кешу активний і ввімкнений; виконуваних cgroup, sandbox-каталогів і записів кешу компіляції — 0. Дані у final-health.json.

## Прибирання та відкат

Видалено тестові контести 14 і 15 після завершення всіх їхніх робіт. Зупинено монітор. Очищено ${cleanup.removed.find(r=>r.entries)?.entries} записи кешу компіляції; видалено тимчасові збірки, завантаження, діагностику/трасування та проміжну версію frontend. Звільнено **${(cleanup.freedBytes/1048576).toFixed(1)} MiB** за обліком дискових блоків. Після прибирання sandbox-процесів і незавершених робіт немає. Кеш стандартних залежностей Go, потрібні версії тестів, активні артефакти та файл swap збережені; регулярне прибирання працює.

Резервна копія залишена у **/root/studycod-contest-backup-20261009-163647**, доступ лише root. Вона містить початкові артефакти, конфігурацію та базу. Прийняті роботи потрібно завершити або безпечно зберегти перед відкатом; перевірка забороняє відкат зі старим backend за наявності незавершених робіт. Поточна черга після прибирання: ${JSON.stringify(state.queue)}. Turnstile ввімкнена: ${state.turnstileEnabled}; глобальна паралельність: ${state.globalConcurrency}.

## Де відтворювати

Інструкція — [ops/CONTEST_CAPACITY.md](../../ops/CONTEST_CAPACITY.md). Зовнішній генератор звичайного API — ops/contest-loadtest.mjs: setup, smoke, sequential, burst, sustain, suite, faults, cleanup. Для входу потрібні окремі валідні токени Turnstile; генератор не обходить перевірку. Усі великі результати та повідомлення компіляторів залишені локально в JSON; VPS тимчасові діагностичні файли прибрані.

Основні докази: ${cold.name}; ${first.name}; ${warm.name}; queue-python-45-final.json; queue-python-45.json; resources.jsonl; state-before-cleanup.json; state-after-cleanup.json; cleanup.json; backend-tests-final.log; judge-tests.log; frontend-build.log. Перервані порожні JSON не враховано. Раніша тепла серія 100/15 дала 182,359 с до останніх змін Dart/C#, її не використано як остаточний доказ готовності.
`;
await writeFile(path.join(directory,'REPORT.md'),report);
console.log(JSON.stringify({report:path.resolve(directory,'REPORT.md'),lastResultMs:last,peakRAMMiB:peakRAM,peakSwapMiB:peakSwap}));
