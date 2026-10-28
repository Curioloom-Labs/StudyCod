import React from "react";
import { ArrowUpRight, BriefcaseBusiness, ExternalLink, Github, Globe2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPortfolioPreview, getPublicPortfolio, type PortfolioPublicView } from "../../lib/api/portfolio";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { isPortfolioAchievement, PortfolioEvidenceCard } from "./PortfolioEvidenceCard";

export const PublicPortfolioPage: React.FC<{ preview?: boolean }> = ({ preview = false }) => {
  const { username = "" } = useParams();
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const copy = (uk: string, english: string) => en ? english : uk;
  const [data, setData] = React.useState<PortfolioPublicView | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    void (preview ? getPortfolioPreview() : getPublicPortfolio(username)).then(value => { if (active) setData(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [preview, username]);

  React.useEffect(() => {
    const priorTitle = document.title;
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    return () => { robots.remove(); document.title = priorTitle; };
  }, []);

  React.useEffect(() => {
    if (data?.profile.displayName) document.title = `${data.profile.displayName} · StudyCod Portfolio${preview ? " Preview" : ""}`;
  }, [data?.profile.displayName, preview]);

  if (error) return <main className="mx-auto max-w-3xl px-5 py-20 text-center text-text-primary"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-bg-hover"><BriefcaseBusiness className="size-5 text-text-secondary" /></div><h1 className="mt-4 text-2xl font-bold">{preview ? copy("Попередній перегляд недоступний", "Preview unavailable") : copy("Портфоліо недоступне", "Portfolio unavailable")}</h1><p className="mt-2 text-sm text-text-secondary">{preview ? copy("Не вдалося завантажити попередній перегляд.", "Could not load your preview.") : copy("Сторінку не знайдено або автор зробив її приватною.", "The page was not found or the owner made it private.")}</p><Link to={preview ? "/portfolio" : "/"} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-bg-hover">{preview ? copy("До портфоліо", "Back to Portfolio") : "StudyCod"}</Link></main>;
  if (!data) return <main className="mx-auto max-w-5xl px-4 py-10" aria-busy="true"><div className="h-52 animate-pulse rounded-3xl bg-bg-hover" /><div className="mt-6 h-64 animate-pulse rounded-3xl bg-bg-hover" /></main>;

  const { profile, works } = data;
  const achievements = data.evidence.filter(item => isPortfolioAchievement(item.sourceType));
  const skillEvidence = data.evidence.filter(item => !isPortfolioAchievement(item.sourceType));
  return <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 text-text-primary sm:px-6 lg:pt-12">
    {preview && <div role="status" className="mb-5 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-text-primary"><strong>{copy("Приватний попередній перегляд", "Private preview")}</strong><span className="ml-2 text-text-secondary">{copy("Його бачиш лише ти. Профіль залишиться приватним, доки ти окремо не опублікуєш його.", "Only you can see this. Your profile stays private until you publish it separately.")}</span></div>}
    <header className="relative overflow-hidden rounded-[28px] border border-border bg-bg-surface p-6 sm:p-9">
      <div className="absolute -right-12 -top-16 size-64 rounded-full bg-primary/5 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-bg-base text-xl font-bold text-primary-strong dark:text-primary-soft">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" width={64} height={64} className="size-full object-cover" /> : profile.displayName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft"><BriefcaseBusiness className="size-4" /> StudyCod · Portfolio</div><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-4xl">{profile.displayName}</h1>{profile.headline && <p className="mt-2 text-lg font-semibold">{profile.headline}</p>}{profile.specialization && <p className="mt-1 text-sm text-text-secondary">{profile.specialization}</p>}{profile.summary && <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-text-secondary">{profile.summary}</p>}{!!profile.technologies.length && <div className="mt-4 flex flex-wrap gap-1.5" aria-label={copy("Технології профілю", "Profile technologies")}>{profile.technologies.map(technology => <span key={technology} className="rounded-lg border border-border bg-bg-base px-2.5 py-1.5 text-xs font-medium text-text-secondary">{technology}</span>)}</div>}
          <div className="mt-5 flex flex-wrap gap-2">{profile.githubUrl && <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-bg-hover"><Github className="size-4" /> GitHub <ExternalLink className="size-3.5" /></a>}{profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-bg-hover"><Globe2 className="size-4" />{copy("Сайт", "Website")}<ExternalLink className="size-3.5" /></a>}</div>
        </div>
      </div>
    </header>

    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted">{copy("Вибрані матеріали", "Selected work")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{copy("Практичні роботи", "Practical work")}</h2></div><span className="text-xs font-medium tabular-nums text-text-muted">{works.length} {copy("робіт", "items")}</span></div>
      {works.length ? <div className="mt-5 space-y-4">{works.map((work, index) => <article key={work.id} className="grid gap-5 rounded-3xl border border-border bg-bg-surface p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_200px]">
        <div><div className="flex items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-bg-hover text-xs font-bold tabular-nums text-text-secondary">{String(index + 1).padStart(2, "0")}</span><div><h3 className="text-lg font-bold tracking-tight">{work.title}</h3>{work.role && <p className="mt-1 text-xs font-medium text-text-muted">{work.role}</p>}</div></div>{work.problem && <div className="mt-4"><h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{copy("Проблема", "Problem")}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{work.problem}</p></div>}{work.solution && <div className="mt-3"><h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{copy("Рішення", "Solution")}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{work.solution}</p></div>}
          <div className="mt-4 flex flex-wrap gap-1.5">{work.technologies.map(technology => <span key={technology} className="rounded-lg border border-border bg-bg-base px-2.5 py-1.5 text-xs font-medium text-text-secondary">{technology}</span>)}</div>
          {!!work.skillIds.length && <div className="mt-3"><p className="mb-1.5 text-[11px] font-semibold text-text-muted">{copy("Навички, пов'язані з роботою", "Skills associated with this work")}</p><div className="flex flex-wrap gap-1.5">{work.skillIds.map(id => { const skill = data.skills.find(candidate => candidate.id === id); return skill ? <span key={id} className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary-strong dark:text-primary-soft">{en ? skill.labelEn : skill.labelUk}</span> : null; })}</div></div>}
        </div>
        <aside className="flex flex-row flex-wrap items-start gap-2 border-t border-border pt-4 md:flex-col md:border-l md:border-t-0 md:pl-5 md:pt-0">{work.repositoryUrl && <a href={work.repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-bg-hover">{copy("Відкрити код", "View source")}<ArrowUpRight className="size-4" /></a>}{work.demoUrl && <a href={work.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-bg-hover">{copy("Демонстрація", "Open demo")}<ArrowUpRight className="size-4" /></a>}{work.sourcePublicId && <Link to={`/portfolio/${encodeURIComponent(work.sourcePublicId)}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary/5 px-3 text-sm font-semibold text-primary-strong transition hover:bg-primary/10 dark:text-primary-soft">{copy("Результат StudyCod", "StudyCod result")}<ArrowUpRight className="size-4" /></Link>}</aside>
      </article>)}</div> : <div className="mt-5 rounded-3xl border border-dashed border-border px-6 py-12 text-center"><p className="text-sm text-text-secondary">{copy("Власник ще не опублікував роботи.", "The owner has not published any work yet.")}</p></div>}
    </section>

    {!!achievements.length && <section className="mt-10" aria-labelledby="portfolio-achievements-title">
      <div className="border-b border-border/70 pb-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted">{copy("Вибрані навчальні та змагальні результати", "Selected learning and competition results")}</p><h2 id="portfolio-achievements-title" className="mt-1 text-2xl font-bold tracking-tight">{copy("Досягнення", "Achievements")}</h2><p className="mt-1 text-sm text-text-secondary">{copy("Це вибрані записи про навчання й офіційні змагання, зафіксовані StudyCod; вони не є сертифікатом професійного рівня.", "These are owner-selected learning milestones and official contest results recorded by StudyCod, not professional certifications.")}</p></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{achievements.map(item => <PortfolioEvidenceCard key={item.id} item={item} skills={data.skills} en={en} />)}</div>
    </section>}
    {!!skillEvidence.length && <section className="mt-10" aria-labelledby="portfolio-skill-evidence-title">
      <div className="border-b border-border/70 pb-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted">{copy("Вибрані перевірені результати", "Selected verified results")}</p><h2 id="portfolio-skill-evidence-title" className="mt-1 text-2xl font-bold tracking-tight">{copy("Свідчення навичок", "Skill evidence")}</h2><p className="mt-1 text-sm text-text-secondary">{copy("StudyCod перевіряє походження кожного джерела. Теги обрав автор; вони не є оцінкою загального рівня.", "StudyCod checks each source record. The owner selected the skill tags; they do not certify overall proficiency.")}</p></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{skillEvidence.map(item => <PortfolioEvidenceCard key={item.id} item={item} skills={data.skills} en={en} />)}</div>
    </section>}
    <footer className="mt-10 flex items-center justify-center gap-2 border-t border-border/70 pt-5 text-xs text-text-muted"><BriefcaseBusiness className="size-3.5" /> StudyCod · {copy("Портфоліо показує вибрані автором матеріали.", "This portfolio shows materials selected by its owner.")}</footer>
  </main>;
};
