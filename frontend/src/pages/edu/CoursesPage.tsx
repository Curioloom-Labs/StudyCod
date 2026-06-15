import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Building2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

interface Org {
  orgId: number;
  role: string;
  name: string | null;
}
interface Course {
  id: number;
  title: string;
  language: string;
  status: "DRAFT" | "PUBLISHED";
}

export const CoursesPage: React.FC = () => {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<number | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"JAVA" | "PYTHON" | "CPP">("PYTHON");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/edu/orgs`);
        const list: Org[] = data?.orgs ?? [];
        setOrgs(list);
        if (list.length) setActiveOrg(list[0].orgId);
      } catch (error) {
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (activeOrg == null) return;
    api
      .get(`/edu/orgs/${activeOrg}/courses`)
      .then(({ data }) => setCourses(data?.courses ?? []))
      .catch(() => setCourses([]));
  }, [activeOrg]);

  const createOrg = async () => {
    if (!orgName.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/edu/orgs`, { name: orgName.trim() });
      const org = data?.org;
      setOrgs(prev => [...prev, { orgId: org.id, role: "ORG_ADMIN", name: org.name }]);
      setActiveOrg(org.id);
      setOrgName("");
      showToast({ message: tr("Організацію створено", "Organization created"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const createCourse = async () => {
    if (activeOrg == null || !title.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/edu/orgs/${activeOrg}/courses`, { title: title.trim(), language });
      setCourses(prev => [data.course, ...prev]);
      setTitle("");
      showToast({ message: tr("Курс створено", "Course created"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>{tr("Завантаження...", "Loading...")}</div>;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 48px" }}>
      <PageHero
        eyebrowClassic="// courses"
        eyebrowAurora={tr("Курси", "Courses")}
        title={tr("Шаблони курсів", "Course templates")}
        subtitle={tr(
          "Багаторазові курси, які призначаються класам (fork-on-assign).",
          "Reusable courses you assign to classes (fork-on-assign)."
        )}
      />

      {orgs.length === 0 ? (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={18} /> {tr("Створіть організацію", "Create an organization")}
          </h3>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
            {tr("Курси належать організації. Створіть свою, щоб почати.", "Courses belong to an organization. Create yours to start.")}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder={tr("Назва організації", "Organization name")}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
            />
            <Button onClick={createOrg} disabled={busy}>
              <Plus size={16} /> {tr("Створити", "Create")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {orgs.length > 1 && (
            <select
              value={activeOrg ?? ""}
              onChange={e => setActiveOrg(Number(e.target.value))}
              style={{ marginTop: 16, padding: "6px 10px", borderRadius: 6 }}
            >
              {orgs.map(o => (
                <option key={o.orgId} value={o.orgId}>
                  {o.name ?? `Org ${o.orgId}`}
                </option>
              ))}
            </select>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={tr("Назва нового курсу", "New course title")}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
            />
            <select value={language} onChange={e => setLanguage(e.target.value as any)} style={{ borderRadius: 6, padding: "0 8px" }}>
              <option value="PYTHON">Python</option>
              <option value="JAVA">Java</option>
              <option value="CPP">C++</option>
            </select>
            <Button onClick={createCourse} disabled={busy || !title.trim()}>
              <Plus size={16} /> {tr("Курс", "Course")}
            </Button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
            {courses.length === 0 && <p style={{ opacity: 0.6 }}>{tr("Ще немає курсів.", "No courses yet.")}</p>}
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => navigate(`/edu/courses/${c.id}`)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  border: "1px solid rgba(128,128,128,0.25)",
                  borderRadius: 8,
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left"
                }}
              >
                <FolderOpen size={18} />
                <span style={{ fontWeight: 600 }}>{c.title}</span>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{c.language}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(128,128,128,0.3)"
                  }}
                >
                  {c.status === "PUBLISHED" ? tr("Опубліковано", "Published") : tr("Чернетка", "Draft")}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
