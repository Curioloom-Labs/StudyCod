import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { resetPassword } from "../../lib/api/auth";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
export const ResetPasswordPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!token) {
      setError(tr("Токен відновлення паролю відсутній", "Password reset token is missing"));
    }
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
    if (newPassword.length < 6) {
      setError(tr("Пароль повинен містити мінімум 6 символів", "Password must be at least 6 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(tr("Паролі не співпадають", "Passwords do not match"));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(tr("Пароль успішно змінено! Перенаправлення на сторінку входу...", "Password changed successfully! Redirecting to login..."));
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err: unknown) {
      setError(getErrorMessageFromUnknown(err, tr("Помилка зміни паролю", "Failed to change password")));
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-bg-base" style={{
    minWidth: "1280px"
  }}>
      <div className="w-full max-w-md bg-bg-surface border border-border p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 border border-primary flex items-center justify-center font-mono text-xl text-primary">
            &lt;/&gt;
          </div>
          <h1 className="mt-4 text-xl font-mono text-text-primary">{tr("Відновлення паролю", "Reset password")}</h1>
        </div>

        {!token ? <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
            {tr("Токен відновлення паролю відсутній або недійсний", "Password reset token is missing or invalid")}
          </div> : <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("Новий пароль", "New password")}</label>
              <input type="password" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
            </div>
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("Підтвердження паролю", "Confirm password")}</label>
              <input type="password" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
            </div>
            {error && <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
                {error}
              </div>}
            {success && <div className="text-xs font-mono text-primary border border-primary bg-bg-code px-3 py-2">
                {success}
              </div>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? tr("Обробка...", "Processing...") : tr("Змінити пароль", "Change password")}
            </Button>
            <div className="text-center">
              <button type="button" onClick={() => navigate("/")} className="text-xs font-mono text-text-secondary hover:text-primary transition-fast">
                {tr("Повернутись до входу", "Back to login")}
              </button>
            </div>
          </form>}
      </div>
    </div>;
};