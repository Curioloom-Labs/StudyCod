import type { AssessRoleProfileKey } from "./assessRoleRubrics";

export const alternateRoleCases: Record<AssessRoleProfileKey, { introductionUk: string; introductionEn: string; questionsUk: [string, string]; questionsEn: [string, string] }> = {
  SOFTWARE_ENGINEERING: {
    introductionUk: "Практичний кейс: команда має розбити великий монолітний endpoint звіту на асинхронне завдання. Клієнти очікують стару API-відповідь, а завдання можуть завершитися не за порядком. За 45 хвилин запропонуй сумісний перехід. Використовуй вигадані дані.",
    introductionEn: "Practical case: a team must split a slow report endpoint into an asynchronous job. Clients rely on the old API response, and jobs may finish out of order. In 45 minutes, propose a compatible migration using fictional data.",
    questionsUk: ["Опиши API станів завдання, ідемпотентність, повтори та сумісність старих клієнтів.", "Які перевірки, метрики й план відкату потрібні перед вимкненням синхронного endpoint?"],
    questionsEn: ["Describe the job status API, idempotency, retries, and compatibility for existing clients.", "Which checks, metrics, and rollback plan are required before the synchronous endpoint is retired?"],
  },
  QA_AUTOMATION: {
    introductionUk: "Практичний кейс: після паралелізації UI-тестів частота flaky-падінь зросла з 1% до 12%, але локально тести проходять. За 45 хвилин склади план стабілізації конвеєра.",
    introductionEn: "Practical case: after UI tests were parallelized, flaky failures rose from 1% to 12%, while tests pass locally. In 45 minutes, prepare a pipeline stabilization plan.",
    questionsUk: ["Які докази збереш і як розділиш гонки, спільний стан, таймаути та дефекти продукту?", "Що виправиш першим і як доведеш, що стабільність зросла без приховування падінь?"],
    questionsEn: ["What evidence would you collect to separate races, shared state, timeouts, and product defects?", "What would you fix first, and how would you show reliability improved without hiding failures?"],
  },
  DATA_AI: {
    introductionUk: "Практичний кейс: рекомендаційна система збільшила кліки на 12%, але частка приховань рекомендацій подвоїлася. Експеримент тривав лише чотири дні й мав сезонний трафік. За 45 хвилин оцінюй результат.",
    introductionEn: "Practical case: a recommender increased clicks by 12%, but users hid recommendations twice as often. The experiment ran for four days during seasonal traffic. In 45 minutes, evaluate the result.",
    questionsUk: ["Які сегменти, захисні метрики й статистичні перевірки потрібні перед висновком?", "Запропонуй наступний експеримент і критерії продовження, зупинки або відкату."],
    questionsEn: ["Which segments, guardrail metrics, and statistical checks are needed before drawing a conclusion?", "Propose the next experiment and criteria to continue, stop, or roll back."],
  },
  DEVOPS_SRE: {
    introductionUk: "Практичний кейс: нічне резервне копіювання завершилося успішно, але відновлення з копії перевищує цільовий час у п'ять разів. Дані не можна перевіряти на production. За 45 хвилин сформуй план відновлення.",
    introductionEn: "Practical case: nightly backups report success, but restoring from them takes five times the recovery target. Production data cannot be used for testing. In 45 minutes, prepare a recovery plan.",
    questionsUk: ["Як безпечно перевіриш цілісність і час відновлення на ізольованому середовищі?", "Які RPO/RTO, автоматизацію й сигнали введеш, щоб проблему виявляти раніше?"],
    questionsEn: ["How would you safely test integrity and restore time in an isolated environment?", "Which RPO/RTO targets, automation, and signals would help detect this earlier?"],
  },
  SECURITY: {
    introductionUk: "Практичний кейс: сканер залежностей позначив критичну вразливість у бібліотеці, яку використовує сервіс, але експлойт поки не відтворено. Реліз запланований завтра. За 45 хвилин визнач безпечний план.",
    introductionEn: "Practical case: a dependency scanner found a critical vulnerability in a library used by a service, but exploitability is unconfirmed. A release is planned for tomorrow. In 45 minutes, prepare a safe response.",
    questionsUk: ["Які безпечні джерела й контекст перевіриш, щоб оцінити фактичний вплив?", "Опиши тимчасове стримування, оновлення, перевірку та критерії блокування релізу."],
    questionsEn: ["Which safe sources and context would you check to assess actual exposure?", "Describe containment, upgrade, verification, and criteria for blocking the release."],
  },
  PRODUCT_DESIGN: {
    introductionUk: "Практичний кейс: користувачі просять прибрати крок підтвердження видалення, а підтримка бачить зростання випадкових видалень. Потрібне рішення, яке працює з клавіатурою й екранним читачем. За 45 хвилин запропонуй підхід.",
    introductionEn: "Practical case: users ask to remove a deletion confirmation, while support reports more accidental deletions. The solution must work with keyboard and screen readers. In 45 minutes, propose an approach.",
    questionsUk: ["Які дослідження та дані допоможуть відрізнити зайве тертя від корисного захисту?", "Опиши доступну альтернативу й спосіб виміряти помилки, завершення дії та відмову."],
    questionsEn: ["Which research and data would separate unnecessary friction from useful protection?", "Describe an accessible alternative and how you would measure errors, task completion, and abandonment."],
  },
  ENGINEERING_MANAGEMENT: {
    introductionUk: "Практичний кейс: два досвідчені інженери блокують реліз через різні оцінки операційного ризику. Продакт просить ухвалити рішення сьогодні, а команда чергує наступного тижня. За 45 хвилин сплануй рішення.",
    introductionEn: "Practical case: two senior engineers block a release over different views of operational risk. Product asks for a decision today, and the team is on call next week. In 45 minutes, plan the decision.",
    questionsUk: ["Як зробиш ризики й припущення явними та визначиш, хто має право вирішити?", "Яке рішення і план комунікації обереш, як відстежиш наслідки та підтримку команди?"],
    questionsEn: ["How would you make risks and assumptions explicit and establish decision ownership?", "What decision and communication plan would you choose, and how would you monitor impact and team support?"],
  },
  TECHNICAL_SUPPORT: {
    introductionUk: "Практичний кейс: після оновлення клієнт бачить неправильні часові мітки в експорті, але лише в одному часовому поясі. Клієнт просить підтвердити, чи змінені фінансові суми. За 45 хвилин підготуй діагностику й відповідь.",
    introductionEn: "Practical case: after an update, a customer sees incorrect timestamps in an export, but only in one time zone. They ask whether financial totals changed. In 45 minutes, prepare a diagnosis and response.",
    questionsUk: ["Які безпечні уточнення та знеособлені приклади потрібні для відтворення проблеми?", "Склади відповідь клієнту, план ескалації та перевірки, які відокремлюють форматування від помилки сум."],
    questionsEn: ["Which safe questions and redacted examples are needed to reproduce the issue?", "Draft a customer response, escalation plan, and checks that distinguish formatting from changed totals."],
  },
};
