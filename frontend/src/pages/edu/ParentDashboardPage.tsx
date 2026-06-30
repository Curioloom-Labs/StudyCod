import React, { useEffect, useState } from "react";
import { Users2 } from "lucide-react";
import { PageHero } from "../../components/ui/PageHero";
import { api } from "../../lib/api/client";
import { tr } from "../../i18n";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { DEFAULT_GRADING_SYSTEM, formatGradeForSystem, getGradeToneForSystem, type ClassGradingSystem } from "../../lib/gradingSystems";

interface Child {
  studentId: number;
  firstName: string;
  lastName: string;
  classId: number | null;
}
interface SummaryGrade {
  id: number;
  name: string;
  grade: number;
  assessmentType?: string | null;
}
interface ChildGrades {
  gradingSystem: ClassGradingSystem;
  summaryGrades: SummaryGrade[];
}

/**
 * Read-only observer view for a linked parent: their children's summary grades.
 * Children come from the parent↔student links; each child's grades are fetched
 * via the shared student-grades endpoint (which authorizes the parent).
 */
export const ParentDashboardPage: React.FC = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [gradesByChild, setGradesByChild] = useState<Record<number, ChildGrades>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get(`/edu/parent/children`);
        const kids: Child[] = data?.children ?? [];
        if (!active) return;
        setChildren(kids);
        const entries = await Promise.all(
          kids.map(async (c) => {
            try {
              const r = await api.get(`/edu/students/${c.studentId}/grades`);
              return [
                c.studentId,
                {
                  gradingSystem: (r.data?.gradingSystem ?? DEFAULT_GRADING_SYSTEM) as ClassGradingSystem,
                  summaryGrades: (r.data?.summaryGrades ?? []) as SummaryGrade[]
                }
              ] as const;
            } catch {
              return [c.studentId, { gradingSystem: DEFAULT_GRADING_SYSTEM as ClassGradingSystem, summaryGrades: [] }] as const;
            }
          })
        );
        if (!active) return;
        setGradesByChild(Object.fromEntries(entries));
      } catch (error) {
        showToast({ message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити", "Failed to load")), type: "error" });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 font-mono text-text-muted">{tr("Завантаження...", "Loading...")}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      <PageHero
        eyebrowClassic="// parent"
        eyebrowAurora={tr("Батьки", "Parent")}
        title={tr("Прогрес дітей", "Children's progress")}
        subtitle={tr("Підсумкові оцінки ваших дітей.", "Your children's summary grades.")}
      />

      {children.length === 0 ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-text-secondary">
          <Users2 className="w-4 h-4 shrink-0 text-primary" />
          {tr("До вашого акаунту ще не прив'язано дітей.", "No children are linked to your account yet.")}
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          {children.map((c) => {
            const g = gradesByChild[c.studentId];
            const gradingSystem = g?.gradingSystem ?? DEFAULT_GRADING_SYSTEM;
            const sgs = g?.summaryGrades ?? [];
            return (
              <div key={c.studentId} className="rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-4">
                <h3 className="font-mono text-text-primary m-0">
                  {`${c.lastName} ${c.firstName}`.trim() || `#${c.studentId}`}
                </h3>
                {sgs.length === 0 ? (
                  <p className="text-sm text-text-muted mt-2">{tr("Поки немає оцінок.", "No grades yet.")}</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {sgs.map((sg) => (
                      <div key={sg.id} className="flex items-center gap-2 text-sm">
                        <span className="text-text-secondary flex-1 truncate">{sg.name}</span>
                        <span className={"font-mono tabular-nums " + getGradeToneForSystem(sg.grade, gradingSystem)}>
                          {formatGradeForSystem(sg.grade, gradingSystem)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
