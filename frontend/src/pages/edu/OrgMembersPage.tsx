import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { UserPlus, X, Building2, Link2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { SchoolAccountActivation } from "./SchoolAccountActivation";
import { getMe, clearGetMeCache } from "../../lib/api/profile";

interface Org { orgId: number; role: string; name: string | null; }
interface Member { userId: number; role: string; username: string | null; name: string | null; email: string | null; accountSetupRequired?: boolean; canSetActivationEmail?: boolean; hasParentAccess?: boolean; }
interface Invite { id: number; email: string; role: string; status: string; token?: string; }
interface ClassSummary { id: number; name: string; studentsCount: number; teacherName: string | null; }
interface Overview { totals: { classes: number; students: number; teachers: number }; classes: ClassSummary[]; }

const ROLES = ["TEACHER", "ASSISTANT", "ORG_ADMIN"] as const;

// Shared input/select chrome matching the Input primitive (theme tokens, focus ring).
const controlClass =
  "bg-bg-code border border-border text-text-primary rounded-[var(--ui-control-radius)] px-4 py-2.5 text-sm leading-[1.45] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/70 transition-colors placeholder:text-text-muted";

const roleLabel = (r: string): string => {
  switch (r) {
    case "ORG_ADMIN": return tr("Адмін", "Admin");
    case "TEACHER": return tr("Викладач", "Teacher");
    case "ASSISTANT": return tr("Асистент", "Assistant");
    case "STUDENT": return tr("Учень", "Student");
    case "PARENT": return tr("Батьки", "Parent");
    default: return r;
  }
};

export const OrgMembersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedOrg = Number(searchParams.get("org"));
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("TEACHER");
  const [busy, setBusy] = useState(false);
  const [orgNameDraft, setOrgNameDraft] = useState("");
  const [selfUserId, setSelfUserId] = useState<number | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const memberPending = React.useRef(false);
  const [pendingRemoval, setPendingRemoval] = useState<Member | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [transferClasses, setTransferClasses] = useState<Array<{ id: number; name: string }>>([]);
  const memberAlertRef = React.useRef<HTMLDivElement>(null);
  const removalRef = React.useRef<HTMLDivElement>(null);
  const membersHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const activeOrgRef = React.useRef(activeOrg); activeOrgRef.current = activeOrg;
  const loadGeneration = React.useRef(0);
  useEffect(() => { if (memberError) memberAlertRef.current?.focus(); }, [memberError]);
  useEffect(() => { if (pendingRemoval) removalRef.current?.focus(); }, [pendingRemoval]);

  useEffect(() => {
    getMe().then(me => setSelfUserId(me.id)).catch(() => {});
    api
      .get(`/edu/orgs`)
      .then(({ data }) => {
        const list: Org[] = (data?.orgs ?? []).filter((o: Org) => o.role === "ORG_ADMIN");
        setOrgs(list);
        if (list.length) setActiveOrg(list.find(org => org.orgId === requestedOrg)?.orgId ?? list[0].orgId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadOrg = async (orgId: number) => {
    const generation = ++loadGeneration.current;
    try {
      const [m, i, o] = await Promise.all([
        api.get(`/edu/orgs/${orgId}/members`),
        api.get(`/edu/orgs/${orgId}/invites`),
        api.get(`/edu/orgs/${orgId}/overview`).catch(() => ({ data: null }))
      ]);
      if (generation !== loadGeneration.current || activeOrgRef.current !== orgId) return;
      setMembers(m.data?.members ?? []);
      setInvites(i.data?.invites ?? []);
      setOverview(o.data ?? null);
    } catch (error) {
      if (generation !== loadGeneration.current || activeOrgRef.current !== orgId) return;
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    }
  };

  useEffect(() => {
    setPendingRemoval(null); setMemberError(null); setTransferClasses([]);
    setMembers([]); setInvites([]); setOverview(null);
    if (activeOrg != null) loadOrg(activeOrg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg]);

  useEffect(() => {
    setOrgNameDraft(orgs.find(o => o.orgId === activeOrg)?.name ?? "");
  }, [activeOrg, orgs]);

  const renameOrg = async () => {
    if (activeOrg == null) return;
    const name = orgNameDraft.trim();
    if (!name) return;
    try {
      await api.patch(`/edu/orgs/${activeOrg}`, { name });
      setOrgs(prev => prev.map(o => (o.orgId === activeOrg ? { ...o, name } : o)));
      showToast({ message: tr("Назву оновлено", "Name updated"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Не вдалося перейменувати", "Couldn't rename")), type: "error" });
    }
  };

  const invite = async () => {
    if (activeOrg == null || !email.trim()) return;
    setBusy(true);
    try {
      await api.post(`/edu/orgs/${activeOrg}/invites`, { email: email.trim(), role });
      setEmail("");
      showToast({ message: tr("Запрошення надіслано", "Invitation sent"), type: "success" });
      await loadOrg(activeOrg);
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invitationId: number) => {
    if (activeOrg == null) return;
    try {
      await api.post(`/edu/orgs/${activeOrg}/invites/${invitationId}/revoke`, {});
      await loadOrg(activeOrg);
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    }
  };

  const copyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ message: tr("Посилання скопійовано", "Link copied"), type: "success" });
    } catch {
      showToast({ message: link, type: "info" });
    }
  };

  const changeRole = async (userId: number, newRole: string) => {
    if (activeOrg == null || memberPending.current) return;
    memberPending.current = true; setMemberBusy(true); setMemberError(null); setTransferClasses([]);
    try {
      await api.patch(`/edu/orgs/${activeOrg}/members/${userId}/role`, { role: newRole });
      if (userId === selfUserId) { clearGetMeCache({ clearSnapshot: true }); window.location.reload(); return; }
      setMembers(prev => prev.map(m => (m.userId === userId ? { ...m, role: newRole } : m)));
      showToast({ message: tr("Роль оновлено", "Role updated"), type: "success" });
    } catch (error) {
      // Resync on failure (e.g. refusing to demote the last admin).
      showMemberError(error, tr("Не вдалося змінити роль", "Couldn't change role"));
      await loadOrg(activeOrg);
    } finally { memberPending.current = false; setMemberBusy(false); }
  };

  const showMemberError = (error: unknown, fallback: string) => {
    const classes = isAxiosError(error) && error.response?.data?.message === "CLASS_TRANSFER_REQUIRED" ? error.response.data.classes : null;
    setTransferClasses(Array.isArray(classes) ? classes.filter(item => Number.isSafeInteger(item.id) && typeof item.name === "string") : []);
    setMemberError(getErrorMessageFromUnknown(error, fallback));
  };

  const removeMember = async () => {
    if (activeOrg == null || !pendingRemoval || memberPending.current) return;
    const userId = pendingRemoval.userId;
    memberPending.current = true; setMemberBusy(true); setMemberError(null); setTransferClasses([]);
    try {
      await api.delete(`/edu/orgs/${activeOrg}/members/${userId}`);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      setPendingRemoval(null);
      membersHeadingRef.current?.focus();
      showToast({ message: tr("Учасника видалено", "Member removed"), type: "success" });
    } catch (error) {
      showMemberError(error, tr("Не вдалося видалити", "Couldn't remove"));
    } finally { memberPending.current = false; setMemberBusy(false); }
  };

  if (loading) return <div role="status" aria-live="polite" className="max-w-3xl mx-auto px-4 py-10 font-mono text-text-muted">{tr("Завантаження…", "Loading…")}</div>;

  if (orgs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-12">
        <PageHero eyebrow="// org" title={tr("Учасники", "Members")} />
        <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <Building2 className="w-4 h-4 shrink-0 text-primary" /> {tr("Ви не адміністратор жодної організації.", "You don't administer any organization.")}
        </p>
        <Button variant="ghost" onClick={() => navigate("/edu/courses")} className="mt-3">
          {tr("Створити організацію", "Create one")}
        </Button>
      </div>
    );
  }

  // This page manages staff (teachers/assistants/admins) — students/parents
  // join via class join-codes / parent invites and have their own dedicated
  // views (class roster, parent dashboard), so they're summarized, not listed,
  // to keep this list usable as a class roster grows.
  const visibleMembers = members.filter(m => (ROLES as readonly string[]).includes(m.role) || m.role === "PARENT" || m.hasParentAccess);
  const nonStaffCount = members.length - visibleMembers.length;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      <PageHero
        eyebrow="// org"
        title={tr("Учасники організації", "Organization members")}
        subtitle={tr("Запрошуйте викладачів та асистентів за email.", "Invite teachers and assistants by email.")}
      />

      {orgs.length > 1 && (
        <select aria-label={tr("Навчальний заклад", "Organization")} disabled={memberBusy} value={activeOrg ?? ""} onChange={e => setActiveOrg(Number(e.target.value))} className={controlClass + " mt-4 min-h-11"}>
          {orgs.map(o => (
            <option key={o.orgId} value={o.orgId}>{o.name ?? `Org ${o.orgId}`}</option>
          ))}
        </select>
      )}

      {activeOrg != null && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            value={orgNameDraft}
            onChange={e => setOrgNameDraft(e.target.value)}
            placeholder={tr("Назва організації", "Organization name")}
            className={controlClass + " flex-1 min-w-[200px]"}
          />
          <Button
            variant="secondary"
            onClick={renameOrg}
            disabled={!orgNameDraft.trim() || orgNameDraft.trim() === (orgs.find(o => o.orgId === activeOrg)?.name ?? "")}
          >
            {tr("Перейменувати", "Rename")}
          </Button>
        </div>
      )}

      {overview && (
        <div className="mt-5">
          <div className="flex gap-3 flex-wrap">
            {[
              { label: tr("Класи", "Classes"), value: overview.totals.classes },
              { label: tr("Учні", "Students"), value: overview.totals.students },
              { label: tr("Викладачі", "Teachers"), value: overview.totals.teachers }
            ].map((s, i) => (
              <div key={i} className="flex-1 min-w-[120px] rounded-[var(--ui-card-radius)] border border-border bg-bg-surface px-4 py-3">
                <div className="text-2xl font-mono font-semibold text-text-primary tabular-nums">{s.value}</div>
                <div className="text-xs text-text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {overview.classes.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {overview.classes.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/edu/classes/${c.id}`)}
                  className="flex items-center gap-2.5 px-3 py-2 text-left rounded-[var(--ui-card-radius)] border border-border bg-bg-surface transition-fast hover:border-primary/40 hover:bg-bg-hover focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <strong className="font-mono text-text-primary truncate">{c.name}</strong>
                  <span className="ml-auto text-xs text-text-secondary tabular-nums">{c.studentsCount} {tr("учнів", "students")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={tr("email викладача", "teacher email")}
          className={controlClass + " flex-1 min-w-[200px]"}
        />
        <select value={role} onChange={e => { const next = e.target.value; if ((ROLES as readonly string[]).includes(next)) setRole(next as typeof role); }} className={controlClass}>
          {ROLES.map(r => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
        <Button onClick={invite} disabled={busy || !email.trim()}>
          <UserPlus className="w-4 h-4 mr-1.5" /> {tr("Запросити", "Invite")}
        </Button>
      </div>

      <h3 ref={membersHeadingRef} tabIndex={-1} className="mt-7 mb-2 text-sm font-mono uppercase tracking-[0.08em] text-text-muted leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Учасники", "Members")}</h3>
      {memberError && <div ref={memberAlertRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl border border-accent-error/30 bg-accent-error/5 p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-error">
        <p>{memberError}</p>
        {transferClasses.length > 0 && <ul className="mt-2 grid gap-1">{transferClasses.map(cls => <li key={cls.id}><button type="button" onClick={() => navigate(`/edu/classes/${cls.id}/manage?tab=settings&return=members`)} className="min-h-11 rounded-lg px-2 text-left font-semibold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Передати клас", "Transfer class")}: {cls.name}</button></li>)}</ul>}
      </div>}
      {pendingRemoval && <div ref={removalRef} tabIndex={-1} role="region" aria-label={tr("Підтвердження видалення учасника", "Confirm member removal")} className="mb-3 rounded-xl border border-border bg-bg-surface p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <p className="font-semibold">{tr("Відкликати доступ", "Revoke access")}: {pendingRemoval.name || pendingRemoval.username || `#${pendingRemoval.userId}`}?</p>
        <p className="mt-2 text-sm text-text-secondary">{tr("Буде відкликано доступ до класів і дітей цього закладу та чинні запрошення. Власні учнівські профілі учасника в цьому закладі архівуються; роботи й оцінки збережуться. Доступ до інших закладів залишиться.", "Class and child access and pending invitations in this organization will be revoked. The member’s own student profiles here will be archived; work and grades will be retained. Access to other organizations will remain.")}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" disabled={memberBusy} onClick={() => { setPendingRemoval(null); setMemberError(null); setTransferClasses([]); membersHeadingRef.current?.focus(); }}>{tr("Скасувати", "Cancel")}</Button><Button disabled={memberBusy} onClick={() => void removeMember()}>{memberBusy ? tr("Відкликаємо…", "Revoking…") : tr("Відкликати доступ", "Revoke access")}</Button></div>
      </div>}
      <div className="flex flex-col gap-1.5">
        {visibleMembers.map(m => (
          <div key={m.userId} className="flex flex-wrap items-center gap-2.5 px-3 py-2 rounded-[var(--ui-card-radius)] border border-border bg-bg-surface">
            <strong className="font-mono text-text-primary">{m.name || m.username || `#${m.userId}`}</strong>
            {m.email && <span className="text-xs text-text-muted truncate">{m.email}</span>}
            {(ROLES as readonly string[]).includes(m.role) ? <select
              value={m.role}
              onChange={e => changeRole(m.userId, e.target.value)}
              disabled={memberBusy}
              className={controlClass + " ml-auto min-h-11 !px-2 text-xs"}
              aria-label={tr("Роль", "Role")}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select> : <span className="ml-auto text-xs text-text-secondary">{roleLabel(m.role)}</span>}
            {m.hasParentAccess && m.role !== "PARENT" && <span className="text-xs text-text-muted">{tr("Доступ до дітей", "Child access")}</span>}
            <Button
              variant="ghost"
              className="text-xs"
              disabled={memberBusy || m.userId === selfUserId}
              title={m.userId === selfUserId ? tr("Не можна видалити себе", "Can't remove yourself") : undefined}
              onClick={() => { setMemberError(null); setTransferClasses([]); setPendingRemoval(m); }}
              aria-label={tr("Видалити", "Remove")}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
            <SchoolAccountActivation orgId={activeOrg!} userId={m.userId} email={m.email} required={m.accountSetupRequired} canSetEmail={m.canSetActivationEmail} disabled={busy || memberBusy} onUpdated={() => loadOrg(activeOrg!)} />
          </div>
        ))}
        {nonStaffCount > 0 && (
          <p className="text-xs text-text-muted mt-1">
            {tr(
              `+ ${nonStaffCount} учнів (керуються через список учнів класу)`,
              `+ ${nonStaffCount} students (managed via the class roster)`
            )}
          </p>
        )}
      </div>

      {invites.length > 0 && (
        <>
          <h3 className="mt-7 mb-2 text-sm font-mono uppercase tracking-[0.08em] text-text-muted leading-none">{tr("Очікують", "Pending")}</h3>
          <div className="flex flex-col gap-1.5">
            {invites.map(i => (
              <div key={i.id} className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--ui-card-radius)] border border-dashed border-border">
                <span className="text-text-primary">{i.email}</span>
                <span className="text-xs text-text-muted">{roleLabel(i.role)}</span>
                {i.token && (
                  <Button variant="ghost" className="text-xs ml-auto" onClick={() => copyInviteLink(i.token!)} aria-label={tr("Копіювати посилання", "Copy link")}>
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="ghost" className={"text-xs" + (i.token ? "" : " ml-auto")} onClick={() => revoke(i.id)} aria-label={tr("Відкликати", "Revoke")}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
