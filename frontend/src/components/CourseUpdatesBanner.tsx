import React, { useState, useEffect } from "react";
import { RefreshCw, Check } from "lucide-react";
import { Button } from "./ui/Button";
import { api } from "../lib/api/client";
import { tr } from "../i18n";
import { showToast } from "../lib/toast";
import { getErrorMessageFromUnknown } from "../lib/safeError";

type PullStatus =
  | "UNCHANGED"
  | "TEMPLATE_UPDATED"
  | "LOCALLY_MODIFIED"
  | "CONFLICT"
  | "NEW_UPSTREAM"
  | "REMOVED_UPSTREAM";

interface Entry { sourceItemId: number; status: PullStatus; title: string | null; }
interface Summary { total: number; actionable: number; byStatus: Record<PullStatus, number>; }

const STATUS_LABEL = (s: PullStatus): string => {
  switch (s) {
    case "TEMPLATE_UPDATED": return tr("Оновлено в шаблоні", "Template updated");
    case "LOCALLY_MODIFIED": return tr("Змінено локально", "Locally modified");
    case "CONFLICT": return tr("Конфлікт", "Conflict");
    case "NEW_UPSTREAM": return tr("Новий елемент", "New item");
    case "REMOVED_UPSTREAM": return tr("Видалено в шаблоні", "Removed in template");
    default: return tr("Без змін", "Unchanged");
  }
};

// Statuses the teacher can pull/apply (UNCHANGED/LOCALLY_MODIFIED are not actionable).
const ACTIONABLE = new Set<PullStatus>(["TEMPLATE_UPDATED", "CONFLICT", "NEW_UPSTREAM", "REMOVED_UPSTREAM"]);

/**
 * Banner on a class page surfacing course-template updates since the fork, with
 * per-item selection (opt-in pull, P2.3). Renders nothing when no assignment or
 * nothing actionable.
 */
export const CourseUpdatesBanner: React.FC<{ classId: string | number }> = ({ classId }) => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/edu/classes/${classId}/course-updates`);
      if (data?.assigned) {
        setSummary(data.summary ?? null);
        setEntries(data.entries ?? []);
      }
    } catch {
      /* non-fatal */
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (!summary || summary.actionable === 0) return null;

  const actionableEntries = entries.filter(e => ACTIONABLE.has(e.status));

  const toggle = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const apply = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      // If any selected item is REMOVED_UPSTREAM, opt into non-destructive close.
      const removeDeleted = actionableEntries.some(e => selected.has(e.sourceItemId) && e.status === "REMOVED_UPSTREAM");
      const { data } = await api.post(`/edu/classes/${classId}/course-updates/apply`, {
        sourceItemIds: [...selected],
        removeDeleted
      });
      showToast({ message: tr(`Застосовано: ${data?.result?.applied ?? 0}`, `Applied: ${data?.result?.applied ?? 0}`), type: "success" });
      setSelected(new Set());
      setOpen(false);
      await load();
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1px solid rgba(245,180,80,0.5)", borderRadius: 8, padding: 12, marginBottom: 16, background: "rgba(245,180,80,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <RefreshCw size={16} />
        <strong>{tr(`Шаблон оновлено: ${summary.actionable} змін`, `Template updated: ${summary.actionable} changes`)}</strong>
        <Button variant="ghost" className="text-xs" onClick={() => setOpen(o => !o)} style={{ marginLeft: "auto" }}>
          {open ? tr("Сховати", "Hide") : tr("Переглянути", "Review")}
        </Button>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {actionableEntries.map(e => (
            <label key={e.sourceItemId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={selected.has(e.sourceItemId)} onChange={() => toggle(e.sourceItemId)} />
              <span>{e.title ?? `#${e.sourceItemId}`}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7 }}>{STATUS_LABEL(e.status)}</span>
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button onClick={apply} disabled={busy || selected.size === 0}>
              <Check size={16} /> {tr(`Застосувати (${selected.size})`, `Apply (${selected.size})`)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
