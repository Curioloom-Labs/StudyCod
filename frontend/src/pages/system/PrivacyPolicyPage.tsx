import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export const PrivacyPolicyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

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
            <ShieldCheck className="w-5 h-5 text-primary" />
            <div className="text-lg font-mono text-text-primary">{tr("Політика конфіденційності", "Privacy Policy")}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <Card className="p-4 sm:p-6 space-y-4">
            <p className="text-xs font-mono text-text-muted">
              {tr("Оновлено: 15.04.2026", "Updated: 2026-04-15")}
            </p>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("1. Які дані ми обробляємо", "1. What data we process")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Ми обробляємо дані акаунта (логін, email), навчальний прогрес, результати завдань, технічні логи та повідомлення підтримки.",
                  "We process account data (username, email), learning progress, task results, technical logs, and support messages."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("2. Мета обробки", "2. Purpose of processing")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Дані використовуються для надання доступу до платформи, перевірки рішень, ведення журналу, покращення стабільності та відповіді на звернення.",
                  "Data is used to provide platform access, evaluate solutions, maintain gradebook functionality, improve reliability, and respond to support requests."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("3. Зберігання і захист", "3. Storage and security")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Ми застосовуємо технічні та організаційні заходи захисту, включно з контролем доступу, журналюванням та резервним копіюванням.",
                  "We apply technical and organizational safeguards, including access control, logging, and backup mechanisms."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("4. Передача даних", "4. Data sharing")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Ми не продаємо персональні дані. Передача третім сторонам можлива лише у межах надання сервісу, за згодою користувача або за вимогою законодавства.",
                  "We do not sell personal data. Sharing with third parties may happen only when necessary to provide the service, with user consent, or as required by law."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("5. Ваші права", "5. Your rights")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Ви можете звернутися щодо доступу, уточнення або видалення даних, а також щодо обмеження обробки у випадках, передбачених законом.",
                  "You can request access, correction, or deletion of data, and request processing restrictions where permitted by law."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("6. Контакти", "6. Contact")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "З питань конфіденційності звертайтесь через розділ підтримки.",
                  "For privacy-related requests, please contact us via the support section."
                )}
              </p>
              <div className="pt-1">
                <Button variant="secondary" onClick={() => navigate("/support")}>{tr("До підтримки", "Go to support")}</Button>
              </div>
            </section>
          </Card>
        </div>
      </main>
    </div>
  );
};
