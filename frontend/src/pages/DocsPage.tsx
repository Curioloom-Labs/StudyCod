import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { MarkdownView } from "../components/MarkdownView";
import { getDocsSections, type DocsAudience, type DocsSectionId } from "../content/docs";
import { ArrowLeft, BookOpen, Search, Sparkles } from "lucide-react";
import { OnboardingOverlay } from "../components/onboarding/OnboardingOverlay";
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
  const selectedId = searchParams.get("id") as DocsSectionId | null || "welcome";
  const sections = useMemo(() => getDocsSections(i18n.language), [i18n.language]);
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
      <header className="h-16 border-b border-border bg-bg-surface flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => {
          if (window.history.length > 1) navigate(-1);else navigate("/");
        }}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("back")}
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <div className="text-lg font-mono text-text-primary">Docs / Wiki</div>
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
        <div className="grid grid-cols-[360px,1fr]">
          {}
          <div className="border-r border-border bg-bg-surface/40 p-4">
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

            <div className="space-y-2">
              {filtered.map(s => <button key={s.id} onClick={() => setSearchParams({
              id: s.id
            }, {
              replace: true
            })} className={`w-full text-left p-3 border transition-fast ${selectedId === s.id ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover"}`}>
                  <div className="text-sm font-mono text-text-primary">{s.title}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {s.audience === "ALL" ? "ALL" : s.audience}
                    {s.tags.length ? ` · ${s.tags.slice(0, 3).join(", ")}` : ""}
                  </div>
                </button>)}
            </div>
          </div>

          {}
          <div className="p-6">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="text-xl font-mono text-text-primary">{selected.title}</div>
                  <div className="text-xs text-text-muted mt-1">
                    {selected.audience} · {selected.id}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?id=${selected.id}`);
                alert(t("linkCopied"));
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