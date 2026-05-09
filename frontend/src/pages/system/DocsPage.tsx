import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { showToast } from "../../lib/toast";
import { MarkdownView } from "../../components/MarkdownView";
import { getDocsSections, type DocsAudience, type DocsSectionId } from "../../content/docs";
import { ArrowLeft, BookOpen, Search, Sparkles } from "lucide-react";
import { OnboardingOverlay } from "../../components/onboarding/OnboardingOverlay";
export const DocsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    t,
    i18n
  } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<DocsAudience>("ALL");
  const [showTour, setShowTour] = useState(false);
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const tx = (uk: string, en: string) => isEn ? en : uk;
  const selectedId = searchParams.get("id") as DocsSectionId | null || "welcome";
  const sections = useMemo(() => getDocsSections(i18n.language), [i18n.language]);
  const openSection = (id: DocsSectionId) => setSearchParams({
    id
  }, {
    replace: true
  });
  const newbieTracks = useMemo(() => [{
    title: tx("Я учень", "I'm a student"),
    buttons: [{
      id: "getting-started" as DocsSectionId,
      label: tx("1) Перші кроки", "1) First steps")
    }, {
      id: "edu-student" as DocsSectionId,
      label: tx("2) Як проходити тему", "2) How to do topics")
    }, {
      id: "edu-controlworks" as DocsSectionId,
      label: tx("3) Як проходити контрольну", "3) How control works")
    }, {
      id: "edu-gradebook" as DocsSectionId,
      label: tx("4) Де дивитися оцінки", "4) Where to see grades")
    }]
  }, {
    title: tx("Я вчитель", "I'm a teacher"),
    buttons: [{
      id: "getting-started" as DocsSectionId,
      label: tx("1) Старт налаштування", "1) Setup start")
    }, {
      id: "edu-teacher" as DocsSectionId,
      label: tx("2) Повний робочий цикл", "2) Full workflow")
    }, {
      id: "edu-topics" as DocsSectionId,
      label: tx("3) Як вести теми", "3) Managing topics")
    }, {
      id: "edu-gradebook" as DocsSectionId,
      label: tx("4) Як ставити оцінки", "4) Grading in gradebook")
    }]
  }, {
    title: tx("Я в Personal", "I'm in Personal mode"),
    buttons: [{
      id: "getting-started" as DocsSectionId,
      label: tx("1) Перші кроки", "1) First steps")
    }, {
      id: "personal" as DocsSectionId,
      label: tx("2) Як працює Personal", "2) How Personal works")
    }, {
      id: "personal-tasks" as DocsSectionId,
      label: tx("3) Ефективний сценарій", "3) Effective workflow")
    }, {
      id: "profile-progress-model" as DocsSectionId,
      label: tx("4) Як читати прогрес", "4) How to read progress")
    }]
  }], [isEn]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.filter(s => {
      const audienceOk = audience === "ALL" ? true : s.audience === "ALL" || s.audience === audience;
      if (!audienceOk) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q)) || s.content.toLowerCase().includes(q);
    });
  }, [query, audience, sections]);
  const selected = useMemo(() => {
    return sections.find(s => s.id === selectedId) || sections[0];
  }, [selectedId, sections]);
  return <div className="min-h-[100dvh] bg-bg-base text-text-primary flex flex-col">
      <header className="min-h-16 border-b border-border bg-bg-surface flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 md:px-6 py-2 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" onClick={() => {
          if (window.history.length > 1) navigate(-1);else navigate("/");
        }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("back")}
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-primary" />
            <div className="text-lg font-mono text-text-primary">StudyCod Wiki</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowTour(true)}>
            <Sparkles className="w-4 h-4 mr-2" />
            {t("onboardingQuickTour")}
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr]">
          {}
          <div className="border-b lg:border-b-0 lg:border-r border-border bg-bg-surface/40 p-3 sm:p-4">
            <Card className="p-3 mb-3">
              <div className="text-sm font-mono text-text-primary mb-2">{t("filter")}</div>
              <div className="flex gap-2 mb-3">
                {(["ALL", "EDU", "PERSONAL"] as const).map(a => <button key={a} onClick={() => setAudience(a)} className={`px-3 py-1 text-xs font-mono border transition-fast ${audience === a ? "border-primary bg-bg-hover text-text-primary" : "border-border text-text-secondary hover:text-text-primary"}`}>
                    {a === "ALL" ? t("all") : a}
                  </button>)}
              </div>

              <div className="flex items-center gap-2 border border-border bg-bg-base px-3 py-2">
                <Search className="w-4 h-4 text-text-muted" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} className="flex-1 bg-transparent outline-none text-sm font-mono text-text-primary" />
              </div>
            </Card>

            <Card className="p-3 mb-3 border border-border">
              <div className="text-sm font-mono text-text-primary mb-1">{tx("Режим новачка", "Newbie mode")}</div>
              <div className="text-xs text-text-secondary mb-3">{tx("Обери свій сценарій і переходь по кнопках 1 → 2 → 3 → 4.", "Pick your scenario and follow buttons 1 → 2 → 3 → 4.")}</div>

              <div className="space-y-3">
                {newbieTracks.map(track => <div key={track.title} className="border border-border/70 bg-bg-base/80 p-2.5">
                    <div className="text-xs font-mono text-text-primary mb-2">{track.title}</div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {track.buttons.map(btn => <button key={`${track.title}-${btn.id}`} onClick={() => openSection(btn.id)} className="text-left px-2 py-1.5 text-xs font-mono border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast">
                          {btn.label}
                        </button>)}
                    </div>
                  </div>)}
              </div>
            </Card>

            <div className="space-y-2">
              {filtered.map(s => <button key={s.id} onClick={() => openSection(s.id)} className={`w-full text-left p-3 border transition-fast ${selectedId === s.id ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover"}`}>
                  <div className="text-sm font-mono text-text-primary">{s.title}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {s.audience === "ALL" ? "ALL" : s.audience}
                    {s.tags.length ? ` · ${s.tags.slice(0, 3).join(", ")}` : ""}
                  </div>
                </button>)}
            </div>
          </div>

          {}
          <div className="p-3 sm:p-4 md:p-6">
            <Card className="p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-xl font-mono text-text-primary">{selected.title}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {selected.audience}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?id=${selected.id}`);
                showToast({ type: "success", message: t("linkCopied") });
              }}>
                  {t("copyLink")}
                </Button>
              </div>

              <MarkdownView content={selected.content} />
            </Card>
          </div>
        </div>
      </main>

      {}
      <OnboardingOverlay open={showTour} onClose={() => setShowTour(false)} mode="auto" persist={false} />
    </div>;
};
