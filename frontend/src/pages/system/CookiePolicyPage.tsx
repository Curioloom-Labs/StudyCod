import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Cookie, Mail } from "lucide-react";
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

export const CookiePolicyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

  const sections: LegalSection[] = [
    {
      title: tr("1. Що таке cookies і локальне сховище", "1. What cookies and local storage are"),
      paragraphs: [
        tr("Cookies — це невеликі файли, які сайт може зберігати у браузері. LocalStorage і sessionStorage — схожі механізми браузера, які дозволяють зберігати налаштування, токени, чернетки та стан інтерфейсу.", "Cookies are small files a website may store in the browser. LocalStorage and sessionStorage are similar browser mechanisms that store settings, tokens, drafts, and interface state."),
        tr("У цій політиці слово 'cookies' охоплює також localStorage, sessionStorage та інші подібні технології, якщо контекст не вимагає іншого.", "In this policy, the word 'cookies' also covers localStorage, sessionStorage, and similar technologies unless the context requires otherwise.")
      ]
    },
    {
      title: tr("2. Необхідні технології", "2. Strictly necessary technologies"),
      paragraphs: [
        tr("StudyCod використовує необхідні cookies і локальне сховище для входу в акаунт, безпеки, переходів після авторизації, Google OAuth, захисту від зловживань, підтримки сесії та коректної роботи інтерфейсу.", "StudyCod uses necessary cookies and local storage for account login, security, post-auth redirects, Google OAuth, abuse prevention, session support, and correct interface operation.")
      ],
      bullets: [
        tr("JWT/token або інший маркер входу, щоб користувач залишався авторизованим.", "JWT/token or another login marker so the user remains signed in."),
        tr("Тимчасові sessionStorage-ключі для повернення після входу, Google OAuth або технічного обслуговування.", "Temporary sessionStorage keys for returning after login, Google OAuth, or maintenance states."),
        tr("Службові cookies backend-сесії, зокрема для прив'язки Google-акаунта або обміну тимчасовим OAuth-кодом.", "Backend service cookies, including for linking a Google account or exchanging a temporary OAuth code."),
        tr("Технічні маркери безпеки, rate limiting, Turnstile/captcha або захисту від автоматизованих зловживань, якщо такі механізми увімкнені.", "Technical markers for security, rate limiting, Turnstile/captcha, or protection from automated abuse when such mechanisms are enabled.")
      ]
    },
    {
      title: tr("3. Функціональні налаштування", "3. Functional settings"),
      bullets: [
        tr("Мова інтерфейсу, тема, режим інтерфейсу та інші персональні налаштування.", "Interface language, theme, UI mode, and other personal settings."),
        tr("Чернетки коду, відповіді на тести, персональні нотатки, стан редактора й відкритої задачі.", "Code drafts, quiz answers, personal notes, editor state, and the currently open task."),
        tr("Дані для відновлення навчальної сесії, останньої активності або безпечного продовження роботи після оновлення сторінки.", "Data for resuming a learning session, last activity, or safely continuing work after a page refresh.")
      ],
      paragraphs: [
        tr("Ці дані допомагають не втрачати прогрес і не налаштовувати платформу заново після кожного відкриття сайту.", "These data help prevent progress loss and avoid reconfiguring the platform each time the site opens.")
      ]
    },
    {
      title: tr("4. Аналітика та покращення сервісу", "4. Analytics and service improvement"),
      paragraphs: [
        tr("StudyCod може використовувати внутрішні журнали подій, помилок і продуктивності для виправлення багів, захисту від зловживань та покращення навчального досвіду.", "StudyCod may use internal event, error, and performance logs to fix bugs, protect against abuse, and improve the learning experience."),
        tr("Якщо в майбутньому буде підключено необов'язкову сторонню аналітику або рекламні cookies, ми маємо показати відповідне повідомлення або отримати згоду там, де це вимагається законом.", "If optional third-party analytics or advertising cookies are added in the future, we should show a relevant notice or obtain consent where required by law.")
      ]
    },
    {
      title: tr("5. Сторонні сервіси", "5. Third-party services"),
      paragraphs: [
        tr("Окремі функції можуть взаємодіяти зі сторонніми сервісами, наприклад Google OAuth, email-доставкою, хостингом, Cloudflare Turnstile або AI-провайдерами. Такі сервіси можуть встановлювати власні cookies або обробляти технічні дані згідно зі своїми політиками.", "Some features may interact with third-party services, such as Google OAuth, email delivery, hosting, Cloudflare Turnstile, or AI providers. These services may set their own cookies or process technical data under their own policies.")
      ]
    },
    {
      title: tr("6. Як керувати cookies", "6. How to manage cookies"),
      bullets: [
        tr("Можна очистити cookies і локальне сховище в налаштуваннях браузера.", "You can clear cookies and local storage in your browser settings."),
        tr("Можна вийти з акаунта, щоб видалити або зробити недійсними частину даних входу на цьому пристрої.", "You can log out to remove or invalidate part of the login data on this device."),
        tr("Можна очистити чернетки або локальні дані задач через браузер, якщо потрібно прибрати збережений код чи відповіді.", "You can clear drafts or local task data through the browser if you need to remove saved code or answers."),
        tr("Блокування необхідних cookies може призвести до того, що вхід, Google OAuth, збереження сесії або виконання задач працюватимуть некоректно.", "Blocking necessary cookies may cause login, Google OAuth, session saving, or task execution to work incorrectly.")
      ]
    },
    {
      title: tr("7. Строк зберігання", "7. Retention period"),
      paragraphs: [
        tr("Тимчасові sessionStorage-дані зазвичай зникають після завершення сесії браузера. LocalStorage-дані можуть залишатися довше, доки користувач не вийде з акаунта, не очистить браузер або доки застосунок не видалить застарілі записи.", "Temporary sessionStorage data usually disappears after the browser session ends. LocalStorage data may remain longer until the user logs out, clears the browser, or the app removes outdated records."),
        tr("Службові cookies backend-сесії та OAuth-обміну мають обмежений строк дії та використовуються лише для завершення відповідної технічної операції.", "Backend service cookies and OAuth exchange cookies have a limited lifetime and are used only to complete the relevant technical operation.")
      ]
    },
    {
      title: tr("8. Контакти", "8. Contact"),
      paragraphs: [
        tr(`Питання щодо cookies, локального сховища або приватності можна надіслати на ${SUPPORT_EMAIL}.`, `Questions about cookies, local storage, or privacy can be sent to ${SUPPORT_EMAIL}.`)
      ]
    }
  ];

  return <LegalExperience
    current="cookies"
    title={tr("Cookies і локальне сховище", "Cookies & Local Storage")}
    description={tr("Які браузерні технології використовує StudyCod, навіщо вони потрібні та як ними керувати.", "Which browser technologies StudyCod uses, why they are needed, and how to manage them.")}
    updated={tr("Оновлено 31 травня 2026", "Updated May 31, 2026")}
    sections={sections}
    tr={tr}
    icon={Cookie}
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
            <Cookie className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-mono text-text-primary">{tr("Політика cookies", "Cookie Policy")}</span>
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
            <PageEyebrow label="cookies" />
            <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
              {tr("Політика cookies", "Cookie Policy")}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              {tr("Ця сторінка пояснює, які cookies і браузерне сховище використовує StudyCod та як ними керувати.", "This page explains what cookies and browser storage StudyCod uses and how to manage them.")}
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
            <Button variant="secondary" onClick={() => navigate("/privacy")}>
              {tr("Політика конфіденційності", "Privacy Policy")}
            </Button>
            <Button variant="ghost" onClick={() => navigate("/terms")}>
              {tr("Умови використання", "Terms of Use")}
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
