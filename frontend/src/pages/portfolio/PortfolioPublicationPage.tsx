import React from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPublicGrowthPortfolio } from "../../lib/api/portfolioProjects";
import type { GrowthFile } from "../../lib/api/portfolioProjects";

function localizedPortfolioBadge(badge: string, en: boolean): string {
  if (!en) return badge;
  const labels: Record<string, string> = {
    "Опубліковано автором": "Published by the author",
    "Додано з попереднього навчання": "Added from prior learning",
    "Автотести пройдено": "Automated tests passed",
    "Зміну вимог перевірено": "Requirement change checked",
    "Перенесення: автотести пройдено": "Transfer: automated tests passed",
    "Рецензія призначеного рецензента": "Appointed reviewer review",
    "Відгук запрошеного користувача": "Invited user feedback",
  };
  return labels[badge] ?? badge;
}

export const PortfolioPublicationPage: React.FC = () => {
  const { publicId = "" } = useParams();
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [publication, setPublication] = React.useState<Record<string, any> | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    const priorTitle = document.title;
    const metaTags = [
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex, nofollow" },
    ].map(({ name, content }) => {
      const meta = document.createElement("meta");
      meta.name = name;
      meta.content = content;
      document.head.append(meta);
      return meta;
    });
    return () => { metaTags.forEach(meta => meta.remove()); document.title = priorTitle; };
  }, []);
  React.useEffect(() => { void getPublicGrowthPortfolio(publicId).then(setPublication).catch(() => setNotFound(true)); }, [publicId]);
  React.useEffect(() => { if (publication?.title) document.title = publication.title + " · StudyCod"; }, [publication?.title]);

  if (notFound) return <main className="mx-auto max-w-3xl px-5 py-20 text-center"><h1 className="text-2xl font-bold">{en ? "Project unavailable" : "Роботу не знайдено"}</h1><p className="mt-3 text-text-secondary">{en ? "The link is invalid or the author revoked access." : "Посилання недійсне або автор відкликав доступ."}</p></main>;
  if (!publication) return <main className="mx-auto max-w-3xl px-5 py-20 text-text-secondary">{en ? "Loading portfolio…" : "Завантаження портфоліо…"}</main>;
  return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6"><header className="rounded-3xl border border-border bg-bg-surface p-6 sm:p-9"><div className="text-xs font-bold uppercase tracking-[.16em] text-primary-soft">StudyCod · {en ? "Portfolio" : "Портфоліо"}</div><h1 className="mt-3 text-3xl font-bold">{publication.title}</h1><p className="mt-3 text-sm text-text-secondary">{publication.author.displayName || publication.author.username} · {publication.runtime} · {publication.stage}</p><p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-text-secondary">{publication.description}</p><div className="mt-5 flex flex-wrap gap-2">{publication.badges.map((badge: string) => <span key={badge} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary-soft">{localizedPortfolioBadge(badge, en)}</span>)}</div></header>
    <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="overflow-hidden rounded-2xl border border-border bg-[#101713]"><div className="border-b border-white/10 px-4 py-3 font-mono text-xs text-white/60">{publication.files?.[0]?.path}</div><pre className="max-h-[560px] overflow-auto p-5 text-xs leading-6 text-[#e5f1e8]"><code>{publication.files?.[0]?.content}</code></pre></div><aside className="space-y-4"><section className="rounded-2xl border border-border bg-bg-surface p-5"><h2 className="font-bold">{en ? "Author's reasoning" : "Рішення автора"}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{publication.explanation}</p></section>{publication.demo && <section className="rounded-2xl border border-border bg-bg-surface p-5"><h2 className="font-bold">{en ? "Demonstration" : "Демонстрація"}</h2><div className="mt-3 text-xs font-semibold">{en ? "Input" : "Ввід"}</div><pre className="mt-1 overflow-auto rounded-lg bg-bg-base p-3 font-mono text-xs">{publication.demo.input}</pre><div className="mt-3 text-xs font-semibold">{en ? "Output" : "Вивід"}</div><pre className="mt-1 overflow-auto rounded-lg bg-bg-base p-3 font-mono text-xs">{publication.demo.output}</pre></section>}</aside></section>
    {publication.files?.length > 1 && <section className="mt-5 rounded-2xl border border-border bg-bg-surface p-5"><h2 className="font-bold">{en ? "Project files" : "Файли проєкту"}</h2><div className="mt-3 space-y-3">{publication.files.slice(1).map((item: GrowthFile) => <details key={item.path}><summary className="cursor-pointer text-sm font-semibold">{item.path}</summary><pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-[#101713] p-4 text-xs leading-6 text-[#e5f1e8]">{item.content}</pre></details>)}</div></section>}
    {!!publication.reviews?.length && <section className="mt-5 rounded-2xl border border-border bg-bg-surface p-5"><h2 className="font-bold">{en ? "Reviewer feedback" : "Відгуки рецензентів"}</h2>{publication.reviews.map((review: any, index: number) => <article key={index} className="mt-4 border-t border-border pt-4"><p className="text-sm font-semibold">{review.reviewerName ?? (review.kind === "OFFICIAL" ? (en ? "Appointed reviewer" : "Рецензія призначеного рецензента") : (en ? "Invited reviewer" : "Відгук запрошеного користувача"))}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{review.comment}</p><p className="mt-2 text-xs text-text-muted">{review.scores?.join(" · ")}</p></article>)}</section>}
    <footer className="mt-8 text-center text-xs text-text-muted">{en ? "Code is shown as text. The portfolio page does not run it." : "Код відображається як текст; сторінка портфоліо не запускає програму."}</footer>
  </main>;
};
