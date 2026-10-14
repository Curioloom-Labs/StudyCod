import React from "react";
import "./eduWorkspace.css";
import { Modal } from "../../components/ui/Modal";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  Building2,
  Check,
  Copy,
  Download,
  KeyRound,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { api } from "../../lib/api/client";
import { getMe, clearGetMeCache } from "../../lib/api/profile";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { SchoolAccountActivation } from "./SchoolAccountActivation";
import { createClass } from "../../lib/api/edu";
import type { ClassGradingSystem } from "../../lib/gradingSystems";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

type Org = { orgId: number; role: string; name: string | null };
type Member = {
  userId: number;
  role: string;
  username: string | null;
  name: string | null;
  email: string | null;
  accountSetupRequired?: boolean;
  canSetActivationEmail?: boolean;
  hasParentAccess?: boolean;
};
type Overview = {
  totals: { classes: number; students: number; teachers: number };
  classes: Array<{
    id: number;
    name: string;
    studentsCount: number;
    teacherName?: string | null;
    teacherNames?: string[];
  }>;
};
type Credentials = {
  username: string;
  email: string | null;
  password: string;
  role: string;
};

const roles = ["TEACHER", "ASSISTANT", "ORG_ADMIN"] as const;
const accountRoles = ["TEACHER", "ASSISTANT"] as const;
const roleName = (role: string) =>
  role === "STUDENT" ? tr("Учень", "Student") : role === "PARENT" ? tr("Батьки", "Parent") : role === "ORG_ADMIN"
    ? tr("Адміністратор", "Administrator")
    : role === "ASSISTANT"
      ? tr("Асистент", "Assistant")
      : tr("Викладач", "Teacher");
const roleTone = (role: string) =>
  role === "ORG_ADMIN"
    ? "bg-bg-hover text-accent-warn dark:bg-accent-warn/14 dark:text-accent-warn"
    : role === "ASSISTANT"
      ? "bg-bg-hover text-accent-error dark:bg-accent-error/12 dark:text-accent-error"
      : "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft";
const badge = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "SC";
const fieldClass =
  "mt-2 w-full rounded-xl border border-border bg-bg-base px-4 py-3 outline-none ring-primary/25 focus:ring-4 dark:border-white/10 dark:bg-bg-base";

export const OrgWorkspacePage: React.FC = () => {
  useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedOrgId = React.useRef(Number(searchParams.get("org")));
  const [orgs, setOrgs] = React.useState<Org[]>([]);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [selfUserId, setSelfUserId] = React.useState<number | null>(null);
  React.useEffect(() => { getMe().then(me => setSelfUserId(me.id)).catch(() => {}); }, []);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateAccount, setShowCreateAccount] = React.useState(false);
  const [showCreateClass, setShowCreateClass] = React.useState(false);
  const [createdCredentials, setCreatedCredentials] =
    React.useState<Credentials | null>(null);
  const [credentialsStatus, setCredentialsStatus] = React.useState<string | null>(null);
  const [credentialsError, setCredentialsError] = React.useState<string | null>(null);
  const [copyingCredentials, setCopyingCredentials] = React.useState(false);
  const [accountDraft, setAccountDraft] = React.useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    role: "TEACHER" as (typeof accountRoles)[number],
  });
  const [classDraft, setClassDraft] = React.useState<{
    name: string;
    gradingSystem: ClassGradingSystem;
  }>({
    name: "",
    gradingSystem: "POINTS_12",
  });
  const [nameDraft, setNameDraft] = React.useState("");
  const [editingName, setEditingName] = React.useState(false);
  const [openActions, setOpenActions] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const loadGeneration = React.useRef(0);
  const [workspaceLoading, setWorkspaceLoading] = React.useState(false);
  const [pendingRemoval, setPendingRemoval] = React.useState<Member | null>(null);
  const [memberError, setMemberError] = React.useState<string | null>(null);
  const [transferClasses, setTransferClasses] = React.useState<Array<{ id: number; name: string }>>([]);
  const memberPending = React.useRef(false);
  const memberAlertRef = React.useRef<HTMLDivElement>(null);
  const removalRef = React.useRef<HTMLDivElement>(null);
  const membersHeadingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { if (memberError) memberAlertRef.current?.focus(); }, [memberError]);
  React.useEffect(() => { if (pendingRemoval) removalRef.current?.focus(); }, [pendingRemoval]);
  const active = orgs.find((org) => org.orgId === activeId) ?? null;

  const loadWorkspace = React.useCallback(async (orgId: number) => {
    const generation = ++loadGeneration.current;
    setWorkspaceLoading(true);
    try {
    const [memberRes, overviewRes] = await Promise.all([
      api.get(`/edu/orgs/${orgId}/members`),
      api.get(`/edu/orgs/${orgId}/overview`),
    ]);
    if (generation !== loadGeneration.current) return;
    setMembers(memberRes.data?.members ?? []);
    setOverview(overviewRes.data ?? null);
    } catch (caught) {
      if (generation !== loadGeneration.current) return;
      throw caught;
    } finally {
      if (generation === loadGeneration.current) setWorkspaceLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get("/edu/orgs");
        const items: Org[] = (data?.orgs ?? []).filter(
          (org: Org) => org.role === "ORG_ADMIN",
        );
        if (!mounted) return;
        setOrgs(items);
        if (items[0]) {
          const selected = items.find(org => org.orgId === requestedOrgId.current) ?? items[0];
          setActiveId(selected.orgId);
          setNameDraft(selected.name ?? "");
          await loadWorkspace(selected.orgId);
        }
      } catch (caught) {
        if (mounted)
          setError(
            getErrorMessageFromUnknown(
              caught,
              tr("Не вдалося відкрити керування навчальним закладом.", "Could not open organization management."),
            ),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      ++loadGeneration.current;
    };
  }, [loadWorkspace]);

  const switchOrg = async (org: Org) => {
    if (busy) return;
    setActiveId(org.orgId);
    const nextParams = new URLSearchParams(searchParams); nextParams.set("org", String(org.orgId)); setSearchParams(nextParams, { replace: true });
    setPendingRemoval(null); setMemberError(null); setTransferClasses([]);
    setNameDraft(org.name ?? "");
    setError(null);
    setMembers([]);
    setOverview(null);
    setOpenActions(null);
    setEditingName(false);
    setShowCreateAccount(false);
    setShowCreateClass(false);
    try {
      await loadWorkspace(org.orgId);
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(
          caught,
          tr("Не вдалося завантажити організацію.", "Could not load the organization."),
        ),
      );
    }
  };

  const updateName = async () => {
    if (busy || !activeId || !nameDraft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/edu/orgs/${activeId}`, { name: nameDraft.trim() });
      setOrgs((old) =>
        old.map((org) =>
          org.orgId === activeId ? { ...org, name: nameDraft.trim() } : org,
        ),
      );
      setEditingName(false);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Назву не змінено.", "Name was not updated.")));
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => {
    if (!createdCredentials) return;
    const preventLostCredentials = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLostCredentials);
    return () => window.removeEventListener("beforeunload", preventLostCredentials);
  }, [createdCredentials]);

  const credentialsText = () => createdCredentials ? [
    "StudyCod EDU", `${tr("Логін", "Username")}: ${createdCredentials.username}`,
    ...(createdCredentials.email ? [`Email: ${createdCredentials.email}`] : []),
    `${tr("Пароль", "Password")}: ${createdCredentials.password}`,
    `${tr("Роль", "Role")}: ${roleName(createdCredentials.role)}`,
    tr("Активуйте акаунт через «Забули пароль?» на сторінці входу EDU. Встановіть особистий пароль, відмінний від тимчасового.", "Activate the account through Forgot password on the EDU sign-in page. Set a personal password different from the temporary one."),
  ].join("\n") : "";
  const copyCredentials = async () => {
    if (!createdCredentials || copyingCredentials) return;
    setCopyingCredentials(true); setCredentialsError(null); setCredentialsStatus(null);
    try {
      await navigator.clipboard.writeText(credentialsText());
      setCredentialsStatus(tr("Дані скопійовано.", "Credentials copied."));
    } catch {
      setCredentialsError(tr("Не вдалося скопіювати. Завантажте файл або виділіть дані вручну.", "Could not copy. Download the file or select the credentials manually."));
    } finally { setCopyingCredentials(false); }
  };
  const downloadCredentials = () => {
    if (!createdCredentials) return;
    const url = URL.createObjectURL(new Blob([credentialsText()], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `studycod-${createdCredentials.username.replace(/[^a-zA-Z0-9_-]/g, "_")}-credentials.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCredentialsError(null);
    setCredentialsStatus(tr("Завантаження даних розпочато.", "Credentials download started."));
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      busy || !activeId ||
      !accountDraft.username.trim() ||
      !accountDraft.password.trim()
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post(
        `/edu/orgs/${activeId}/users`,
        accountDraft,
      );
      setCredentialsStatus(null); setCredentialsError(null);
      setCreatedCredentials(data.credentials);
      setAccountDraft({
        firstName: "",
        lastName: "",
        username: "",
        email: "",
        password: "",
        role: "TEACHER",
      });
      setShowCreateAccount(false);
      await loadWorkspace(activeId).catch(caught => setError(getErrorMessageFromUnknown(caught,
        tr("Обліковий запис створено, але список учасників не оновився. Оновіть сторінку після збереження даних.", "Account created, but the member list could not refresh. Reload after saving the credentials."))));
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(caught, tr("Обліковий запис не створено.", "Account was not created.")),
      );
    } finally {
      setBusy(false);
    }
  };

  const createOrganizationClass = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !activeId || !classDraft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createClass(
        classDraft.name.trim(),
        classDraft.gradingSystem,
        undefined,
        activeId || undefined,
      );
      setClassDraft({
        name: "",
        gradingSystem: "POINTS_12",
      });
      setShowCreateClass(false);
      if (activeId) await loadWorkspace(activeId);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Клас не створено.", "Class was not created.")));
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (member: Member, nextRole: string) => {
    if (busy || memberPending.current || !activeId || member.role === nextRole) return;
    memberPending.current = true;
    setMemberError(null); setTransferClasses([]);
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/edu/orgs/${activeId}/members/${member.userId}/role`, {
        role: nextRole,
      });
      if (member.userId === selfUserId) { clearGetMeCache({ clearSnapshot: true }); window.location.reload(); return; }
      setMembers((old) =>
        old.map((item) =>
          item.userId === member.userId ? { ...item, role: nextRole } : item,
        ),
      );
      setOpenActions(null);
    } catch (caught) {
      setOpenActions(null);
      showMemberError(caught, tr("Роль не змінено.", "Role was not updated."));
    } finally {
      memberPending.current = false;
      setBusy(false);
    }
  };

  const showMemberError = (caught: unknown, fallback: string) => {
    const list = isAxiosError(caught) && caught.response?.data?.message === "CLASS_TRANSFER_REQUIRED" ? caught.response.data.classes : null;
    setTransferClasses(Array.isArray(list) ? list.filter(cls => Number.isSafeInteger(cls.id) && typeof cls.name === "string") : []);
    setMemberError(getErrorMessageFromUnknown(caught, fallback));
  };

  const removeMember = async () => {
    const member = pendingRemoval;
    if (busy || memberPending.current || !activeId || !member || member.userId === selfUserId) return;
    memberPending.current = true;
    setMemberError(null); setTransferClasses([]);
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/edu/orgs/${activeId}/members/${member.userId}`);
      setMembers((old) => old.filter((item) => item.userId !== member.userId));
      setPendingRemoval(null); membersHeadingRef.current?.focus();
      setOpenActions(null);
    } catch (caught) {
      showMemberError(caught, tr("Учасника не вдалося прибрати.", "Could not remove the member."));
    } finally {
      memberPending.current = false;
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="edu-workspace mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
        <div className="h-[600px] animate-pulse rounded-[30px] bg-bg-hover dark:bg-white/[.05]" />
      </div>
    );

  return (
    <>
      <div aria-busy={workspaceLoading} className="edu-workspace mx-auto w-full min-w-0 max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        {workspaceLoading && <p role="status" className="mb-4 text-sm text-text-secondary">{tr("Завантажуємо організацію…", "Loading organization…")}</p>}
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">
              {tr("EDU / керування навчальним закладом", "EDU / organization management")}
            </p>
            {editingName ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  aria-label={tr("Назва закладу", "Organization name")}
                  autoFocus maxLength={200} disabled={busy}
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  className="w-full min-w-0 rounded-xl border border-border/12 bg-white px-4 py-2 text-2xl font-bold tracking-[-.04em] outline-none ring-primary/25 focus:ring-4 dark:border-white/10 dark:bg-bg-surface dark:text-white"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void updateName()}
                  className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                  {tr("Зберегти", "Save")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false);
                    setNameDraft(active?.name ?? "");
                  }}
                  className="min-h-11 rounded-xl px-3 text-sm font-bold text-text-muted"
                >
                  {tr("Скасувати", "Cancel")}
                </button>
              </div>
            ) : (
              <h1 className="mt-3 break-words font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] text-text-primary dark:text-text-primary sm:text-5xl">
                {active?.name || tr("Керування навчальним закладом", "Organization management")}
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  aria-label={tr("Змінити назву закладу", "Edit organization name")}
                  className="ml-3 inline-grid h-11 w-11 place-items-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover dark:hover:bg-white/[.07]"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </h1>
            )}
            <p className="mt-3 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary">
              {tr("Створюй облікові записи викладачів, передавай їм дані для входу та керуй класами організації.", "Create teacher accounts, share their sign-in details, and manage the organization's classes.")}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !activeId} onClick={() => { setError(null); setShowCreateAccount(true); }}
            className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_12px_28px_rgba(20,67,40,.18)] transition  dark:bg-primary dark:text-primary-foreground"
          >
            <UserRound className="mr-2 inline h-4 w-4" />
            {tr("Створити обліковий запис викладача", "Create teacher account")}
          </button>
        </header>
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm font-medium text-accent-error dark:text-accent-error"
          >
            {error}
          </div>
        )}
        {orgs.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-border/16 px-7 py-20 text-center dark:border-white/10">
            <Building2 className="mx-auto h-9 w-9 text-accent-warn" />
            <h2 className="mt-4 text-2xl font-bold">
              {tr("Ще немає навчального простору", "No learning space yet")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-7 text-text-muted dark:text-text-secondary">
              {tr("Створи організацію у студії курсів, щоб керувати викладачами та класами.", "Create an organization in Course Studio to manage teachers and classes.")}
            </p>
            <button type="button"
              onClick={() => navigate("/edu/courses")}
              className="mt-6 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground dark:bg-primary dark:text-primary-foreground"
            >
              {tr("До курсів", "Go to courses")}
            </button>
          </section>
        ) : (
          <>
            <div className="mb-7 flex gap-2 overflow-x-auto pb-1">
              {orgs.map((org) => (
                <button
                  type="button"
                  key={org.orgId}
                  disabled={busy}
                  aria-pressed={activeId === org.orgId}
                  onClick={() => void switchOrg(org)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${activeId === org.orgId ? "bg-bg-base text-text-primary dark:bg-bg-hover dark:text-text-primary" : "bg-bg-hover text-text-muted dark:bg-white/[.06] dark:text-text-secondary"}`}
                >
                  {org.name || tr("Навчальний простір", "Learning space")}
                </button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: <UsersRound className="h-5 w-5" />,
                  label: tr("Учасники", "Members"),
                  value: members.length,
                  tone: "text-primary-strong dark:text-primary-soft",
                },
                {
                  icon: <Building2 className="h-5 w-5" />,
                  label: tr("Класи", "Classes"),
                  value: overview?.totals.classes || 0,
                  tone: "text-accent-warn dark:text-accent-warn",
                },
                {
                  icon: <ShieldCheck className="h-5 w-5" />,
                  label: tr("Учні", "Students"),
                  value: overview?.totals.students || 0,
                  tone: "text-accent-error dark:text-accent-error",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface"
                >
                  <span className={item.tone}>{item.icon}</span>
                  <p className="mt-6 text-3xl font-bold tracking-[-.045em]">
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-muted dark:text-text-secondary">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
              <section className="rounded-[28px] border border-border/10 bg-white p-5 dark:border-white/[.09] dark:bg-bg-surface sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
                      {tr("Облікові записи", "Accounts")}
                    </p>
                    <h2 ref={membersHeadingRef} tabIndex={-1} className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {tr("Учасники організації", "Organization members")}
                    </h2>
                  </div>
                  <span className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
                    {members.length}
                  </span>
                </div>
                {memberError && <div ref={memberAlertRef} tabIndex={-1} role="alert" className="mb-4 rounded-xl border border-accent-error/30 bg-accent-error/5 p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-error">
                  <p>{memberError}</p>
                  {transferClasses.length > 0 && <ul className="mt-2 grid gap-1">{transferClasses.map(cls => <li key={cls.id}><button type="button" onClick={() => navigate(`/edu/classes/${cls.id}/manage?tab=settings&return=members`)} className="min-h-11 rounded-lg px-2 text-left font-semibold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Передати клас", "Transfer class")}: {cls.name}</button></li>)}</ul>}
                </div>}
                {pendingRemoval && <div ref={removalRef} tabIndex={-1} role="region" aria-label={tr("Підтвердження видалення учасника", "Confirm member removal")} className="mb-4 rounded-xl border border-border bg-bg-surface p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <p className="font-semibold">{tr("Відкликати доступ", "Revoke access")}: {pendingRemoval.name || pendingRemoval.username || `#${pendingRemoval.userId}`}?</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{tr("Буде відкликано доступ до класів і дітей цього закладу та чинні запрошення. Власні учнівські профілі учасника в цьому закладі архівуються; роботи й оцінки збережуться. Доступ до інших закладів залишиться.", "Class and child access and pending invitations in this organization will be revoked. The member’s own student profiles here will be archived; work and grades will be retained. Access to other organizations will remain.")}</p>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { setPendingRemoval(null); setMemberError(null); setTransferClasses([]); membersHeadingRef.current?.focus(); }} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Скасувати", "Cancel")}</button><button type="button" disabled={busy} onClick={() => void removeMember()} className="min-h-11 rounded-lg bg-accent-error px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-error">{busy ? tr("Відкликаємо…", "Revoking…") : tr("Відкликати доступ", "Revoke access")}</button></div>
                </div>}
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.userId}
                      data-member-id={member.userId}
                      className="relative flex flex-wrap items-center gap-3 rounded-2xl p-3 transition hover:bg-bg-hover dark:hover:bg-white/[.04]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-bg-hover text-xs font-extrabold text-text-primary dark:bg-white/[.08] dark:text-text-primary">
                        {badge(member.name || member.username || "")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">
                          {member.name || member.username || tr("Учасник", "Member")}
                        </span>
                        <span className="block truncate text-xs text-text-muted dark:text-text-secondary">
                          @{member.username}
                          {member.email ? ` · ${member.email}` : ""}
                        </span>
                        {member.hasParentAccess && member.role !== "PARENT" && <span className="mt-1 block text-xs font-medium text-text-secondary">{tr("Доступ до дітей", "Child access")}</span>}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${roleTone(member.role)}`}
                      >
                        {roleName(member.role)}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setOpenActions(
                            openActions === member.userId
                              ? null
                              : member.userId,
                          )
                        }
                        aria-label={tr(`Відкрити дії для ${member.username || member.userId}`, `Open actions for ${member.username || member.userId}`)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-bg-hover dark:hover:bg-white/[.08]"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {openActions === member.userId && (
                        <div className="absolute right-2 top-12 z-20 w-48 rounded-xl border border-border/10 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-bg-base">
                          <div>
                            {((roles as readonly string[]).includes(member.role) ? roles : []).map((item) => (
                              <button
                                type="button"
                                key={item}
                                disabled={busy}
                                onClick={() => void setRole(member, item)}
                                className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-bg-hover dark:hover:bg-white/[.07]"
                              >
                                <span>{roleName(item)}</span>
                                {member.role === item && (
                                  <Check className="h-3.5 w-3.5 text-primary-strong dark:text-primary-soft" />
                                )}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={busy || member.userId === selfUserId}
                            onClick={() => { setMemberError(null); setTransferClasses([]); setOpenActions(null); setPendingRemoval(member); }}
                            aria-disabled={member.userId === selfUserId}
                            title={member.userId === selfUserId ? tr("Не можна видалити себе", "Can't remove yourself") : undefined}
                            className="mt-1 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-accent-error hover:bg-accent-error/[.08] dark:text-accent-error"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {tr("Прибрати", "Remove")}
                          </button>
                        </div>
                      )}
                      <SchoolAccountActivation orgId={activeId!} userId={member.userId} email={member.email} required={member.accountSetupRequired} canSetEmail={member.canSetActivationEmail} disabled={busy} onUpdated={() => loadWorkspace(activeId!)} />
                    </div>
                  ))}
                </div>
              </section>
              <aside className="space-y-5">
                <section className="rounded-[28px] bg-bg-surface p-5 text-text-primary sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-text-primary">
                    {tr("Доступ викладачів", "Teacher access")}
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                    {tr("Створення облікових записів", "Creating accounts")}
                  </h2>
                  <div className="mt-5 space-y-3 text-sm leading-6 text-text-primary">
                    <p>
                      {tr("Адміністратор створює акаунт і передає викладачу логін. Власник активує акаунт через свою пошту та встановлює особистий пароль.", "The administrator creates the account and shares the username. The owner activates it through their email and sets a personal password.")}
                    </p>
                    <p>
                      {tr("Після створення призначай одного або кількох викладачів відповідному класу.", "After creating a class, assign one or more teachers to it.")}
                    </p>
                    <p className="flex items-center gap-2 text-primary-strong">
                      <KeyRound className="h-4 w-4 shrink-0" />
                      {tr("Пароль показується один раз.", "The password is shown only once.")}
                    </p>
                  </div>
                </section>
                <section className="rounded-[28px] border border-border/10 bg-bg-hover p-5 dark:border-white/[.09] dark:bg-bg-code">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
                      {tr("Класи", "Classes")}
                    </p>
                    <button
                      type="button"
                      disabled={busy || !activeId} onClick={() => { setError(null); setShowCreateClass(true); }}
                      className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground dark:bg-primary dark:text-primary-foreground"
                    >
                      {tr("Створити клас", "Create class")}
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {overview?.classes.slice(0, 6).map((group) => (
                      <button
                        type="button"
                        onClick={() => navigate(`/edu/classes/${group.id}`)}
                        key={group.id}
                        className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm transition  dark:bg-white/[.05] dark:shadow-none"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg-hover text-[10px] font-extrabold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
                          {tr("К", "C")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {group.name}
                          </span>
                          <span className="block text-xs text-text-muted dark:text-text-secondary">
                            {(group.teacherNames?.length
                              ? group.teacherNames.join(", ")
                              : group.teacherName) || tr("Без призначених викладачів", "No teachers assigned")}
                            {" · "}
                            {group.studentsCount} {tr("учнів", "students")}
                          </span>
                        </span>
                      </button>
                    )) || (
                      <p className="text-sm text-text-muted dark:text-text-secondary">
                        {tr("Поки без класів.", "No classes yet.")}
                      </p>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
      {showCreateAccount && (
        <Modal open={Boolean(showCreateAccount)} title={tr("Створити обліковий запис викладача", "Create teacher account")} onClose={() => setShowCreateAccount(false)} closable={!busy} showCloseButton={false} panelClassName="!max-w-[520px] edu-workspace">
          <form
            onSubmit={createAccount}
            className="space-y-3"
          >
            {error && <p role="alert" className="rounded-xl bg-accent-error/10 p-3 text-sm text-accent-error">{error}</p>}
            <fieldset disabled={busy} className="contents">
            <div className="flex items-start justify-between">
              <div>


                <p className="mt-2 text-sm leading-5 text-text-muted dark:text-text-secondary">
                  {tr("Після створення передайте тимчасові дані викладачу. Він активує особистий акаунт через пошту й установлює власний пароль.", "Share the temporary credentials after creation. The teacher activates their personal account through email and sets their own password.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateAccount(false)}
                aria-label={tr("Закрити", "Close")} className="rounded-lg px-2 text-xl text-text-muted"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                {tr("Ім'я", "First name")}
                <input
                  value={accountDraft.firstName}
                  onChange={(event) =>
                    setAccountDraft((old) => ({
                      ...old,
                      firstName: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-sm font-bold">
                {tr("Прізвище", "Last name")}
                <input
                  value={accountDraft.lastName}
                  onChange={(event) =>
                    setAccountDraft((old) => ({
                      ...old,
                      lastName: event.target.value,
                    }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="text-sm font-bold">
                {tr("Логін", "Username")}
                <input
                  required
                  value={accountDraft.username}
                  onChange={(event) =>
                    setAccountDraft((old) => ({
                      ...old,
                      username: event.target.value,
                    }))
                  }
                  className={fieldClass}
                  placeholder="teacher2026"
                />
              </label>
              <label className="text-sm font-bold">
                Email
                <input
                  required
                  type="email"
                  value={accountDraft.email}
                  onChange={(event) =>
                    setAccountDraft((old) => ({
                      ...old,
                      email: event.target.value,
                    }))
                  }
                  className={fieldClass}
                  placeholder="teacher@school.ua"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                {tr("Тимчасовий пароль", "Temporary password")}
                <input
                  required
                  minLength={8}
                  value={accountDraft.password}
                  onChange={(event) =>
                    setAccountDraft((old) => ({
                      ...old,
                      password: event.target.value,
                    }))
                  }
                  className={fieldClass}
                  placeholder={tr("мінімум 8 символів", "at least 8 characters")}
                />
              </label>
            </div>
            <button type="submit"
              disabled={
                busy ||
                !accountDraft.username.trim() ||
                accountDraft.password.length < 8
              }
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {tr("Створити й показати дані", "Create and show credentials")}
            </button>
          </fieldset>
          </form>
        </Modal>
      )}
      {showCreateClass && (
        <Modal open={Boolean(showCreateClass)} title={tr("Створення класу", "Create class")} onClose={() => setShowCreateClass(false)} closable={!busy} showCloseButton={false} panelClassName="!max-w-[520px] edu-workspace">
          <form
            onSubmit={createOrganizationClass}
            className="space-y-3"
          >
            {error && <p role="alert" className="rounded-xl bg-accent-error/10 p-3 text-sm text-accent-error">{error}</p>}
            <fieldset disabled={busy} className="contents">
            <div className="flex items-start justify-between">
              <div>


                <p className="mt-2 text-sm leading-5 text-text-muted dark:text-text-secondary">
                  {tr("Після створення клас можна призначити одному або кільком викладачам та наповнити обліковими записами учнів.", "After creation, you can assign one or more teachers to the class and add student accounts.")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateClass(false)}
                aria-label={tr("Закрити", "Close")} className="rounded-lg px-2 text-xl text-text-muted"
              >
                ×
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold">
              {tr("Назва класу", "Class name")}
              <input
                required
                maxLength={100} value={classDraft.name}
                onChange={(event) =>
                  setClassDraft((old) => ({ ...old, name: event.target.value }))
                }
                className={fieldClass}
                placeholder={tr("11-А", "Class 11-A")}
              />
            </label>
            <div className="mt-4">
              <label className="text-sm font-bold">
                {tr("Система оцінювання", "Grading system")}
                <select
                  value={classDraft.gradingSystem}
                  onChange={(event) =>
                    setClassDraft((old) => ({
                      ...old,
                      gradingSystem: event.target.value as ClassGradingSystem,
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="POINTS_12">{tr("12-бальна (МОН)", "12-point (Ministry of Education)")}</option>
                  <option value="PERCENT_100">{tr("100-бальна", "100-point")}</option>
                  <option value="POINTS_10">{tr("10-бальна", "10-point")}</option>
                  <option value="LETTER_AF">{tr("Літерна A–F", "Letter grades A–F")}</option>
                  <option value="ECTS_AF">ECTS A–F</option>
                  <option value="GPA_4">GPA 4.0</option>
                </select>
              </label>
            </div>
            <button type="submit"
              disabled={busy || !classDraft.name.trim()}
              className="mt-6 w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {tr("Створити клас", "Create class")}
            </button>
          </fieldset>
          </form>
        </Modal>
      )}
      {createdCredentials && (
        <Modal open={Boolean(createdCredentials)} title={tr("Обліковий запис створено", "Account created")} onClose={() => {}} closable={false} showCloseButton={false} panelClassName="!max-w-[520px] edu-workspace">
          <section className="w-full max-w-[460px] rounded-[26px] border border-white/60 bg-bg-surface p-6 shadow-2xl dark:border-white/10 dark:bg-bg-base">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong">
              {tr("Обліковий запис створено", "Account created")}
            </p>
            <h2 className="mt-2 text-2xl font-bold">{tr("Дані для входу", "Sign-in credentials")}</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
              {tr("Передайте ці тимчасові дані викладачу. Для доступу до класів він має отримати посилання через «Забули пароль?» і встановити власний пароль.", "Share these temporary credentials with the teacher. To access classes, they must request a link through Forgot password and set their own password.")}
            </p>
            <div className="mt-5 select-text space-y-3 break-words rounded-2xl bg-bg-hover p-4 text-sm dark:bg-white/[.06]">
              <p>
                <span className="text-text-muted">{tr("Логін:", "Username:")}</span>{" "}
                <strong>{createdCredentials.username}</strong>
              </p>
              {createdCredentials.email && (
                <p>
                  <span className="text-text-muted">Email:</span>{" "}
                  <strong>{createdCredentials.email}</strong>
                </p>
              )}
              <p>
                <span className="text-text-muted">{tr("Пароль:", "Password:")}</span>{" "}
                <strong>{createdCredentials.password}</strong>
              </p>
              <p>
                <span className="text-text-muted">{tr("Роль:", "Role:")}</span>{" "}
                <strong>{roleName(createdCredentials.role)}</strong>
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={copyingCredentials} onClick={() => void copyCredentials()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-50"><Copy className="size-4" />{tr("Скопіювати дані", "Copy credentials")}</button>
              <button type="button" onClick={downloadCredentials} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><Download className="size-4" />{tr("Завантажити файл", "Download file")}</button>
            </div>
            {credentialsStatus && <p role="status" className="mt-3 text-sm text-primary-strong">{credentialsStatus}</p>}
            {credentialsError && <p role="alert" className="mt-3 text-sm text-accent-error">{credentialsError}</p>}
            <button
              type="button"
              disabled={copyingCredentials}
              onClick={() => setCreatedCredentials(null)}
              className="mt-6 w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground dark:bg-primary dark:text-primary-foreground"
            >
              {tr("Дані збережено — закрити", "Credentials saved — close")}
            </button>
          </section>
        </Modal>
      )}
    </>
  );
};
