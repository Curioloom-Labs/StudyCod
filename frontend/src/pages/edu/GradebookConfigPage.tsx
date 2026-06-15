import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

interface Category {
  id: string;
  name: string;
  weight: number;
  dropLowest: number;
}

let uidSeq = 0;
const newCategory = (): Category => ({ id: `cat${++uidSeq}`, name: "", weight: 1, dropLowest: 0 });

export const GradebookConfigPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [whatIf, setWhatIf] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ final: number | null } | null>(null);
  const [tasks, setTasks] = useState<Array<{ id: number; title: string; categoryId: string | null }>>([]);

  useEffect(() => {
    const load = async () => {
      if (!classId) return;
      try {
        const { data } = await api.get(`/edu/classes/${classId}/gradebook-config`);
        const cfg = data?.config;
        if (cfg?.categories?.length) {
          setCategories(
            cfg.categories.map((c: any) => ({
              id: String(c.id),
              name: String(c.name ?? ""),
              weight: Number(c.weight) || 1,
              dropLowest: Number(c.dropLowest) || 0
            }))
          );
        }
      } catch (error) {
        showToast({ message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити", "Failed to load")), type: "error" });
      } finally {
        setLoading(false);
      }
      try {
        const { data } = await api.get(`/edu/classes/${classId}/gradebook/tasks`);
        setTasks(data?.tasks ?? []);
      } catch {
        /* non-fatal */
      }
    };
    load();
  }, [classId]);

  const tagTask = async (taskId: number, categoryId: string | null) => {
    try {
      await api.put(`/edu/tasks/${taskId}/gradebook-category`, { categoryId });
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, categoryId } : t)));
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    }
  };

  const totalWeight = useMemo(() => categories.reduce((s, c) => s + (Number(c.weight) || 0), 0), [categories]);

  const updateCategory = (id: string, patch: Partial<Category>) =>
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));

  const removeCategory = (id: string) => setCategories(prev => prev.filter(c => c.id !== id));

  const save = async () => {
    if (!classId) return;
    if (categories.some(c => !c.name.trim())) {
      showToast({ message: tr("Кожна категорія потребує назви", "Every category needs a name"), type: "error" });
      return;
    }
    if (categories.some(c => !(c.weight > 0))) {
      showToast({ message: tr("Вага має бути додатною", "Weight must be positive"), type: "error" });
      return;
    }
    setSaving(true);
    try {
      const config = categories.length
        ? { categories: categories.map(c => ({ id: c.id, name: c.name.trim(), weight: c.weight, dropLowest: c.dropLowest })) }
        : null;
      await api.put(`/edu/classes/${classId}/gradebook-config`, { config });
      showToast({ message: tr("Збережено", "Saved"), type: "success" });
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Не вдалося зберегти", "Failed to save")), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    if (!classId) return;
    try {
      const grades = categories
        .map(c => ({ categoryId: c.id, percent: Number(whatIf[c.id]) }))
        .filter(g => Number.isFinite(g.percent));
      const { data } = await api.post(`/edu/classes/${classId}/gradebook-config/preview`, { grades });
      setPreview(data?.result ?? null);
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Спочатку збережіть конфіг", "Save the config first")), type: "error" });
    }
  };

  if (loading) return <div style={{ padding: 24 }}>{tr("Завантаження...", "Loading...")}</div>;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("Назад", "Back")}
      </Button>
      <PageHero
        eyebrowClassic="// gradebook"
        eyebrowAurora={tr("Журнал", "Gradebook")}
        title={tr("Зважений журнал оцінок", "Weighted gradebook")}
        subtitle={tr(
          "Категорії з вагами; підсумок — зважене середнє. Порожньо = тематична модель.",
          "Weighted categories; the final is their weighted mean. Empty = thematic model."
        )}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {categories.map(c => (
          <div
            key={c.id}
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, alignItems: "end" }}
          >
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, opacity: 0.8 }}>
              {tr("Назва", "Name")}
              <input
                value={c.name}
                onChange={e => updateCategory(c.id, { name: e.target.value })}
                placeholder={tr("Напр. Домашні", "e.g. Homework")}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, opacity: 0.8 }}>
              {tr("Вага", "Weight")}
              <input
                type="number"
                min={1}
                value={c.weight}
                onChange={e => updateCategory(c.id, { weight: Number(e.target.value) })}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontSize: 12, opacity: 0.8 }}>
              {tr("Відкинути найгірших", "Drop lowest")}
              <input
                type="number"
                min={0}
                value={c.dropLowest}
                onChange={e => updateCategory(c.id, { dropLowest: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <Button variant="ghost" onClick={() => removeCategory(c.id)} aria-label={tr("Видалити", "Remove")}>
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
        <Button variant="secondary" onClick={() => setCategories(prev => [...prev, newCategory()])}>
          <Plus size={16} /> {tr("Додати категорію", "Add category")}
        </Button>
        <span style={{ fontSize: 13, opacity: 0.7 }}>
          {tr("Сума ваг", "Total weight")}: {totalWeight} ({tr("нормалізується автоматично", "auto-normalized")})
        </span>
        <Button onClick={save} disabled={saving} style={{ marginLeft: "auto" }}>
          <Save size={16} /> {saving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
        </Button>
      </div>

      {categories.length > 0 && tasks.length > 0 && (
        <div style={{ marginTop: 28, padding: 16, border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>{tr("Прив'язка завдань до категорій", "Tag tasks to categories")}</h3>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
            {tr("Лише прив'язані завдання враховуються в підсумку.", "Only tagged tasks count toward the final.")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tasks.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <span style={{ flex: 1 }}>{t.title}</span>
                <select
                  value={t.categoryId ?? ""}
                  onChange={e => tagTask(t.id, e.target.value || null)}
                  style={{ padding: "4px 8px", borderRadius: 6 }}
                >
                  <option value="">{tr("— без категорії —", "— none —")}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.id}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div style={{ marginTop: 28, padding: 16, border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>{tr("Передперегляд «що-якщо»", "What-if preview")}</h3>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
            {tr(
              "Введіть середній % по категорії, щоб побачити підсумок. Потрібен збережений конфіг.",
              "Enter an average % per category to see the final. Requires a saved config."
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {categories.map(c => (
              <label key={c.id} style={{ display: "flex", flexDirection: "column", fontSize: 12, opacity: 0.8 }}>
                {c.name || c.id}
                <input
                  type="number"
                  min={0}
                  max={100}
                  style={{ width: 90 }}
                  value={whatIf[c.id] ?? ""}
                  onChange={e => setWhatIf(prev => ({ ...prev, [c.id]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <Button variant="secondary" onClick={runPreview}>
              {tr("Обчислити", "Compute")}
            </Button>
            {preview && (
              <strong>
                {tr("Підсумок", "Final")}: {preview.final == null ? "—" : `${preview.final}/100`}
              </strong>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
