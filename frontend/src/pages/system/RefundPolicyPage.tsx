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
      title: tr("1. Добровільне 14-денне повернення", "1. Voluntary 14-day refund window"),
      paragraphs: [
        tr(
          "Для покупок платних планів, цифрового доступу та підписок StudyCod добровільно надає 14-денний строк для запиту на повернення коштів. Якщо ви надішлете запит протягом 14 календарних днів з дати покупки, ми розглянемо його за цим правилом без вимоги пояснювати причину.",
          "For purchases of paid plans, digital access, and subscriptions, StudyCod voluntarily provides a 14-day period for requesting a refund. If you submit a request within 14 calendar days of the purchase date, we will review it under this rule without requiring an explanation."
        ),
        tr(
          "Це добровільне правило застосовується до оплат StudyCod, якщо інше не визначено індивідуальними умовами замовлення або обов’язковими нормами законодавства.",
          "This voluntary rule applies to StudyCod payments unless the applicable order terms or mandatory law provide otherwise."
        )
      ]
    },
    {
      title: tr("2. Ваші законні права", "2. Your legal rights"),
      paragraphs: [
        tr(
          "Ця політика не обмежує обов’язкові права споживача, зокрема право розірвати дистанційний договір та інші права, передбачені чинним законодавством України. Якщо закон встановлює інший порядок або виняток для цифрової послуги, застосовується закон.",
          "This policy does not limit mandatory consumer rights, including the right to withdraw from a distance contract and other rights provided by Ukrainian law. If the law establishes a different procedure or an exception for a digital service, the law applies."
        )
      ]
    },
    {
      title: tr("3. Як подати запит", "3. How to request a refund"),
      paragraphs: [
        tr(
          `Надішліть запит на ${SUPPORT_EMAIL} або зверніться через підтримку в акаунті. Щоб ми швидше знайшли платіж, додайте email акаунта, дату платежу, суму, назву тарифу або продукту та ідентифікатор транзакції або інше підтвердження платежу, якщо воно у вас є.`,
          `Send a request to ${SUPPORT_EMAIL} or contact support from your account. To help us find the payment faster, include the account email, payment date, amount, plan or product name, and the transaction ID or other payment confirmation if available.`
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
          "Після схвалення повернення ми оформлюємо його тим самим платіжним методом, який використовувався для оплати, якщо інше не передбачено законом або неможливо з технічних причин. Фактичне зарахування коштів залежить від банку, карткової мережі або іншого платіжного провайдера.",
          "After a refund is approved, we process it using the same payment method used for the purchase unless the law provides otherwise or this is technically impossible. The actual posting of funds depends on the bank, card network, or other payment provider."
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
    description={tr("14-денний запит на повернення коштів, скасування оплат і порядок звернення.", "14-day refund requests, payment cancellations, and how to submit a request.")}
    updated={tr("Оновлено 7 серпня 2026", "Updated August 7, 2026")}
    sections={sections}
    tr={tr}
    icon={RotateCcw}
    email={SUPPORT_EMAIL}
  />;
};

export default RefundPolicyPage;
