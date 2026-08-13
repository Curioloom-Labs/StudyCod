import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { verifyEmail, resendVerificationEmail } from "../../lib/api/auth";
import { primeGetMeCache } from "../../lib/api/profile";
import { Button } from "../../components/ui/Button";
import { showToast } from "../../lib/toast";
import type { User } from "../../types";
import { CheckCircle2, XCircle, Mail, Loader2 } from "lucide-react";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

interface Props {
  onAuth: (user: User) => void;
}

export const VerifyEmailPage: React.FC<Props> = ({ onAuth }) => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const prefersReducedMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const getErrorMessage = (errorValue: unknown, fallback: string): string => {
    const responseMessage = (errorValue as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
    if (typeof responseMessage === "string" && responseMessage.trim()) return responseMessage;
    const directMessage = (errorValue as { message?: unknown })?.message;
    if (typeof directMessage === "string" && directMessage.trim()) return directMessage;
    return fallback;
  };

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError(tr("Відсутній токен підтвердження", "Missing verification token"));
      setLoading(false);
      return;
    }
    const verify = async () => {
      try {
        const result = await verifyEmail(token);
        setSuccess(true);
        setTimeout(() => { primeGetMeCache(result.user); onAuth(result.user); navigate("/"); }, 2000);
      } catch (err: unknown) {
        setError(getErrorMessage(err, tr("Помилка підтвердження email", "Email verification failed")));
      } finally {
        setLoading(false);
      }
    };
    verify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, onAuth, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="rounded-xl border border-border bg-bg-surface p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm font-mono text-text-secondary">{tr("Підтвердження email...", "Verifying email...")}</p>
        </div>
      </div>
    );
  }

  const canResend = error?.includes("INVALID_TOKEN") || error?.includes("TOKEN_REQUIRED") || error?.includes("Відсутній токен");

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-8">
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? undefined : "initial"}
        animate={prefersReducedMotion ? undefined : "animate"}
        className="w-full max-w-[400px]"
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
            <span className="text-[10px] font-mono text-text-muted tracking-[0.08em]">verify-email</span>
            <div className="w-16" />
          </div>

          <div className="p-6">
            <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="mb-4">
              <span className="font-mono text-xs text-primary/70">
                {success ? "// email verified" : "// verification error"}
              </span>
            </motion.div>

            <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="flex flex-col items-center text-center gap-3 mb-5">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${success ? "bg-accent-success/10 border border-accent-success/30" : "bg-accent-error/10 border border-accent-error/30"}`}>
                {success
                  ? <CheckCircle2 className="w-5 h-5 text-accent-success" />
                  : <XCircle className="w-5 h-5 text-accent-error" />
                }
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                  {success
                    ? tr("Email підтверджено!", "Email verified!")
                    : tr("Помилка підтвердження", "Verification error")}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                  {success
                    ? tr("Перенаправлення...", "Redirecting...")
                    : (error || tr("Не вдалося підтвердити email", "Failed to verify email"))}
                </p>
              </div>
            </motion.div>

            <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent mb-5" />

            {success ? (
              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-mono text-primary">
                    {tr("Ваш email успішно підтверджено.", "Your email has been verified.")}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="space-y-3">
                {canResend ? (
                  <>
                    {resendSuccess && (
                      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                        <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs font-mono text-primary">
                          {tr("Лист з підтвердженням відправлено!", "Verification email sent!")}
                        </span>
                      </div>
                    )}
                    <div>
                      <label className="text-[0.7rem] font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 block">
                        {tr("Email для повторної відправки", "Email to resend")}
                      </label>
                      <input
                        type="email"
                        id="resend-email"
                        className="w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-fast placeholder:text-text-muted"
                        placeholder="your@email.com"
                        defaultValue={searchParams.get("email") || ""}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        onClick={async () => {
                          const emailInput = document.getElementById("resend-email") as HTMLInputElement;
                          const email = emailInput?.value || searchParams.get("email");
                          if (!email) {
                            showToast({ type: "error", message: tr("Будь ласка, введіть email для повторної відправки.", "Please enter an email to resend.") });
                            return;
                          }
                          setResending(true);
                          setResendSuccess(false);
                          try {
                            await resendVerificationEmail(email);
                            setResendSuccess(true);
                          } catch (err: unknown) {
                            showToast({ type: "error", message: getErrorMessage(err, tr("Не вдалося відправити лист", "Failed to send email")) });
                          } finally {
                            setResending(false);
                          }
                        }}
                        disabled={resending}
                        className="w-full"
                      >
                        {resending ? tr("Відправка...", "Sending...") : tr("Відправити лист повторно", "Resend email")}
                      </Button>
                      <Button variant="secondary" onClick={() => navigate("/auth")} className="w-full">
                        {tr("Повернутись до входу", "Back to login")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button onClick={() => navigate("/auth")} className="w-full">
                    {tr("Повернутись до входу", "Back to login")}
                  </Button>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
