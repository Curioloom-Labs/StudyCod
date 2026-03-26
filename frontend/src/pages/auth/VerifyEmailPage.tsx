import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { verifyEmail, resendVerificationEmail } from "../../lib/api/auth";
import { Button } from "../../components/ui/Button";
import { showToast } from "../../lib/toast";
import type { User } from "../../types";
interface Props {
  onAuth: (user: User) => void;
}
export const VerifyEmailPage: React.FC<Props> = ({
  onAuth
}) => {
  const {
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
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
        setTimeout(() => {
          onAuth(result.user);
          navigate("/");
        }, 2000);
      } catch (err: unknown) {
        setError(getErrorMessage(err, tr("Помилка підтвердження email", "Email verification failed")));
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, [searchParams, onAuth, navigate]);
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="text-center">
          <div className="text-text-secondary font-mono">{tr("Підтвердження email...", "Verifying email...")}</div>
        </div>
      </div>;
  }
  return <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <div className="w-full max-w-md bg-bg-surface border border-border p-8">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border border-primary flex items-center justify-center font-mono text-xl text-primary mb-4">
            {success ? "✓" : "✗"}
          </div>
          {success ? <>
              <h1 className="text-xl font-mono text-text-primary mb-4">{tr("Email підтверджено!", "Email verified!")}</h1>
              <p className="text-sm font-mono text-text-secondary text-center mb-4">
                {tr("Ваш email успішно підтверджено. Зараз ви будете перенаправлені...", "Your email has been verified. Redirecting...")}
              </p>
            </> : <>
              <h1 className="text-xl font-mono text-text-primary mb-4">{tr("Помилка підтвердження", "Verification error")}</h1>
              <p className="text-sm font-mono text-text-secondary text-center mb-4">
                {error || tr("Не вдалося підтвердити email", "Failed to verify email")}
              </p>
              {error?.includes("INVALID_TOKEN") || error?.includes("TOKEN_REQUIRED") || error?.includes("Відсутній токен") ? <>
                  {resendSuccess && <p className="text-sm font-mono text-primary text-center mb-4">
                      {tr("Лист з підтвердженням відправлено на вашу пошту!", "Verification email sent!")}
                    </p>}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-mono text-text-secondary mb-1 block">
                        {tr("Email для повторної відправки", "Email to resend")}
                      </label>
                      <input type="email" id="resend-email" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast mb-2" placeholder="your@email.com" defaultValue={searchParams.get("email") || ""} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button onClick={async () => {
                  const emailInput = document.getElementById("resend-email") as HTMLInputElement;
                  const email = emailInput?.value || searchParams.get("email");
                  if (!email) {
                    showToast({
                      type: "error",
                      message: tr("Будь ласка, введіть email для повторної відправки.", "Please enter an email to resend.")
                    });
                    return;
                  }
                  setResending(true);
                  setResendSuccess(false);
                  try {
                    await resendVerificationEmail(email);
                    setResendSuccess(true);
                  } catch (err: unknown) {
                    showToast({
                      type: "error",
                      message: getErrorMessage(err, tr("Не вдалося відправити лист", "Failed to send email"))
                    });
                  } finally {
                    setResending(false);
                  }
                }} disabled={resending}>
                        {resending ? tr("Відправка...", "Sending...") : tr("Відправити лист повторно", "Resend email")}
                      </Button>
                      <Button variant="secondary" onClick={() => navigate("/auth")}>
                        {tr("Повернутись до входу", "Back to login")}
                      </Button>
                    </div>
                  </div>
                </> : <Button onClick={() => navigate("/auth")}>{tr("Повернутись до входу", "Back to login")}</Button>}
            </>}
        </div>
      </div>
    </div>;
};