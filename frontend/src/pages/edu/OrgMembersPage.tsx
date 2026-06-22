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

  if (loading) return <div style={{ padding: 24 }}>{tr("Завантаження...", "Loading...")}</div>;

  if (orgs.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
        <PageHero eyebrowClassic="// org" eyebrowAurora={tr("Організація", "Organization")} title={tr("Учасники", "Members")} />
        <p style={{ opacity: 0.7, marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={18} /> {tr("Ви не адміністратор жодної організації.", "You don't administer any organization.")}
        </p>
        <Button variant="ghost" onClick={() => navigate("/edu/courses")} style={{ marginTop: 12 }}>
          {tr("Створити організацію", "Create one")}
        </Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 48px" }}>
      <PageHero
        eyebrowClassic="// org"
        eyebrowAurora={tr("Організація", "Organization")}
        title={tr("Учасники організації", "Organization members")}
        subtitle={tr("Запрошуйте викладачів та асистентів за email.", "Invite teachers and assistants by email.")}
      />

      {orgs.length > 1 && (
        <select value={activeOrg ?? ""} onChange={e => setActiveOrg(Number(e.target.value))} style={{ marginTop: 16, padding: "6px 10px", borderRadius: 6 }}>
          {orgs.map(o => (
            <option key={o.orgId} value={o.orgId}>{o.name ?? `Org ${o.orgId}`}</option>
          ))}
        </select>
      )}

      {overview && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { label: tr("Класи", "Classes"), value: overview.totals.classes },
              { label: tr("Учні", "Students"), value: overview.totals.students },
              { label: tr("Викладачі", "Teachers"), value: overview.totals.teachers }
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, minWidth: 120, border: "1px solid rgba(128,128,128,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {overview.classes.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {overview.classes.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/edu/classes/${c.id}`)}
                  style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 8, background: "transparent", cursor: "pointer" }}
                >
                  <strong>{c.name}</strong>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>{c.language}{c.teacherName ? ` · ${c.teacherName}` : ""}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>{c.studentsCount} {tr("учнів", "students")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={tr("email викладача", "teacher email")}
          style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
        />
        <select value={role} onChange={e => setRole(e.target.value as any)} style={{ borderRadius: 6, padding: "0 8px" }}>
          {ROLES.map(r => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
        <Button onClick={invite} disabled={busy || !email.trim()}>
          <UserPlus size={16} /> {tr("Запросити", "Invite")}
        </Button>
      </div>

      <h3 style={{ marginTop: 28 }}>{tr("Учасники", "Members")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {members.map(m => (
          <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 8 }}>
            <strong>{m.name || m.username || `#${m.userId}`}</strong>
            {m.email && <span style={{ fontSize: 13, opacity: 0.6 }}>{m.email}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(128,128,128,0.3)" }}>
              {roleLabel(m.role)}
            </span>
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <>
          <h3 style={{ marginTop: 28 }}>{tr("Очікують", "Pending")}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {invites.map(i => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px dashed rgba(128,128,128,0.3)", borderRadius: 8 }}>
                <span>{i.email}</span>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{roleLabel(i.role)}</span>
                <Button variant="ghost" className="text-xs" onClick={() => revoke(i.id)} style={{ marginLeft: "auto" }} aria-label={tr("Відкликати", "Revoke")}>
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
