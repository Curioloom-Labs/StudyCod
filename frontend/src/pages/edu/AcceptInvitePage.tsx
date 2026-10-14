import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api/client";
import { requestPasswordReset, resendVerificationEmail } from "../../lib/api/auth";
import { clearGetMeCache } from "../../lib/api/profile";
import { setActiveEduStudentId } from "../../lib/eduContext";
import { tr } from "../../i18n";
import { getEduErrorMessage } from "../../lib/eduError";

interface Preview {
  organizationName: string; role: string; currentEmail: string | null;
  recipientHint: string; emailMatches: boolean; emailVerified: boolean; accountSetupRequired: boolean;
}

export const AcceptInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null);
  const [revision, setRevision] = useState(0), feedbackRef = React.useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) feedbackRef.current?.focus(); }, [error]);
  useEffect(() => {
    let active = true; setLoading(true); setError(null); setPreview(null);
    if (!token) { setError(tr("Невірне посилання запрошення.", "Invalid invitation link.")); setLoading(false); return; }
    api.get<Preview>(`/edu/invites/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (active) setPreview(data); })
      .catch(failure => { if (active) setError(getEduErrorMessage(failure, tr("Не вдалося відкрити запрошення.", "Could not open the invitation."))); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, revision]);

  const actionClass = "min-h-11 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
  const canAccept = preview?.emailMatches && preview.emailVerified && !preview.accountSetupRequired;
  const roleNames: Record<string, string> = { ORG_ADMIN: tr("Адміністратор", "Administrator"), TEACHER: tr("Викладач", "Teacher"), ASSISTANT: tr("Асистент", "Assistant"), PARENT: tr("Батьки", "Parent"), STUDENT: tr("Учень", "Student") };
  const roleName = (role: string) => roleNames[role] ?? role;
  const sendProof = async (activation: boolean) => {
    if (!preview?.currentEmail || busy) return; setBusy(true); setError(null); setFeedback(null);
    try {
      if (activation) await requestPasswordReset(preview.currentEmail, `/invite/${token}`); else await resendVerificationEmail(preview.currentEmail);
      setFeedback(activation ? tr("Перевірте пошту та встановіть особистий пароль. Потім увійдіть з новим паролем і поверніться до цього запрошення.", "Check your email and set a personal password. Then sign in with your new password and return to this invitation.") : tr("Перевірте вхідні та спам. Після підтвердження пошти оновіть перевірку нижче.", "Check your inbox and spam. After verifying your email, refresh the check below."));
    } catch (failure) { setError(getEduErrorMessage(failure, tr("Не вдалося надіслати посилання.", "Could not send the link."))); }
    finally { setBusy(false); }
  };
  const switchAccount = async () => {
    if (busy) return; setBusy(true); setError(null);
    try {
      await api.post("/auth/logout"); setActiveEduStudentId(null); clearGetMeCache({ clearSnapshot: true });
      window.location.assign(`/?auth=login&audience=teacher&next=${encodeURIComponent(`/invite/${token ?? ""}`)}`);
    } catch (failure) { setError(getEduErrorMessage(failure, tr("Не вдалося вийти з акаунта.", "Could not sign out."))); setBusy(false); }
  };
  return <section className="edu-workspace mx-auto w-full max-w-xl px-4 py-12 text-text-primary">
    <h1 className="text-2xl font-bold">{tr("Запрошення до закладу", "Organization invitation")}</h1>
    {loading && <p role="status" className="mt-5 text-text-secondary">{tr("Перевіряємо запрошення…", "Checking your invitation…")}</p>}
    {preview && <section className="mt-5 space-y-4 rounded-2xl border border-border bg-bg-surface p-5">
      <h2 className="break-words text-xl font-semibold">{preview.organizationName}</h2>
      <p>{tr("Роль", "Role")}: <strong>{roleName(preview.role)}</strong></p>
      <p className="break-words text-sm text-text-secondary">{tr("Ваш акаунт", "Your account")}: {preview.currentEmail || tr("Пошта не вказана", "No email provided")}</p>
      {!preview.emailMatches && <p>{tr("Адресат запрошення", "Invitation recipient")}: {preview.recipientHint}. {tr("Увійдіть з поштою адресата, щоб приєднатися.", "Sign in with the recipient's email to join.")}</p>}
      {preview.emailMatches && preview.accountSetupRequired && <p>{tr("Для цієї ролі потрібен особистий пароль, відмінний від виданого закладом. Активуйте акаунт через свою пошту.", "This role needs a personal password different from the school-issued one. Activate your account through your email.")}</p>}
      {preview.emailMatches && !preview.accountSetupRequired && !preview.emailVerified && <p>{tr("Спочатку підтвердьте пошту свого акаунта.", "First verify your account email.")}</p>}
      <div className="flex flex-col gap-2">
        {canAccept && <button type="button" disabled={busy} className={`${actionClass} bg-primary text-primary-foreground`} onClick={async () => {
          if (busy) return; setBusy(true); setError(null);
          try {
            const { data } = await api.post(`/edu/invites/${encodeURIComponent(token!)}/accept`, {});
            setActiveEduStudentId(null); clearGetMeCache({ clearSnapshot: true });
            window.location.assign(data.studentId != null || data.role === "PARENT" ? "/edu/parent" : data.role === "STUDENT" ? "/edu/join" : "/edu");
          } catch (failure) { setError(getEduErrorMessage(failure, tr("Не вдалося прийняти запрошення.", "Could not accept the invitation."))); setBusy(false); }
        }}>{busy ? tr("Приєднуємо…", "Joining…") : tr("Прийняти запрошення", "Accept invitation")}</button>}
        {preview.emailMatches && preview.currentEmail && (preview.accountSetupRequired || !preview.emailVerified) && <button type="button" disabled={busy} className={`${actionClass} bg-primary text-primary-foreground`} onClick={() => void sendProof(preview.accountSetupRequired)}>{preview.accountSetupRequired ? tr("Надіслати посилання активації", "Send activation link") : tr("Підтвердити мою пошту", "Verify my email")}</button>}
        <button type="button" disabled={busy} className={`${actionClass} text-primary`} onClick={() => setRevision(value => value + 1)}>{tr("Оновити перевірку", "Refresh check")}</button>
      </div>
    </section>}
    {feedback && <p role="status" className="mt-4 text-sm text-text-secondary">{feedback}</p>}
    {error && <p ref={feedbackRef} role="alert" tabIndex={-1} className="mt-4 rounded-xl border border-accent-error/40 p-4 text-sm text-accent-error">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" disabled={busy} className={`${actionClass} text-primary`} onClick={() => void switchAccount()}>{tr("Увійти з іншим акаунтом", "Sign in with another account")}</button>
      <a href="/edu" className={`${actionClass} text-text-secondary`}>{tr("До ЕДУ", "Back to EDU")}</a>
    </div>
  </section>;
};
