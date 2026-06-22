import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { getStudents, getAttendance, setAttendance, type Student, type AttendanceStatus } from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

export const AttendancePage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Student[]>([]);
  const [statusMap, setStatusMap] = useState<Record<number, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const meta: Record<AttendanceStatus, { label: string; short: string; cls: string }> = {
    PRESENT: { label: tr("Присутній", "Present"), short: tr("П", "P"), cls: "border-accent-success text-accent-success bg-accent-success/10" },
    LATE: { label: tr("Запізнення", "Late"), short: tr("З", "L"), cls: "border-accent-warning text-accent-warning bg-accent-warning/10" },
    ABSENT: { label: tr("Відсутній", "Absent"), short: tr("В", "A"), cls: "border-accent-error text-accent-error bg-accent-error/10" },
    EXCUSED: { label: tr("Поважна", "Excused"), short: tr("У", "E"), cls: "border-primary text-primary bg-primary/10" }
  };

  const load = async (d: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const cid = parseInt(classId, 10);
      const [studs, att] = await Promise.all([getStudents(cid), getAttendance(cid, d)]);
      setStudents(Array.isArray(studs) ? studs : []);
      const map: Record<number, AttendanceStatus> = {};
      for (const s of studs || []) map[s.id] = "PRESENT";
      for (const r of att?.records || []) map[r.studentId] = r.status;
      setStatusMap(map);
    } catch (error) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити відвідуваність", "Failed to load attendance")) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date]);

  const summary = useMemo(() => {
    const c = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 } as Record<AttendanceStatus, number>;
    for (const s of students) c[statusMap[s.id] || "PRESENT"] += 1;
    return c;
  }, [students, statusMap]);

  const markAll = (status: AttendanceStatus) => {
    const map: Record<number, AttendanceStatus> = {};
    for (const s of students) map[s.id] = status;
    setStatusMap(map);
  };

  const save = async () => {
    if (!classId) return;
    setSaving(true);
    try {
      const entries = students.map(s => ({ studentId: s.id, status: statusMap[s.id] || "PRESENT" as AttendanceStatus }));
      await setAttendance(parseInt(classId, 10), date, entries);
      showToast({ type: "success", message: tr("Відвідуваність збережено", "Attendance saved") });
    } catch (error) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося зберегти", "Failed to save")) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// attendance"
        eyebrowAurora={tr("Відвідуваність", "Attendance")}
        title={tr("Відвідуваність", "Attendance")}
        subtitle={tr("Відмітьте присутність учнів на обрану дату.", "Mark student attendance for the selected date.")}
        maxWidth="4xl"
        actions={<>
          <Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("До класу", "To class")}
          </Button>
          <Button onClick={save} disabled={saving || loading || students.length === 0}>
            <Check className="w-4 h-4 mr-2" />
            {saving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
          </Button>
        </>}
      />

      <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono text-sm rounded-lg focus:outline-none focus:border-primary"
          />
          <Button variant="ghost" className="text-xs" onClick={() => markAll("PRESENT")}>
            {tr("Усі присутні", "All present")}
          </Button>
          <div className="ml-auto flex items-center gap-3 text-xs font-mono text-text-secondary tabular-nums">
            {STATUSES.map(s => (
              <span key={s} className={meta[s].cls.split(" ").find(c => c.startsWith("text-"))}>
                {meta[s].short}:{summary[s]}
              </span>
            ))}
          </div>
        </div>

        {loading ? (
          <PageSkeleton variant="default" />
        ) : students.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center text-text-secondary">
            {tr("У класі немає учнів", "No students in this class")}
          </div>
        ) : (
          <div className="space-y-2">
            {students.map(s => (
              <div key={s.id} className="rounded-xl border border-border bg-bg-surface p-3 flex items-center justify-between gap-3">
                <div className="text-sm font-mono text-text-primary truncate min-w-0">
                  {s.lastName} {s.firstName} {s.middleName || ""}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {STATUSES.map(st => {
                    const active = (statusMap[s.id] || "PRESENT") === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        title={meta[st].label}
                        aria-label={meta[st].label}
                        aria-pressed={active}
                        onClick={() => setStatusMap(m => ({ ...m, [s.id]: st }))}
                        className={`w-9 h-9 rounded-lg border text-xs font-mono transition-fast ${active ? meta[st].cls : "border-border text-text-muted hover:bg-bg-hover hover:text-text-primary"}`}
                      >
                        {meta[st].short}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
