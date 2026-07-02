import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ShieldAlert, Users, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { PageHero } from "../../components/ui/PageHero";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { Modal } from "../../components/ui/Modal";
import { getClassSimilarity, compareSimilarity, type SimilarityGroupDto, type SimilarityCompareDto } from "../../lib/api/edu";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

function toneFor(sim: number): string {
  if (sim >= 0.9) return "text-accent-error border-accent-error/40 bg-accent-error/10";
  if (sim >= 0.8) return "text-accent-warning border-accent-warning/40 bg-accent-warning/10";
  return "text-text-secondary border-border bg-bg-surface";
}

export const SimilarityPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<SimilarityGroupDto[]>([]);
  const [minSim, setMinSim] = useState(0.7);
  const [loading, setLoading] = useState(true);
  const [compare, setCompare] = useState<SimilarityCompareDto | null>(null);
  const [comparing, setComparing] = useState(false);

  const openCompare = async (taskId: number, aId: number, bId: number) => {
    if (!classId) return;
    setComparing(true);
    setCompare(null);
    try {
      const data = await compareSimilarity(Number(classId), taskId, aId, bId);
      setCompare(data);
    } catch (error) {
      showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити порівняння", "Failed to load comparison")) });
    } finally {
      setComparing(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (!classId) return;
      try {
        const data = await getClassSimilarity(Number(classId));
        setGroups(Array.isArray(data?.groups) ? data.groups : []);
        if (typeof data?.minSimilarity === "number") setMinSim(data.minSimilarity);
      } catch (error) {
        showToast({ type: "error", message: getErrorMessageFromUnknown(error, tr("Не вдалося завантажити звіт", "Failed to load report")) });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (loading) return <PageSkeleton variant="default" />;

  return (
    <div className="min-h-full bg-bg-base">
      <PageHero
        eyebrowClassic="// similarity"
        eyebrowAurora={tr("Антиплагіат", "Similarity")}
        title={tr("Схожість робіт", "Code similarity")}
        subtitle={tr(`Пари рішень із схожістю від ${Math.round(minSim * 100)}% — потенційні запозичення.`, `Solution pairs with ${Math.round(minSim * 100)}%+ similarity — potential copying.`)}
        maxWidth="4xl"
        actions={<Button variant="ghost" onClick={() => navigate(`/edu/classes/${classId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {tr("До класу", "To class")}
        </Button>}
      />

      <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto space-y-6">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-surface/40 p-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-accent-success/10 flex items-center justify-center mb-3">
              <ShieldAlert className="w-6 h-6 text-accent-success" />
            </div>
            <p className="text-text-secondary">{tr("Підозрілих збігів не знайдено.", "No suspicious matches found.")}</p>
          </div>
        ) : (
          groups.map(g => (
            <section key={g.taskId}>
              <h2 className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none mb-3">
                <ShieldAlert className="w-3.5 h-3.5 text-accent-warning" />
                {g.taskTitle}
                <span className="text-text-muted/70">· {g.pairs.length}</span>
              </h2>
              <div className="space-y-2">
                {g.pairs.map((p, i) => (
                  <button
                    key={`${g.taskId}-${i}`}
                    type="button"
                    onClick={() => openCompare(g.taskId, p.a.id, p.b.id)}
                    className="w-full text-left rounded-xl border border-border bg-bg-surface p-4 flex items-center justify-between gap-3 transition-fast hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <div className="flex items-center gap-2 min-w-0 text-sm font-mono text-text-primary">
                      <Users className="w-4 h-4 text-text-muted shrink-0" />
                      <span className="truncate">{p.a.name}</span>
                      <span className="text-text-muted">↔</span>
                      <span className="truncate">{p.b.name}</span>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-mono tabular-nums px-2.5 py-1 rounded-full border ${toneFor(p.similarity)}`}>
                        {Math.round(p.similarity * 100)}%
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {(comparing || compare) && (
        <Modal open onClose={() => setCompare(null)} title={compare ? `${tr("Порівняння", "Compare")}: ${compare.taskTitle}` : tr("Завантаження…", "Loading…")}>
          {!compare ? (
            <div className="p-8 text-center text-text-secondary">{tr("Завантаження…", "Loading…")}</div>
          ) : (
            <div className="w-[min(960px,92vw)] max-h-[78vh] overflow-auto p-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[compare.a, compare.b].map((side, idx) => {
                  const sharedArr = idx === 0 ? compare.shared.aShared : compare.shared.bShared;
                  const lines = side.code.split("\n");
                  return (
                    <div key={idx} className="rounded-lg border border-border overflow-hidden">
                      <div className="px-3 py-2 text-sm font-mono text-text-primary border-b border-border bg-bg-surface truncate">{side.name}</div>
                      <pre className="text-xs font-mono leading-relaxed py-1">
                        {lines.map((l, li) => (
                          <div key={li} className={`px-3 whitespace-pre ${sharedArr[li] ? "bg-accent-error/15" : ""}`}>
                            <span className="text-text-muted select-none mr-3 tabular-nums">{String(li + 1).padStart(2, " ")}</span>{l || " "}
                          </div>
                        ))}
                      </pre>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-text-muted mt-3 px-1">{tr("Підсвічені рядки збігаються в обох роботах.", "Highlighted lines match in both submissions.")}</p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};
