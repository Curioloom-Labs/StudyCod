import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollText } from "lucide-react";
import { LegalExperience } from "./LegalExperience";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const SUPPORT_EMAIL = "studycod@studycod.space";

export const TermsOfUsePage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

  const sections: LegalSection[] = [
    {
      title: tr("1. Прийняття умов", "1. Acceptance of terms"),
      paragraphs: [
        tr("Використовуючи StudyCod, створюючи акаунт, входячи через Google, приєднуючись до класу або беручи участь у змаганні, ви погоджуєтесь із цими Умовами використання та Політикою конфіденційності в межах, дозволених законом.", "By using StudyCod, creating an account, signing in with Google, joining a class, or participating in a contest, you agree to these Terms of Use and the Privacy Policy to the extent permitted by law."),
        tr("Якщо ви не погоджуєтесь із цими умовами, не використовуйте платформу. Якщо ви користуєтесь StudyCod від імені навчальної організації, класу або команди, ви підтверджуєте, що маєте право діяти від їхнього імені.", "If you do not agree to these terms, do not use the platform. If you use StudyCod on behalf of an educational organization, class, or team, you confirm that you have authority to act on their behalf.")
      ]
    },
    {
      title: tr("2. Опис сервісу", "2. Service description"),
      paragraphs: [
        tr("StudyCod є навчальною платформою для програмування. Вона може надавати задачі, теорію, редактор коду, автоматичну перевірку, AI-підказки, бібліотеку задач, EDU-режим для класів, журнал оцінок, підтримку, змагання та сертифікати.", "StudyCod is a learning platform for programming. It may provide tasks, theory, a code editor, automated checking, AI hints, a task library, EDU mode for classes, a gradebook, support, contests, and certificates."),
        tr("Функції можуть змінюватися, розширюватися або тимчасово вимикатися для технічного обслуговування, безпеки, оновлення навчальних матеріалів або стабільності сервісу.", "Features may change, expand, or be temporarily disabled for maintenance, security, learning-content updates, or service reliability.")
      ]
    },
    {
      title: tr("3. Акаунти та безпека", "3. Accounts and security"),
      bullets: [
        tr("Ви повинні надавати коректні дані під час реєстрації та підтримувати їх актуальними.", "You must provide accurate registration data and keep it up to date."),
        tr("Ви відповідаєте за збереження пароля, токенів доступу та пристроїв, з яких входите в акаунт.", "You are responsible for keeping your password, access tokens, and signed-in devices secure."),
        tr("Не передавайте акаунт іншій особі, крім випадків, коли учнівський акаунт створено вчителем або організатором і передано конкретному учню.", "Do not transfer your account to another person, except when a student account is created by a teacher or organizer and assigned to a specific student."),
        tr("Якщо ви помітили несанкціонований доступ, негайно змініть пароль і зверніться до підтримки.", "If you notice unauthorized access, change your password immediately and contact support.")
      ]
    },
    {
      title: tr("4. Учні, неповнолітні та EDU-режим", "4. Students, minors, and EDU mode"),
      paragraphs: [
        tr("EDU-режим призначений для навчального процесу. Вчитель або навчальна організація відповідає за коректність списку учнів, правомірність створення учнівських акаунтів, призначення матеріалів та використання оцінок.", "EDU mode is intended for the learning process. The teacher or educational organization is responsible for the accuracy of student rosters, lawful creation of student accounts, assignment of materials, and use of grades."),
        tr("Якщо користувач є неповнолітнім, платформа має використовуватися на належній правовій підставі, визначеній батьками, законним представником або навчальним організатором, коли така підстава потрібна. Сам дозвіл вчителя не замінює згоди чи іншої підстави, передбаченої законом.", "If a user is a minor, the platform must be used on a proper legal basis established by a parent, legal guardian, or educational organizer where required. A teacher's permission alone does not replace consent or another legal basis required by law.")
      ]
    },
    {
      title: tr("5. Дозволене використання", "5. Acceptable use"),
      bullets: [
        tr("Використовуйте платформу для навчання, практики, викладання, перевірки знань, підтримки та участі в змаганнях.", "Use the platform for learning, practice, teaching, assessment, support, and contest participation."),
        tr("Не намагайтеся обходити обмеження, rate limits, автентифікацію, права доступу, sandbox або механізми доброчесності.", "Do not attempt to bypass restrictions, rate limits, authentication, access rights, sandboxes, or integrity mechanisms."),
        tr("Не завантажуйте шкідливий код, небезпечні файли, персональні дані третіх осіб без підстави або незаконний контент.", "Do not upload malicious code, unsafe files, third-party personal data without a basis, or unlawful content."),
        tr("Не використовуйте платформу для атак, скрейпінгу, спаму, фішингу, масової автоматизації або порушення роботи сервісу.", "Do not use the platform for attacks, scraping, spam, phishing, mass automation, or disrupting service operations."),
        tr("Не видавайте чужі рішення за власні, якщо правила класу, завдання або змагання цього не дозволяють.", "Do not present someone else's solutions as your own when class, task, or contest rules do not allow it.")
      ]
    },
    {
      title: tr("6. Код, завдання та користувацький контент", "6. Code, tasks, and user content"),
      paragraphs: [
        tr("Ви зберігаєте права на власний код, нотатки, коментарі, матеріали та інший контент, який створюєте або завантажуєте, якщо інше не випливає із прав третіх осіб. Водночас ви надаєте StudyCod обмежене, невиключне та безоплатне право використовувати й обробляти цей контент лише настільки і протягом такого строку, наскільки це потрібно для запуску тестів, показу вчителю, збереження прогресу, підтримки, безпеки та роботи сервісу. Це не передає StudyCod право власності на ваш контент.", "You retain rights to your own code, notes, comments, materials, and other content you create or upload, subject to third-party rights. You grant StudyCod a limited, non-exclusive, royalty-free right to use and process that content only to the extent and for as long as needed to run tests, show it to a teacher, save progress, provide support, maintain security, and operate the service. This does not transfer ownership of your content to StudyCod."),
        tr("Не додавайте до задач, коду, коментарів або вкладень секрети, паролі, API-ключі, приватні токени, банківські дані чи зайві персональні дані.", "Do not add secrets, passwords, API keys, private tokens, banking data, or unnecessary personal data to tasks, code, comments, or attachments.")
      ]
    },
    {
      title: tr("7. Оцінювання, AI та доброчесність", "7. Grading, AI, and integrity"),
      paragraphs: [
        tr("Автоматична перевірка, AI-підказки, аналіз помилок, рекомендації складності та журнали доброчесності допомагають навчанню, але можуть містити помилки або потребувати людського перегляду.", "Automated checking, AI hints, error analysis, difficulty recommendations, and integrity logs support learning but may contain errors or require human review."),
        tr("Вчителі й організатори змагань можуть встановлювати власні правила щодо дедлайнів, повторних спроб, використання AI, списування, апеляцій і перегляду оцінок. Такі правила застосовуються разом із цими Умовами.", "Teachers and contest organizers may set their own rules for deadlines, retakes, AI use, cheating, appeals, and grade review. Those rules apply together with these Terms.")
      ]
    },
    {
      title: tr("8. Інтелектуальна власність StudyCod", "8. StudyCod intellectual property"),
      paragraphs: [
        tr("Інтерфейс, дизайн, бренд, логотипи, навчальні матеріали, задачі, тексти, структура курсів, перевіряючі механізми та програмний код платформи належать StudyCod або відповідним правовласникам.", "The interface, design, brand, logos, learning materials, tasks, texts, course structure, checking mechanisms, and platform code belong to StudyCod or their respective rights holders."),
        tr("Ви можете використовувати матеріали в межах нормального навчання на платформі. Масове копіювання, перепродаж, публікація закритих матеріалів або створення похідного сервісу без дозволу заборонені.", "You may use materials as part of normal learning on the platform. Mass copying, resale, publication of restricted materials, or creation of a derivative service without permission is prohibited.")
      ]
    },
    {
      title: tr("9. Email, сповіщення та підтримка", "9. Email, notifications, and support"),
      paragraphs: [
        tr("Ми можемо надсилати службові листи про реєстрацію, підтвердження email, відновлення пароля, оцінки, сертифікати, підтримку, безпеку та важливі зміни сервісу. Від маркетингових або навчальних розсилок можна відписатися.", "We may send service emails about registration, email verification, password reset, grades, certificates, support, security, and important service changes. You can unsubscribe from marketing or learning newsletters."),
        tr("Звернення до підтримки мають бути добросовісними та містити достатньо інформації для діагностики проблеми. Вкладення не повинні містити шкідливих файлів або зайвих персональних даних.", "Support requests should be made in good faith and include enough information to diagnose the issue. Attachments must not contain malicious files or unnecessary personal data.")
      ]
    },
    {
      title: tr("10. Доступність сервісу", "10. Service availability"),
      paragraphs: [
        tr("Ми прагнемо підтримувати стабільну роботу StudyCod, але сервіс може тимчасово перериватися через технічне обслуговування, помилки, оновлення, дії провайдерів, мережеві проблеми або обставини непереборної сили. Це положення не скасовує вимог щодо якості послуг і інших обов’язкових прав споживача.", "We aim to keep StudyCod reliable, but the service may be temporarily interrupted because of maintenance, bugs, updates, provider actions, network issues, or force majeure. This provision does not remove quality requirements or other mandatory consumer rights."),
        tr("Ми не гарантуємо, що кожна задача, тест, AI-відповідь або оцінка буде безпомилковою. Якщо результат здається неправильним, користувач має звернутися до вчителя, організатора або підтримки.", "We do not guarantee that every task, test, AI answer, or grade will be error-free. If a result seems incorrect, the user should contact the teacher, organizer, or support.")
      ]
    },
    {
      title: tr("11. Обмеження відповідальності", "11. Limitation of liability"),
      paragraphs: [
        tr("У межах, дозволених законом, StudyCod не відповідає за непрямі збитки, втрату очікуваного результату, помилки користувача, неправомірні дії третіх осіб або рішення, ухвалені виключно на основі навчальних результатів без належного перегляду.", "To the extent permitted by law, StudyCod is not liable for indirect losses, loss of expected results, user mistakes, unlawful actions by third parties, or decisions made solely on learning results without proper review."),
        tr("Ніщо в цих Умовах не обмежує права споживачів або відповідальність, яку не можна обмежити за застосовним законодавством.", "Nothing in these Terms limits consumer rights or liability that cannot be limited under applicable law.")
      ]
    },
    {
      title: tr("12. Призупинення або припинення доступу", "12. Suspension or termination"),
      paragraphs: [
        tr("Ми можемо тимчасово обмежити, призупинити або припинити доступ до акаунта лише настільки, наскільки це розумно потрібно через порушення цих Умов, загрозу безпеці, зловживання, незаконний контент, спам, атаки на сервіс або вимогу закону. Якщо це можливо, ми повідомляємо причину та спосіб оскарження.", "We may temporarily limit, suspend, or terminate account access only to the extent reasonably needed because of a breach of these Terms, a security risk, abuse, unlawful content, spam, attacks on the service, or a legal requirement. Where possible, we will explain the reason and how to appeal."),
        tr("Якщо доступ обмежено помилково, користувач може звернутися до підтримки для перегляду ситуації. Таке обмеження не позбавляє користувача права на вже сплачені послуги або повернення коштів, якщо це передбачено законом чи умовами покупки.", "If access was limited by mistake, the user may contact support for review. This limitation does not remove a user's right to paid services already purchased or to a refund where provided by law or the purchase terms.")
      ]
    },
    {
      title: tr("13. Зміни умов", "13. Changes to terms"),
      paragraphs: [
        tr("Ми можемо оновлювати ці Умови, коли змінюється платформа, законодавство, безпека або спосіб надання сервісу. Актуальна версія публікується на цій сторінці, а про істотні зміни ми повідомляємо до їх застосування, коли це вимагається законом. Нова редакція застосовується до подальшого користування та нових замовлень і не змінює заднім числом уже укладений договір без належної правової підстави.", "We may update these Terms when the platform, laws, security, or service delivery changes. The current version is published on this page, and we will notify users of material changes before they apply where required by law. A new version applies to future use and new orders and does not retroactively change an existing contract without a proper legal basis.")
      ]
    },
    {
      title: tr("14. Застосовне право", "14. Governing law"),
      paragraphs: [
        tr("До цих Умов та користування StudyCod застосовується законодавство України. Обов’язкові права споживача, правила електронної комерції, захисту персональних даних та інші норми, від яких не можна відступити договором, мають перевагу над цими Умовами.", "Ukrainian law applies to these Terms and the use of StudyCod. Mandatory consumer rights, e-commerce rules, personal-data protections, and other non-waivable rules prevail over these Terms.")
      ]
    },
    {
      title: tr("15. Контакти", "15. Contact"),
      paragraphs: [
        tr(`Питання щодо цих Умов можна надіслати на ${SUPPORT_EMAIL} або через розділ підтримки після входу в акаунт.`, `Questions about these Terms can be sent to ${SUPPORT_EMAIL} or through the support section after signing in.`)
      ]
    }
  ];

  return <LegalExperience
    current="terms"
    title={tr("Умови використання", "Terms of Use")}
    description={tr("Правила користування StudyCod, відповідальність сторін і межі роботи освітньої платформи.", "Rules for using StudyCod, responsibilities, and the boundaries of the education platform.")}
    updated={tr("Оновлено 7 серпня 2026", "Updated August 7, 2026")}
    sections={sections}
    tr={tr}
    icon={ScrollText}
    email={SUPPORT_EMAIL}
  />;

};
