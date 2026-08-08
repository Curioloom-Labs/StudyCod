import React from "react";
import { useTranslation } from "react-i18next";
import { Cookie } from "lucide-react";
import { LegalExperience } from "./LegalExperience";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const SUPPORT_EMAIL = "studycod@studycod.space";

export const CookiePolicyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

  const sections: LegalSection[] = [
    {
      title: tr("1. Що таке cookies і локальне сховище", "1. What cookies and local storage are"),
      paragraphs: [
        tr("Cookies — це невеликі файли, які сайт може зберігати у браузері. LocalStorage і sessionStorage — схожі механізми браузера, які дозволяють зберігати налаштування, токени, чернетки та стан інтерфейсу.", "Cookies are small files a website may store in the browser. LocalStorage and sessionStorage are similar browser mechanisms that store settings, tokens, drafts, and interface state."),
        tr("Cookies, localStorage та sessionStorage є різними технологіями. Для прозорості ця сторінка описує їх разом, але не ототожнює браузерні cookies з локальним сховищем.", "Cookies, local storage, and session storage are different technologies. For transparency, this page describes them together but does not treat browser cookies and local storage as the same thing.")
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
        tr("StudyCod може використовувати внутрішні журнали подій, помилок і продуктивності для виправлення багів, захисту від зловживань та покращення навчального досвіду. Такі журнали не повинні використовуватися для несумісних із цією метою цілей.", "StudyCod may use internal event, error, and performance logs to fix bugs, protect against abuse, and improve the learning experience. Such logs are not used for purposes incompatible with this notice."),
        tr("Станом на дату оновлення цієї політики StudyCod не описує рекламні cookies або необов'язкову сторонню аналітику як необхідні технології. Якщо такі технології буде додано, ми окремо оновимо повідомлення та отримаємо згоду там, де це вимагається законом.", "As of the date of this policy, StudyCod does not treat advertising cookies or optional third-party analytics as necessary technologies. If such technologies are added, we will update this notice and obtain consent where required by law.")
      ]
    },
    {
      title: tr("5. Сторонні сервіси", "5. Third-party services"),
      paragraphs: [
        tr("Окремі функції можуть взаємодіяти зі сторонніми сервісами, наприклад Google OAuth, email-доставкою, хостингом, Cloudflare Turnstile або AI-провайдерами. Такі сервіси можуть встановлювати власні cookies або обробляти технічні дані згідно зі своїми політиками; їх перелік і роль мають відповідати фактично підключеним інтеграціям.", "Some features may interact with third-party services, such as Google OAuth, email delivery, hosting, Cloudflare Turnstile, or AI providers. These services may set their own cookies or process technical data under their own policies; the list and role of each service must match the integrations actually enabled.")
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
    updated={tr("Оновлено 7 серпня 2026", "Updated August 7, 2026")}
    sections={sections}
    tr={tr}
    icon={Cookie}
    email={SUPPORT_EMAIL}
  />;
};
