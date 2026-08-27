# StudyCod Concept Council

**Timestamp:** 2026-08-23 19:14:45 (Europe/Kyiv)

## Original request

Проведи аналіз концепції StudyCod цим скілом.

## Context sources used

- `README.md` — product vision, operating modes, architecture, AI layer, live classroom, target audience.
- `AGENT.md` — product requirements and repository context.
- `docs/product-ideas.md` — Debugging Graph and AI Truth Layer proposals.

## Framed question

Оціни концепцію StudyCod як продукту й дай рекомендацію щодо фокусу.

StudyCod — платформа для вивчення програмування, де центральний цикл: прочитати умову → написати код → запустити → отримати результати тестів → зрозуміти помилку → виправити рішення → повторити. Її відмінність — поєднання реального developer workflow, об'єктивного sandboxed judge, прозорого оцінювання та AI-помічника, який має пояснювати помилки й давати підказки, а не просто відповідь.

Поточна концепція охоплює Personal learning, EDU для викладачів і класів, Contest engine, code-aware live classroom, AI-рівень, кілька мов та англійську/українську локалізацію. Майбутній moat у `docs/product-ideas.md`: evidence-based Debugging Graph (submission → misconception hypothesis → hint → code change → transfer result) та AI Truth Layer, де твердження AI спираються на execution evidence, AST або verified test comparison.

Потрібно оцінити цінність проти LMS, coding platforms, курсів та AI coding assistants; ризик розпорошення між режимами й аудиторіями; найсильніший beachhead і платіжного користувача; потенційну захисну перевагу evidence-based feedback; ризики adoption, pedagogy, trust, operations і monetization; та найменший експеримент на 4–6 тижнів. Це аналіз концепції, не code review.

## Advisor responses

### The Contrarian

StudyCod зараз не продукт, а набір чотирьох різних бізнесів. Personal learning, EDU, contests і live classroom мають різних покупців, цикли продажу та критерії успіху. Це майже гарантовано розмиє UX, roadmap і маркетинг.

Ціннісна пропозиція слабко відрізняється від Codewars, HackerRank, CodeGrade, Moodle-плагінів і AI-асистентів: “написав → запустив → отримав тести → підказка” вже є ринковим стандартом. Купуватимуть не workflow, а вимірюване зменшення часу викладача на перевірку та зростання реального засвоєння. Інакше переможе incumbent із дешевшим розгортанням.

Найкращий beachhead — B2B для bootcamp’ів і університетських курсів Python для початківців із 50–300 студентами. Платник — керівник програми або кафедра; викладач — головний користувач. Не продавайте “платформу навчання”; продавайте автоматизовану, доказову перевірку лабораторних робіт і керування повторними спробами.

Debugging Graph та AI Truth Layer не є moat самі по собі. Це дорога інфраструктура, яку конкуренти зможуть скопіювати. Захист виникне лише з великого датасету misconception → intervention → transfer outcome і доведеного впливу на результати. До цього це feature, а не перевага.

Головні ризики: низька готовність викладачів мігрувати, недовіра до AI-діагнозів, спокуса студентів обійти навчання, дорогий sandbox, flaky тести, підтримка мов і складна академічна політика. LiveKit, contests, локалізацію та AI-code detection слід заморозити.

Експеримент на 4–6 тижнів: Python, один курс, 10 задач, 2–3 викладачі, 50–100 студентів. Порівняйте час перевірки, кількість корисних виправлень, результат transfer-тесту та готовність платити. Якщо економія часу не перевищує 50% без падіння навчального результату — концепцію треба закривати або радикально звузити.

### The First-Principles Thinker

StudyCod має сильну ціннісну основу, але зараз це не один продукт, а чотири бізнеси: Duolingo для коду, LMS, contest-система й AI-classroom. Таку ширину не можна ефективно продавати, розробляти й позиціонувати. Основний job-to-be-done — не «вивчити програмування», а швидко перетворити невдалий запуск коду на зрозуміле виправлення та перевірену навичку.

Найкращий beachhead — викладачі introductory programming у коледжах і bootcamp’ах. Платіжний користувач — навчальна організація або викладач, який платить за зменшення ручного grading, debugging support і доказ прогресу. Студентський personal learning залишити як продуктову поверхню, але не як первинний ринок.

Від LMS StudyCod відрізняється execution loop; від coding platforms — педагогічним поясненням; від курсів — практикою; від AI assistants — контрольованим feedback замість готового рішення. Це достатня диференціація лише за умови, що feedback реально кращий, а не просто має чат.

Evidence-based feedback може стати moat, але не сам по собі. Захист виникне з накопиченої карти misconceptions, verified intervention outcomes і benchmark’ів перенесення навички. Debugging Graph та AI Truth Layer — це другий етап, не стартова причина купівлі.

Головні ризики: викладачі не змінять workflow заради ще однієї системи; AI помилково діагностуватиме причини; sandbox, мови й live-режим створять дорогі операційні проблеми; студенти оптимізуватимуть submission, а не навчання; інституційний sales cycle буде довгим.

Експеримент на 4–6 тижнів: один курс, одна мова, 20–40 студентів, 15–20 задач і AI лише для пояснення failing tests та ієрархічних hints. Порівняти з наявним процесом: час викладача на support, кількість повторних спроб, completion і retention навички на нових задачах. Якщо немає вимірного покращення цих метрик, moat будувати зарано.

### The Expansionist

StudyCod має шанс стати не ще одним LMS чи AI-асистентом, а системою доказового вимірювання навички програмування: що саме студент не розуміє, які підказки спрацювали й чи переніс він навичку на нову задачу. Це набагато сильніша позиція, бо LMS зберігає активності, а coding platforms — результати; StudyCod може володіти картою причин помилок і прогресу.

Але нині концепція розпорошена. Personal learning, EDU, contests і live classroom — чотири різні продукти. Їх не можна одночасно використовувати як фокус. Contest engine і LiveKit — слабкі диференціатори; AI-code detection — ризикова й оборонна функція. Їх слід заморозити.

Найкращий beachhead — програмістські школи, bootcamps і університетські курси з викладачем, дедлайнами та 50–500 студентами. Платіжний користувач — керівник програми або викладач, який платить за зменшення ручного debugging/grading і за доказ результату навчання. Студент є користувачем, але не первинним покупцем.

Evidence-based feedback може стати захисною перевагою, якщо накопичиться longitudinal graph: submission → причина → hint → зміна коду → перенесення. Сам AI не є moat; приватний датасет перевірених misconception-кейсів і execution evidence — є.

Головні ризики: недовіра до помилкових діагнозів, педагогічне over-scaffolding, дорогі sandbox/модерація, складність інтеграцій і нечітка готовність платити. Найцінніший експеримент на 4–6 тижнів: один курс, одна мова, 20–30 задач, реальна когорта. Порівняти StudyCod із чинним процесом за часом викладача, кількістю повторних спроб, успіхом на transfer-задачах і довірою до feedback. Успішний результат — підстава будувати “debugging intelligence layer”, а не повний LMS.

### The Outsider

StudyCod зараз звучить не як один продукт, а як «LMS + Codeforces + Zoom + AI-репетитор». Це погано пояснюється в одному реченні й одразу викликає недовіру: незрозуміло, за яку конкретну проблему платить клієнт.

Центральний workflow справді цінний, але сам по собі неунікальний: його частково мають coding-платформи, курси й AI-асистенти. Реальна відмінність — не “AI пояснює помилки”, а доведене покращення навички після помилки. Проте Debugging Graph і AI Truth Layer поки є roadmap-ідеями, а не moat. Без накопиченої доказової бази це просто складна назва для feedback-системи.

Концепція розпорошена. Personal learning, EDU, contests і live classroom мають різних користувачів, цикли продажу та критерії успіху. Я б без вагань сфокусувався на викладачах bootcamp’ів та інтенсивних курсів програмування. Студент — щоденний користувач, викладач — champion, покупець — автор курсу або навчальна організація. Університети й школи залишити на потім через довгі продажі та вимоги до інтеграцій.

Головні ризики: хибні AI-діагнози, суперечки щодо оцінювання, cheating, дорогий sandbox, авторство якісних задач і слабка готовність викладача змінювати процес. AI-code detection я б взагалі не будував на старті.

Найкращий експеримент на 4–6 тижнів: одна мова, один тип курсу, 15–20 задач, 20–50 студентів, judge, рівневі hints і простий dashboard для викладача. Виміряти час викладача, частку виправлених рішень після feedback, повторні спроби й готовність заплатити. Якщо ці метрики не зростають, ширша платформа не врятує концепцію.

### The Executor

StudyCod має сильну ціннісну пропозицію лише в одному вузькому формулюванні: «платформа, що скорочує час викладача на перевірку й пояснення помилок у практичному програмуванні». Це не LMS, бо центральним артефактом є execution evidence; не просто coding platform, бо feedback пояснює причину; не AI-асистент, бо він зобов’язаний доводити твердження тестами й кодом. Але чотири режими, кілька мов, live-клас, contests і personal learning зараз утворюють не продукт, а портфель.

Найкращий beachhead — викладачі програмування в малих bootcamp/університетських групах, які щотижня перевіряють 30–100 студентів. Платіжний користувач — викладач або навчальна організація; студент є джерелом usage, але не першим покупцем. Продавати треба не «AI-навчання», а швидший, прозоріший feedback і gradebook.

Evidence-based feedback може стати захисною перевагою, але не сама наявність AI. Moat виникне лише з накопиченої зв’язки: submission → execution trace → misconception → ефективність hint → перенесення навички. Це потребує якісної taxonomy та валідації викладачем, яких на старті ще немає.

Експеримент на 4–6 тижнів: один курс, одна мова, 15–30 студентів, 20 задач, без LiveKit, contests, генерації матеріалів та AI-code detection. Викладач призначає задачі, StudyCod автоматично перевіряє, дає evidence-grounded hints, а викладач редагує діагноз.

Інструментувати: час до першого корисного hint, кількість повторних спроб, pass rate після hint, час викладача на перевірку, частку AI-висновків із підтвердженням, retention наступної задачі, NPS викладача та willingness-to-pay.

Успіх: мінус 50% часу перевірки, плюс 20% успішних виправлень без готового розв’язку, 70% weekly usage і щонайменше 3 платні пілоти. Провал: викладачі все одно переписують feedback вручну або студенти ігнорують hints.

## Anonymous mapping

- Response A → The Expansionist
- Response B → The Executor
- Response C → The Contrarian
- Response D → The Outsider
- Response E → The First-Principles Thinker

## Peer reviews

### Review 1

Найсильніша — B: вона найкраще переводить концепцію в конкретний JTBD, beachhead, MVP, метрики та paid pilots; moat не перебільшує. Найбільша сліпа зона — C: 50% grading-time не може бути єдиним go/no-go, бо є learning outcomes, trust, assessment validity; 10 задач/50–100 студентів можуть бути слабким дизайном. Усі пропустили unit economics і distribution: cost per student session, LLM/sandbox/storage/support, LMS integrations, teacher communities, curriculum partners.

### Review 2

Найсильніша — B: executable і має paid-pilot criterion. Сліпа зона — C: efficiency може погіршити learning/trust/validity, недооцінено authoring tasks/tests/rubrics/hints. Усі пропустили causal measurement: потрібні control/pre-post, delayed transfer, anti-gaming; governance щодо privacy/code/analytics, appeals, AI feedback, і українська/англійська як potential distribution wedge.

### Review 3

Найсильніша — B. Сліпа зона — C: надмірно жорсткий 50% threshold. Усі пропустили operational economics: authoring/maintenance, integration/deployment, sandbox/support, security/privacy, pricing/margins, procurement/sales cycle; потрібні paid renewal та cost per learner.

### Review 4

Найсильніша — B. Сліпа зона — A: optimistic про graph, недооцінює data sparsity, privacy/consent, labeling cost і baseline “LMS + autograder + ChatGPT”. Усі пропустили switching/distribution: чому instructor замінить наявний workflow, migration tasks/tests, content ownership, integrations/procurement; потрібні direct incumbent comparison, onboarding time, real purchase.

### Review 5

Найсильніша — E: найкраще називає real job і не перебільшує moat. Сліпа зона — B: grading-time як primary wedge недооцінює authoring/maintenance. Усі пропустили causal validation: контрольне порівняння з existing workflow/ChatGPT, randomization, predefined learning-gain threshold; engagement/efficiency не доводять programming improvement.

## Chairman synthesis

## Де рада погоджується

StudyCod має цінне ядро, але не як “платформа для всього навчання програмуванню”. Найсильніший артефакт — не LMS, відеокурси, live-клас чи contest, а цикл:

> умова → код → виконання → доказ тестами → пояснення помилки → виправлення → повторна перевірка.

Сам workflow не є унікальним: його частково мають Codewars, HackerRank, CodeGrade, LMS-плагіни та AI-асистенти. Потенційно сильніша відмінність — контрольований, доказовий feedback, який пов’язує submission, execution evidence, ймовірну помилкову концепцію, рівень підказки, зміну коду та результат на наступній задачі.

Це поки інференція з концепції, а не доведена ринкова перевага. Debugging Graph і AI Truth Layer — roadmap і гіпотеза moat. Вони стануть захистом лише після накопичення якісних даних, розмічених misconception-патернів, перевірених intervention-стратегій і доказу transfer.

Продукт зараз розпорошений: Personal learning, EDU, contests, live classroom, локалізація, кілька мов, AI-code detection і складна аналітика мають різних користувачів, покупців, цикли продажу та критерії успіху.

## Де рада розходиться

Головна розбіжність — у первинному job-to-be-done. B називає його скороченням часу викладача на перевірку й пояснення помилок — це найкращий комерційний wedge. E називає глибший job: перетворити failed run на зрозуміле виправлення та перевірену навичку — це сильніше педагогічно.

Рішення ради: використовувати обидва рівні послідовно. Продавати економію часу викладача та прозорий evidence-based feedback; довгостроково доводити покращення навчання й transfer. Efficiency без learning — небезпечний продукт.

C пропонує жорсткий поріг “-50% grading time”. Це корисна aspirational-ціль, але не єдиний критерій. Потрібні одночасно operational, learning, trust та commercial критерії.

## Сліпі зони, які рада виявила

Потрібно рахувати повну unit economics: sandbox execution, storage, monitoring, support, task/test maintenance, авторинг підказок, ручну перевірку AI-діагнозів, deployment та інтеграції.

Викладач уже має workflow через LMS, GitHub Classroom, автогрейдер, Google Forms, ChatGPT або власні тести. Потрібно довести, що onboarding, міграція задач і підтримка дешевші за incumbent.

Якість задач, тестів, рубрик і hierarchical hints критична. Також потрібна причинність: контрольне порівняння, pre/post або randomization, unseen problems, delayed transfer і захист від gaming.

Код студентів, telemetry, AI feedback, апеляції щодо оцінювання та дані для Graph потребують прозорих правил. AI-code detection не є первинною цінністю.

## Рекомендація

Радикально звузити StudyCod до B2B-продукту для викладачів introductory Python у bootcamp або інтенсивному курсі програмування.

> StudyCod допомагає викладачам швидше й прозоріше перетворювати невдалі запуски студентів на перевірені виправлення та вимірюваний прогрес — із доказами виконання, а не неперевіреними AI-відповідями.

Користувач — студент; champion — викладач; buyer — автор курсу, керівник bootcamp або керівник навчальної програми. Університетські enterprise-продажі, K-12, self-serve Personal і широке “навчання програмуванню” — пізніші напрями.

На час експерименту заморозити LiveKit/live classroom, contests, Personal як окремий продукт, генерацію повних задач/розв’язань, AI-code detection, підтримку багатьох мов, складний Debugging Graph як інтерфейс і повний AI Truth Layer.

Залишити стабільний sandboxed judge, execution evidence, failing-test explanation, hierarchical hints, teacher dashboard, gradebook/export і ручне підтвердження або виправлення AI-діагнозу.

## Що зробити першим

Провести 4–6-тижневий paid pilot у Python: 2–3 викладачі, 40–80 студентів, 15–20 задач одного introductory-модуля. Взяти реальні задачі курсу, зберегти existing workflow для контролю, увімкнути лише пояснення failing tests і hints без готового розв’язку, виміряти baseline, unseen transfer через 1–2 тижні, teacher-confirmed correctness і конкретну пропозицію на оплату.

Ключові орієнтири: мінус 30% часу grading/support (stretch — 50%), плюс 20% виправлень без готової відповіді, transfer не гірший за control і бажано +10–15%, щонайменше 80% teacher-confirmed correctness, не більше 5% grading disputes, 70% weekly usage, onboarding до 2 годин, variable cost ≤25–30% цільової ціни, 2 із 3 пілотів готові платити за продовження.

Інвестувати в misconception taxonomy, longitudinal graph і intervention data лише після одночасного підтвердження operational економії, відсутності погіршення transfer/trust, регулярного використання та реальної готовності платити. Якщо після двох ітерацій grading time майже не зменшується, feedback не викликає довіри, transfer не покращується або ніхто не платить — звузити продукт до autograding/support tool або переосмислити концепцію.
