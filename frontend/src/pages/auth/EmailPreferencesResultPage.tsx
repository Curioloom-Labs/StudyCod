import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { CheckCircle2, XCircle, ArrowLeft, LifeBuoy } from "lucide-react";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

export const EmailPreferencesResultPage: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [searchParams] = useSearchParams();

  const ok = searchParams.get("ok") === "1";
  const action = String(searchParams.get("action") || "unsubscribe").toLowerCase() === "subscribe" ? "subscribe" : "unsubscribe";
  const email = String(searchParams.get("email") || "").trim();

  const eyebrow = ok ? "// email preferences" : "// error";
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
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-8">
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? undefined : "initial"}
        animate={prefersReducedMotion ? undefined : "animate"}
        className="w-full max-w-[440px]"
      >
        <motion.div
          variants={prefersReducedMotion ? undefined : fadeUpItem}
          className="rounded-xl border border-border bg-bg-surface overflow-hidden shadow-[0_24px_48px_-16px_rgba(0,0,0,0.5)]"
        >
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-border bg-bg-code/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
            </div>
            <span className="text-[10px] font-mono text-text-muted tracking-[0.08em]">email-preferences</span>
            <div className="w-16" />
          </div>

          <div className="p-6">
            <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="flex flex-col items-center text-center gap-3 mb-5">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${ok ? "bg-accent-success/10 border border-accent-success/30" : "bg-accent-error/10 border border-accent-error/30"}`}>
                {ok
                  ? <CheckCircle2 className="w-6 h-6 text-accent-success" />
                  : <XCircle className="w-6 h-6 text-accent-error" />
                }
              </div>
              <div>
                <span className="block font-mono text-xs text-primary/70 mb-1">{eyebrow}</span>
                <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
                <p className="mt-1.5 text-sm text-text-secondary max-w-xs">{subtitle}</p>
                {email && (
                  <p className="mt-2 text-[11px] font-mono text-text-muted">{email}</p>
                )}
              </div>
            </motion.div>

            <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent mb-5" />

            <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="flex flex-wrap gap-2">
              <Link to="/">
                <Button variant="primary">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  На головну
                </Button>
              </Link>
              <Link to="/support">
                <Button variant="secondary">
                  <LifeBuoy className="w-4 h-4 mr-2" />
                  Підтримка
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default EmailPreferencesResultPage;
