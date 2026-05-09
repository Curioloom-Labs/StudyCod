import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ScrollText } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export const TermsOfUsePage: React.FC = () => {
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
            <ScrollText className="w-5 h-5 text-primary" />
            <div className="text-lg font-mono text-text-primary">{tr("Умови використання", "Terms of Use")}</div>
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
              <h2 className="text-base font-mono text-text-primary">{tr("1. Загальні положення", "1. General terms")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Використовуючи StudyCod, ви погоджуєтесь із цими умовами. Якщо ви не погоджуєтесь — припиніть використання платформи.",
                  "By using StudyCod, you agree to these terms. If you disagree, please discontinue platform usage."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("2. Обліковий запис", "2. Account")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Користувач відповідає за безпеку доступу до свого акаунта та достовірність наданої інформації.",
                  "The user is responsible for account access security and the accuracy of provided information."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("3. Дозволене використання", "3. Acceptable use")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Заборонено порушувати роботу сервісу, здійснювати несанкціонований доступ, поширювати шкідливий код або контент, що порушує закон.",
                  "You must not disrupt service operations, attempt unauthorized access, distribute malicious code, or publish unlawful content."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("4. Інтелектуальна власність", "4. Intellectual property")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Матеріали платформи належать їхнім правовласникам. Користувач не має права копіювати чи поширювати контент поза межами дозволеного використання.",
                  "Platform materials belong to their respective rights holders. Users may not copy or redistribute content beyond permitted use."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("5. Відповідальність", "5. Liability")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Сервіс надається " + "" + "як є" + "" + ". Ми докладаємо зусиль для стабільності, але не гарантуємо безперервну доступність у кожен момент часу.",
                  "The service is provided " + "" + "as is" + "" + ". We aim for reliability but cannot guarantee uninterrupted availability at all times."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("6. Оновлення умов", "6. Changes to terms")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Ми можемо періодично оновлювати ці умови. Актуальна версія завжди публікується на цій сторінці.",
                  "We may update these terms from time to time. The current version is always available on this page."
                )}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-mono text-text-primary">{tr("7. Підтримка", "7. Support")}</h2>
              <p className="text-sm text-text-secondary">
                {tr(
                  "Якщо є питання щодо умов використання — зверніться до служби підтримки.",
                  "If you have questions regarding these terms, contact support."
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
