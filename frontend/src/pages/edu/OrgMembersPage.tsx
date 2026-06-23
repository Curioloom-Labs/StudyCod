import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, X, Building2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

interface Org { orgId: number; role: string; name: string | null; }
interface Member { userId: number; role: string; username: string | null; name: string | null; email: string | null; }
interface Invite { id: number; email: string; role: string; status: string; }
interface ClassSummary { id: number; name: string; language: string; studentsCount: number; teacherName: string | null; }
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
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("TEACHER");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/edu/orgs`)
      .then(({ data }) => {
        const list: Org[] = (data?.orgs ?? []).filter((o: Org) => o.role === "ORG_ADMIN");
        setOrgs(list);
        if (list.length) setActiveOrg(list[0].orgId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadOrg = async (orgId: number) => {
    try {
      const [m, i, o] = await Promise.all([
        api.get(`/edu/orgs/${orgId}/members`),
        api.get(`/edu/orgs/${orgId}/invites`),
        api.get(`/edu/orgs/${orgId}/overview`).catch(() => ({ data: null }))
      ]);
      setMembers(m.data?.members ?? []);
      setInvites(i.data?.invites ?? []);
      setOverview(o.data ?? null);
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    }
  };

  useEffect(() => {
    if (activeOrg != null) loadOrg(activeOrg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg]);

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

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-10 font-mono text-text-muted">{tr("Завантаження...", "Loading...")}</div>;

  if (orgs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-12">
        <PageHero eyebrowClassic="// org" eyebrowAurora={tr("Організація", "Organization")} title={tr("Учасники", "Members")} />
        <p className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
          <Building2 className="w-4 h-4 shrink-0 text-primary" /> {tr("Ви не адміністратор жодної організації.", "You don't administer any organization.")}
        </p>
        <Button variant="ghost" onClick={() => navigate("/edu/courses")} className="mt-3">
          {tr("Створити організацію", "Create one")}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      <PageHero
        eyebrowClassic="// org"
        eyebrowAurora={tr("Організація", "Organization")}
        title={tr("Учасники організації", "Organization members")}
        subtitle={tr("Запрошуйте викладачів та асистентів за email.", "Invite teachers and assistants by email.")}
      />

      {orgs.length > 1 && (
        <select value={activeOrg ?? ""} onChange={e => setActiveOrg(Number(e.target.value))} className={controlClass + " mt-4"}>
          {orgs.map(o => (
            <option key={o.orgId} value={o.orgId}>{o.name ?? `Org ${o.orgId}`}</option>
          ))}
        </select>
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
                  <span className="text-xs text-text-muted">{c.language}{c.teacherName ? ` · ${c.teacherName}` : ""}</span>
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
        <select value={role} onChange={e => setRole(e.target.value as any)} className={controlClass}>
          {ROLES.map(r => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
        <Button onClick={invite} disabled={busy || !email.trim()}>
          <UserPlus className="w-4 h-4 mr-1.5" /> {tr("Запросити", "Invite")}
        </Button>
      </div>

      <h3 className="mt-7 mb-2 text-sm font-mono uppercase tracking-[0.08em] text-text-muted leading-none">{tr("Учасники", "Members")}</h3>
      <div className="flex flex-col gap-1.5">
        {members.map(m => (
          <div key={m.userId} className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--ui-card-radius)] border border-border bg-bg-surface">
            <strong className="font-mono text-text-primary">{m.name || m.username || `#${m.userId}`}</strong>
            {m.email && <span className="text-xs text-text-muted truncate">{m.email}</span>}
            <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full border border-border text-text-secondary">
              {roleLabel(m.role)}
            </span>
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <>
          <h3 className="mt-7 mb-2 text-sm font-mono uppercase tracking-[0.08em] text-text-muted leading-none">{tr("Очікують", "Pending")}</h3>
          <div className="flex flex-col gap-1.5">
            {invites.map(i => (
              <div key={i.id} className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--ui-card-radius)] border border-dashed border-border">
                <span className="text-text-primary">{i.email}</span>
                <span className="text-xs text-text-muted">{roleLabel(i.role)}</span>
                <Button variant="ghost" className="text-xs ml-auto" onClick={() => revoke(i.id)} aria-label={tr("Відкликати", "Revoke")}>
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
