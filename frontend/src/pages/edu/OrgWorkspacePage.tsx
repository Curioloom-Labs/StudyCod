import React from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, Copy, Mail, MoreHorizontal, Pencil, ShieldCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { api } from "../../lib/api/client";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

type Org = { orgId: number; role: string; name: string | null };
type Member = { userId: number; role: string; username: string | null; name: string | null; email: string | null };
type Invite = { id: number; email: string; role: string; token?: string };
type Overview = { totals: { classes: number; students: number; teachers: number }; classes: Array<{ id: number; name: string; language: string; studentsCount: number }> };

const roles = ["TEACHER", "ASSISTANT", "ORG_ADMIN"] as const;
const devPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const roleName = (role: string) => role === "ORG_ADMIN" ? "Адміністратор" : role === "ASSISTANT" ? "Асистент" : "Викладач";
const roleTone = (role: string) => role === "ORG_ADMIN" ? "bg-[#fff0d7] text-[#a45d00] dark:bg-[#ff8c00]/14 dark:text-[#ffbb6a]" : role === "ASSISTANT" ? "bg-[#fff0f5] text-[#bf4168] dark:bg-[#ff6b9d]/12 dark:text-[#ff9abd]" : "bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]";
const badge = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SC";

const sampleOrg: Org = { orgId: 44, role: "ORG_ADMIN", name: "Майстерня коду" };
const sampleMembers: Member[] = [
  { userId: 1, role: "ORG_ADMIN", username: "oksana", name: "Оксана Коваль", email: "oksana@example.com" },
  { userId: 2, role: "TEACHER", username: "denys", name: "Денис Руденко", email: "denys@example.com" },
  { userId: 3, role: "ASSISTANT", username: "marta", name: "Марта Левченко", email: "marta@example.com" },
];
const sampleOverview: Overview = { totals: { classes: 4, students: 86, teachers: 3 }, classes: [{ id: 1, name: "9-Б · Python", language: "PYTHON", studentsCount: 24 }, { id: 2, name: "10-А · C++", language: "CPP", studentsCount: 21 }] };

export const OrgWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const [orgs, setOrgs] = React.useState<Org[]>([]);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showInvite, setShowInvite] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<(typeof roles)[number]>("TEACHER");
  const [nameDraft, setNameDraft] = React.useState("");
  const [editingName, setEditingName] = React.useState(false);
  const [openActions, setOpenActions] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const active = orgs.find((org) => org.orgId === activeId) ?? null;

  const loadWorkspace = React.useCallback(async (orgId: number) => {
    const [memberRes, inviteRes, overviewRes] = await Promise.all([
      api.get(`/edu/orgs/${orgId}/members`),
      api.get(`/edu/orgs/${orgId}/invites`),
      api.get(`/edu/orgs/${orgId}/overview`).catch(() => ({ data: null })),
    ]);
    setMembers(memberRes.data?.members ?? []);
    setInvites(inviteRes.data?.invites ?? []);
    setOverview(overviewRes.data ?? null);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get("/edu/orgs");
        const items: Org[] = (data?.orgs ?? []).filter((org: Org) => org.role === "ORG_ADMIN");
        if (!mounted) return;
        setOrgs(items);
        if (items[0]) {
          setActiveId(items[0].orgId);
          setNameDraft(items[0].name ?? "");
          await loadWorkspace(items[0].orgId);
        }
      } catch (caught) {
        if (!mounted) return;
        if (devPreview()) {
          setOrgs([sampleOrg]); setActiveId(sampleOrg.orgId); setNameDraft(sampleOrg.name ?? "");
          setMembers(sampleMembers); setOverview(sampleOverview);
        } else setError(getErrorMessageFromUnknown(caught, "Не вдалося відкрити команду організації."));
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [loadWorkspace]);

  const switchOrg = async (org: Org) => {
    setActiveId(org.orgId); setNameDraft(org.name ?? ""); setError(null);
    try { await loadWorkspace(org.orgId); }
    catch (caught) { setError(getErrorMessageFromUnknown(caught, "Не вдалося завантажити організацію.")); }
  };
  const updateName = async () => {
    if (!activeId || !nameDraft.trim()) return;
    setBusy(true);
    try {
      await api.patch(`/edu/orgs/${activeId}`, { name: nameDraft.trim() });
      setOrgs((old) => old.map((org) => org.orgId === activeId ? { ...org, name: nameDraft.trim() } : org));
      setEditingName(false);
    } catch (caught) { setError(getErrorMessageFromUnknown(caught, "Назву не змінено.")); }
    finally { setBusy(false); }
  };
  const sendInvite = async (event: React.FormEvent) => {
    event.preventDefault(); if (!activeId || !email.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/edu/orgs/${activeId}/invites`, { email: email.trim(), role: inviteRole });
      setInvites((old) => [data.invite, ...old]); setEmail(""); setShowInvite(false);
    } catch (caught) { setError(getErrorMessageFromUnknown(caught, "Запрошення не надіслано.")); }
    finally { setBusy(false); }
  };
  const setRole = async (member: Member, nextRole: string) => {
    if (!activeId || member.role === nextRole) return;
    setBusy(true);
    try {
      await api.patch(`/edu/orgs/${activeId}/members/${member.userId}/role`, { role: nextRole });
      setMembers((old) => old.map((item) => item.userId === member.userId ? { ...item, role: nextRole } : item));
      setOpenActions(null);
    } catch (caught) { setError(getErrorMessageFromUnknown(caught, "Роль не змінено.")); }
    finally { setBusy(false); }
  };
  const removeMember = async (member: Member) => {
    if (!activeId || !window.confirm(`Прибрати ${member.name || member.username || "учасника"} з команди?`)) return;
    setBusy(true);
    try {
      await api.delete(`/edu/orgs/${activeId}/members/${member.userId}`);
      setMembers((old) => old.filter((item) => item.userId !== member.userId)); setOpenActions(null);
    } catch (caught) { setError(getErrorMessageFromUnknown(caught, "Учасника не вдалося прибрати.")); }
    finally { setBusy(false); }
  };
  const revokeInvite = async (invite: Invite) => {
    if (!activeId) return;
    setBusy(true);
    try { await api.post(`/edu/orgs/${activeId}/invites/${invite.id}/revoke`, {}); setInvites((old) => old.filter((item) => item.id !== invite.id)); }
    catch (caught) { setError(getErrorMessageFromUnknown(caught, "Запрошення не відкликано.")); }
    finally { setBusy(false); }
  };
  const copyInvite = async (invite: Invite) => {
    const link = `${window.location.origin}/invite/${invite.token ?? ""}`;
    try { await navigator.clipboard.writeText(link); } catch { setError(link); }
  };

  if (loading) return <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10"><div className="h-[600px] animate-pulse rounded-[30px] bg-[#e8eeea] dark:bg-white/[.05]" /></div>;

  return <>
    <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#16834d] dark:text-[#72edb0]">EDU / команда</p>
          {editingName ? <div className="mt-3 flex flex-wrap gap-2"><input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="rounded-xl border border-[#19291d]/12 bg-white px-4 py-2 text-2xl font-bold tracking-[-.04em] outline-none ring-[#00ff88]/25 focus:ring-4 dark:border-white/10 dark:bg-[#111b14] dark:text-white" /><button disabled={busy} onClick={() => void updateName()} className="rounded-xl bg-[#00d978] px-4 py-2 text-sm font-bold text-[#062211]">Зберегти</button><button onClick={() => { setEditingName(false); setNameDraft(active?.name ?? ""); }} className="rounded-xl px-3 text-sm font-bold text-[#6d7d72]">Скасувати</button></div> : <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] text-[#17241b] dark:text-[#eff5f0] sm:text-5xl">{active?.name || "Твоя команда"}<button onClick={() => setEditingName(true)} className="ml-3 inline-grid h-8 w-8 translate-y-[-3px] place-items-center rounded-lg text-[#799087] transition hover:bg-[#edf3ed] dark:hover:bg-white/[.07]"><Pencil className="h-4 w-4" /></button></h1>}
          <p className="mt-3 max-w-xl text-base leading-7 text-[#69796e] dark:text-[#a9b6ac]">Люди, ролі й навчальні групи — без злиплого адміністративного інтерфейсу.</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(20,67,40,.18)] transition hover:-translate-y-0.5 dark:bg-[#00d978] dark:text-[#062211]"><UserPlus className="mr-2 inline h-4 w-4" />Запросити людину</button>
      </header>
      {error && <div className="mb-5 rounded-2xl border border-[#ff6b9d]/25 bg-[#ff6b9d]/[.08] px-4 py-3 text-sm font-medium text-[#c4436b] dark:text-[#ff9abd]">{error}</div>}
      {orgs.length === 0 ? <section className="rounded-[28px] border border-dashed border-[#19291d]/16 px-7 py-20 text-center dark:border-white/10"><Building2 className="mx-auto h-9 w-9 text-[#ff9b2e]" /><h2 className="mt-4 text-2xl font-bold">Ще немає простору команди</h2><p className="mx-auto mt-3 max-w-md text-base leading-7 text-[#6d7d72] dark:text-[#a9b6ac]">Створи організацію у студії курсів — тоді тут можна буде запросити колег.</p><button onClick={() => navigate("/edu/courses")} className="mt-6 rounded-xl bg-[#153321] px-4 py-3 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062211]">До курсів</button></section> : <>
        <div className="mb-7 flex gap-2 overflow-x-auto pb-1">{orgs.map((org) => <button key={org.orgId} onClick={() => void switchOrg(org)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${activeId === org.orgId ? "bg-[#17251c] text-white dark:bg-[#edf3ef] dark:text-[#102016]" : "bg-[#edf2ed] text-[#64756a] dark:bg-white/[.06] dark:text-[#adbaaf]"}`}>{org.name || "Навчальний простір"}</button>)}</div>
        <div className="grid gap-4 md:grid-cols-3">{[{ icon: <UsersRound className="h-5 w-5" />, label: "Учасники", value: members.length || overview?.totals.teachers || 0, tone: "text-[#16834d] dark:text-[#72edb0]" }, { icon: <Building2 className="h-5 w-5" />, label: "Класи", value: overview?.totals.classes || 0, tone: "text-[#c76e00] dark:text-[#ffb760]" }, { icon: <ShieldCheck className="h-5 w-5" />, label: "Учні", value: overview?.totals.students || 0, tone: "text-[#bf4168] dark:text-[#ff9abd]" }].map((item) => <div key={item.label} className="rounded-2xl border border-[#19291d]/10 bg-white p-5 dark:border-white/[.09] dark:bg-[#111b14]"><span className={item.tone}>{item.icon}</span><p className="mt-6 text-3xl font-bold tracking-[-.045em]">{item.value}</p><p className="mt-1 text-sm font-medium text-[#718075] dark:text-[#a7b5aa]">{item.label}</p></div>)}</div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-[28px] border border-[#19291d]/10 bg-white p-5 dark:border-white/[.09] dark:bg-[#111b14] sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">Склад</p><h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">Люди в команді</h2></div><span className="rounded-full bg-[#edf4ee] px-3 py-1.5 text-xs font-bold text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">{members.length}</span></div><div className="space-y-2">{members.map((member) => <div key={member.userId} className="relative flex items-center gap-3 rounded-2xl p-3 transition hover:bg-[#f4f7f4] dark:hover:bg-white/[.04]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#e7f2e9] text-xs font-extrabold text-[#27503a] dark:bg-white/[.08] dark:text-[#dce9df]">{badge(member.name || member.username || "")}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{member.name || member.username || "Учасник"}</span><span className="block truncate text-xs text-[#738278] dark:text-[#a5b3a8]">{member.email || member.username}</span></span><span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:block ${roleTone(member.role)}`}>{roleName(member.role)}</span><button onClick={() => setOpenActions(openActions === member.userId ? null : member.userId)} className="grid h-8 w-8 place-items-center rounded-lg text-[#718075] hover:bg-[#eaf0eb] dark:hover:bg-white/[.08]"><MoreHorizontal className="h-4 w-4" /></button>{openActions === member.userId && <div className="absolute right-2 top-12 z-20 w-48 rounded-xl border border-[#19291d]/10 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#19251c]">{roles.map((item) => <button key={item} disabled={busy} onClick={() => void setRole(member, item)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-[#f0f4f0] dark:hover:bg-white/[.07]"><span>{roleName(item)}</span>{member.role === item && <Check className="h-3.5 w-3.5 text-[#16834d] dark:text-[#72edb0]" />}</button>)}<button disabled={busy} onClick={() => void removeMember(member)} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-[#c4436b] hover:bg-[#ff6b9d]/[.08] dark:text-[#ff9abd]"><Trash2 className="h-3.5 w-3.5" />Прибрати</button></div>}</div>)}</div></section>
          <aside className="space-y-5"><section className="rounded-[28px] bg-[#163421] p-5 text-white sm:p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a9d7b7]">Запрошення</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">В очікуванні</h2><div className="mt-5 space-y-2">{invites.length ? invites.map((invite) => <div key={invite.id} className="rounded-xl bg-white/[.09] p-3"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#aef0c9]" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{invite.email}</span><button onClick={() => void revokeInvite(invite)} className="text-xs font-bold text-[#ffb0c7] hover:text-white">Відкликати</button></div><div className="mt-2 flex items-center justify-between text-xs text-[#bdd2c3]"><span>{roleName(invite.role)}</span>{invite.token && <button onClick={() => void copyInvite(invite)} className="inline-flex items-center gap-1 font-bold text-[#aef0c9]"><Copy className="h-3 w-3" />Лінк</button>}</div></div>) : <p className="text-sm leading-6 text-[#c1d4c7]">Немає активних запрошень. Коли запросиш колегу, її статус з'явиться тут.</p>}</div></section><section className="rounded-[28px] border border-[#19291d]/10 bg-[#fafbf9] p-5 dark:border-white/[.09] dark:bg-[#101a13]"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">Класи</p><div className="mt-4 space-y-2">{overview?.classes.slice(0, 4).map((group) => <button onClick={() => navigate(`/edu/classes/${group.id}`)} key={group.id} className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 dark:bg-white/[.05] dark:shadow-none"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#edf4ee] text-[10px] font-extrabold text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">{group.language}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{group.name}</span><span className="block text-xs text-[#75847a] dark:text-[#a4b2a7]">{group.studentsCount} учнів</span></span></button>) || <p className="text-sm text-[#748379] dark:text-[#a6b4a9]">Поки без класів.</p>}</div></section></aside>
        </div>
      </>}
    </div>
    {showInvite && <div className="fixed inset-0 z-[80] grid place-items-center bg-[#071009]/45 px-4 backdrop-blur-sm"><form onSubmit={sendInvite} className="w-full max-w-[440px] rounded-[26px] border border-white/60 bg-[#fbfcfa] p-6 shadow-2xl dark:border-white/10 dark:bg-[#142018]"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d]">Команда</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">Запросити колегу</h2></div><button type="button" onClick={() => setShowInvite(false)} className="rounded-lg px-2 text-xl text-[#738278]">×</button></div><label className="mt-6 block text-sm font-bold">Email<input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#19291d]/12 bg-white px-4 py-3 outline-none ring-[#00ff88]/25 focus:ring-4 dark:border-white/10 dark:bg-[#0d1510]" placeholder="name@school.edu" /></label><label className="mt-4 block text-sm font-bold">Роль<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as (typeof roles)[number])} className="mt-2 w-full rounded-xl border border-[#19291d]/12 bg-white px-4 py-3 outline-none dark:border-white/10 dark:bg-[#0d1510]">{roles.map((item) => <option key={item} value={item}>{roleName(item)}</option>)}</select></label><button disabled={busy || !email.trim()} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3.5 text-sm font-bold text-[#062211] disabled:opacity-60"><Mail className="h-4 w-4" />Надіслати запрошення</button></form></div>}
  </>;
};
