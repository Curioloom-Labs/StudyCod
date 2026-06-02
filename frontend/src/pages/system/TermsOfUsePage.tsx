import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, ScrollText } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const SUPPORT_EMAIL = "support@studycod.space";

const LegalSectionBlock: React.FC<{ section: LegalSection }> = ({ section }) => (
  <section className="space-y-2">
    <h2 className="text-base font-mono text-text-primary">{section.title}</h2>
    {section.paragraphs?.map((paragraph) => (
      <p key={paragraph} className="text-sm leading-6 text-text-secondary">
        {paragraph}
      </p>
    ))}
    {section.bullets ? (
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-text-secondary">
        {section.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    ) : null}
  </section>
);

export const TermsOfUsePage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

  const sections: LegalSection[] = [
    {
      title: tr("1. Прийняття умов", "1. Acceptance of terms"),
      paragraphs: [
        tr(
          "Використовуючи StudyCod, створюючи акаунт, входячи через Google, приєднуючись до класу або беручи участь у змаганні, ви погоджуєтесь із цими Умовами використання та Політикою конфіденційності.",
          "By using StudyCod, creating an account, signing in with Google, joining a class, or participating in a contest, you agree to these Terms of Use and the Privacy Policy."
        ),
        tr(
          "Якщо ви не погоджуєтесь із цими умовами, не використовуйте платформу. Якщо ви користуєтесь StudyCod від імені навчальної організації, класу або команди, ви підтверджуєте, що маєте право діяти від їхнього імені.",
          "If you do not agree to these terms, do not use the platform. If you use StudyCod on behalf of an educational organization, class, or team, you confirm that you have authority to act on their behalf."
        )
      ]
    },
    {
      title: tr("2. Опис сервісу", "2. Service description"),
      paragraphs: [
        tr(
          "StudyCod є навчальною платформою для програмування. Вона може надавати задачі, теорію, редактор коду, автоматичну перевірку, AI-підказки, бібліотеку задач, EDU-режим для класів, журнал оцінок, підтримку, змагання та сертифікати.",
          "StudyCod is a learning platform for programming. It may provide tasks, theory, a code editor, automated checking, AI hints, a task library, EDU mode for classes, a gradebook, support, contests, and certificates."
        ),
        tr(
          "Функції можуть змінюватися, розширюватися або тимчасово вимикатися для технічного обслуговування, безпеки, оновлення навчальних матеріалів або стабільності сервісу.",
          "Features may change, expand, or be temporarily disabled for maintenance, security, learning-content updates, or service reliability."
        )
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
        tr(
          "EDU-режим призначений для навчального процесу. Вчитель або навчальна організація відповідає за коректність списку учнів, правомірність створення учнівських акаунтів, призначення матеріалів та використання оцінок.",
          "EDU mode is intended for the learning process. The teacher or educational organization is responsible for the accuracy of student rosters, lawful creation of student accounts, assignment of materials, and use of grades."
        ),
        tr(
          "Якщо користувач є неповнолітнім, платформа має використовуватися з дозволу батьків, законного представника, вчителя або навчальної організації, коли така згода чи підстава потрібна.",
          "If a user is a minor, the platform should be used with permission from a parent, legal guardian, teacher, or educational organization where such consent or basis is required."
        )
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
        tr(
          "Ви зберігаєте права на власний код, нотатки, коментарі, матеріали та інший контент, який створюєте або завантажуєте. Водночас ви надаєте StudyCod право обробляти цей контент настільки, наскільки це потрібно для роботи платформи: запуску тестів, показу вчителю, збереження прогресу, підтримки, безпеки та покращення сервісу.",
          "You keep rights to your own code, notes, comments, materials, and other content you create or upload. At the same time, you grant StudyCod the right to process that content as needed to operate the platform: run tests, show it to a teacher, save progress, provide support, maintain security, and improve the service."
        ),
        tr(
          "Не додавайте до задач, коду, коментарів або вкладень секрети, паролі, API-ключі, приватні токени, банківські дані чи зайві персональні дані.",
          "Do not add secrets, passwords, API keys, private tokens, banking data, or unnecessary personal data to tasks, code, comments, or attachments."
        )
      ]
    },
    {
      title: tr("7. Оцінювання, AI та доброчесність", "7. Grading, AI, and integrity"),
      paragraphs: [
        tr(
          "Автоматична перевірка, AI-підказки, аналіз помилок, рекомендації складності та журнали доброчесності допомагають навчанню, але можуть містити помилки або потребувати людського перегляду.",
          "Automated checking, AI hints, error analysis, difficulty recommendations, and integrity logs support learning but may contain errors or require human review."
        ),
        tr(
          "Вчителі й організатори змагань можуть встановлювати власні правила щодо дедлайнів, повторних спроб, використання AI, списування, апеляцій і перегляду оцінок. Такі правила застосовуються разом із цими Умовами.",
          "Teachers and contest organizers may set their own rules for deadlines, retakes, AI use, cheating, appeals, and grade review. Those rules apply together with these Terms."
        )
      ]
    },
    {
      title: tr("8. Інтелектуальна власність StudyCod", "8. StudyCod intellectual property"),
      paragraphs: [
        tr(
          "Інтерфейс, дизайн, бренд, логотипи, навчальні матеріали, задачі, тексти, структура курсів, перевіряючі механізми та програмний код платформи належать StudyCod або відповідним правовласникам.",
          "The interface, design, brand, logos, learning materials, tasks, texts, course structure, checking mechanisms, and platform code belong to StudyCod or their respective rights holders."
        ),
        tr(
          "Ви можете використовувати матеріали в межах нормального навчання на платформі. Масове копіювання, перепродаж, публікація закритих матеріалів або створення похідного сервісу без дозволу заборонені.",
          "You may use materials as part of normal learning on the platform. Mass copying, resale, publication of restricted materials, or creation of a derivative service without permission is prohibited."
        )
      ]
    },
    {
      title: tr("9. Email, сповіщення та підтримка", "9. Email, notifications, and support"),
      paragraphs: [
        tr(
          "Ми можемо надсилати службові листи про реєстрацію, підтвердження email, відновлення пароля, оцінки, сертифікати, підтримку, безпеку та важливі зміни сервісу. Від маркетингових або навчальних розсилок можна відписатися.",
          "We may send service emails about registration, email verification, password reset, grades, certificates, support, security, and important service changes. You can unsubscribe from marketing or learning newsletters."
        ),
        tr(
          "Звернення до підтримки мають бути добросовісними та містити достатньо інформації для діагностики проблеми. Вкладення не повинні містити шкідливих файлів або зайвих персональних даних.",
          "Support requests should be made in good faith and include enough information to diagnose the issue. Attachments must not contain malicious files or unnecessary personal data."
        )
      ]
    },
    {
      title: tr("10. Доступність сервісу", "10. Service availability"),
      paragraphs: [
        tr(
          "Ми прагнемо підтримувати стабільну роботу StudyCod, але сервіс надається на умовах 'як є' та 'за наявності'. Можливі перерви через технічне обслуговування, помилки, оновлення, дії провайдерів, мережеві проблеми або форс-мажор.",
          "We aim to keep StudyCod reliable, but the service is provided 'as is' and 'as available'. Interruptions may occur because of maintenance, bugs, updates, provider actions, network issues, or force majeure."
        ),
        tr(
          "Ми не гарантуємо, що кожна задача, тест, AI-відповідь або оцінка буде безпомилковою. Якщо результат здається неправильним, користувач має звернутися до вчителя, організатора або підтримки.",
          "We do not guarantee that every task, test, AI answer, or grade will be error-free. If a result seems incorrect, the user should contact the teacher, organizer, or support."
        )
      ]
    },
    {
      title: tr("11. Обмеження відповідальності", "11. Limitation of liability"),
      paragraphs: [
        tr(
          "У межах, дозволених законом, StudyCod не відповідає за непрямі збитки, втрату очікуваного результату, помилки користувача, неправомірні дії третіх осіб або рішення, ухвалені виключно на основі навчальних результатів без належного перегляду.",
          "To the extent permitted by law, StudyCod is not liable for indirect losses, loss of expected results, user mistakes, unlawful actions by third parties, or decisions made solely on learning results without proper review."
        ),
        tr(
          "Ніщо в цих Умовах не обмежує права споживачів або відповідальність, яку не можна обмежити за застосовним законодавством.",
          "Nothing in these Terms limits consumer rights or liability that cannot be limited under applicable law."
        )
      ]
    },
    {
      title: tr("12. Призупинення або припинення доступу", "12. Suspension or termination"),
      paragraphs: [
        tr(
          "Ми можемо обмежити, призупинити або припинити доступ до акаунта, якщо є порушення цих Умов, загроза безпеці, зловживання, незаконний контент, спам, атаки на сервіс або вимога закону.",
          "We may limit, suspend, or terminate account access if there is a breach of these Terms, a security risk, abuse, unlawful content, spam, attacks on the service, or a legal requirement."
        ),
        tr(
          "Якщо доступ обмежено помилково, користувач може звернутися до підтримки для перегляду ситуації.",
          "If access was limited by mistake, the user may contact support for review."
        )
      ]
    },
    {
      title: tr("13. Зміни умов", "13. Changes to terms"),
      paragraphs: [
        tr(
          "Ми можемо оновлювати ці Умови, коли змінюється платформа, законодавство, безпека або спосіб надання сервісу. Актуальна версія публікується на цій сторінці. Подальше використання StudyCod після оновлення означає прийняття нової редакції.",
          "We may update these Terms when the platform, laws, security, or service delivery changes. The current version is published on this page. Continued use of StudyCod after an update means acceptance of the new version."
        )
      ]
    },
    {
      title: tr("14. Контакти", "14. Contact"),
      paragraphs: [
        tr(
          `Питання щодо цих Умов можна надіслати на ${SUPPORT_EMAIL} або через розділ підтримки після входу в акаунт.`,
          `Questions about these Terms can be sent to ${SUPPORT_EMAIL} or through the support section after signing in.`
        )
      ]
    }
  ];

  return (
    <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
      <header className="min-h-16 border-b border-border bg-bg-surface flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 md:px-6 py-2 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" onClick={() => {
            if (window.history.length > 1) navigate(-1); else navigate("/");
          }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <ScrollText className="w-5 h-5 text-primary" />
            <div className="text-lg font-mono text-text-primary">{tr("Умови використання", "Terms of Use")}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <Card className="p-4 sm:p-6 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-mono text-text-muted">
                {tr("Оновлено: 31.05.2026", "Updated: 2026-05-31")}
              </p>
              <p className="text-sm leading-6 text-text-secondary">
                {tr(
                  "Ці Умови визначають правила використання StudyCod, відповідальність користувачів і межі роботи платформи.",
                  "These Terms define the rules for using StudyCod, user responsibilities, and the boundaries of platform operation."
                )}
              </p>
            </div>

            {sections.map((section) => (
              <LegalSectionBlock key={section.title} section={section} />
            ))}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="secondary" onClick={() => navigate("/privacy")}>
                {tr("Політика конфіденційності", "Privacy Policy")}
              </Button>
              <Button variant="ghost" onClick={() => navigate("/support")}>
                {tr("До підтримки", "Go to support")}
              </Button>
              <Button variant="ghost" onClick={() => {
                window.location.href = `mailto:${SUPPORT_EMAIL}`;
              }}>
                <Mail className="w-4 h-4 mr-2" />
                {SUPPORT_EMAIL}
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};
