import React from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { LegalExperience, type LegalSection } from "./LegalExperience";

const SUPPORT_EMAIL = "studycod@studycod.space";

export const RefundPolicyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

  const sections: LegalSection[] = [
    {
      title: tr("1. Загальний принцип", "1. General principle"),
      paragraphs: [
        tr(
          "StudyCod продає доступ до цифрової навчальної платформи, курсів, освітніх інструментів, змагань або організаційних робочих просторів. Ми хочемо, щоб оплата була прозорою: якщо сервіс не працює як очікувалось або оплата сталася помилково, напишіть нам — ми розглянемо запит по суті.",
          "StudyCod sells access to a digital learning platform, courses, education tools, contests, or organization workspaces. We want billing to be transparent: if the service does not work as expected or a payment happened by mistake, contact us and we will review the request on its merits."
        )
      ]
    },
    {
      title: tr("2. Коли можливе повернення", "2. When refunds may be available"),
      bullets: [
        tr("Випадкова або дубльована оплата за той самий період чи продукт.", "Accidental or duplicate payment for the same period or product."),
        tr("Технічна помилка з нашого боку, через яку оплачений доступ фактично не був наданий.", "A technical issue on our side that prevented the paid access from being provided."),
        tr("Скасування платного доступу до початку оплаченого періоду або до фактичного використання цифрового продукту, якщо це застосовно до конкретного тарифу.", "Cancellation before the paid period starts or before the digital product is actually used, where applicable to the specific plan."),
        tr("Інші випадки, коли законодавство або правила платіжного провайдера вимагають повернення коштів.", "Other cases where applicable law or payment provider rules require a refund.")
      ]
    },
    {
      title: tr("3. Коли повернення може бути недоступним", "3. When refunds may not be available"),
      paragraphs: [
        tr(
          "Повернення може бути недоступним, якщо оплачений цифровий доступ уже був активований і суттєво використаний, якщо завершився період доступу, якщо порушено правила платформи або якщо продукт був наданий відповідно до опису тарифу.",
          "A refund may not be available if paid digital access has already been activated and substantially used, if the access period has ended, if platform rules were violated, or if the product was delivered according to the plan description."
        ),
        tr(
          "Для організаційних, шкільних або конкурсних оплат можуть діяти окремі умови договору, інвойсу або письмової домовленості.",
          "Organization, school, or contest payments may be subject to separate terms in a contract, invoice, or written agreement."
        )
      ]
    },
    {
      title: tr("4. Як подати запит", "4. How to request a refund"),
      paragraphs: [
        tr(
          `Надішліть запит на ${SUPPORT_EMAIL} або зверніться через підтримку в акаунті. Щоб ми швидше перевірили оплату, додайте email акаунта, дату платежу, суму, назву тарифу або продукту та короткий опис причини.`,
          `Send a request to ${SUPPORT_EMAIL} or contact support from your account. To help us verify the payment faster, include the account email, payment date, amount, plan or product name, and a short reason.`
        )
      ],
      bullets: [
        tr("Не надсилайте повний номер банківської картки або CVV.", "Do not send a full card number or CVV."),
        tr("Якщо платіж зроблено через стороннього провайдера, ми можемо попросити ID транзакції або квитанцію.", "If payment was made through a third-party provider, we may ask for a transaction ID or receipt."),
        tr("Якщо оплату робила організація, запит має подати уповноважена особа або власник інвойсу.", "If an organization made the payment, the request should come from an authorized person or invoice owner.")
      ]
    },
    {
      title: tr("5. Строки розгляду й зарахування", "5. Review and processing time"),
      paragraphs: [
        tr(
          "Ми зазвичай розглядаємо запити протягом 5 робочих днів після отримання достатньої інформації. Якщо повернення схвалено, фактичне зарахування коштів залежить від банку або платіжного провайдера і може тривати додатково кілька робочих днів.",
          "We usually review requests within 5 business days after receiving enough information. If a refund is approved, the actual posting of funds depends on the bank or payment provider and may take additional business days."
        )
      ]
    },
    {
      title: tr("6. Скасування підписок або доступу", "6. Subscription or access cancellation"),
      paragraphs: [
        tr(
          "Якщо для вашого тарифу доступне автоматичне поновлення, його можна скасувати до наступного списання через акаунт або через підтримку. Скасування зупиняє майбутні списання, але не завжди означає повернення за вже оплачений період.",
          "If automatic renewal is available for your plan, it can be cancelled before the next charge through your account or support. Cancellation stops future charges but does not always mean a refund for an already paid period."
        )
      ]
    },
    {
      title: tr("7. Зміни цієї політики", "7. Changes to this policy"),
      paragraphs: [
        tr(
          "Ми можемо оновлювати цю політику, якщо змінюються тарифи, платіжні процеси, законодавство або робота платформи. Актуальна версія завжди публікується на цій сторінці.",
          "We may update this policy when plans, payment processes, laws, or platform operations change. The current version is always published on this page."
        )
      ]
    },
    {
      title: tr("8. Контакти", "8. Contact"),
      paragraphs: [
        tr(`Питання щодо оплат, скасувань або повернень можна надіслати на ${SUPPORT_EMAIL}.`, `Questions about billing, cancellations, or refunds can be sent to ${SUPPORT_EMAIL}.`)
      ]
    }
  ];

  return <LegalExperience
    current="refunds"
    title={tr("Політика повернення коштів", "Refund Policy")}
    description={tr("Як StudyCod розглядає повернення, скасування оплат і запити щодо помилкових транзакцій.", "How StudyCod handles refunds, cancellations, and requests related to mistaken transactions.")}
    updated={tr("Оновлено 13 липня 2026", "Updated July 13, 2026")}
    sections={sections}
    tr={tr}
    icon={RotateCcw}
    email={SUPPORT_EMAIL}
  />;
};

export default RefundPolicyPage;
