import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { fadeUpItem, staggerContainer, easeOutQuint } from "../../lib/motion";
import { LegalExperience } from "./LegalExperience";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const SUPPORT_EMAIL = "support@studycod.space";

const LegalSectionBlock: React.FC<{ section: LegalSection }> = ({ section }) => (
  <section className="space-y-2.5">
    <h2 className="text-sm font-mono font-semibold text-text-primary">{section.title}</h2>
    {section.paragraphs?.map((paragraph) => (
      <p key={paragraph} className="text-sm leading-7 text-text-secondary">{paragraph}</p>
    ))}
    {section.bullets ? (
      <ul className="space-y-1.5 pl-4 border-l-2 border-primary/20">
        {section.bullets.map((bullet) => (
          <li key={bullet} className="text-sm leading-6 text-text-secondary pl-2">{bullet}</li>
        ))}
      </ul>
    ) : null}
  </section>
);

export const PrivacyPolicyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

  const sections: LegalSection[] = [
    {
      title: tr("1. Хто відповідає за обробку даних", "1. Who is responsible for data processing"),
      paragraphs: [
        tr("Ця політика пояснює, як StudyCod обробляє персональні дані користувачів платформи: учнів, студентів, вчителів, організаторів змагань, адміністраторів та користувачів персонального режиму.", "This policy explains how StudyCod processes personal data of platform users: learners, students, teachers, contest organizers, administrators, and personal-mode users."),
        tr("Для персонального режиму оператором даних є StudyCod. Для класів, створених навчальним закладом або вчителем, відповідальність за склад учнів, навчальні матеріали й оцінювання може розподілятися між StudyCod та відповідним навчальним організатором.", "For personal mode, StudyCod acts as the data operator. For classes created by an educational institution or teacher, responsibility for student rosters, learning materials, and assessment may be shared between StudyCod and the relevant educational organizer.")
      ]
    },
    {
      title: tr("2. Які дані ми обробляємо", "2. What data we process"),
      bullets: [
        tr("Дані акаунта: username, email, пароль у захищеному вигляді, роль, мова інтерфейсу, курс, часовий пояс, налаштування профілю та публічності.", "Account data: username, email, protected password hash, role, interface language, course, timezone, profile settings, and public profile preferences."),
        tr("Профільні дані: ім'я, прізвище, аватар, дата й місяць народження, прив'язані Google-акаунти або спортивні/олімпіадні handles, якщо користувач їх додає.", "Profile data: first name, last name, avatar, birth day and month, linked Google accounts, or coding-platform handles if the user adds them."),
        tr("Навчальні дані: задачі, код, відповіді на тести, спроби, оцінки, прогрес, рівень підготовки, streak, чернетки, нотатки та історія виконання.", "Learning data: tasks, code, quiz answers, attempts, grades, progress, placement level, streaks, drafts, notes, and activity history."),
        tr("Дані EDU-режиму: класи, списки учнів, учнівські акаунти, уроки, контрольні роботи, апеляції, коментарі вчителя та підсумкові оцінки.", "EDU-mode data: classes, student rosters, student accounts, lessons, control works, appeals, teacher comments, and summary grades."),
        tr("Дані змагань: учасники, заявки, результати, сертифікати, дискваліфікації, службові повідомлення та контактні email для розсилок організатора.", "Contest data: participants, registrations, results, certificates, disqualifications, service messages, and contact emails for organizer mailings."),
        tr("Дані підтримки: тема звернення, повідомлення, email, вкладення, історія діалогу та службові статуси звернення.", "Support data: request subject, messages, email, attachments, conversation history, and service statuses."),
        tr("Технічні дані: IP-адреса, user agent, час запитів, помилки, журнали безпеки, rate-limit події, session/cookie identifiers та діагностична інформація.", "Technical data: IP address, user agent, request times, errors, security logs, rate-limit events, session/cookie identifiers, and diagnostic information.")
      ]
    },
    {
      title: tr("3. Для чого ми використовуємо дані", "3. Why we use data"),
      bullets: [
        tr("Щоб створювати акаунти, автентифікувати користувачів, відновлювати пароль і захищати доступ до платформи.", "To create accounts, authenticate users, reset passwords, and protect access to the platform."),
        tr("Щоб перевіряти код, запускати тести, зберігати прогрес, показувати оцінки та будувати навчальну траєкторію.", "To evaluate code, run tests, save progress, show grades, and build a learning path."),
        tr("Щоб вчителі могли вести класи, призначати завдання, оцінювати роботи, переглядати апеляції та підтримувати учнів.", "To let teachers manage classes, assign tasks, grade work, review appeals, and support students."),
        tr("Щоб проводити контести, формувати рейтинги, сертифікати й службові повідомлення учасникам.", "To run contests, generate scoreboards, certificates, and service messages for participants."),
        tr("Щоб відповідати на звернення підтримки, виправляти помилки, запобігати зловживанням і підтримувати стабільність сервісу.", "To respond to support requests, fix bugs, prevent abuse, and keep the service reliable."),
        tr("Щоб надсилати важливі службові листи, а також навчальні або маркетингові листи, якщо така підписка увімкнена.", "To send important service emails, and learning or marketing emails when the subscription is enabled.")
      ]
    },
    {
      title: tr("4. Правові підстави обробки", "4. Legal bases for processing"),
      paragraphs: [
        tr("Залежно від ситуації ми обробляємо дані на підставі виконання домовленості з користувачем або навчальним організатором, законного інтересу в безпеці й розвитку сервісу, згоди користувача або вимог законодавства.", "Depending on the situation, we process data to perform an agreement with the user or educational organizer, based on legitimate interests in security and service improvement, with user consent, or to comply with legal requirements."),
        tr("Якщо учень користується платформою в межах класу, вчитель або навчальна організація мають переконатися, що для створення й використання учнівського акаунта є належна підстава або згода батьків/законних представників, коли це потрібно.", "If a student uses the platform as part of a class, the teacher or educational organization must ensure there is a proper basis or parent/legal guardian consent for creating and using the student account when required.")
      ]
    },
    {
      title: tr("5. AI, автоматична перевірка та доброчесність", "5. AI, automated checking, and integrity"),
      paragraphs: [
        tr("StudyCod може використовувати автоматичні тести, аналіз коду, AI-підказки, AI-генерацію навчальних матеріалів та інструменти оцінювання. Для цього можуть оброблятися умови задач, код, відповіді, технічні помилки й навчальний контекст.", "StudyCod may use automated tests, code analysis, AI hints, AI-generated learning materials, and assessment tools. Task statements, code, answers, technical errors, and learning context may be processed for this purpose."),
        tr("Журнали доброчесності можуть фіксувати технічні сигнали під час виконання або здачі роботи, наприклад індикатори підозрілої активності. Такі сигнали призначені для перегляду вчителем або адміністратором і не повинні бути єдиною підставою для важливого рішення без людської перевірки.", "Integrity logs may record technical signals during work or submission, such as indicators of suspicious activity. These signals are intended for teacher or administrator review and should not be the sole basis for an important decision without human review.")
      ]
    },
    {
      title: tr("6. Кому ми можемо передавати дані", "6. Who we may share data with"),
      bullets: [
        tr("Вчителям, адміністраторам класів або організаторам змагань у межах їхніх навчальних груп, контестів і службових повноважень.", "Teachers, class administrators, or contest organizers within their learning groups, contests, and service responsibilities."),
        tr("Технічним постачальникам: хостинг, база даних, email-доставка, кеш/черги, хмарні сервіси, AI-провайдери, антиспам або captcha/Turnstile.", "Technical providers: hosting, database, email delivery, cache/queues, cloud services, AI providers, anti-spam, or captcha/Turnstile."),
        tr("Правоохоронним органам, судам або державним органам, якщо цього вимагає закон або необхідно для захисту прав, безпеки чи цілісності сервісу.", "Law enforcement, courts, or public authorities when required by law or necessary to protect rights, safety, or service integrity.")
      ],
      paragraphs: [
        tr("Ми не продаємо персональні дані користувачів. Постачальники отримують лише ті дані, які потрібні для виконання конкретної функції сервісу.", "We do not sell users' personal data. Providers receive only the data needed to perform a specific service function.")
      ]
    },
    {
      title: tr("7. Міжнародна передача даних", "7. International data transfers"),
      paragraphs: [
        tr("Окремі технічні або AI-сервіси можуть бути розміщені за межами країни користувача. У таких випадках ми застосовуємо доступні договірні, технічні та організаційні заходи для захисту даних відповідно до застосовного законодавства.", "Some technical or AI services may be hosted outside the user's country. In those cases, we use available contractual, technical, and organizational safeguards to protect data in line with applicable law.")
      ]
    },
    {
      title: tr("8. Зберігання даних", "8. Data retention"),
      paragraphs: [
        tr("Ми зберігаємо дані стільки, скільки це потрібно для роботи акаунта, навчального процесу, підтримки, безпеки, виконання юридичних обов'язків або вирішення спорів. Навчальні результати й журнал оцінок можуть зберігатися довше, якщо вони потрібні вчителю, класу, контесту або самому користувачу.", "We keep data for as long as needed to operate the account, support learning, provide support, maintain security, meet legal obligations, or resolve disputes. Learning results and gradebook records may be kept longer when needed by a teacher, class, contest, or the user."),
        tr("Локальні чернетки, нотатки, токени входу, мова інтерфейсу та налаштування можуть зберігатися у браузері користувача до виходу з акаунта, очищення браузера або видалення відповідних даних користувачем.", "Local drafts, notes, login tokens, interface language, and settings may be stored in the user's browser until logout, browser cleanup, or deletion of the relevant data by the user.")
      ]
    },
    {
      title: tr("9. Захист даних", "9. Data security"),
      paragraphs: [
        tr("Ми застосовуємо технічні й організаційні заходи захисту: обмеження доступу за ролями, токени автентифікації, хешування паролів, журналювання подій, rate limiting, ізоляцію виконання коду, перевірку файлів підтримки та контроль службових доступів.", "We use technical and organizational safeguards: role-based access, authentication tokens, password hashing, event logging, rate limiting, code execution isolation, support file validation, and administrative access controls."),
        tr("Жоден онлайн-сервіс не може гарантувати абсолютну безпеку. Якщо ви підозрюєте несанкціонований доступ до акаунта або витік даних, повідомте нас якомога швидше.", "No online service can guarantee absolute security. If you suspect unauthorized account access or a data leak, please notify us as soon as possible.")
      ]
    },
    {
      title: tr("10. Права користувача", "10. User rights"),
      bullets: [
        tr("Отримати інформацію про те, які дані ми обробляємо.", "Receive information about what data we process."),
        tr("Попросити виправити неточні або застарілі дані.", "Ask us to correct inaccurate or outdated data."),
        tr("Попросити видалити акаунт або окремі дані, якщо немає законної причини зберігати їх далі.", "Ask us to delete an account or specific data when there is no lawful reason to keep it."),
        tr("Обмежити або заперечити проти певної обробки у випадках, передбачених законом.", "Restrict or object to certain processing where the law allows it."),
        tr("Відписатися від маркетингових листів без втрати доступу до службових повідомлень.", "Unsubscribe from marketing emails without losing access to service messages."),
        tr("Попросити експорт даних у розумному технічному форматі, якщо це можливо й передбачено законом.", "Request data export in a reasonable technical format where possible and required by law.")
      ],
      paragraphs: [
        tr("Ми можемо попросити підтвердити особу перед виконанням запиту, щоб не розкрити дані сторонній особі.", "We may ask you to verify your identity before fulfilling a request so that we do not disclose data to someone else.")
      ]
    },
    {
      title: tr("11. Діти та навчальні акаунти", "11. Children and educational accounts"),
      paragraphs: [
        tr("StudyCod є навчальною платформою, тому нею можуть користуватися неповнолітні. Учнівські акаунти в EDU-режимі мають створюватися або використовуватися з відома вчителя, навчальної організації або законного представника, якщо це потрібно за законом.", "StudyCod is an educational platform, so minors may use it. Student accounts in EDU mode should be created or used with the knowledge of a teacher, educational organization, or legal guardian where required by law."),
        tr("Ми не просимо учнів додавати зайві персональні дані й рекомендуємо вчителям мінімізувати дані в назвах класів, матеріалах, коментарях і вкладеннях.", "We do not ask students to add unnecessary personal data and recommend that teachers minimize personal data in class names, materials, comments, and attachments.")
      ]
    },
    {
      title: tr("12. Cookies і локальне сховище", "12. Cookies and local storage"),
      paragraphs: [
        tr("Ми використовуємо cookies, localStorage і sessionStorage для входу, безпеки, Google OAuth, мови інтерфейсу, чернеток, налаштувань, стану сесій і стабільної роботи платформи. Детальніше це описано в Cookie Policy.", "We use cookies, localStorage, and sessionStorage for login, security, Google OAuth, interface language, drafts, settings, session state, and stable platform operation. This is described in more detail in the Cookie Policy.")
      ]
    },
    {
      title: tr("13. Оновлення політики", "13. Policy updates"),
      paragraphs: [
        tr("Ми можемо оновлювати цю політику, коли змінюється функціональність платформи, постачальники, вимоги безпеки або законодавство. Актуальна версія завжди доступна на цій сторінці.", "We may update this policy when platform functionality, providers, security requirements, or laws change. The current version is always available on this page.")
      ]
    },
    {
      title: tr("14. Контакти", "14. Contact"),
      paragraphs: [
        tr(`З питань приватності, доступу, видалення або виправлення даних напишіть на ${SUPPORT_EMAIL} або створіть звернення в розділі підтримки після входу в акаунт.`, `For privacy, access, deletion, or correction requests, email ${SUPPORT_EMAIL} or create a support request after signing in.`)
      ]
    }
  ];

  return <LegalExperience
    current="privacy"
    title={tr("Політика конфіденційності", "Privacy Policy")}
    description={tr("Як StudyCod обробляє й захищає дані учнів, викладачів, організаторів та користувачів Personal.", "How StudyCod processes and protects data for students, teachers, organizers, and Personal users.")}
    updated={tr("Оновлено 31 травня 2026", "Updated May 31, 2026")}
    sections={sections}
    tr={tr}
    icon={ShieldCheck}
    email={SUPPORT_EMAIL}
  />;

  return (
    <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
      {/* Header */}
      <motion.header
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutQuint }}
        className="min-h-14 border-b border-border bg-bg-surface flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 md:px-6 py-2 shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-mono text-text-primary">{tr("Політика конфіденційності", "Privacy Policy")}</span>
          </div>
        </div>
      </motion.header>

      <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-8">
        <motion.div
          variants={prefersReducedMotion ? undefined : staggerContainer}
          initial={prefersReducedMotion ? undefined : "initial"}
          animate={prefersReducedMotion ? undefined : "animate"}
          className="max-w-3xl mx-auto"
        >
          {/* Hero */}
          <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="mb-8">
            <PageEyebrow label="privacy" />
            <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
              {tr("Політика конфіденційності", "Privacy Policy")}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              {tr("Цей документ описує, які дані збирає StudyCod, навіщо вони потрібні, кому можуть бути доступні та як користувач може керувати своїми даними.", "This document describes what data StudyCod collects, why it is needed, who may access it, and how users can manage their data.")}
            </p>
            <p className="mt-1.5 text-xs font-mono text-text-muted">{tr("Оновлено: 31.05.2026", "Updated: 2026-05-31")}</p>
          </motion.div>

          <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
            <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent mb-8" />
          </motion.div>

          <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="space-y-7">
            {sections.map((section) => (
              <LegalSectionBlock key={section.title} section={section} />
            ))}
          </motion.div>

          <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="mt-10 pt-6 border-t border-border flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate("/cookies")}>
              {tr("Політика cookies", "Cookie Policy")}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/support")}>
              {tr("До підтримки", "Go to support")}
            </Button>
            <Button variant="ghost" onClick={() => { window.location.href = `mailto:${SUPPORT_EMAIL}`; }}>
              <Mail className="w-4 h-4 mr-2" />
              {SUPPORT_EMAIL}
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
};
