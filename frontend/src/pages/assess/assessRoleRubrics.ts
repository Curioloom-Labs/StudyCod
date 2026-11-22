export const assessRoleProfiles = [
  { key: "SOFTWARE_ENGINEERING", uk: "Розробка ПЗ", en: "Software engineering" },
  { key: "QA_AUTOMATION", uk: "QA та автоматизація", en: "QA and automation" },
  { key: "DATA_AI", uk: "Дані та AI", en: "Data and AI" },
  { key: "DEVOPS_SRE", uk: "DevOps та SRE", en: "DevOps and SRE" },
  { key: "SECURITY", uk: "Кібербезпека", en: "Security" },
  { key: "PRODUCT_DESIGN", uk: "Продукт і дизайн", en: "Product and design" },
  { key: "ENGINEERING_MANAGEMENT", uk: "Інженерне лідерство", en: "Engineering management" },
  { key: "TECHNICAL_SUPPORT", uk: "Технічна підтримка", en: "Technical support" },
] as const;

export type AssessRoleProfileKey = typeof assessRoleProfiles[number]["key"];

export const assessRoleCaseTemplates: Record<AssessRoleProfileKey, { introductionUk: string; introductionEn: string; questionsUk: [string, string]; questionsEn: [string, string] }> = {
  SOFTWARE_ENGINEERING: {
    introductionUk: "Практичний кейс: сервіс оплати має перейти від одноразових платежів до підписок. Платіжний провайдер може відповісти із затримкою після фактичного списання, а клієнти повторюють запити. За 45 хвилин опиши безпечну зміну та перевірки. Використовуй лише вигадані дані; код клієнта або роботодавця не надсилай.",
    introductionEn: "Practical case: a payments service is adding subscriptions. The provider may time out after charging a card, and clients retry requests. In 45 minutes, outline a safe change and how you would verify it. Use fictional data; do not share employer or client code.",
    questionsUk: ["Опиши API та модель станів, щоб повтор запиту не списував кошти вдруге. Додай псевдокод або короткий фрагмент критичної логіки, якщо це допоможе пояснити рішення.", "Наведи перевірки для таймауту після списання, повторного callback, скасування підписки та міграції старих платежів. Який компроміс перевірив би першим?"],
    questionsEn: ["Describe the API and state model so a retry cannot charge twice. Include pseudocode or a short critical code fragment if it helps explain your design.", "List checks for a timeout after charge, duplicate callback, subscription cancellation, and migration of existing payments. Which trade-off would you validate first?"],
  },
  QA_AUTOMATION: {
    introductionUk: "Практичний кейс: checkout іноді створює подвійне замовлення після повторного запиту; проблема проявляється приблизно у 1 з 200 спроб і залежить від часу відповіді провайдера. За 45 хвилин підготуй ризик-орієнтований план перевірки та автоматизації. Використовуй вигадані дані.",
    introductionEn: "Practical case: checkout occasionally creates a duplicate order after a retry; it happens about once in 200 attempts and depends on provider latency. In 45 minutes, prepare a risk-based test and automation plan. Use fictional data.",
    questionsUk: ["Опиши мінімальні API, інтеграційні та конкурентні сценарії: передумови, кроки, очікувані результати й потрібні тестові дані.", "Які перевірки автоматизуєш першими? Як зробиш відтворення стабільним і відрізниш дефект від flaky-тесту?"],
    questionsEn: ["Define the minimum API, integration, and concurrency scenarios, including setup, steps, expected results, and test data.", "Which checks would you automate first? How would you make reproduction stable and distinguish a defect from a flaky test?"],
  },
  DATA_AI: {
    introductionUk: "Практичний кейс: після релізу моделі прогнозу відтоку AUC зріс з 0,78 до 0,84, але конверсія кампанії знизилася на 8%. Нові користувачі представлені в навчальних даних нерівномірно. За 45 хвилин підготуй план діагностики й безпечного рішення. Використовуй вигадані дані.",
    introductionEn: "Practical case: after a churn-model release, AUC rose from 0.78 to 0.84, but campaign conversion fell by 8%. New users are underrepresented in training data. In 45 minutes, prepare a diagnosis and safe decision plan. Use fictional data.",
    questionsUk: ["Які перевірки даних, витоку, дрейфу, сегментів і цільової метрики зробиш? Які зрізи та базову лінію порівняння обереш?", "Які критерії використаєш для відкату чи повторного запуску? Опиши мінімальний моніторинг і обмеження висновку з AUC."],
    questionsEn: ["What checks would you run for data quality, leakage, drift, segments, and the target metric? Which slices and baseline would you compare?", "What criteria would trigger rollback or a relaunch? Outline minimum monitoring and the limits of using AUC alone."],
  },
  DEVOPS_SRE: {
    introductionUk: "Практичний кейс: після релізу p95 latency зросла з 250 мс до 1,8 с, частка 5xx — з 0,2% до 4%, CPU бази даних — до 90%, а черга повідомлень росте. За 45 хвилин опиши пріоритети інциденту й відновлення. Не припускай доступу до production.",
    introductionEn: "Practical case: after a release, p95 latency rose from 250 ms to 1.8 s, 5xx from 0.2% to 4%, database CPU reached 90%, and the message queue is growing. In 45 minutes, outline incident priorities and recovery. Assume no production access.",
    questionsUk: ["Які сигнали й гіпотези перевіриш першими? Опиши безпечне обмеження впливу, критерії відкату та координацію під час інциденту.", "Які SLO, алерти й післяінцидентні зміни зменшать ризик повторення, не створюючи шуму?"],
    questionsEn: ["Which signals and hypotheses would you check first? Describe safe blast-radius reduction, rollback criteria, and incident coordination.", "Which SLO, alerts, and post-incident changes would reduce recurrence without creating noisy alerts?"],
  },
  SECURITY: {
    introductionUk: "Практичний кейс: багатокористувацький сервіс експорту приймає tenantId у запиті. Клієнт повідомив, що побачив назву чужого файлу, але зміст не підтверджений. За 45 хвилин побудуй безпечний план реагування. Не тестуй реальні дані й не експлуатуй систему.",
    introductionEn: "Practical case: a multi-tenant export service accepts tenantId in a request. A customer reports seeing another file's name, but content exposure is unconfirmed. In 45 minutes, prepare a safe response plan. Do not test real data or exploit the system.",
    questionsUk: ["Сформулюй модель загроз і мінімальні безпечні кроки підтвердження впливу без доступу до чужих даних.", "Які тимчасове стримування, виправлення авторизації, аудит і повідомлення потрібні? Які докази збережеш?"],
    questionsEn: ["State the threat model and minimum safe steps to confirm impact without accessing another tenant's data.", "What containment, authorization fix, audit, and communication are needed? What evidence would you preserve?"],
  },
  PRODUCT_DESIGN: {
    introductionUk: "Практичний кейс: 38% нових користувачів не завершують onboarding на кроці дозволів. У команди є два тижні; юридичні вимоги до згоди змінювати не можна. За 45 хвилин запропонуй дослідження та рішення. Використовуй вигадані дані.",
    introductionEn: "Practical case: 38% of new users abandon onboarding at the permissions step. The team has two weeks; legal consent requirements cannot change. In 45 minutes, propose research and a solution. Use fictional data.",
    questionsUk: ["Які сегменти, дослідження й причини відмови перевіриш до зміни інтерфейсу?", "Опиши доступний варіант взаємодії та експеримент: основна метрика, захисні метрики й критерій успіху."],
    questionsEn: ["Which user segments, research, and abandonment causes would you investigate before changing the interface?", "Describe an accessible interaction and experiment, including the primary metric, guardrails, and success criteria."],
  },
  ENGINEERING_MANAGEMENT: {
    introductionUk: "Практичний кейс: запуск через три тижні. QA знайшла регресію, двоє інженерів сперечаються про архітектуру, а бізнес додає обсяг. Команда з чотирьох людей уже відстає. За 45 хвилин опиши план керування ситуацією.",
    introductionEn: "Practical case: launch is in three weeks. QA found a regression, two engineers disagree on architecture, and the business is adding scope. A four-person team is already behind. In 45 minutes, outline how you would manage the situation.",
    questionsUk: ["Як визначиш мінімальний безпечний обсяг, розподілиш відповідальність і приймеш рішення щодо регресії та архітектури?", "Що і кому повідомиш зараз? Які сигнали перевірятимеш щотижня та як проведеш ретроспективу без пошуку винних?"],
    questionsEn: ["How would you set the minimum safe scope, assign ownership, and decide on the regression and architecture dispute?", "What would you communicate and to whom? Which signals would you review weekly, and how would you run a blameless retrospective?"],
  },
  TECHNICAL_SUPPORT: {
    introductionUk: "Практичний кейс: експорт великого звіту зависає у клієнта з ЄС; проблема виникає у 2 з 30 запусків, а журнали показують 503 в одному регіоні. За 45 хвилин підготуй діагностику та відповідь клієнту. Не вигадуй доступу до його даних.",
    introductionEn: "Practical case: a large report export hangs for an EU customer; it happens in 2 of 30 runs, and logs show a 503 in one region. In 45 minutes, prepare a diagnosis and customer response. Do not assume access to their data.",
    questionsUk: ["Які безпечні уточнення та знеособлені докази збереш, щоб звузити проблему й відрізнити клієнтську помилку від інциденту сервісу?", "Склади коротке повідомлення клієнту: що відомо, що робимо, коли буде оновлення та які тимчасові кроки безпечні."],
    questionsEn: ["Which safe questions and redacted evidence would you collect to narrow the issue and distinguish a client-side problem from a service incident?", "Draft a short customer update: what is known, what is being done, when the next update will come, and which workarounds are safe."],
  },
};
