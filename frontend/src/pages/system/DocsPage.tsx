import React, { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { showToast } from "../../lib/toast";
import { getDocsSections, type DocsAudience, type DocsSectionId } from "../../content/docs";
import { OnboardingOverlay } from "../../components/onboarding/OnboardingOverlay";
import { DocsExperience } from "./DocsExperience";

export const DocsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
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
};
