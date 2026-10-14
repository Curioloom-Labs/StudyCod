import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { resetPassword } from "../../lib/api/auth";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { getEduErrorMessage } from "../../lib/eduError";
import { clearGetMeCache } from "../../lib/api/profile";
import { setActiveEduStudentId } from "../../lib/eduContext";

export const ResetPasswordPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const prefersReducedMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const requestedNext = searchParams.get("next");
  const invitationNext = requestedNext && /^\/invite\/[A-Za-z0-9_-]{1,80}$/.test(requestedNext) ? requestedNext : null;
  const [eduResult, setEduResult] = useState(false);
  const educational = searchParams.get("mode") === "edu" || eduResult;
  const quiet = prefersReducedMotion || educational;
  const fieldId = React.useId();
  const feedbackRef = React.useRef<HTMLDivElement>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (educational && (error || success)) feedbackRef.current?.focus(); }, [educational, error, success]);
  useEffect(() => {
    if (!success || educational) return;
    const timer = setTimeout(() => navigate("/"), 2000);
    return () => clearTimeout(timer);
  }, [success, educational, navigate]);

  useEffect(() => {
    if (!token) {
      setError(tr("Токен відновлення паролю відсутній", "Password reset token is missing"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!token) {
      setError(tr("Токен відновлення паролю відсутній", "Password reset token is missing"));
      return;
    }
    if (!newPassword || !confirmPassword) {
      setError(tr("Введіть новий пароль та підтвердження", "Enter a new password and confirmation"));
      return;
    }
    if (newPassword.length < (educational ? 8 : 6)) {
      setError(educational ? tr("Пароль повинен містити мінімум 8 символів", "Password must be at least 8 characters") : tr("Пароль повинен містити мінімум 6 символів", "Password must be at least 6 characters"));
      return;
    }
    if (educational && new TextEncoder().encode(newPassword).length > 72) {
      setError(tr("Пароль задовгий. Використайте до 72 байтів; українські символи займають більше одного байта.", "Password is too long. Use up to 72 bytes; some characters use more than one byte."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(tr("Паролі не співпадають", "Passwords do not match"));
      return;
    }
    setLoading(true);
    try {
      const result = await resetPassword(token, newPassword);
      const isEdu = educational || result.userMode === "EDUCATIONAL";
      if (isEdu) {
        setActiveEduStudentId(null);
        clearGetMeCache({ clearSnapshot: true });
      }
      setEduResult(isEdu);
      setNewPassword(""); setConfirmPassword("");
      setSuccess(isEdu ? tr("Особистий пароль збережено. Тепер увійдіть в ЕДУ з новим паролем.", "Your personal password is saved. Sign in to EDU with your new password.") : tr("Пароль успішно змінено! Перенаправлення на сторінку входу…", "Password changed successfully! Redirecting to login…"));
    } catch (err: unknown) {
      setError(educational ? getEduErrorMessage(err, tr("Не вдалося змінити пароль", "Failed to change password")) : getErrorMessageFromUnknown(err, tr("Помилка зміни паролю", "Failed to change password")));
    } finally {
      setLoading(false);
    }
  };

  const fieldInputClass = `w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-fast placeholder:text-text-muted ${educational ? "min-h-11" : ""}`;
  const fieldLabelClass = "text-[0.7rem] font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 block";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-8">
      <motion.div
        variants={quiet ? undefined : staggerContainer}
        initial={quiet ? undefined : "initial"}
        animate={quiet ? undefined : "animate"}
        className="w-full max-w-[400px]"
      >
        <motion.div
          variants={quiet ? undefined : fadeUpItem}
          className="rounded-xl border border-border bg-bg-surface overflow-hidden shadow-[0_24px_48px_-16px_rgba(0,0,0,0.5)]"
        >
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-border bg-bg-code/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
            </div>
            <span className="text-[10px] font-mono text-text-muted tracking-[0.08em]">reset-password</span>
            <div className="w-16" />
          </div>

          <div className="p-6">
            <motion.div variants={quiet ? undefined : fadeUpItem} className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <span className="block font-mono text-xs text-primary/70">// reset password</span>
                <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                  {tr("Відновлення паролю", "Reset Password")}
                </h1>
              </div>
            </motion.div>

            <div className="mb-5 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

            {!token ? (
              <>
              <motion.div
                role="alert"
                variants={quiet ? undefined : fadeUpItem}
                className="flex items-start gap-2 rounded-lg border border-accent-error/50 bg-accent-error/10 px-3 py-2.5"
              >
                <AlertCircle className="w-3.5 h-3.5 text-accent-error shrink-0 mt-0.5" />
                <span className="text-xs font-mono text-accent-error">
                  {tr("Токен відновлення паролю відсутній або недійсний", "Password reset token is missing or invalid")}
                </span>
              </motion.div>
              {educational && <button type="button" onClick={() => navigate("/edu")} className="mt-4 min-h-11 w-full rounded-lg px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("До входу в ЕДУ", "Back to EDU login")}</button>}
              </>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <motion.div variants={quiet ? undefined : fadeUpItem}>
                  <label htmlFor={`${fieldId}-password`} className={fieldLabelClass}>{tr("Новий пароль", "New password")}</label>
                  <input
                    id={`${fieldId}-password`} autoComplete="new-password" disabled={loading || !!success}
                    type="password"
                    className={fieldInputClass}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={educational ? 8 : 6}
                  />
                </motion.div>

                <motion.div variants={quiet ? undefined : fadeUpItem}>
                  <label htmlFor={`${fieldId}-confirm`} className={fieldLabelClass}>{tr("Підтвердження паролю", "Confirm password")}</label>
                  <input
                    id={`${fieldId}-confirm`} autoComplete="new-password" disabled={loading || !!success}
                    type="password"
                    className={fieldInputClass}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    minLength={educational ? 8 : 6}
                  />
                </motion.div>

                {error && (
                  <motion.div
                    role="alert" tabIndex={-1} ref={feedbackRef}
                    variants={quiet ? undefined : fadeUpItem}
                    className="flex items-start gap-2 rounded-lg border border-accent-error/50 bg-accent-error/10 px-3 py-2.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-accent-error shrink-0 mt-0.5" />
                    <span className="text-xs font-mono text-accent-error">{error}</span>
                  </motion.div>
                )}
                {success && (
                  <motion.div
                    role="status" tabIndex={-1} ref={feedbackRef}
                    variants={quiet ? undefined : fadeUpItem}
                    className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <span className="text-xs font-mono text-primary">{success}</span>
                  </motion.div>
                )}

                <motion.div variants={quiet ? undefined : fadeUpItem}>
                  <Button type="submit" className={educational ? "min-h-11 w-full" : "w-full"} disabled={loading || !!success}>
                    {loading ? tr("Обробка…", "Processing…") : tr("Змінити пароль", "Change password")}
                  </Button>
                </motion.div>

                <motion.div variants={quiet ? undefined : fadeUpItem} className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate(educational ? invitationNext ? `/?auth=login&audience=teacher&next=${encodeURIComponent(invitationNext)}` : "/edu" : "/")}
                    className="min-h-11 rounded-lg px-3 text-sm font-mono text-text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-fast"
                  >
                    {invitationNext ? tr("Продовжити до запрошення", "Continue to invitation") : tr("Повернутись до входу", "Back to login")}
                  </button>
                </motion.div>
              </form>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
