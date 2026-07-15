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
      title: tr("1. Мінімальне 14-денне вікно повернення", "1. Minimum 14-day refund window"),
      paragraphs: [
        tr(
          "Для покупок, здійснених через Paddle Checkout, StudyCod надає мінімальне 14-денне вікно повернення коштів. Якщо ви надішлете запит на повернення протягом 14 днів з дати покупки, ми оформимо повернення без винятків і без додаткових умов з боку StudyCod.",
          "For purchases made through Paddle Checkout, StudyCod provides a minimum 14-day refund window. If you submit a refund request within 14 days of purchase, we will issue the refund with no exceptions and no additional conditions imposed by StudyCod."
        ),
        tr(
          "Це мінімальне правило застосовується до платних планів, цифрового доступу, підписок та організаційних або custom/enterprise оплат, якщо вони оплачуються через Paddle Checkout.",
          "This minimum rule applies to paid plans, digital access, subscriptions, and organization or custom/enterprise purchases when they are paid through Paddle Checkout."
        )
      ]
    },
    {
      title: tr("2. Ваші законні права", "2. Your legal rights"),
      paragraphs: [
        tr(
          "Ця політика не обмежує обов'язкові права споживача, які можуть надавати довше право на скасування або повернення відповідно до застосовного законодавства чи умов Paddle Buyer Terms.",
          "This policy does not limit mandatory consumer rights that may provide a longer cancellation or refund right under applicable law or the Paddle Buyer Terms."
        )
      ]
    },
    {
      title: tr("3. Як подати запит", "3. How to request a refund"),
      paragraphs: [
        tr(
          `Надішліть запит на ${SUPPORT_EMAIL} або зверніться через підтримку в акаунті. Щоб ми швидше знайшли платіж, додайте email акаунта, дату платежу, суму, назву тарифу або продукту та ID транзакції Paddle, якщо він у вас є.`,
          `Send a request to ${SUPPORT_EMAIL} or contact support from your account. To help us find the payment faster, include the account email, payment date, amount, plan or product name, and the Paddle transaction ID if you have it.`
        )
      ],
      bullets: [
        tr("Не надсилайте повний номер банківської картки або CVV.", "Do not send a full card number or CVV."),
        tr("Запит у межах 14 днів з дати покупки не потребує пояснення причини.", "A request made within 14 days of purchase does not require you to explain the reason."),
        tr("Якщо оплату робила організація, запит може подати платник, власник інвойсу або уповноважена контактна особа.", "If an organization made the payment, the request may be submitted by the payer, invoice owner, or authorized contact person.")
      ]
    },
    {
      title: tr("4. Обробка повернення", "4. Refund processing"),
      paragraphs: [
        tr(
          "Після отримання запиту, що підпадає під 14-денне вікно, ми передаємо повернення на обробку через Paddle або відповідний платіжний метод. Фактичне зарахування коштів залежить від банку, карткової мережі або платіжного провайдера.",
          "After receiving a request that falls within the 14-day window, we submit the refund for processing through Paddle or the relevant payment method. The actual posting of funds depends on the bank, card network, or payment provider."
        )
      ],
    },
    {
      title: tr("5. Запити після 14 днів", "5. Requests after 14 days"),
      paragraphs: [
        tr(
          "Після мінімального 14-денного періоду ви все одно можете звернутися до нас щодо помилкової, дубльованої або технічно проблемної оплати. Такі запити розглядаються окремо, але це не змінює вашого права на повернення протягом перших 14 днів.",
          "After the minimum 14-day period, you can still contact us about an accidental, duplicate, or technically problematic payment. These requests are reviewed separately, but this does not change your right to a refund during the first 14 days."
        )
      ]
    },
    {
      title: tr("6. Скасування підписок або доступу", "6. Subscription or access cancellation"),
      paragraphs: [
        tr(
          "Скасування підписки зупиняє майбутні поновлення або списання. Якщо скасування або запит на повернення подано протягом 14 днів з дати покупки, 14-денне правило повернення застосовується незалежно від скасування.",
          "Cancelling a subscription stops future renewals or charges. If the cancellation or refund request is submitted within 14 days of purchase, the 14-day refund rule applies regardless of the cancellation."
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
    description={tr("Мінімальне 14-денне повернення коштів, скасування оплат і порядок подання запиту.", "Minimum 14-day refunds, payment cancellations, and how to submit a request.")}
    updated={tr("Оновлено 15 липня 2026", "Updated July 15, 2026")}
    sections={sections}
    tr={tr}
    icon={RotateCcw}
    email={SUPPORT_EMAIL}
  />;
};

export default RefundPolicyPage;
