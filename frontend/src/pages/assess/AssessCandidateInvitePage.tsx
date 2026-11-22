import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api/client";
import { assessRoleProfiles } from "./assessRoleRubrics";

type InvitationPreview = {
  companyName: string;
  roleTitle: string;
  roleProfile: string;
  rubric: Array<{ id: string; labelUk: string; labelEn: string }>;
  introduction: string;
  recipientHint: string;
  estimatedMinutes: number;
  deadlineAt: string | null;
  aiPolicy: "ALLOWED" | "NOT_ALLOWED" | "DISCUSS";
};

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50";

export const AssessCandidateInvitePage: React.FC = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [preview, setPreview] = React.useState<InvitationPreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showAccountActions, setShowAccountActions] = React.useState(false);

  const invitationPath = `/assess/invite/${encodeURIComponent(token)}`;
  const signInUrl = `/?auth=login&next=${encodeURIComponent(invitationPath)}`;
  const registerUrl = `/?auth=register&next=${encodeURIComponent(invitationPath)}`;

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/assess/companies/invitations/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (active) setPreview(data); })
      .catch(() => { if (active) setError(en ? "This invitation is unavailable or has expired. Contact the company that sent it." : "Запрошення недоступне або термін його дії минув. Звернися до компанії, яка його надіслала."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, en]);

  const claimInvitation = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/assess/companies/invitations/${encodeURIComponent(token)}/claim`, {});
      navigate(`/assess?case=${encodeURIComponent(data.assessmentId)}`, { replace: true });
    } catch (failure: any) {
      const status = Number(failure?.response?.status);
      const code = String(failure?.response?.data?.code ?? failure?.response?.data?.message ?? "");
      if (status === 401) {
        setShowAccountActions(true);
        setError(en ? "Sign in or create a StudyCod account with the invited email address, then return here to accept." : "Увійди або створи акаунт StudyCod з адресою з запрошення, а потім повернися сюди, щоб прийняти його.");
      } else if (code === "INVITATION_EMAIL_UNVERIFIED") {
        setShowAccountActions(true);
        setError(en ? "Verify the invited email address in your account before accepting." : "Підтвердь адресу з запрошення в налаштуваннях акаунта, перш ніж прийняти його.");
      } else if (code === "INVITATION_EMAIL_MISMATCH") {
        setShowAccountActions(true);
        setError(en ? "This invitation was sent to another email address. Sign in with the invited account." : "Запрошення надіслали на іншу адресу. Увійди з відповідним акаунтом.");
      } else {
        setError(en ? "Could not accept the invitation. Refresh this page or contact the company." : "Не вдалося прийняти запрошення. Онови сторінку або звернися до компанії.");
      }
    } finally {
      setBusy(false);
    }
  };

  const policy = preview?.aiPolicy === "NOT_ALLOWED"
    ? (en ? "Do not use AI tools for this assessment." : "Не використовуй інструменти ШІ під час оцінювання.")
    : preview?.aiPolicy === "DISCUSS"
      ? (en ? "External tools are allowed. Tell the team what you used." : "Зовнішні інструменти дозволені. Розкажи команді, чим користувався.")
      : (en ? "AI tools are allowed. Disclose AI-generated work." : "Інструменти ШІ дозволені. Познач роботу, створену з їх допомогою.");

  return <main className="mx-auto w-full max-w-2xl px-4 py-12 text-text-primary">
    <span className="text-xs font-bold uppercase tracking-[.14em] text-primary">{en ? "StudyCod Assess" : "StudyCod Assess"}</span>
    <h1 className="mt-2 text-2xl font-bold">{en ? "Interview invitation" : "Запрошення на співбесіду"}</h1>
    {loading && <p role="status" className="mt-5 text-sm text-text-secondary">{en ? "Loading invitation…" : "Завантажуємо запрошення…"}</p>}
    {preview && <section className="mt-5 space-y-4 rounded-2xl border border-border bg-bg-surface p-5">
      <div><h2 className="text-xl font-semibold">{preview.companyName}</h2><p className="mt-1 text-sm text-text-secondary">{en ? "Role" : "Роль"} · {preview.roleTitle}</p></div>
      <div className="rounded-xl bg-bg-base p-4"><p className="text-xs font-bold uppercase tracking-wide text-text-muted">{en ? "Review profile" : "Профіль оцінювання"}</p><p className="mt-1 font-semibold">{assessRoleProfiles.find(profile => profile.key === preview.roleProfile)?.[en ? "en" : "uk"] ?? preview.roleProfile}</p><ul className="mt-3 grid gap-2 text-sm text-text-secondary sm:grid-cols-2">{preview.rubric?.map(criterion => <li key={criterion.id}>{en ? criterion.labelEn : criterion.labelUk}</li>)}</ul><p className="mt-2 text-xs leading-5 text-text-muted">{en ? "These criteria guide human review; they do not create an automatic hiring score." : "Ці критерії допомагають рецензентам і не формують автоматичний бал для найму."}</p></div>
      <p className="whitespace-pre-wrap text-sm leading-6">{preview.introduction}</p>
      <dl className="grid gap-3 rounded-xl bg-bg-base p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-text-muted">{en ? "Estimated time" : "Орієнтовний час"}</dt><dd className="mt-1 font-semibold">{preview.estimatedMinutes} {en ? "minutes" : "хвилин"}</dd></div>
        <div><dt className="text-xs text-text-muted">{en ? "Deadline" : "Дедлайн"}</dt><dd className="mt-1 font-semibold">{preview.deadlineAt ? new Date(preview.deadlineAt).toLocaleString(en ? "en-GB" : "uk-UA") : (en ? "No deadline" : "Без дедлайну")}</dd></div>
        <div className="sm:col-span-2"><dt className="text-xs text-text-muted">{en ? "AI and external tools" : "ШІ та зовнішні інструменти"}</dt><dd className="mt-1">{policy}</dd></div>
      </dl>
      <p className="text-sm text-text-secondary">{en ? "Invitation sent to" : "Запрошення надіслано на"} <strong className="text-text-primary">{preview.recipientHint}</strong></p>
      <p className="text-xs leading-5 text-text-muted">{en ? "The company will see the materials you choose to share after you accept. You can withdraw later." : "Після прийняття компанія побачить матеріали, якими ти вирішиш поділитися. Участь можна відкликати пізніше."}</p>
      <button type="button" className={actionClass} disabled={busy} onClick={() => void claimInvitation()}>{busy ? (en ? "Accepting…" : "Приймаємо…") : (en ? "Accept invitation" : "Прийняти запрошення")}</button>
    </section>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-accent-error/30 bg-accent-error/5 p-4 text-sm">{error}</p>}
    {showAccountActions && <div className="mt-4 flex flex-wrap gap-3"><a className={actionClass} href={signInUrl}>{en ? "Sign in" : "Увійти"}</a><a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-semibold" href={registerUrl}>{en ? "Create an account" : "Створити акаунт"}</a></div>}
  </main>;
};
