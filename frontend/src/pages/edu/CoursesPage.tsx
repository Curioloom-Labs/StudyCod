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
  variants?: Array<{ runtime: string; status?: string }>;
  status: "DRAFT" | "PUBLISHED";
}

// Shared input/select chrome matching the Input primitive (theme tokens, focus ring).
const controlClass =
  "bg-bg-code border border-border text-text-primary rounded-[var(--ui-control-radius)] px-4 py-2.5 text-sm leading-[1.45] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/70 transition-colors placeholder:text-text-muted";

export const CoursesPage: React.FC = () => {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<number | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");
  const [title, setTitle] = useState("");
  const [runtime, setRuntime] = useState<"JAVA" | "PYTHON" | "CPP">("PYTHON");
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
      const { data } = await api.post(`/edu/orgs/${activeOrg}/courses`, { title: title.trim(), runtime });
      setCourses(prev => [data.course, ...prev]);
      setTitle("");
      showToast({ message: tr("Курс створено", "Course created"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-10 font-mono text-text-muted">{tr("Завантаження...", "Loading...")}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
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
        <div className="mt-6 rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-5">
          <h3 className="flex items-center gap-2 text-base font-mono text-text-primary leading-none">
            <Building2 className="w-4 h-4 shrink-0 text-primary" /> {tr("Створіть організацію", "Create an organization")}
          </h3>
          <p className="mt-2 text-sm text-text-secondary">
            {tr("Курси належать організації. Створіть свою, щоб почати.", "Courses belong to an organization. Create yours to start.")}
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder={tr("Назва організації", "Organization name")}
              className={controlClass + " flex-1"}
            />
            <Button onClick={createOrg} disabled={busy}>
              <Plus className="w-4 h-4 mr-1.5" /> {tr("Створити", "Create")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {orgs.length > 1 && (
            <select
              value={activeOrg ?? ""}
              onChange={e => setActiveOrg(Number(e.target.value))}
              className={controlClass + " mt-4"}
            >
              {orgs.map(o => (
                <option key={o.orgId} value={o.orgId}>
                  {o.name ?? `Org ${o.orgId}`}
                </option>
              ))}
            </select>
          )}

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={tr("Назва нового курсу", "New course title")}
              className={controlClass + " flex-1"}
            />
            <select value={runtime} onChange={e => setRuntime(e.target.value as "JAVA" | "PYTHON" | "CPP")} className={controlClass}>
              <option value="PYTHON">Python</option>
              <option value="JAVA">Java</option>
              <option value="CPP">C++</option>
            </select>
            <Button onClick={createCourse} disabled={busy || !title.trim()}>
              <Plus className="w-4 h-4 mr-1.5" /> {tr("Курс", "Course")}
            </Button>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {courses.length === 0 && (
              <p className="text-sm text-text-muted">{tr("Ще немає курсів.", "No courses yet.")}</p>
            )}
            {courses.map(c => (
              <button
                key={c.id}
                onClick={() => navigate(`/edu/courses/${c.id}`)}
                className="flex items-center gap-3 px-4 py-3 text-left rounded-[var(--ui-card-radius)] border border-border bg-bg-surface transition-fast hover:border-primary/40 hover:bg-bg-hover focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
                <span className="font-mono font-semibold text-text-primary truncate">{c.title}</span>
                <span className="text-xs text-text-muted">{c.variants?.[0]?.runtime ?? "COURSE"}</span>
                <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-full border border-border text-text-secondary">
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
