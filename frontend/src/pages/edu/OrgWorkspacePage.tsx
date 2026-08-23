import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Check,
  KeyRound,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { api } from "../../lib/api/client";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { createClass } from "../../lib/api/edu";
import type { ClassGradingSystem } from "../../lib/gradingSystems";

type Org = { orgId: number; role: string; name: string | null };
type Member = {
  userId: number;
  role: string;
  username: string | null;
  name: string | null;
  email: string | null;
};
type Overview = {
  totals: { classes: number; students: number; teachers: number };
  classes: Array<{
    id: number;
    name: string;
    language: string;
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
  role === "ORG_ADMIN"
    ? "Адміністратор"
    : role === "ASSISTANT"
      ? "Асистент"
      : "Викладач";
const roleTone = (role: string) =>
  role === "ORG_ADMIN"
    ? "bg-[#fff0d7] text-[#a45d00] dark:bg-[#ff8c00]/14 dark:text-[#ffbb6a]"
    : role === "ASSISTANT"
      ? "bg-[#fff0f5] text-[#bf4168] dark:bg-[#ff6b9d]/12 dark:text-[#ff9abd]"
      : "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]";
const badge = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "SC";
const fieldClass =
  "mt-2 w-full rounded-xl border border-[#19291d]/12 bg-white px-4 py-3 outline-none ring-[#00ff88]/25 focus:ring-4 dark:border-white/10 dark:bg-[#0d1510]";

export const OrgWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const [orgs, setOrgs] = React.useState<Org[]>([]);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateAccount, setShowCreateAccount] = React.useState(false);
  const [showCreateClass, setShowCreateClass] = React.useState(false);
  const [createdCredentials, setCreatedCredentials] =
    React.useState<Credentials | null>(null);
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
    language: "PYTHON" | "JAVA" | "CPP";
    gradingSystem: ClassGradingSystem;
  }>({
    name: "",
    language: "PYTHON",
    gradingSystem: "POINTS_12",
  });
  const [nameDraft, setNameDraft] = React.useState("");
  const [editingName, setEditingName] = React.useState(false);
  const [openActions, setOpenActions] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const active = orgs.find((org) => org.orgId === activeId) ?? null;

  const loadWorkspace = React.useCallback(async (orgId: number) => {
    const [memberRes, overviewRes] = await Promise.all([
      api.get(`/edu/orgs/${orgId}/members`),
      api.get(`/edu/orgs/${orgId}/overview`).catch(() => ({ data: null })),
    ]);
    setMembers(memberRes.data?.members ?? []);
    setOverview(overviewRes.data ?? null);
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
          setActiveId(items[0].orgId);
          setNameDraft(items[0].name ?? "");
          await loadWorkspace(items[0].orgId);
        }
      } catch (caught) {
        if (mounted)
          setError(
            getErrorMessageFromUnknown(
              caught,
              "Не вдалося відкрити керування навчальним закладом.",
            ),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadWorkspace]);

  const switchOrg = async (org: Org) => {
    setActiveId(org.orgId);
    setNameDraft(org.name ?? "");
    setError(null);
    try {
      await loadWorkspace(org.orgId);
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(
          caught,
          "Не вдалося завантажити організацію.",
        ),
      );
    }
  };

  const updateName = async () => {
    if (!activeId || !nameDraft.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/edu/orgs/${activeId}`, { name: nameDraft.trim() });
      setOrgs((old) =>
        old.map((org) =>
          org.orgId === activeId ? { ...org, name: nameDraft.trim() } : org,
        ),
      );
      setEditingName(false);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Назву не змінено."));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !activeId ||
      !accountDraft.username.trim() ||
      !accountDraft.password.trim()
    )
      return;
    setBusy(true);
    try {
      const { data } = await api.post(
        `/edu/orgs/${activeId}/users`,
        accountDraft,
      );
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
      await loadWorkspace(activeId);
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(caught, "Обліковий запис не створено."),
      );
    } finally {
      setBusy(false);
    }
  };

  const createOrganizationClass = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!classDraft.name.trim()) return;
    setBusy(true);
    try {
      await createClass(
        classDraft.name.trim(),
        classDraft.language,
        classDraft.gradingSystem,
      );
      setClassDraft({
        name: "",
        language: "PYTHON",
        gradingSystem: "POINTS_12",
      });
      setShowCreateClass(false);
      if (activeId) await loadWorkspace(activeId);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Клас не створено."));
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (member: Member, nextRole: string) => {
    if (!activeId || member.role === nextRole) return;
    setBusy(true);
    try {
      await api.patch(`/edu/orgs/${activeId}/members/${member.userId}/role`, {
        role: nextRole,
      });
      setMembers((old) =>
        old.map((item) =>
          item.userId === member.userId ? { ...item, role: nextRole } : item,
        ),
      );
      setOpenActions(null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Роль не змінено."));
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (member: Member) => {
    if (
      !activeId ||
      !window.confirm(
        `Прибрати ${member.name || member.username || "учасника"} з організації?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.delete(`/edu/orgs/${activeId}/members/${member.userId}`);
      setMembers((old) => old.filter((item) => item.userId !== member.userId));
      setOpenActions(null);
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(caught, "Учасника не вдалося прибрати."),
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
        <div className="h-[600px] animate-pulse rounded-[30px] bg-[#e8eeea] dark:bg-white/[.05]" />
      </div>
    );

  return (
    <>
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#16834d] dark:text-[#72edb0]">
              EDU / керування навчальним закладом
            </p>
            {editingName ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  className="rounded-xl border border-[#19291d]/12 bg-white px-4 py-2 text-2xl font-bold tracking-[-.04em] outline-none ring-[#00ff88]/25 focus:ring-4 dark:border-white/10 dark:bg-[#111b14] dark:text-white"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void updateName()}
                  className="rounded-xl bg-[#00d978] px-4 py-2 text-sm font-bold text-[#062211]"
                >
                  Зберегти
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false);
                    setNameDraft(active?.name ?? "");
                  }}
                  className="rounded-xl px-3 text-sm font-bold text-[#6d7d72]"
                >
                  Скасувати
                </button>
              </div>
            ) : (
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] text-[#17241b] dark:text-[#eff5f0] sm:text-5xl">
                {active?.name || "Керування навчальним закладом"}
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="ml-3 inline-grid h-8 w-8 translate-y-[-3px] place-items-center rounded-lg text-[#799087] transition hover:bg-[#edf3ed] dark:hover:bg-white/[.07]"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </h1>
            )}
            <p className="mt-3 max-w-xl text-base leading-7 text-[#69796e] dark:text-[#a9b6ac]">
              Створюй облікові записи викладачів, передавай їм дані для входу та
              керуй класами організації.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateAccount(true)}
            className="rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(20,67,40,.18)] transition hover:-translate-y-0.5 dark:bg-[#00d978] dark:text-[#062211]"
          >
            <UserRound className="mr-2 inline h-4 w-4" />
            Створити обліковий запис викладача
          </button>
        </header>
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-[#ff6b9d]/25 bg-[#ff6b9d]/[.08] px-4 py-3 text-sm font-medium text-[#c4436b] dark:text-[#ff9abd]"
          >
            {error}
          </div>
        )}
        {orgs.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-[#19291d]/16 px-7 py-20 text-center dark:border-white/10">
            <Building2 className="mx-auto h-9 w-9 text-[#ff9b2e]" />
            <h2 className="mt-4 text-2xl font-bold">
              Ще немає навчального простору
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-7 text-[#6d7d72] dark:text-[#a9b6ac]">
              Створи організацію у студії курсів, щоб керувати викладачами та
              класами.
            </p>
            <button
              type="button"
              onClick={() => navigate("/edu/courses")}
              className="mt-6 rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062211]"
            >
              До курсів
            </button>
          </section>
        ) : (
          <>
            <div className="mb-7 flex gap-2 overflow-x-auto pb-1">
              {orgs.map((org) => (
                <button
                  type="button"
                  key={org.orgId}
                  onClick={() => void switchOrg(org)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${activeId === org.orgId ? "bg-[#17251c] text-white dark:bg-[#edf3ef] dark:text-[#102016]" : "bg-[#edf2ed] text-[#64756a] dark:bg-white/[.06] dark:text-[#adbaaf]"}`}
                >
                  {org.name || "Навчальний простір"}
                </button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: <UsersRound className="h-5 w-5" />,
                  label: "Учасники",
                  value: members.length,
                  tone: "text-[#16834d] dark:text-[#72edb0]",
                },
                {
                  icon: <Building2 className="h-5 w-5" />,
                  label: "Класи",
                  value: overview?.totals.classes || 0,
                  tone: "text-[#c76e00] dark:text-[#ffb760]",
                },
                {
                  icon: <ShieldCheck className="h-5 w-5" />,
                  label: "Учні",
                  value: overview?.totals.students || 0,
                  tone: "text-[#bf4168] dark:text-[#ff9abd]",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[#19291d]/10 bg-white p-5 dark:border-white/[.09] dark:bg-[#111b14]"
                >
                  <span className={item.tone}>{item.icon}</span>
                  <p className="mt-6 text-3xl font-bold tracking-[-.045em]">
                    {item.value}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#718075] dark:text-[#a7b5aa]">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
              <section className="rounded-[28px] border border-[#19291d]/10 bg-white p-5 dark:border-white/[.09] dark:bg-[#111b14] sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">
                      Облікові записи
                    </p>
                    <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                      Викладачі організації
                    </h2>
                  </div>
                  <span className="rounded-full bg-[#edf4ee] px-3 py-1.5 text-xs font-bold text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                    {members.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.userId}
                      className="relative flex items-center gap-3 rounded-2xl p-3 transition hover:bg-[#f4f7f4] dark:hover:bg-white/[.04]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e7f2e9] text-xs font-extrabold text-[#27503a] dark:bg-white/[.08] dark:text-[#dce9df]">
                        {badge(member.name || member.username || "")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">
                          {member.name || member.username || "Учасник"}
                        </span>
                        <span className="block truncate text-xs text-[#738278] dark:text-[#a5b3a8]">
                          @{member.username}
                          {member.email ? ` · ${member.email}` : ""}
                        </span>
                      </span>
                      <span
                        className={`hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:block ${roleTone(member.role)}`}
                      >
                        {roleName(member.role)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenActions(
                            openActions === member.userId
                              ? null
                              : member.userId,
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg text-[#718075] hover:bg-[#eaf0eb] dark:hover:bg-white/[.08]"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openActions === member.userId && (
                        <div className="absolute right-2 top-12 z-20 w-48 rounded-xl border border-[#19291d]/10 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#19251c]">
                          <div>
                            {roles.map((item) => (
                              <button
                                type="button"
                                key={item}
                                disabled={busy}
                                onClick={() => void setRole(member, item)}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-[#f0f4f0] dark:hover:bg-white/[.07]"
                              >
                                <span>{roleName(item)}</span>
                                {member.role === item && (
                                  <Check className="h-3.5 w-3.5 text-[#16834d] dark:text-[#72edb0]" />
                                )}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeMember(member)}
                            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#c4436b] hover:bg-[#ff6b9d]/[.08] dark:text-[#ff9abd]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Прибрати
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <aside className="space-y-5">
                <section className="rounded-[28px] bg-[#163421] p-5 text-white sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-[#a9d7b7]">
                    Доступ викладачів
                  </p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                    Створення облікових записів
                  </h2>
                  <div className="mt-5 space-y-3 text-sm leading-6 text-[#c1d4c7]">
                    <p>
                      Адміністратор сам створює обліковий запис і передає
                      викладачу логін та пароль.
                    </p>
                    <p>
                      Після створення призначай одного або кількох викладачів відповідному класу.
                    </p>
                    <p className="flex items-center gap-2 text-[#aef0c9]">
                      <KeyRound className="h-4 w-4 shrink-0" />
                      Пароль показується один раз.
                    </p>
                  </div>
                </section>
                <section className="rounded-[28px] border border-[#19291d]/10 bg-[#fafbf9] p-5 dark:border-white/[.09] dark:bg-[#101a13]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">
                      Класи
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCreateClass(true)}
                      className="rounded-lg bg-[#153321] px-3 py-2 text-xs font-bold text-white dark:bg-[#00d978] dark:text-[#062211]"
                    >
                      Створити клас
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {overview?.classes.slice(0, 6).map((group) => (
                      <button
                        type="button"
                        onClick={() => navigate(`/edu/classes/${group.id}`)}
                        key={group.id}
                        className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 dark:bg-white/[.05] dark:shadow-none"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf4ee] text-[10px] font-extrabold text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                          {group.language}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {group.name}
                          </span>
                          <span className="block text-xs text-[#75847a] dark:text-[#a4b2a7]">
                            {(group.teacherNames?.length
                              ? group.teacherNames.join(", ")
                              : group.teacherName) || "Без призначених викладачів"}
                            {" · "}
                            {group.studentsCount} учнів
                          </span>
                        </span>
                      </button>
                    )) || (
                      <p className="text-sm text-[#748379] dark:text-[#a6b4a9]">
                        Поки без класів.
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
        <div data-material="org-dialog-scrim" className="fixed inset-0 z-[80] grid place-items-center bg-[#071009]/45 px-4 backdrop-blur-sm" role="presentation">
          <form
            onSubmit={createAccount}
            role="dialog"
            aria-modal="true"
            aria-label="Створення акаунта"
            tabIndex={-1}
            className="w-full max-w-[520px] rounded-[26px] border border-white/60 bg-[#fbfcfa] p-6 shadow-2xl dark:border-white/10 dark:bg-[#142018]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d]">
                  Керування навчальним закладом
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                  Створити обліковий запис викладача
                </h2>
                <p className="mt-2 text-sm leading-5 text-[#708077] dark:text-[#aab7ad]">
                  Дані для входу з'являться після створення. Запрошення та
                  email-підтвердження не потрібні.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateAccount(false)}
                className="rounded-lg px-2 text-xl text-[#738278]"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                Ім'я
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
                Прізвище
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
                Логін
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
                Тимчасовий пароль
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
                  placeholder="мінімум 8 символів"
                />
              </label>
            </div>
            <button
              disabled={
                busy ||
                !accountDraft.username.trim() ||
                accountDraft.password.length < 8
              }
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3.5 text-sm font-bold text-[#062211] disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              Створити й показати дані
            </button>
          </form>
        </div>
      )}
      {showCreateClass && (
        <div data-material="org-dialog-scrim" className="fixed inset-0 z-[80] grid place-items-center bg-[#071009]/45 px-4 backdrop-blur-sm" role="presentation">
          <form
            onSubmit={createOrganizationClass}
            role="dialog"
            aria-modal="true"
            aria-label="Створення класу"
            tabIndex={-1}
            className="w-full max-w-[520px] rounded-[26px] border border-white/60 bg-[#fbfcfa] p-6 shadow-2xl dark:border-white/10 dark:bg-[#142018]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d]">
                  Керування навчальним закладом
                </p>
                <h2 className="mt-2 text-2xl font-bold">Створити клас</h2>
                <p className="mt-2 text-sm leading-5 text-[#708077] dark:text-[#aab7ad]">
                  Після створення клас можна призначити одному або кільком викладачам та наповнити
                  обліковими записами учнів.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateClass(false)}
                className="rounded-lg px-2 text-xl text-[#738278]"
              >
                ×
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold">
              Назва класу
              <input
                required
                autoFocus
                value={classDraft.name}
                onChange={(event) =>
                  setClassDraft((old) => ({ ...old, name: event.target.value }))
                }
                className={fieldClass}
                placeholder="11-А"
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                Мова
                <select
                  value={classDraft.language}
                  onChange={(event) =>
                    setClassDraft((old) => ({
                      ...old,
                      language: event.target.value as typeof old.language,
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="PYTHON">Python</option>
                  <option value="JAVA">Java</option>
                  <option value="CPP">C++</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Система оцінювання
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
                  <option value="POINTS_12">12-бальна (МОН)</option>
                  <option value="PERCENT_100">100-бальна</option>
                  <option value="POINTS_10">10-бальна</option>
                  <option value="LETTER_AF">Літерна A–F</option>
                  <option value="ECTS_AF">ECTS A–F</option>
                  <option value="GPA_4">GPA 4.0</option>
                </select>
              </label>
            </div>
            <button
              disabled={busy || !classDraft.name.trim()}
              className="mt-6 w-full rounded-xl bg-[#00d978] px-4 py-3.5 text-sm font-bold text-[#062211] disabled:opacity-60"
            >
              Створити клас
            </button>
          </form>
        </div>
      )}
      {false && (
        <div data-material="org-dialog-scrim" className="fixed inset-0 z-[80] grid place-items-center bg-[#071009]/45 px-4 backdrop-blur-sm" role="presentation">
          <form
            onSubmit={createOrganizationClass}
            role="dialog"
            aria-modal="true"
            aria-label="Створення класу"
            tabIndex={-1}
            className="w-full max-w-[520px] rounded-[26px] border border-white/60 bg-[#fbfcfa] p-6 shadow-2xl dark:border-white/10 dark:bg-[#142018]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d]">
                  Керування навчальним закладом
                </p>
                <h2 className="mt-2 text-2xl font-bold">Створити клас</h2>
                <p className="mt-2 text-sm leading-5 text-[#708077] dark:text-[#aab7ad]">
                  Після створення клас можна призначити одному або кільком викладачам та наповнити
                  обліковими записами учнів.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateClass(false)}
                className="rounded-lg px-2 text-xl text-[#738278]"
              >
                ×
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold">
              Назва класу
              <input
                required
                autoFocus
                value={classDraft.name}
                onChange={(event) =>
                  setClassDraft((old) => ({ ...old, name: event.target.value }))
                }
                className={fieldClass}
                placeholder="11-А"
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                Мова
                <select
                  value={classDraft.language}
                  onChange={(event) =>
                    setClassDraft((old) => ({
                      ...old,
                      language: event.target.value as typeof old.language,
                    }))
                  }
                  className={fieldClass}
                >
                  <option value="PYTHON">Python</option>
                  <option value="JAVA">Java</option>
                  <option value="CPP">C++</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Система оцінювання
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
                  <option value="POINTS_12">12-бальна (МОН)</option>
                  <option value="PERCENT_100">100-бальна</option>
                  <option value="POINTS_10">10-бальна</option>
                  <option value="LETTER_AF">Літерна A–F</option>
                  <option value="ECTS_AF">ECTS A–F</option>
                  <option value="GPA_4">GPA 4.0</option>
                </select>
              </label>
            </div>
            <button
              disabled={busy || !classDraft.name.trim()}
              className="mt-6 w-full rounded-xl bg-[#00d978] px-4 py-3.5 text-sm font-bold text-[#062211] disabled:opacity-60"
            >
              Створити клас
            </button>
          </form>
        </div>
      )}
      {createdCredentials && (
        <div data-material="org-dialog-scrim" className="fixed inset-0 z-[90] grid place-items-center bg-[#071009]/55 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-label="Обліковий запис створено" tabIndex={-1} className="w-full max-w-[460px] rounded-[26px] border border-white/60 bg-[#fbfcfa] p-6 shadow-2xl dark:border-white/10 dark:bg-[#142018]">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d]">
              Обліковий запис створено
            </p>
            <h2 className="mt-2 text-2xl font-bold">Дані для викладача</h2>
            <p className="mt-2 text-sm leading-6 text-[#708077] dark:text-[#aab7ad]">
              Збережи їх зараз: пароль більше ніде не показуватиметься.
            </p>
            <div className="mt-5 space-y-3 rounded-2xl bg-[#edf4ee] p-4 text-sm dark:bg-white/[.06]">
              <p>
                <span className="text-[#708077]">Логін:</span>{" "}
                <strong>{createdCredentials.username}</strong>
              </p>
              {createdCredentials.email && (
                <p>
                  <span className="text-[#708077]">Email:</span>{" "}
                  <strong>{createdCredentials.email}</strong>
                </p>
              )}
              <p>
                <span className="text-[#708077]">Пароль:</span>{" "}
                <strong>{createdCredentials.password}</strong>
              </p>
              <p>
                <span className="text-[#708077]">Роль:</span>{" "}
                <strong>{roleName(createdCredentials.role)}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedCredentials(null)}
              className="mt-6 w-full rounded-xl bg-[#153321] px-4 py-3.5 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062211]"
            >
              Готово
            </button>
          </section>
        </div>
      )}
    </>
  );
};
