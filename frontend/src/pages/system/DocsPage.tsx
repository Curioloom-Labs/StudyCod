import React, { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { showToast } from "../../lib/toast";
import { MarkdownView } from "../../components/MarkdownView";
import { getDocsSections, type DocsAudience, type DocsSectionId } from "../../content/docs";
import { ArrowLeft, BookOpen, Search, Sparkles } from "lucide-react";
import { OnboardingOverlay } from "../../components/onboarding/OnboardingOverlay";
import { fadeUpItem, easeOutQuint } from "../../lib/motion";
import { DocsExperience } from "./DocsExperience";

export const DocsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const isAurora = useUIMode().mode === "aurora";
  const [searchParams] = useSearchParams();
  const { "*": docsPath = "" } = useParams();
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<DocsAudience>("ALL");
  const [showTour, setShowTour] = useState(false);
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const tx = (uk: string, en: string) => isEn ? en : uk;
  const routeId = docsPath.split("/").filter(Boolean)[0] as DocsSectionId | undefined;
  const legacyId = searchParams.get("id") as DocsSectionId | null;
  const selectedId = routeId || legacyId || "welcome";
  const sections = useMemo(() => getDocsSections(i18n.language), [i18n.language]);
  const openSection = (id: DocsSectionId) => navigate(`/docs/${id}`);

  const newbieTracks = useMemo(() => [
    {
      title: tx("Я учень", "I'm a student"),
      buttons: [
        { id: "getting-started" as DocsSectionId, label: tx("1) Перші кроки", "1) First steps") },
        { id: "edu-student" as DocsSectionId, label: tx("2) Як проходити тему", "2) How to do topics") },
        { id: "edu-controlworks" as DocsSectionId, label: tx("3) Як проходити контрольну", "3) How control works") },
        { id: "edu-gradebook" as DocsSectionId, label: tx("4) Де дивитися оцінки", "4) Where to see grades") },
      ]
    },
    {
      title: tx("Я вчитель", "I'm a teacher"),
      buttons: [
        { id: "getting-started" as DocsSectionId, label: tx("1) Старт налаштування", "1) Setup start") },
        { id: "edu-teacher" as DocsSectionId, label: tx("2) Повний робочий цикл", "2) Full workflow") },
        { id: "edu-topics" as DocsSectionId, label: tx("3) Як вести теми", "3) Managing topics") },
        { id: "edu-gradebook" as DocsSectionId, label: tx("4) Як ставити оцінки", "4) Grading in gradebook") },
      ]
    },
    {
      title: tx("Я в Personal", "I'm in Personal mode"),
      buttons: [
        { id: "getting-started" as DocsSectionId, label: tx("1) Перші кроки", "1) First steps") },
        { id: "personal" as DocsSectionId, label: tx("2) Як працює Personal", "2) How Personal works") },
        { id: "personal-tasks" as DocsSectionId, label: tx("3) Ефективний сценарій", "3) Effective workflow") },
        { id: "profile-progress-model" as DocsSectionId, label: tx("4) Як читати прогрес", "4) How to read progress") },
      ]
    },
  ], [isEn]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.filter(s => {
      const audienceOk = audience === "ALL" ? true : s.audience === "ALL" || s.audience === audience;
      if (!audienceOk) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || s.tags.some(tag => tag.toLowerCase().includes(q)) || s.content.toLowerCase().includes(q);
    });
  }, [query, audience, sections]);

  const selected = useMemo(() => sections.find(s => s.id === selectedId) || sections[0], [selectedId, sections]);

  return <>
    <DocsExperience
      tr={tx}
      query={query}
      audience={audience}
      sections={sections}
      filtered={filtered}
      selected={selected}
      isDetail={Boolean(routeId || legacyId)}
      setQuery={setQuery}
      setAudience={setAudience}
      openSection={openSection}
      onBack={() => navigate("/docs")}
      onTour={() => setShowTour(true)}
      onCopyLink={() => {
        navigator.clipboard?.writeText(`${window.location.origin}/docs/${selected.id}`);
        showToast({ type: "success", message: t("linkCopied") });
      }}
    />
    <OnboardingOverlay open={showTour} onClose={() => setShowTour(false)} mode="auto" persist={false} />
  </>;

  return (
    <div className="min-h-full bg-bg-base text-text-primary flex flex-col">
      {/* Header */}
      <motion.header
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutQuint }}
        className="min-h-14 border-b border-border bg-bg-surface flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 md:px-6 py-2 shrink-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate("/"); }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("back")}
          </Button>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-mono text-text-primary">StudyCod Wiki</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowTour(true)}>
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          {t("onboardingQuickTour")}
        </Button>
      </motion.header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr]">
          {/* Sidebar */}
          <div className="border-b lg:border-b-0 lg:border-r border-border bg-bg-surface/30 p-3 sm:p-4 space-y-3">
            {/* Audience filter */}
            <div>
              <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-2">{t("filter")}</div>
              <div className="flex gap-1.5">
                {(["ALL", "EDU", "PERSONAL"] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => setAudience(a)}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-mono border transition-fast ${
                      audience === a
                        ? "border-primary/40 bg-bg-hover text-text-primary"
                        : "border-border text-text-secondary hover:text-text-primary hover:border-primary/20"
                    }`}
                  >
                    {a === "ALL" ? t("all") : a}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-code px-3 py-2 focus-within:border-primary transition-fast">
              <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="flex-1 bg-transparent outline-none text-sm font-mono text-text-primary placeholder:text-text-muted"
              />
            </div>

            {/* Newbie tracks */}
            <div className="rounded-xl border border-border bg-bg-surface p-3">
              <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted mb-1">{tx("Режим новачка", "Newbie mode")}</div>
              <div className="text-[11px] text-text-secondary mb-3">{tx("Обери свій сценарій і переходь 1 → 2 → 3 → 4.", "Pick your scenario and follow 1 → 2 → 3 → 4.")}</div>
              <div className="space-y-2.5">
                {newbieTracks.map(track => (
                  <div key={track.title}>
                    <div className="text-[11px] font-mono font-medium text-text-primary mb-1.5">{track.title}</div>
                    <div className="grid grid-cols-1 gap-1">
                      {track.buttons.map(btn => (
                        <button
                          key={`${track.title}-${btn.id}`}
                          onClick={() => openSection(btn.id)}
                          className="text-left rounded-md px-2 py-1.5 text-[11px] font-mono border border-border/60 text-text-secondary hover:text-text-primary hover:bg-bg-hover hover:border-primary/30 transition-fast"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section list */}
            <div className="space-y-1">
              {filtered.map(s => (
                <button
                  key={s.id}
                  onClick={() => openSection(s.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition-fast ${
                    selectedId === s.id
                      ? "border-primary/40 bg-bg-hover text-text-primary"
                      : "border-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary hover:border-border"
                  }`}
                >
                  <div className="text-sm font-mono text-text-primary truncate">{s.title}</div>
                  <div className="text-[10px] font-mono text-text-muted mt-0.5">
                    {s.audience === "ALL" ? "ALL" : s.audience}
                    {s.tags.length ? ` · ${s.tags.slice(0, 3).join(", ")}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Content area */}
          <div className="p-3 sm:p-4 md:p-6">
            <motion.div
              key={selected?.id}
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: easeOutQuint }}
              className="rounded-xl border border-border bg-bg-surface p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  {isAurora ? (
                    <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-muted">{selected?.audience}</span>
                  ) : (
                    <span className="font-mono text-xs text-primary/70">// {selected?.audience?.toLowerCase()}</span>
                  )}
                  <h2 className={`mt-1 font-semibold text-text-primary ${isAurora ? "text-2xl md:text-3xl tracking-[-0.01em]" : "text-2xl tracking-tight"}`}>{selected?.title}</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?id=${selected?.id}`);
                    showToast({ type: "success", message: t("linkCopied") });
                  }}
                >
                  {t("copyLink")}
                </Button>
              </div>

              <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent mb-5" />

              <div className="prose-like">
                <MarkdownView content={selected?.content ?? ""} />
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <OnboardingOverlay open={showTour} onClose={() => setShowTour(false)} mode="auto" persist={false} />
    </div>
  );
};
