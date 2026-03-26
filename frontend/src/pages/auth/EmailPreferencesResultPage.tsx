import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

export const EmailPreferencesResultPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const ok = searchParams.get("ok") === "1";
  const action = String(searchParams.get("action") || "unsubscribe").toLowerCase() === "subscribe" ? "subscribe" : "unsubscribe";
  const email = String(searchParams.get("email") || "").trim();

  const title = ok
    ? action === "unsubscribe"
      ? "Ви успішно відписалися"
      : "Підписку успішно увімкнено"
    : "Не вдалося оновити налаштування";

  const subtitle = ok
    ? action === "unsubscribe"
      ? "Маркетингові листи StudyCod для цієї адреси вимкнено."
      : "Маркетингові листи StudyCod для цієї адреси увімкнено."
    : "Посилання недійсне або застаріле. Спробуйте оновити налаштування в профілі.";

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex items-center justify-center p-4">
      <Card className="w-full max-w-xl p-6 border border-border/70 bg-bg-surface/90">
        <div className="flex items-start gap-3">
          {ok ? <CheckCircle2 className="w-6 h-6 text-accent-success mt-0.5" /> : <XCircle className="w-6 h-6 text-accent-error mt-0.5" />}
          <div>
            <div className="text-xl font-mono text-text-primary">{title}</div>
            <div className="mt-2 text-sm text-text-secondary">{subtitle}</div>
            {email ? <div className="mt-2 text-xs font-mono text-text-secondary">{email}</div> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link to="/">
            <Button variant="primary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              На головну
            </Button>
          </Link>
          <Link to="/support">
            <Button variant="secondary">Підтримка</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default EmailPreferencesResultPage;
