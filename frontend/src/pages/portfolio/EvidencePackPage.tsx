import React from "react";
import { ArrowUpRight, BriefcaseBusiness, ExternalLink, FileCheck2, Github, Globe2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPublicEvidencePack } from "../../lib/api/portfolio";
import { PortfolioEvidenceCard } from "./PortfolioEvidenceCard";

export const EvidencePackPage: React.FC = () => {
  const { token = "" } = useParams();
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const copy = (uk: string, english: string) => en ? english : uk;
  const [data, setData] = React.useState<Awaited<ReturnType<typeof getPublicEvidencePack>> | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    void getPublicEvidencePack(token).then(value => { if (active) setData(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [token]);

  React.useEffect(() => {
    const priorTitle = document.title;
    const referrerMeta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const priorReferrerPolicy = referrerMeta?.content ?? null;
    const effectiveReferrerMeta = referrerMeta ?? document.createElement("meta");
    if (!referrerMeta) {
      effectiveReferrerMeta.name = "referrer";
      document.head.append(effectiveReferrerMeta);
    }
    effectiveReferrerMeta.content = "no-referrer";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    return () => {
      robots.remove();
      if (priorReferrerPolicy === null) effectiveReferrerMeta.remove();
      else effectiveReferrerMeta.content = priorReferrerPolicy;
      document.title = priorTitle;
    };
  }, []);

  React.useEffect(() => {
    if (data?.title) document.title = `${data.title} · StudyCod Evidence Pack`;
  }, [data?.title]);

  if (failed) return <main className="mx-auto max-w-3xl px-5 py-20 text-center text-text-primary"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-bg-hover"><FileCheck2 className="size-5 text-text-secondary" /></div><h1 className="mt-4 text-2xl font-bold">{copy("Посилання недоступне", "Share link unavailable")}</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-secondary">{copy("Власник відкликав доступ, термін дії посилання завершився або матеріали більше недоступні.", "The owner revoked access, the link expired, or the shared materials are no longer available.")}</p><Link to="/" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-bg-hover">StudyCod</Link></main>;
  if (!data) return <main className="mx-auto max-w-5xl px-4 py-10" aria-busy="true"><div className="h-52 animate-pulse rounded-3xl bg-bg-hover" /><div className="mt-6 h-64 animate-pulse rounded-3xl bg-bg-hover" /></main>;

  return <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 text-text-primary sm:px-6 lg:pt-12">
    <header className="relative overflow-hidden rounded-[28px] border border-border bg-bg-surface p-6 sm:p-9">
      <div className="absolute -right-12 -top-16 size-64 rounded-full bg-primary/5 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-border bg-bg-base text-primary-strong dark:text-primary-soft"><FileCheck2 className="size-6" /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft"><BriefcaseBusiness className="size-4" /> StudyCod · Evidence Pack</div><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-4xl">{data.title}</h1>{data.specialization && <p className="mt-1 text-sm font-semibold text-primary-strong dark:text-primary-soft">{data.specialization}</p>}<p className="mt-2 text-sm leading-6 text-text-secondary">{copy("Власник надав доступ до цих вибраних матеріалів. Посилання автоматично завершиться:", "The owner shared access to these selected items. This link expires:")} <time dateTime={data.expiresAt} className="font-semibold text-text-primary">{new Date(data.expiresAt).toLocaleString(en ? "en-GB" : "uk-UA")}</time></p></div>
      </div>
      {data.profile && <div className="relative mt-6 border-t border-border pt-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-bg-base font-bold text-primary-strong dark:text-primary-soft">{data.profile.avatarUrl ? <img src={data.profile.avatarUrl} alt="" width={48} height={48} className="size-full object-cover" /> : data.profile.displayName.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><h2 className="text-xl font-bold">{data.profile.displayName}</h2>{data.profile.headline && <p className="mt-1 font-medium">{data.profile.headline}</p>}{data.profile.specialization && <p className="mt-1 text-sm text-text-secondary">{data.profile.specialization}</p>}{data.profile.summary && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{data.profile.summary}</p>}{!!data.profile.technologies.length && <div className="mt-3 flex flex-wrap gap-1.5" aria-label={copy("Технології профілю", "Profile technologies")}>{data.profile.technologies.map(technology => <span key={technology} className="rounded-lg border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-secondary">{technology}</span>)}</div>}<div className="mt-4 flex flex-wrap gap-2">{data.profile.githubUrl && <a href={data.profile.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-bg-hover"><Github className="size-3.5" /> GitHub <ExternalLink className="size-3" /></a>}{data.profile.websiteUrl && <a href={data.profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-bg-hover"><Globe2 className="size-3.5" />{copy("Сайт", "Website")}<ExternalLink className="size-3" /></a>}</div></div></div></div>}
    </header>

    {!!data.competencies.length && <section className="mt-8 rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-6" aria-labelledby="evidence-pack-competencies-title"><p className="text-xs font-bold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft">{copy("Фокус добірки", "Pack focus")}</p><h2 id="evidence-pack-competencies-title" className="mt-1 text-xl font-bold">{copy("Компетенції", "Competencies")}</h2><p className="mt-1 text-sm leading-6 text-text-secondary">{copy("Ці теги обрав кандидат, щоб показати фокус пакета. Вони не є сертифікацією рівня.", "The candidate selected these tags to describe the pack's focus. They do not certify proficiency.")}</p><div className="mt-3 flex flex-wrap gap-2">{data.competencies.map(skill => <span key={skill.id} className="rounded-xl border border-primary/20 bg-bg-surface px-3 py-2 text-sm font-semibold text-primary-strong dark:text-primary-soft">{en ? skill.labelEn : skill.labelUk}</span>)}</div></section>}

    {!!data.works.length && <section className="mt-8"><div className="border-b border-border/70 pb-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted">{copy("Вибрані матеріали", "Selected materials")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{copy("Практичні роботи", "Practical work")}</h2></div><div className="mt-4 space-y-3">{data.works.map(work => <article key={work.id} className="rounded-3xl border border-border bg-bg-surface p-5 sm:p-6"><h3 className="text-lg font-bold">{work.title}</h3>{work.role && <p className="mt-1 text-xs text-text-muted">{work.role}</p>}{work.problem && <div className="mt-4"><h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{copy("Проблема", "Problem")}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{work.problem}</p></div>}{work.solution && <div className="mt-3"><h4 className="text-xs font-bold uppercase tracking-wide text-text-muted">{copy("Рішення", "Solution")}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{work.solution}</p></div>}<div className="mt-3 flex flex-wrap gap-1.5">{work.technologies.map(item => <span key={item} className="rounded-lg border border-border bg-bg-base px-2.5 py-1.5 text-xs text-text-secondary">{item}</span>)}</div>{!!work.skillIds.length && <div className="mt-3 flex flex-wrap gap-1.5">{work.skillIds.map(id => { const skill = data.skills.find(candidate => candidate.id === id); return skill ? <span key={id} className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-primary-strong dark:text-primary-soft">{en ? skill.labelEn : skill.labelUk}</span> : null; })}</div>}<div className="mt-4 flex flex-wrap gap-2">{work.repositoryUrl && <a href={work.repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-bg-hover">{copy("Відкрити репозиторій", "Open repository")}<ArrowUpRight className="size-4" /></a>}{work.demoUrl && <a href={work.demoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-bg-hover">{copy("Демонстрація", "Demo")}<ArrowUpRight className="size-4" /></a>}{work.sourcePublicId && <Link to={`/portfolio/${encodeURIComponent(work.sourcePublicId)}`} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-primary/5 px-3 text-xs font-semibold text-primary-strong hover:bg-primary/10 dark:text-primary-soft">{copy("Результат StudyCod", "StudyCod result")}<ArrowUpRight className="size-4" /></Link>}</div></article>)}</div></section>}

    {!!data.evidence.length && <section className="mt-8"><div className="border-b border-border/70 pb-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted">{copy("Вибрані перевірені результати", "Selected verified results")}</p><h2 className="mt-1 text-2xl font-bold tracking-tight">{copy("Свідчення навичок", "Skill evidence")}</h2><p className="mt-1 text-sm text-text-secondary">{copy("StudyCod перевіряє походження кожного джерела. Теги обрав автор; вони не є оцінкою загального рівня.", "StudyCod checks each source record. The owner selected the skill tags; they do not certify overall proficiency.")}</p></div><div className="mt-4 grid gap-3 md:grid-cols-2">{data.evidence.map(item => <PortfolioEvidenceCard key={item.id} item={item} skills={data.skills} en={en} />)}</div></section>}

    <footer className="mt-10 flex items-center justify-center gap-2 border-t border-border/70 pt-5 text-xs text-text-muted"><BriefcaseBusiness className="size-3.5" /> StudyCod · {copy("Доступ лише до матеріалів, вибраних для цього пакета.", "Access is limited to materials selected for this pack.")}</footer>
  </main>;
};
