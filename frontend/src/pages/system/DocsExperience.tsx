import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  GraduationCap,
  Search,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import type { DocsAudience, DocsSection, DocsSectionId } from "../../content/docs";
import { MarkdownView } from "../../components/MarkdownView";
import { PublicProductNav } from "../../components/layout/PublicProductNav";

type Translate = (uk: string, en: string) => string;

type Props = {
  tr: Translate;
  query: string;
  audience: DocsAudience;
  sections: DocsSection[];
  filtered: DocsSection[];
  selected: DocsSection;
  isDetail: boolean;
  setQuery: (value: string) => void;
  setAudience: (value: DocsAudience) => void;
  openSection: (id: DocsSectionId) => void;
  onBack: () => void;
  onCopyLink: () => void;
  onTour: () => void;
};

const surface = "border border-[#122017]/10 bg-white dark:border-white/10 dark:bg-[#151c17]";

const sectionDescription = (content: string) => {
  const lines = content.split("\n").map(line => line.trim()).filter(Boolean);
  const paragraph = lines.find(line =>
    !line.startsWith("#") &&
    !line.startsWith("!") &&
    !line.startsWith("|") &&
    !line.startsWith("-") &&
    !/^\d+[.)]/.test(line) &&
    !line.startsWith(">")
  );
  return (paragraph || "").replace(/[*_`]/g, "");
};

const audienceLabel = (audience: DocsAudience, tr: Translate) => {
  if (audience === "EDU") return "EDU";
  if (audience === "PERSONAL") return "Personal";
  return tr("Для всіх", "For everyone");
};

export const DocsExperience: React.FC<Props> = ({
  tr,
  query,
  audience,
  sections,
  filtered,
  selected,
  isDetail,
  setQuery,
  setAudience,
  openSection,
  onBack,
  onCopyLink,
  onTour,
}) => {
  const reduceMotion = useReducedMotion();
  const open = (id: DocsSectionId) => openSection(id);

  if (isDetail) {
    const sameAudience = sections.filter(section =>
      section.id !== selected.id &&
      (selected.audience === "ALL" ? section.audience === "ALL" : section.audience === selected.audience || section.audience === "ALL")
    ).slice(0, 7);
    const currentIndex = sections.findIndex(section => section.id === selected.id);
    const next = sections[(currentIndex + 1) % sections.length];

    return <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <PublicProductNav active="docs" />
      <main className="mx-auto w-[min(1180px,calc(100%_-_32px))] py-8 sm:py-12">
        <button type="button" onClick={onBack} className="group inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#122017]/10 bg-white px-4 text-[12px] font-bold text-[#667169] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#151c17] dark:text-[#aab5ad]">
          <ArrowLeft className="size-4 transition group-hover:-translate-x-0.5" />
          {tr("До всіх інструкцій", "Back to all guides")}
        </button>

        <div className="mt-7 grid items-start gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="sticky top-24 hidden rounded-[22px] border border-[#122017]/10 bg-white p-4 lg:block dark:border-white/10 dark:bg-[#151c17]">
            <div className="px-2 pb-3">
              <span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#62ecaa]">{audienceLabel(selected.audience, tr)}</span>
              <p className="mt-2 text-[12px] leading-5 text-[#748078] dark:text-[#96a299]">{tr("Продовжити за темою", "Continue this topic")}</p>
            </div>
            <nav className="space-y-1">
              {sameAudience.map(section => <button type="button" key={section.id} onClick={() => open(section.id)} className="w-full rounded-[13px] px-3 py-2.5 text-left text-[12px] font-semibold leading-[1.45] text-[#657269] transition hover:bg-[#f0f3ef] hover:text-[#111814] dark:text-[#9da9a1] dark:hover:bg-white/[.05] dark:hover:text-white">{section.title}</button>)}
            </nav>
          </aside>

          <motion.article
            key={selected.id}
            initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[28px] border border-[#122017]/10 bg-white shadow-[0_24px_80px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111713] dark:shadow-[0_24px_80px_rgba(0,0,0,.22)]"
          >
            <header className="border-b border-[#122017]/10 px-[clamp(24px,6vw,72px)] py-[clamp(44px,7vw,76px)] dark:border-white/10">
              <div className="flex items-start justify-between gap-5">
                <div className="max-w-[700px]">
                  <span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#62ecaa]">{audienceLabel(selected.audience, tr)} · {tr("Практичний гайд", "Practical guide")}</span>
                  <h1 className="mt-5 text-balance text-[clamp(36px,5vw,58px)] font-extrabold leading-[1.03] tracking-[-.055em]">{selected.title}</h1>
                  <p className="mt-6 max-w-[650px] text-[16px] leading-7 text-[#657269] dark:text-[#a7b2aa]">{sectionDescription(selected.content)}</p>
                  <div className="mt-6 flex flex-wrap gap-2">{selected.tags.slice(0, 4).map(tag => <span key={tag} className="rounded-full bg-[#eef2ed] px-3 py-1.5 text-[10px] font-semibold text-[#718078] dark:bg-white/[.06] dark:text-[#9da9a1]">{tag}</span>)}</div>
                </div>
                <button type="button" onClick={onCopyLink} className="grid size-11 shrink-0 place-items-center rounded-[14px] border border-[#122017]/10 text-[#667169] transition hover:bg-[#f1f4f0] dark:border-white/10 dark:text-[#9da9a1] dark:hover:bg-white/5" title={tr("Копіювати посилання", "Copy link")}><Copy className="size-4" /></button>
              </div>
            </header>

            <div className="px-[clamp(24px,6vw,72px)] py-[clamp(42px,6vw,72px)]">
              <MarkdownView content={selected.content} variant="handbook" />
            </div>

            <footer className="border-t border-[#122017]/10 bg-[#f8faf7] p-[clamp(24px,4vw,42px)] dark:border-white/10 dark:bg-[#0e1410]">
              <button type="button" onClick={() => open(next.id)} className="group flex w-full items-center justify-between gap-6 rounded-[20px] border border-[#122017]/10 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#151c17]">
                <span><span className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#62ecaa]">{tr("Наступний гайд", "Next guide")}</span><strong className="mt-2 block text-[16px] leading-5">{next.title}</strong></span>
                <ArrowRight className="size-5 shrink-0 text-[#809087] transition group-hover:translate-x-1 group-hover:text-[#00a85c]" />
              </button>
            </footer>
          </motion.article>
        </div>
      </main>
    </div>;
  }

  const tracks = [
    {
      Icon: GraduationCap,
      label: tr("Учень", "Student"),
      title: tr("Від першого уроку до зрозумілої оцінки", "From the first lesson to a clear grade"),
      description: tr("Уроки, практика, контрольні та журнал — у правильному порядку.", "Lessons, practice, control works, and gradebook in the right order."),
      steps: [tr("Знайти урок", "Find a lesson"), tr("Виконати роботу", "Complete work"), tr("Перевірити результат", "Review result")],
      target: "edu-student" as DocsSectionId,
      accent: "bg-[#00ff88]/12 text-[#00884a] dark:text-[#62ecaa]",
    },
    {
      Icon: Users,
      label: tr("Викладач", "Teacher"),
      title: tr("Організувати клас і навчальний ритм", "Organize a class and its learning rhythm"),
      description: tr("Класи, курси, live-уроки, журнал і аналітика в одному маршруті.", "Classes, courses, live lessons, gradebook, and analytics in one path."),
      steps: [tr("Підготувати клас", "Prepare a class"), tr("Призначити матеріал", "Assign material"), tr("Оцінити прогрес", "Assess progress")],
      target: "edu-teacher" as DocsSectionId,
      accent: "bg-[#ff8c00]/12 text-[#b96300] dark:text-[#ffad4a]",
    },
    {
      Icon: UserRound,
      label: "Personal",
      title: tr("Побудувати власний маршрут практики", "Build your own practice path"),
      description: tr("Бібліотека, редактор, пісочниця й прогрес без прив’язки до класу.", "Library, editor, playground, and progress without a class."),
      steps: [tr("Обрати тему", "Choose a topic"), tr("Розв’язати задачу", "Solve a task"), tr("Побачити прогрес", "See progress")],
      target: "personal" as DocsSectionId,
      accent: "bg-[#ffd93d]/20 text-[#8b6b00] dark:text-[#ffe36c]",
    },
  ];

  return <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0b100d] dark:text-[#edf3ef]">
    <PublicProductNav active="docs" />
    <main>
      <section className="mx-auto w-[min(1180px,calc(100%_-_32px))] pt-8">
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[32px] bg-[#101713] px-[clamp(24px,6vw,78px)] py-[clamp(54px,8vw,92px)] text-white shadow-[0_36px_90px_rgba(12,25,17,.16)]"
        >
          <div className="absolute -right-32 -top-44 size-[440px] rounded-full bg-[#00ff88]/10 blur-[95px]" />
          <div className="absolute -bottom-48 left-1/4 size-[380px] rounded-full bg-[#ff8c00]/10 blur-[110px]" />
          <div className="relative max-w-[790px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[12px] font-semibold text-[#b9c3bc]">
              <BookOpen className="size-4 text-[#62efaa]" />
              StudyCod Handbook · {sections.length} {tr("гайдів", "guides")}
            </span>
            <h1 className="mt-7 text-balance text-[clamp(43px,6vw,72px)] font-bold leading-[.98] tracking-[-.055em]">
              {tr("Усе про StudyCod — зрозуміло й по суті.", "Everything about StudyCod, clearly explained.")}
            </h1>
            <p className="mt-6 max-w-[650px] text-[17px] leading-7 text-[#aab5ad]">
              {tr("Актуальні інструкції для практики, навчання в класі та викладання. З точними станами інтерфейсу, схемами й покроковими сценаріями.", "Current guidance for practice, classroom learning, and teaching—with precise interface states, diagrams, and step-by-step workflows.")}
            </p>
            <label className="mt-9 flex max-w-[660px] items-center gap-3 rounded-[18px] border border-white/10 bg-white/[.075] p-2 backdrop-blur">
              <Search className="ml-3 size-5 text-[#7f8d84]" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={tr("Знайти функцію, дію або проблему…", "Find a feature, action, or issue…")}
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#78867d]"
              />
              {query && <span className="mr-2 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-[#c6d0c9]">{filtered.length}</span>}
            </label>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto w-[min(1080px,calc(100%_-_32px))] py-20">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#62ecaa]">{tr("Швидкий старт", "Quick start")}</span>
            <h2 className="mt-2 text-[clamp(30px,4vw,40px)] font-bold tracking-[-.045em]">{tr("Оберіть свій сценарій", "Choose your workflow")}</h2>
          </div>
          <button type="button" onClick={onTour} className="flex h-11 items-center gap-2 rounded-[14px] border border-[#122017]/10 bg-white px-4 text-[12px] font-bold text-[#667169] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#151c17] dark:text-[#aab5ad]">
            <Sparkles className="size-4 text-[#00a85c]" />{tr("Тур інтерфейсом", "Interface tour")}
          </button>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3 max-md:grid-cols-1">
          {tracks.map(({ Icon, label, title, description, steps, target, accent }) => <button type="button" key={label} onClick={() => open(target)} className={`${surface} group rounded-[24px] p-6 text-left shadow-[0_16px_45px_rgba(18,32,23,.045)] transition hover:-translate-y-1 dark:shadow-[0_16px_45px_rgba(0,0,0,.16)]`}>
            <span className={`grid size-11 place-items-center rounded-[14px] ${accent}`}><Icon className="size-5" /></span>
            <span className="mt-7 block text-[11px] font-extrabold uppercase tracking-[.12em] text-[#7a867e]">{label}</span>
            <h3 className="mt-2 text-[19px] font-bold leading-[1.22] tracking-[-.035em]">{title}</h3>
            <p className="mt-3 min-h-[48px] text-[13px] leading-5 text-[#718078] dark:text-[#9da9a1]">{description}</p>
            <div className="mt-6 space-y-2.5">{steps.map(step => <span key={step} className="flex items-center gap-2 text-[12px] text-[#68746c] dark:text-[#a0aba3]"><Check className="size-4 rounded-full bg-[#00ff88] p-0.5 text-[#062315]" />{step}</span>)}</div>
            <span className="mt-7 flex items-center gap-1 text-[11px] font-bold text-[#00884a] transition group-hover:gap-2 dark:text-[#62ecaa]">{tr("Відкрити гайд", "Open guide")}<ArrowRight className="size-3.5" /></span>
          </button>)}
        </div>

        <div className="mt-20 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[#00884a] dark:text-[#62ecaa]">{tr("Бібліотека знань", "Knowledge library")}</span>
            <h2 className="mt-2 text-[clamp(30px,4vw,40px)] font-bold tracking-[-.045em]">{query ? tr("Результати пошуку", "Search results") : tr("Усі інструкції", "All guides")}</h2>
            <p className="mt-2 text-[14px] text-[#718078] dark:text-[#9da9a1]">{filtered.length} {tr("матеріалів у вибраному розділі", "articles in the selected view")}</p>
          </div>
          <div className="flex gap-1 rounded-2xl border border-[#122017]/10 bg-white p-1 dark:border-white/10 dark:bg-[#151c17]">
            {(["ALL", "EDU", "PERSONAL"] as DocsAudience[]).map(value => <button type="button" key={value} onClick={() => setAudience(value)} className={`rounded-xl px-4 py-2.5 text-[11px] font-extrabold transition ${audience === value ? "bg-[#111814] text-white dark:bg-[#edf3ef] dark:text-[#111814]" : "text-[#718078] hover:text-[#111814] dark:text-[#8e9a92] dark:hover:text-white"}`}>{value === "ALL" ? tr("Усі", "All") : value === "PERSONAL" ? "Personal" : "EDU"}</button>)}
          </div>
        </div>

        {filtered.length ? <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(section => {
            const active = selected.id === section.id;
            return <button type="button" key={section.id} onClick={() => open(section.id)} className={`${surface} group min-h-[196px] rounded-[21px] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#00b963]/30 ${active ? "ring-2 ring-[#00b963]/20" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-lg bg-[#edf0eb] px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-[.08em] text-[#667169] dark:bg-[#202821] dark:text-[#a0aba3]">{audienceLabel(section.audience, tr)}</span>
                <ArrowRight className="size-4 text-[#9aa59d] transition group-hover:translate-x-1 group-hover:text-[#00a85c]" />
              </div>
              <h3 className="mt-6 line-clamp-2 text-[16px] font-bold leading-5 tracking-[-.025em]">{section.title}</h3>
              <p className="mt-3 line-clamp-2 text-[12px] leading-[1.55] text-[#748078] dark:text-[#96a299]">{sectionDescription(section.content)}</p>
              <p className="mt-4 line-clamp-1 text-[10px] text-[#89948d]">{section.tags.slice(0, 3).join(" · ")}</p>
            </button>;
          })}
        </div> : <div className={`${surface} mt-7 rounded-[24px] px-6 py-14 text-center`}><Search className="mx-auto size-6 text-[#8d9991]" /><h3 className="mt-4 text-[18px] font-bold">{tr("Нічого не знайдено", "No guides found")}</h3><p className="mt-2 text-[13px] text-[#718078]">{tr("Спробуйте коротший запит або змініть фільтр.", "Try a shorter query or change the filter.")}</p></div>}
      </section>

    </main>
  </div>;
};

export default DocsExperience;
