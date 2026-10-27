import React from "react";
import { ArrowLeft, BookOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getCatalogCourseSyllabus, type CatalogCourseSyllabus } from "../../lib/api/learningCatalog";
import { withDevPreview } from "../../lib/devPreview";
import { tr } from "../../i18n";

function levelLabel(level: CatalogCourseSyllabus["level"]): string {
  if (level === "FOUNDATION") return tr("База", "Foundation");
  if (level === "SPECIALIZATION") return tr("Спеціалізація", "Specialization");
  return tr("Поглиблений", "Advanced");
}

function itemKindLabel(kind: CatalogCourseSyllabus["modules"][number]["items"][number]["kind"]): string {
  if (kind === "THEORY" || kind === "PAGE") return tr("Теорія", "Theory");
  if (kind === "CODE_TASK" || kind === "WEB_TASK") return tr("Практика", "Practice");
  if (kind === "QUIZ") return tr("Квіз", "Quiz");
  return tr("Проєкт", "Project");
}

export const CourseSyllabusPage: React.FC = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const id = Number(courseId);
  const [syllabus, setSyllabus] = React.useState<CatalogCourseSyllabus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setSyllabus(null);
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      setSyllabus(await getCatalogCourseSyllabus(id));
    } catch {
      setSyllabus(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  return <main className="mx-auto w-full min-w-0 max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-9">
    <button type="button" onClick={() => navigate(withDevPreview("/learning/catalog"))} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-text-secondary transition hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
      <ArrowLeft className="size-4" aria-hidden="true" />{tr("До каталогу", "Back to catalog")}
    </button>

    {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-secondary" role="status" aria-live="polite">
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{tr("Завантажуємо програму курсу…", "Loading the course syllabus…")}
    </div> : error || !syllabus ? <section className="rounded-2xl border border-accent-error/30 bg-accent-error/[.06] p-6 sm:p-8" role="alert">
      <h1 className="text-xl font-bold text-text-primary">{tr("Не вдалося відкрити програму", "Couldn’t open the syllabus")}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">{tr("Спробуй завантажити її ще раз.", "Try loading it again.")}</p>
      <button type="button" onClick={() => void load()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
        <RefreshCw className="size-4" aria-hidden="true" />{tr("Повторити", "Retry")}
      </button>
    </section> : <>
      <header className="overflow-hidden rounded-[26px] border border-white/10 bg-[#17372d] p-6 text-[#f3f2e9] shadow-[0_24px_70px_rgba(8,24,17,.12)] sm:p-9">
        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-[#c4e58a]"><BookOpen className="size-4" aria-hidden="true" />{tr("Програма курсу", "Course syllabus")}</p>
        <h1 className="mt-4 max-w-4xl text-balance font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,3.25rem)] font-black leading-[1.02] tracking-[-.055em]">{syllabus.title}</h1>
        {syllabus.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-[#d3ded4] sm:text-base">{syllabus.description}</p> : null}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/15 pt-4">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{levelLabel(syllabus.level)}</span>
          {syllabus.variants.map((variant) => <span key={`${variant.runtime}-${variant.title}`} className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-[#d3ded4]">{variant.title || variant.runtimeLabel}</span>)}
          <span className="ml-auto text-xs font-semibold text-[#d3ded4]">{syllabus.modules.length} {tr("розділів", "units")}</span>
        </div>
      </header>

      <section className="mt-7" aria-labelledby="syllabus-outline-heading">
        <div className="mb-4 border-b border-border pb-3">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-primary-strong dark:text-primary">{tr("Структура навчання", "Learning outline")}</p>
          <h2 id="syllabus-outline-heading" className="mt-1 text-xl font-black tracking-tight text-text-primary">{tr("Що ти опануєш", "What you’ll learn")}</h2>
        </div>
        {syllabus.modules.length ? <ol className="space-y-3">
          {syllabus.modules.map((module, moduleIndex) => <li key={module.id} className="rounded-2xl border border-border bg-bg-surface p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-sm font-black tabular-nums text-primary-strong dark:text-primary-soft">{String(moduleIndex + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-base font-extrabold text-text-primary">{module.title}</h3>
                  <span className="text-xs font-semibold text-text-muted">{module.items.length} {tr("занять", "steps")}</span>
                </div>
                <ol className="mt-3 divide-y divide-border/70">
                  {module.items.map((item, itemIndex) => <li key={`${item.title}-${itemIndex}`} className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                    <span className="min-w-0 text-sm font-semibold text-text-secondary">{item.title}</span>
                    <span className="shrink-0 rounded-full bg-bg-base px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-text-muted">{itemKindLabel(item.kind)}</span>
                  </li>)}
                </ol>
              </div>
            </div>
          </li>)}
        </ol> : <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-text-secondary">{tr("Програма для цього курсу ще не додана.", "A syllabus has not been added to this course yet.")}</p>}
      </section>
    </>}
  </main>;
};

export default CourseSyllabusPage;
