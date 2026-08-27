import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Send } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

interface Submission { text: string | null; hasFile: boolean; fileName: string | null; status: string; updatedAt: string; }

/**
 * Student submission for a MANUAL (hand-graded) task — text and/or a file.
 * Uses the manual-tasks endpoints (P2.4b).
 */
export const ManualTaskPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/edu/manual-tasks/${taskId}/submission`);
      const sub: Submission | null = data?.submission ?? null;
      setExisting(sub);
      if (sub?.text) setText(sub.text);
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const submit = async () => {
    if (!text.trim() && !file) {
      showToast({ message: tr("Додайте текст або файл", "Add text or a file"), type: "error" });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      if (text.trim()) form.append("text", text);
      if (file) form.append("file", file);
      await api.post(`/edu/manual-tasks/${taskId}/submit`, form, { headers: { "Content-Type": "multipart/form-data" } });
      showToast({ message: tr("Здано на перевірку", "Submitted for review"), type: "success" });
      setFile(null);
      await load();
    } catch (error) {
      showToast({ message: getErrorMessageFromUnknown(error, tr("Помилка", "Error")), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div role="status" aria-live="polite" style={{ padding: 24 }}>{tr("Завантаження…", "Loading…")}</div>;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px 48px" }}>
      <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>
        <ArrowLeft size={16} /> {tr("Назад", "Back")}
      </Button>
      <PageHero
        eyebrow="// manual task"
        title={tr("Завдання з ручною перевіркою", "Hand-graded task")}
        subtitle={tr("Надішліть текстову відповідь та/або файл.", "Submit a text answer and/or a file.")}
      />

      {existing && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, fontSize: 14 }}>
          {tr("Поточний статус", "Current status")}:{" "}
          <strong>{existing.status === "GRADED" ? tr("Оцінено", "Graded") : tr("На перевірці", "Submitted")}</strong>
          {existing.hasFile && <span style={{ marginLeft: 8, opacity: 0.7 }}>📎 {existing.fileName}</span>}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
          placeholder={tr("Ваша відповідь…", "Your answer…")}
          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid rgba(128,128,128,0.3)", boxSizing: "border-box" }}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
          <Upload size={16} />
          <span>{file ? file.name : tr("Прикріпити файл", "Attach a file")}</span>
          <input type="file" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <Button onClick={submit} disabled={busy}>
          <Send size={16} /> {busy ? tr("Надсилання…", "Submitting…") : tr("Надіслати", "Submit")}
        </Button>
      </div>
    </div>
  );
};
