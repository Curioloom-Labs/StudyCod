import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, FileText, Code, HelpCircle, Send } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

type ItemKind = "THEORY" | "PAGE" | "CODE_TASK" | "WEB_TASK" | "QUIZ" | "MANUAL";
interface Item { id: number; kind: ItemKind; title: string; }
interface Module { id: number; title: string; items: Item[]; }
interface CourseTree { id: number; title: string; variants?: Array<{ runtime: string; status?: string }>; status: "DRAFT" | "PUBLISHED"; modules: Module[]; }
interface ClassOption { id: number; name: string; }

const KIND_ICON: Record<ItemKind, React.ReactNode> = {
  THEORY: <FileText size={14} />,
  PAGE: <FileText size={14} />,
  CODE_TASK: <Code size={14} />,
  WEB_TASK: <Code size={14} />,
  QUIZ: <HelpCircle size={14} />,
  MANUAL: <Send size={14} />
};

export const CourseDetailPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleTitle, setModuleTitle] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [assignClass, setAssignClass] = useState<number | "">("");

  const reload = useCallback(async () => {
    if (!courseId) return;
    const { data } = await api.get(`/edu/courses/${courseId}`);
    setCourse(data?.course ?? null);
  }, [courseId]);

  useEffect(() => {
    (async () => {
      try {
        await reload();
        const { data } = await api.get(`/edu/classes`);
        setClasses((data?.classes ?? []).map((c: any) => ({ id: c.id, name: c.name })));
      } catch (error) {
        showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
      } finally {
        setLoading(false);
      }
    })();
  }, [reload]);

  const addModule = async () => {
    if (!moduleTitle.trim()) return;
    try {
      await api.post(`/edu/courses/${courseId}/modules`, { title: moduleTitle.trim(), order: course?.modules.length ?? 0 });
      setModuleTitle("");
      await reload();
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    }
  };

  const togglePublish = async () => {
    if (!course) return;
    const next = course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    try {
      await api.put(`/edu/courses/${courseId}/status`, { status: next });
      await reload();
      showToast({ message: next === "PUBLISHED" ? tr("Опубліковано", "Published") : tr("Знято з публікації", "Unpublished"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    }
  };

  const assign = async () => {
    if (!assignClass) return;
    try {
      const { data } = await api.post(`/edu/classes/${assignClass}/assign-course`, { courseId: Number(courseId) });
      const r = data?.assignment;
      showToast({
        message: tr(`Призначено: ${r?.lessonsCreated} уроків, ${r?.tasksCreated} задач`, `Assigned: ${r?.lessonsCreated} lessons, ${r?.tasksCreated} tasks`),
        type: "success"
      });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Курс має бути опублікований", "Course must be published")), type: "error" });
    }
  };

  if (loading) return <div role="status" aria-live="polite" style={{ padding: 24 }}>{tr("Завантаження…", "Loading…")}</div>;
  if (!course) return <div style={{ padding: 24 }}>{tr("Курс не знайдено", "Course not found")}</div>;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(`/edu/courses`)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("До курсів", "Back to courses")}
      </Button>
      <PageHero
        eyebrow="// course"
        title={course.title}
        subtitle={`${course.variants?.[0]?.runtime ?? "COURSE"} · ${course.status === "PUBLISHED" ? tr("Опубліковано", "Published") : tr("Чернетка", "Draft")}`}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant={course.status === "PUBLISHED" ? "secondary" : "primary"} onClick={togglePublish}>
          {course.status === "PUBLISHED" ? tr("Зняти з публікації", "Unpublish") : tr("Опублікувати", "Publish")}
        </Button>
        {course.status === "PUBLISHED" && (
          <>
            <select value={assignClass} onChange={e => setAssignClass(e.target.value ? Number(e.target.value) : "")} style={{ padding: "6px 10px", borderRadius: 6 }}>
              <option value="">{tr("Обрати клас…", "Pick a class…")}</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Button onClick={assign} disabled={!assignClass}>
              <Send size={16} /> {tr("Призначити класу", "Assign to class")}
            </Button>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <input
          value={moduleTitle}
          onChange={e => setModuleTitle(e.target.value)}
          placeholder={tr("Назва модуля", "Module title")}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
        />
        <Button variant="secondary" onClick={addModule}>
          <Plus size={16} /> {tr("Модуль", "Module")}
        </Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
        {course.modules.map(m => (
          <ModuleBlock key={m.id} module={m} onChanged={reload} />
        ))}
      </div>
    </div>
  );
};

const ModuleBlock: React.FC<{ module: Module; onChanged: () => Promise<void> }> = ({ module, onChanged }) => {
  const [kind, setKind] = useState<ItemKind>("CODE_TASK");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);

  const buildContent = (): Record<string, unknown> => {
    if (kind === "THEORY" || kind === "PAGE") return { html: body };
    if (kind === "CODE_TASK" || kind === "WEB_TASK") return { description: body, template: "" };
    if (kind === "MANUAL") return { description: body };
    if (kind === "QUIZ") {
      try {
        return { quiz: JSON.parse(body || "{}") };
      } catch {
        return { quiz: {} };
      }
    }
    return {};
  };

  const addItem = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      await api.post(`/edu/modules/${module.id}/items`, {
        kind,
        title: title.trim(),
        order: module.items.length,
        content: buildContent()
      });
      setTitle("");
      setBody("");
      await onChanged();
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, padding: 14 }}>
      <h3 style={{ marginTop: 0 }}>{module.title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
        {module.items.map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            {KIND_ICON[it.kind]} <span>{it.title}</span>
            <span style={{ fontSize: 11, opacity: 0.5 }}>{it.kind}</span>
          </div>
        ))}
        {module.items.length === 0 && <span style={{ opacity: 0.5, fontSize: 13 }}>{tr("Порожній модуль", "Empty module")}</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <select value={kind} onChange={e => setKind(e.target.value as ItemKind)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="CODE_TASK">{tr("Задача (код)", "Code task")}</option>
          <option value="WEB_TASK">{tr("Веб-задача", "Web task")}</option>
          <option value="THEORY">{tr("Теорія", "Theory")}</option>
          <option value="QUIZ">{tr("Вікторина (JSON)", "Quiz (JSON)")}</option>
          <option value="MANUAL">{tr("Ручна перевірка", "Manual")}</option>
        </select>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={tr("Назва елемента", "Item title")}
          style={{ flex: 1, minWidth: 160, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)" }}
        />
        <Button variant="secondary" onClick={addItem} disabled={adding || !title.trim()}>
          <Plus size={14} /> {tr("Додати", "Add")}
        </Button>
      </div>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={kind === "QUIZ" ? tr("JSON вікторини", "Quiz JSON") : tr("Опис / тіло", "Description / body")}
        rows={2}
        style={{ width: "100%", marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid rgba(128,128,128,0.3)", boxSizing: "border-box" }}
      />
    </div>
  );
};
