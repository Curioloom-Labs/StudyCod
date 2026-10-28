import React from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BadgeCheck, BriefcaseBusiness, Check, Copy, ExternalLink, Eye, FileCheck2, FolderKanban, Globe2, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  archivePortfolioWork,
  archivePortfolioEvidence,
  createPortfolioEvidencePack,
  savePortfolioBirthDate,
  removePortfolioBirthYear,
  createPortfolioEvidence,
  createPortfolioWork,
  getPortfolioDashboard,
  reorderPortfolioEvidence,
  reorderPortfolioWorks,
  savePortfolioProfile,
  updatePortfolioWork,
  updatePortfolioEvidence,
  revokePortfolioEvidencePack,
  type PortfolioDashboard,
  type PortfolioEvidence,
  type PortfolioEvidenceInput,
  type PortfolioEvidenceSource,
  type PortfolioEvidenceSourceType,
  type PortfolioProfile,
  type PortfolioWork,
  type PortfolioWorkInput,
} from "../../lib/api/portfolio";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { localizePortfolioEvidenceDetail } from "./PortfolioEvidenceCard";

const emptyProfile: PortfolioProfile = {
  displayName: "", headline: "", specialization: "", technologies: [], summary: "", githubUrl: null, websiteUrl: null, shareAvatar: false, visibility: "PRIVATE",
};
const blankWork = (): PortfolioWorkInput => ({
  title: "", problem: "", solution: "", role: "", technologies: [], skillIds: [], repositoryUrl: null, demoUrl: null,
  sourcePublicationId: null, visibility: "PRIVATE",
});
const groupPortfolioSkills = (skills: PortfolioDashboard["skills"]) => {
  const groups = new Map<string, { id: string; labelUk: string; labelEn: string; skills: PortfolioDashboard["skills"] }>();
  for (const skill of skills) {
    let group = groups.get(skill.categoryId);
    if (!group) {
      group = { id: skill.categoryId, labelUk: skill.categoryUk, labelEn: skill.categoryEn, skills: [] };
      groups.set(skill.categoryId, group);
    }
    group.skills.push(skill);
  }
  return [...groups.values()];
};
const tokenizePortfolioTerms = (value: string) => value.toLocaleLowerCase().match(/[\p{L}\p{N}+#.]+/gu) ?? [];
const evidenceSourceLabel = (type: PortfolioEvidenceSourceType, en: boolean) => ({
  ONLINE_JUDGE: en ? "Online Judge · accepted solution" : "Online Judge · прийнятий розв'язок",
  LEARNING_ACTIVITY: en ? "Learn · completed course activity" : "Learn · завершена активність курсу",
  LEARNING_COURSE: en ? "Learn · course completion" : "Learn · завершення курсу",
  PROJECT_PUBLICATION: en ? "Published StudyCod project" : "Опублікований проєкт StudyCod",
  ASSESSMENT_FEEDBACK: en ? "Assess · released interview feedback" : "Assess · опублікований відгук інтерв'ю",
  ASSESSMENT_TASK_RESULT: en ? "Assess · reviewed Judge task" : "Assess · перевірена Judge задача",
  COMPETITION_RESULT: en ? "Competition · official result" : "Змагання · офіційний результат",
})[type];
const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-border bg-bg-base px-3 text-sm text-text-primary outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";
const textAreaClass = "mt-1.5 min-h-28 w-full resize-y rounded-xl border border-border bg-bg-base px-3 py-2.5 text-sm leading-6 text-text-primary outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20";

export const PortfolioDashboardPage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const copy = (uk: string, english: string) => en ? english : uk;
  const [dashboard, setDashboard] = React.useState<PortfolioDashboard | null>(null);
  const skillGroups = React.useMemo(() => groupPortfolioSkills(dashboard?.skills ?? []), [dashboard?.skills]);
  const availableEvidenceSources = React.useMemo(() => [
    ...(dashboard?.evidenceSources ?? []),
    ...(dashboard?.sourcedEvidenceSources ?? []),
  ], [dashboard]);
  const [profile, setProfile] = React.useState<PortfolioProfile>(emptyProfile);
  const [birthDate, setBirthDate] = React.useState("");
  const [work, setWork] = React.useState<PortfolioWorkInput>(blankWork);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingBirthDate, setSavingBirthDate] = React.useState(false);
  const [savingWork, setSavingWork] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [evidenceFormOpen, setEvidenceFormOpen] = React.useState(false);
  const [editingEvidenceId, setEditingEvidenceId] = React.useState<string | null>(null);
  const [evidenceDraft, setEvidenceDraft] = React.useState<PortfolioEvidenceInput>({ sourceType: "ONLINE_JUDGE", sourceKey: "", description: "", skillIds: [], visibility: "PRIVATE" });
  const [savingEvidence, setSavingEvidence] = React.useState(false);
  const [packDraft, setPackDraft] = React.useState({ title: "", specialization: "", includeProfile: false, workIds: [] as string[], evidenceIds: [] as string[], skillIds: [] as string[], expiresInDays: 7 });
  const packRecommendations = React.useMemo(() => {
    const selectedSkillIds = new Set(packDraft.skillIds);
    const selectedSkills = dashboard?.skills.filter(skill => selectedSkillIds.has(skill.id)) ?? [];
    const query = new Set([
      ...tokenizePortfolioTerms(packDraft.specialization),
      ...selectedSkills.flatMap(skill => tokenizePortfolioTerms(`${skill.id} ${skill.labelEn} ${skill.labelUk} ${skill.categoryEn} ${skill.categoryUk}`)),
    ]);
    if (!dashboard || query.size === 0) return { workIds: new Set<string>(), evidenceIds: new Set<string>() };
    const skillsById = new Map(dashboard.skills.map(skill => [skill.id, skill]));
    const score = (values: string[]) => {
      const terms = new Set(values.flatMap(tokenizePortfolioTerms));
      return [...query].reduce((total, term) => total + Number(terms.has(term)), 0);
    };
    const workIds = dashboard.works.map(work => ({
      id: work.id,
      score: score([
        work.title, work.problem, work.solution, work.role, ...work.technologies,
        ...work.skillIds.flatMap(id => {
          const skill = skillsById.get(id);
          return skill ? [id, skill.labelEn, skill.labelUk, skill.categoryEn, skill.categoryUk] : [id];
        }),
      ]) + work.skillIds.filter(id => selectedSkillIds.has(id)).length,
    })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.id);
    const evidenceIds = dashboard.evidence.map(evidence => ({
      id: evidence.id,
      score: score([
        evidence.sourceTitle, evidence.sourceLabel, evidence.sourceDetail, evidence.taskTitle ?? "", evidence.language ?? "",
        ...evidence.skillIds.flatMap(id => {
          const skill = skillsById.get(id);
          return skill ? [id, skill.labelEn, skill.labelUk, skill.categoryEn, skill.categoryUk] : [id];
        }),
      ]) + evidence.skillIds.filter(id => selectedSkillIds.has(id)).length,
    })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.id);
    return { workIds: new Set(workIds), evidenceIds: new Set(evidenceIds) };
  }, [dashboard, packDraft.specialization, packDraft.skillIds]);
  const [savingPack, setSavingPack] = React.useState(false);
  const [packPreviewOpen, setPackPreviewOpen] = React.useState(false);
  const [createdPackUrl, setCreatedPackUrl] = React.useState("");
  const [copiedPackUrl, setCopiedPackUrl] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await getPortfolioDashboard();
      setDashboard(next);
      setProfile(next.profile);
      setBirthDate(next.birthDate ?? "");
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося завантажити портфоліо.", "Could not load your portfolio.")));
    } finally {
      setLoading(false);
    }
  }, [en]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setError("");
    setNotice("");
    try {
      const saved = await savePortfolioProfile(profile);
      setProfile(saved);
      setDashboard(current => current ? { ...current, profile: saved } : current);
      setNotice(copy("Профіль збережено.", "Profile saved."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося зберегти профіль.", "Could not save your profile.")));
    } finally {
      setSavingProfile(false);
    }
  };

  const saveBirthDate = async () => {
    setSavingBirthDate(true);
    setError("");
    setNotice("");
    try {
      const result = await savePortfolioBirthDate(birthDate);
      setDashboard(current => current ? { ...current, ...result } : current);
      setBirthDate(result.birthDate ?? "");
      setNotice(copy("Дату збережено приватно. Вона не відображається у портфоліо чи посиланнях.", "Date saved privately. It is not shown on your Portfolio or share links."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося зберегти дату народження.", "Could not save your birth date.")));
    } finally {
      setSavingBirthDate(false);
    }
  };

  const removeBirthYear = async () => {
    setSavingBirthDate(true);
    setError("");
    setNotice("");
    try {
      const result = await removePortfolioBirthYear();
      setDashboard(current => current ? { ...current, ...result } : current);
      setBirthDate("");
      setNotice(copy(
        "Рік прибрано. День і місяць залишилися для наявних функцій StudyCod; публічне поширення Portfolio вимкнено.",
        "The year was removed. The day and month remain for existing StudyCod features; public Portfolio sharing is disabled.",
      ));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося прибрати рік народження.", "Could not remove the birth year.")));
    } finally {
      setSavingBirthDate(false);
    }
  };

  const editWork = (item: PortfolioWork) => {
    setEditingId(item.id);
    setWork({
      title: item.title, problem: item.problem, solution: item.solution, role: item.role,
      technologies: item.technologies, skillIds: item.skillIds ?? [], repositoryUrl: item.repositoryUrl, demoUrl: item.demoUrl,
      sourcePublicationId: item.sourcePublicationId, visibility: item.visibility,
    });
    setFormOpen(true);
    setNotice("");
  };

  const startNewWork = (sourcePublicationId?: string) => {
    const source = dashboard?.availablePublications.find(item => item.id === sourcePublicationId);
    setEditingId(null);
    setWork({
      ...blankWork(),
      ...(source ? { title: source.title, problem: source.description, sourcePublicationId: source.id } : {}),
    });
    setFormOpen(true);
    setNotice("");
  };

  const saveWork = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!work.title.trim()) return;
    setSavingWork(true);
    setError("");
    setNotice("");
    const payload: PortfolioWorkInput = {
      ...work,
      technologies: [...new Set(work.technologies.map(item => item.trim()).filter(Boolean))].slice(0, 16),
      skillIds: [...new Set(work.skillIds)].slice(0, 12),
      repositoryUrl: work.repositoryUrl?.trim() || null,
      demoUrl: work.demoUrl?.trim() || null,
    };
    try {
      if (editingId) await updatePortfolioWork(editingId, payload);
      else await createPortfolioWork(payload);
      await refresh();
      setFormOpen(false);
      setEditingId(null);
      setWork(blankWork());
      setNotice(copy("Роботу збережено.", "Work saved."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося зберегти роботу.", "Could not save this work.")));
    } finally {
      setSavingWork(false);
    }
  };

  const archiveWork = async (id: string) => {
    setError("");
    try {
      await archivePortfolioWork(id);
      setDashboard(current => current ? { ...current, works: current.works.filter(item => item.id !== id) } : current);
      setNotice(copy("Роботу прибрано з портфоліо.", "Work removed from your portfolio."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося прибрати роботу.", "Could not remove this work.")));
    }
  };

  const moveWork = async (id: string, direction: -1 | 1) => {
    if (!dashboard) return;
    const items = [...dashboard.works];
    const index = items.findIndex(item => item.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    try {
      await reorderPortfolioWorks(items.map(item => item.id));
      setDashboard(current => current ? { ...current, works: items } : current);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося змінити порядок робіт.", "Could not reorder your work.")));
    }
  };

  const moveEvidence = async (id: string, direction: -1 | 1) => {
    if (!dashboard) return;
    const items = [...dashboard.evidence];
    const index = items.findIndex(item => item.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    setError("");
    try {
      await reorderPortfolioEvidence(items.map(item => item.id));
      setDashboard(current => current ? { ...current, evidence: items } : current);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося змінити порядок свідчень.", "Could not reorder your evidence.")));
    }
  };

  const startEvidence = (source?: PortfolioEvidenceSource) => {
    setEditingEvidenceId(null);
    setEvidenceDraft({ sourceType: source?.sourceType ?? "ONLINE_JUDGE", sourceKey: source?.sourceKey ?? "", description: "", skillIds: [], visibility: "PRIVATE" });
    setEvidenceFormOpen(true);
    setNotice("");
  };

  const editEvidence = (item: PortfolioEvidence) => {
    setEditingEvidenceId(item.id);
    setEvidenceDraft({ sourceType: item.sourceType, sourceKey: item.sourceKey ?? String(item.sourceGradeId ?? ""), description: item.description, skillIds: item.skillIds, visibility: item.visibility });
    setEvidenceFormOpen(true);
    setNotice("");
  };

  const saveEvidence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingEvidenceId && !evidenceDraft.sourceKey) return;
    setSavingEvidence(true);
    setError("");
    setNotice("");
    try {
      if (editingEvidenceId) {
        await updatePortfolioEvidence(editingEvidenceId, { description: evidenceDraft.description, skillIds: evidenceDraft.skillIds, visibility: evidenceDraft.visibility });
      } else {
        await createPortfolioEvidence(evidenceDraft);
      }
      await refresh();
      setEvidenceFormOpen(false);
      setEditingEvidenceId(null);
      setNotice(copy("Свідчення навички збережено.", "Skill evidence saved."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося зберегти свідчення навички.", "Could not save skill evidence.")));
    } finally {
      setSavingEvidence(false);
    }
  };

  const removeEvidence = async (id: string) => {
    try {
      await archivePortfolioEvidence(id);
      await refresh();
      setNotice(copy("Свідчення прибрано з портфоліо.", "Evidence removed from your portfolio."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося прибрати свідчення.", "Could not remove evidence.")));
    }
  };

  const createEvidencePack = async (event: React.FormEvent) => {
    event.preventDefault();
    if (dashboard?.publicSharingAgeStatus !== "ADULT") {
      setError(copy("Публічні посилання доступні лише після збереження дати, яка вказує на вік 18 років або більше.", "Share links require a saved birth date that indicates an age of 18 or older."));
      return;
    }
    if (!packDraft.workIds.length && !packDraft.evidenceIds.length) return;
    setSavingPack(true);
    setError("");
    setNotice("");
    try {
      const created = await createPortfolioEvidencePack(packDraft);
      const url = `${window.location.origin}/portfolio/p/${encodeURIComponent(created.token)}`;
      setCreatedPackUrl(url);
      setPackDraft({ title: "", specialization: "", includeProfile: false, workIds: [], evidenceIds: [], skillIds: [], expiresInDays: 7 });
      setPackPreviewOpen(false);
      await refresh();
      setNotice(copy("Пакет створено. Скопіюй посилання зараз: його більше не можна буде відновити.", "Pack created. Copy the link now; it cannot be retrieved again."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося створити пакет.", "Could not create the pack.")));
    } finally {
      setSavingPack(false);
    }
  };

  const copyPackUrl = async () => {
    if (!createdPackUrl) return;
    try {
      await navigator.clipboard.writeText(createdPackUrl);
      setCopiedPackUrl(true);
      window.setTimeout(() => setCopiedPackUrl(false), 1800);
    } catch {
      setError(copy("Не вдалося скопіювати посилання. Скопіюй його з поля вручну.", "Could not copy the link. Copy it from the field manually."));
    }
  };

  const revokeEvidencePack = async (id: string) => {
    try {
      await revokePortfolioEvidencePack(id);
      setDashboard(current => current ? {
        ...current,
        evidencePacks: current.evidencePacks.map(pack => pack.id === id ? { ...pack, revokedAt: new Date().toISOString() } : pack),
      } : current);
      setNotice(copy("Доступ за посиланням відкликано.", "Share link access revoked."));
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, copy("Не вдалося відкликати пакет.", "Could not revoke the pack.")));
    }
  };

  const setTechnologies = (value: string) => setWork(current => ({
    ...current,
    technologies: value.split(",").map(item => item.trim()).filter(Boolean).slice(0, 16),
  }));
  const setProfileTechnologies = (value: string) => setProfile(current => ({
    ...current,
    technologies: [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))].slice(0, 16),
  }));

  if (loading && !dashboard) return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-10" aria-busy="true">
    <div className="h-8 w-36 animate-pulse rounded-lg bg-bg-hover" />
    <div className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="h-80 animate-pulse rounded-3xl bg-bg-hover" /><div className="h-80 animate-pulse rounded-3xl bg-bg-hover" /></div>
  </main>;

  return <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 text-text-primary sm:px-6 lg:px-10 lg:pt-10">
    <header className="flex flex-col justify-between gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft"><BriefcaseBusiness className="size-4" /> StudyCod · Portfolio</div>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-4xl">{copy("Твої роботи, твій вибір", "Your work, selected by you")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{copy("Збирай власні проєкти й обирай, що показувати. Портфоліо приватне, доки ти сам не відкриєш його.", "Collect your work and decide what to share. Your portfolio stays private until you choose to publish it.")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {dashboard?.username && <Link to="/portfolio/preview" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Eye className="size-4" />{copy("Попередній перегляд", "Preview page")}<ArrowUpRight className="size-4" /></Link>}
        {dashboard?.username && profile.visibility === "PUBLIC" && dashboard.publicSharingAgeStatus === "ADULT" && <Link to={`/portfolio/u/${encodeURIComponent(dashboard.username)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Eye className="size-4" />{copy("Переглянути сторінку", "View public page")}<ArrowUpRight className="size-4" /></Link>}
        <Link to="/portfolio/projects" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><FolderKanban className="size-4" />{copy("Розвивати роботу на StudyCod", "Build work on StudyCod")}</Link>
      </div>
    </header>

    {error && <div role="alert" className="mt-5 rounded-2xl border border-accent-error/30 bg-accent-error/5 px-4 py-3 text-sm text-accent-error">{error}</div>}
    {notice && <div role="status" aria-live="polite" className="mt-5 flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-text-primary"><Check className="size-4 text-primary" />{notice}</div>}

    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,.95fr)]">
      <form onSubmit={event => void saveProfile(event)} className="rounded-3xl border border-border bg-bg-surface p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold tracking-tight">{copy("Профіль", "Profile")}</h2><p className="mt-1 text-sm leading-6 text-text-secondary">{copy("Коротко опиши напрям, у якому хочеш розвиватися.", "Describe the kind of work you want to grow into.")}</p></div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${profile.visibility === "PUBLIC" ? "border-primary/30 bg-primary/5 text-primary-strong dark:text-primary-soft" : "border-border text-text-secondary"}`}><Globe2 className="size-3.5" />{profile.visibility === "PUBLIC" ? copy("Публічний", "Public") : copy("Приватний", "Private")}</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold sm:col-span-2">{copy("Ім'я або псевдонім", "Display name")}<input className={fieldClass} maxLength={120} value={profile.displayName} onChange={event => setProfile(current => ({ ...current, displayName: event.target.value }))} placeholder={dashboard?.username || copy("Наприклад, Олена Коваль", "For example, Alex Morgan")} /></label>
          <label className="text-sm font-semibold">{copy("Заголовок", "Headline")}<input className={fieldClass} maxLength={160} value={profile.headline} onChange={event => setProfile(current => ({ ...current, headline: event.target.value }))} placeholder={copy("Наприклад, Java backend developer", "For example, Java backend developer")} /></label>
          <label className="text-sm font-semibold">{copy("Спеціалізація", "Specialization")}<input className={fieldClass} maxLength={120} value={profile.specialization} onChange={event => setProfile(current => ({ ...current, specialization: event.target.value }))} placeholder={copy("Backend, algorithms, data…", "Backend, algorithms, data…")} /></label>
          <label className="text-sm font-semibold sm:col-span-2">{copy("Технології профілю через кому", "Profile technologies, separated by commas")}<input className={fieldClass} maxLength={800} value={profile.technologies.join(", ")} onChange={event => setProfileTechnologies(event.target.value)} placeholder="Java, Spring, SQL" /><span className="mt-1 block text-xs font-normal text-text-muted">{copy("Додавай лише технології, які хочеш показати в заголовку профілю.", "Choose the technologies you want shown in your profile header.")}</span></label>
          <label className="text-sm font-semibold sm:col-span-2">{copy("Про мене", "About")}<textarea className={textAreaClass} maxLength={4000} value={profile.summary} onChange={event => setProfile(current => ({ ...current, summary: event.target.value }))} placeholder={copy("Які задачі тобі цікаво розв'язувати?", "What kinds of problems do you enjoy solving?")} /></label>
          <label className="text-sm font-semibold">GitHub<input className={fieldClass} type="url" inputMode="url" value={profile.githubUrl ?? ""} onChange={event => setProfile(current => ({ ...current, githubUrl: event.target.value || null }))} placeholder="https://github.com/username" /></label>
          <label className="text-sm font-semibold">{copy("Особистий сайт", "Website")}<input className={fieldClass} type="url" inputMode="url" value={profile.websiteUrl ?? ""} onChange={event => setProfile(current => ({ ...current, websiteUrl: event.target.value || null }))} placeholder="https://example.com" /></label>
          <label className={`flex items-start gap-3 rounded-xl border border-border p-3 sm:col-span-2 ${dashboard?.avatarUrl || profile.shareAvatar ? "cursor-pointer" : "opacity-70"}`}><input type="checkbox" className="mt-1 accent-primary" checked={profile.shareAvatar} disabled={!dashboard?.avatarUrl && !profile.shareAvatar} onChange={event => setProfile(current => ({ ...current, shareAvatar: event.target.checked }))} /><span className="text-sm font-semibold">{copy("Показувати фото профілю", "Show account photo")}<span className="mt-1 block text-xs font-normal leading-5 text-text-secondary">{dashboard?.avatarUrl ? copy("Фото з акаунта буде показано на публічній сторінці та в пакетах, де ти окремо ділишся профілем.", "Your account photo appears on the public page and in packs where you choose to share your profile.") : profile.shareAvatar ? copy("Фото акаунта наразі недоступне; вимкни цей параметр, щоб прибрати дозвіл.", "Your account photo is currently unavailable; turn this off to remove permission.") : <>{copy("Спершу додай фото в налаштуваннях акаунта.", "Add an account photo first.")} <Link to="/profile" className="font-semibold text-primary-strong underline dark:text-primary-soft">{copy("Відкрити профіль", "Open profile")}</Link></>}</span></span>{dashboard?.avatarUrl && <img src={dashboard.avatarUrl} alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl border border-border object-cover" />}</label>
          <label className="text-sm font-semibold sm:col-span-2">{copy("Видимість профілю", "Profile visibility")}<select className={fieldClass} value={profile.visibility} onChange={event => setProfile(current => ({ ...current, visibility: event.target.value as PortfolioProfile["visibility"] }))}><option value="PRIVATE">{copy("Приватний — доступний лише тобі", "Private — only you can see it")}</option><option value="PUBLIC" disabled={dashboard?.publicSharingAgeStatus !== "ADULT"}>{copy("Публічний — показувати вибрані роботи", "Public — show selected work")}</option></select></label>
          <div className="rounded-xl border border-border bg-bg-base p-3 sm:col-span-2">
            <label className="block text-sm font-semibold">{copy("Дата народження для налаштування приватності", "Birth date for privacy settings")}<input className={fieldClass} type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={birthDate} onChange={event => setBirthDate(event.target.value)} /></label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="max-w-lg text-xs leading-5 text-text-muted">{copy("Повна дата не показується у Portfolio. Рік використовується для вікового обмеження поширення; день і місяць можуть використовуватися для вітального листа до дня народження. Вік самостійно вказаний і не перевіряється документами.", "The full date is not shown in your Portfolio. The year is used for sharing age restrictions; the day and month may be used for the birthday greeting email. Age is self-reported and is not document-verified.")}</p>
              <button type="button" onClick={() => void saveBirthDate()} disabled={savingBirthDate || !birthDate} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{savingBirthDate ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{copy("Зберегти дату", "Save date")}</button>
              {dashboard?.birthDate && <button type="button" onClick={() => void removeBirthYear()} disabled={savingBirthDate} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-text-secondary transition hover:border-accent-error/30 hover:bg-accent-error/5 hover:text-accent-error disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Trash2 className="size-4" />{copy("Прибрати рік", "Remove year")}</button>}
            </div>
            {dashboard?.birthDate && <p className="mt-2 text-xs leading-5 text-text-muted">{copy("Можна прибрати лише рік: день і місяць збережуться для наявних функцій акаунта. Без року вік невідомий, тому публічне поширення буде вимкнене.", "You can remove only the year: the day and month stay for existing account features. Without the year, age is unknown and public sharing is disabled.")}</p>}
            <p className="mt-2 text-xs font-medium text-text-secondary">{dashboard?.publicSharingAgeStatus === "ADULT" ? copy("Публічне поширення доступне для вказаної дати.", "Public sharing is available for the date you provided.") : dashboard?.publicSharingAgeStatus === "UNDER_18" ? copy("Для цієї дати публічне портфоліо й посилання вимкнені.", "Public Portfolio and share links are disabled for this date.") : copy("Збережи повну дату, щоб керувати публічним поширенням.", "Save a complete date to manage public sharing.")}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="max-w-md text-xs leading-5 text-text-muted">{copy("Публічна сторінка показує лише роботи з позначкою «Публічна». Навчальна історія та приватний код не додаються автоматично.", "The public page only shows work marked public. Learning history and private code are never added automatically.")}</p>
          <button type="submit" disabled={savingProfile || loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 active:translate-y-px disabled:cursor-wait disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{savingProfile ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{savingProfile ? copy("Збереження…", "Saving…") : copy("Зберегти профіль", "Save profile")}</button>
        </div>
      </form>

      <section className="rounded-3xl border border-border bg-bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-bold tracking-tight">{copy("Практичні роботи", "Practical work")}</h2><p className="mt-1 text-sm leading-6 text-text-secondary">{copy("Додай власні роботи, посилання на код і демонстрації.", "Add your own work, source links, and demos.")}</p></div><button type="button" onClick={() => startNewWork()} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Plus className="size-4" />{copy("Додати", "Add work")}</button></div>
        {dashboard?.works.length ? <div className="mt-5 divide-y divide-border">{dashboard.works.map((item, index) => <article key={item.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title}</h3><span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{item.visibility === "PUBLIC" ? copy("Публічна", "Public") : copy("Приватна", "Private")}</span>{item.sourcePublicId && <span className="rounded-md bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary-strong dark:text-primary-soft">{copy("Перевірена публікація StudyCod", "StudyCod publication")}</span>}</div><p className="mt-1 line-clamp-2 text-sm leading-5 text-text-secondary">{item.problem || item.solution || copy("Додай опис роботи.", "Add a description for this work.")}</p><div className="mt-2 flex flex-wrap gap-1.5">{item.technologies.map(technology => <span key={technology} className="rounded-md bg-bg-hover px-2 py-1 text-[11px] font-medium text-text-secondary">{technology}</span>)}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{item.skillIds.map(id => { const skill = dashboard.skills.find(candidate => candidate.id === id); return skill ? <span key={id} className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary-strong dark:text-primary-soft">{en ? skill.labelEn : skill.labelUk}</span> : null; })}</div></div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => void moveWork(item.id, -1)} disabled={index === 0} aria-label={copy(`Перемістити ${item.title} вгору`, `Move ${item.title} up`)} className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-hover disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><ArrowUp className="size-4" /></button><button type="button" onClick={() => void moveWork(item.id, 1)} disabled={index === dashboard.works.length - 1} aria-label={copy(`Перемістити ${item.title} вниз`, `Move ${item.title} down`)} className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-hover disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><ArrowDown className="size-4" /></button><button type="button" onClick={() => editWork(item)} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-text-secondary transition hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{copy("Змінити", "Edit")}</button><button type="button" onClick={() => void archiveWork(item.id)} aria-label={copy(`Прибрати ${item.title}`, `Remove ${item.title}`)} className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-accent-error/10 hover:text-accent-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Trash2 className="size-4" /></button></div></div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium">{item.repositoryUrl && <a href={item.repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-strong hover:underline dark:text-primary-soft">{copy("Репозиторій", "Repository")}<ExternalLink className="size-3" /></a>}{item.sourcePublicId && <Link to={`/portfolio/${encodeURIComponent(item.sourcePublicId)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-strong hover:underline dark:text-primary-soft">{copy("Результат StudyCod", "StudyCod result")}<ExternalLink className="size-3" /></Link>}</div>
        </article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-border px-5 py-8 text-center"><FolderKanban className="mx-auto size-6 text-text-muted" /><p className="mt-3 text-sm font-semibold">{copy("Тут з'являться твої роботи", "Your work will appear here")}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-text-secondary">{copy("Додай власний проєкт або вибери опублікований результат StudyCod.", "Add a personal project or select a published StudyCod result.")}</p></div>}

        {!!dashboard?.availablePublications.length && <details className="mt-5 rounded-2xl border border-border bg-bg-base p-4"><summary className="cursor-pointer text-sm font-semibold">{copy("Додати опубліковану роботу StudyCod", "Add a published StudyCod project")}</summary><div className="mt-3 space-y-2">{dashboard.availablePublications.map(publication => <div key={publication.id} className="flex items-center justify-between gap-3 rounded-xl bg-bg-surface px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{publication.title}</p><p className="mt-0.5 text-xs text-text-muted">{publication.runtime} · {publication.stage}</p></div><button type="button" onClick={() => startNewWork(publication.id)} disabled={dashboard.works.some(item => item.sourcePublicationId === publication.id)} className="min-h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45">{dashboard.works.some(item => item.sourcePublicationId === publication.id) ? copy("Додано", "Added") : copy("Додати", "Add")}</button></div>)}</div></details>}
      </section>

      <section className="rounded-3xl border border-border bg-bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-bold tracking-tight">{copy("Свідчення навичок", "Skill evidence")}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">{copy("Додавай результати Learn, опубліковані роботи, офіційні результати змагань і відгуки Assess, які вже відкриті тобі. StudyCod перевіряє походження; теги обираєш ти.", "Add Learn completions, published work, official competition results, and Assess feedback already released to you. StudyCod checks provenance; you choose the skill tags.")}</p></div><button type="button" onClick={() => startEvidence()} disabled={!availableEvidenceSources.length} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold transition hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Plus className="size-4" />{copy("Додати свідчення", "Add evidence")}</button></div>

        {dashboard?.evidence.length ? <div className="mt-5 divide-y divide-border">{dashboard.evidence.map((item, index) => <article key={item.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.sourceTitle}</h3><span className="rounded-md bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary-strong dark:text-primary-soft">{evidenceSourceLabel(item.sourceType, en)}</span><span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{item.visibility === "PUBLIC" ? copy("Публічне", "Public") : copy("Приватне", "Private")}</span></div><p className="mt-1 text-xs text-text-muted">{localizePortfolioEvidenceDetail(item.sourceType, item.sourceDetail, en)}</p>{item.description && <p className="mt-2 text-sm leading-6 text-text-secondary">{item.description}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{item.skillIds.map(id => { const skill = dashboard.skills.find(candidate => candidate.id === id); return skill ? <span key={id} className="rounded-md bg-bg-hover px-2 py-1 text-[11px] font-medium text-text-secondary">{en ? skill.labelEn : skill.labelUk}</span> : null; })}</div></div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => void moveEvidence(item.id, -1)} disabled={index === 0} aria-label={copy(`Перемістити свідчення ${item.sourceTitle} вгору`, `Move evidence for ${item.sourceTitle} up`)} className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-hover disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><ArrowUp className="size-4" /></button><button type="button" onClick={() => void moveEvidence(item.id, 1)} disabled={index === dashboard.evidence.length - 1} aria-label={copy(`Перемістити свідчення ${item.sourceTitle} вниз`, `Move evidence for ${item.sourceTitle} down`)} className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-hover disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><ArrowDown className="size-4" /></button><button type="button" onClick={() => editEvidence(item)} className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-text-secondary transition hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{copy("Змінити", "Edit")}</button><button type="button" onClick={() => void removeEvidence(item.id)} aria-label={copy(`Прибрати свідчення ${item.sourceTitle}`, `Remove evidence for ${item.sourceTitle}`)} className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-accent-error/10 hover:text-accent-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Trash2 className="size-4" /></button></div></div>
        </article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-border px-5 py-7 text-center"><BadgeCheck className="mx-auto size-6 text-text-muted" /><p className="mt-3 text-sm font-semibold">{copy("Тут з'являться вибрані перевірені розв'язки", "Selected accepted solutions will appear here")}</p><p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-text-secondary">{copy("Для додавання доступні лише власні задачі з кодом, де Judge зафіксував AC і пройдено всі тести.", "Only your own code tasks with an AC verdict and all tests passed can be added.")}</p></div>}

        {!!availableEvidenceSources.length && <details className="mt-5 rounded-2xl border border-border bg-bg-base p-4"><summary className="cursor-pointer text-sm font-semibold">{copy("Доступні підтверджені джерела", "Available verified sources")} <span className="ml-1 text-text-muted">({availableEvidenceSources.length})</span></summary><div className="mt-3 space-y-2">{availableEvidenceSources.map(source => <div key={`${source.sourceType}:${source.sourceKey}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-surface px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{source.title}</p><p className="mt-0.5 text-xs text-text-muted">{evidenceSourceLabel(source.sourceType, en)} · {localizePortfolioEvidenceDetail(source.sourceType, source.detail, en)}</p></div><button type="button" onClick={() => startEvidence(source)} className="min-h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-bg-hover">{copy("Додати", "Add")}</button></div>)}</div></details>}
      </section>

      {evidenceFormOpen && <section className="rounded-3xl border border-primary/20 bg-bg-surface p-5 sm:p-7" aria-labelledby="portfolio-evidence-form-title">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="portfolio-evidence-form-title" className="text-lg font-bold">{editingEvidenceId ? copy("Змінити свідчення", "Edit evidence") : copy("Нове свідчення навички", "Add skill evidence")}</h2><p className="mt-1 text-sm text-text-secondary">{copy("Факт результату надходить із сервера. Опублікована картка не містить коду або прихованих тестів.", "The result is read from server records. Public cards never include code or hidden tests.")}</p></div><button type="button" onClick={() => { setEvidenceFormOpen(false); setEditingEvidenceId(null); }} className="min-h-9 rounded-lg px-3 text-sm font-semibold text-text-secondary transition hover:bg-bg-hover">{copy("Закрити", "Close")}</button></div>
        <form onSubmit={event => void saveEvidence(event)} className="mt-5 grid gap-4">
          {!editingEvidenceId && <label className="text-sm font-semibold">{copy("Підтверджене джерело", "Verified source")}<select required className={fieldClass} value={evidenceDraft.sourceKey ? `${evidenceDraft.sourceType}:${evidenceDraft.sourceKey}` : ""} onChange={event => { const [sourceType, sourceKey] = event.target.value.split(":"); if (sourceKey) setEvidenceDraft(current => ({ ...current, sourceType: sourceType as PortfolioEvidenceSourceType, sourceKey })); }}><option value="">{copy("Обери джерело", "Choose a source")}</option>{availableEvidenceSources.map(source => <option key={`${source.sourceType}:${source.sourceKey}`} value={`${source.sourceType}:${source.sourceKey}`}>{evidenceSourceLabel(source.sourceType, en)} · {source.title}</option>)}</select></label>}
          <label className="text-sm font-semibold">{copy("Що це показує?", "What does this show?")}<textarea maxLength={1000} className={textAreaClass} value={evidenceDraft.description} onChange={event => setEvidenceDraft(current => ({ ...current, description: event.target.value }))} placeholder={copy("Наприклад: розділив пошук і сортування на окремі кроки.", "For example: separated lookup and sorting into distinct steps.")} /></label>
          <fieldset><legend className="text-sm font-semibold">{copy("Навички для цієї картки", "Skills for this item")}</legend><div className="mt-3 space-y-3">{skillGroups.map(group => <div key={group.id}><p className="mb-1.5 text-xs font-semibold text-text-muted">{en ? group.labelEn : group.labelUk}</p><div className="flex flex-wrap gap-2">{group.skills.map(skill => <label key={skill.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${evidenceDraft.skillIds.includes(skill.id) ? "border-primary/40 bg-primary/5 text-primary-strong dark:text-primary-soft" : "border-border text-text-secondary hover:bg-bg-hover"}`}><input type="checkbox" className="accent-primary" checked={evidenceDraft.skillIds.includes(skill.id)} onChange={event => setEvidenceDraft(current => ({ ...current, skillIds: event.target.checked ? [...current.skillIds, skill.id].slice(0, 8) : current.skillIds.filter(id => id !== skill.id) }))} />{en ? skill.labelEn : skill.labelUk}</label>)}</div></div>)}</div><p className="mt-2 text-xs text-text-muted">{copy("Теги описують цю роботу, а не підтверджують загальний рівень.", "Tags describe this item; they do not certify overall proficiency.")}</p></fieldset>
          <label className="text-sm font-semibold">{copy("Видимість", "Visibility")}<select className={fieldClass} value={evidenceDraft.visibility} onChange={event => setEvidenceDraft(current => ({ ...current, visibility: event.target.value as PortfolioEvidence["visibility"] }))}><option value="PRIVATE">{copy("Приватне", "Private")}</option><option value="PUBLIC" disabled={dashboard?.publicSharingAgeStatus !== "ADULT"}>{copy("Публічне", "Public")}</option></select></label>
          <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={() => { setEvidenceFormOpen(false); setEditingEvidenceId(null); }} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-text-secondary transition hover:bg-bg-hover">{copy("Скасувати", "Cancel")}</button><button type="submit" disabled={savingEvidence || (!editingEvidenceId && !evidenceDraft.sourceKey)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 active:translate-y-px disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{savingEvidence ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{savingEvidence ? copy("Збереження…", "Saving…") : copy("Зберегти свідчення", "Save evidence")}</button></div>
        </form>
      </section>}

      <section className="rounded-3xl border border-border bg-bg-surface p-5 sm:p-7">
        <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/5 text-primary-strong dark:text-primary-soft"><FileCheck2 className="size-5" /></div><div><h2 className="text-lg font-bold tracking-tight">{copy("Пакети матеріалів", "Evidence Packs")}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">{copy("Створи обмежене в часі посилання на вибрані роботи й свідчення. Той, хто має посилання, побачить вибране навіть якщо воно приватне у портфоліо.", "Create a time-limited link to selected work and evidence. Anyone with the link can view these items, including items marked private in your Portfolio.")}</p></div></div>

        <form onSubmit={event => void createEvidencePack(event)} className="mt-5 rounded-2xl border border-border bg-bg-base p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px]">
            <label className="text-sm font-semibold">{copy("Назва пакета", "Pack title")}<input required maxLength={120} className={fieldClass} value={packDraft.title} onChange={event => setPackDraft(current => ({ ...current, title: event.target.value }))} placeholder={copy("Портфоліо для стажування", "Internship application")}/></label>
            <label className="text-sm font-semibold">{copy("Спеціалізація", "Specialization")}<input maxLength={120} className={fieldClass} value={packDraft.specialization} onChange={event => setPackDraft(current => ({ ...current, specialization: event.target.value }))} placeholder={copy("Java backend", "Java backend")}/></label>
            <label className="text-sm font-semibold">{copy("Посилання діє", "Link expires in")}<select className={fieldClass} value={packDraft.expiresInDays} onChange={event => setPackDraft(current => ({ ...current, expiresInDays: Number(event.target.value) }))}><option value={1}>1 {copy("день", "day")}</option><option value={7}>7 {copy("днів", "days")}</option><option value={14}>14 {copy("днів", "days")}</option><option value={30}>30 {copy("днів", "days")}</option></select></label>
          </div>
          <p className="mt-2 text-xs text-text-muted">{packDraft.specialization.trim() || packDraft.skillIds.length ? copy(`${packRecommendations.workIds.size + packRecommendations.evidenceIds.size} рекомендацій за збігом метаданих. Перевір їх і вибери потрібне вручну.`, `${packRecommendations.workIds.size + packRecommendations.evidenceIds.size} metadata-based suggestions. Review them and select items manually.`) : copy("Вкажи спеціалізацію або вибери компетенції — підкажемо роботи й свідчення з відповідними метаданими.", "Enter a specialization or select competencies to see items with matching metadata.")}</p>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 accent-primary" checked={packDraft.includeProfile} onChange={event => setPackDraft(current => ({ ...current, includeProfile: event.target.checked }))} /><span><span className="font-semibold">{copy("Додати профіль до пакета", "Include my profile")}</span><span className="mt-0.5 block text-xs leading-5 text-text-secondary">{copy("Покаже ім'я, опис і посилання з профілю.", "Shares the display name, summary, and profile links.")}</span></span></label>

          <fieldset className="mt-5"><legend className="text-sm font-semibold">{copy("Вибрати роботи", "Select practical work")}</legend>{dashboard?.works.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{dashboard.works.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-bg-surface p-3 text-sm"><input type="checkbox" className="mt-0.5 accent-primary" checked={packDraft.workIds.includes(item.id)} onChange={event => setPackDraft(current => ({ ...current, workIds: event.target.checked ? [...current.workIds, item.id] : current.workIds.filter(id => id !== item.id) }))}/><span className="min-w-0"><span className="block truncate font-semibold">{item.title}</span>{packRecommendations.workIds.has(item.id) && <span className="mt-1 inline-flex rounded-md bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary-strong dark:text-primary-soft">{copy("Рекомендовано", "Suggested")}</span>}<span className="mt-0.5 block text-xs text-text-muted">{item.visibility === "PUBLIC" ? copy("Публічна робота", "Public work") : copy("Приватна робота", "Private work")}</span></span></label>)}</div> : <p className="mt-2 text-xs text-text-muted">{copy("Спочатку додай роботу до портфоліо.", "Add work to your Portfolio first.")}</p>}</fieldset>

          <fieldset className="mt-5"><legend className="text-sm font-semibold">{copy("Вибрати свідчення навичок", "Select Skill Evidence")}</legend>{dashboard?.evidence.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{dashboard.evidence.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-bg-surface p-3 text-sm"><input type="checkbox" className="mt-0.5 accent-primary" checked={packDraft.evidenceIds.includes(item.id)} onChange={event => setPackDraft(current => ({ ...current, evidenceIds: event.target.checked ? [...current.evidenceIds, item.id] : current.evidenceIds.filter(id => id !== item.id) }))}/><span className="min-w-0"><span className="block truncate font-semibold">{item.sourceTitle}</span><span className="mt-0.5 block truncate text-xs text-text-muted">{evidenceSourceLabel(item.sourceType, en)} · {localizePortfolioEvidenceDetail(item.sourceType, item.sourceDetail, en)}</span>{packRecommendations.evidenceIds.has(item.id) && <span className="mt-1 inline-flex rounded-md bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary-strong dark:text-primary-soft">{copy("Рекомендовано", "Suggested")}</span>}<span className="mt-0.5 block text-xs text-text-muted">{item.visibility === "PUBLIC" ? copy("Публічне", "Public") : copy("Приватне", "Private")}</span></span></label>)}</div> : <p className="mt-2 text-xs text-text-muted">{copy("Спочатку додай свідчення навички.", "Add Skill Evidence first.")}</p>}</fieldset>

          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">{copy("Вибрати компетенції", "Select competencies")}</legend>
            <p className="mt-1 text-xs text-text-muted">{copy("Це опис цільового напряму, а не сертифікація рівня. Рекомендації враховують спеціалізацію та вибрані навички.", "These labels describe the pack's focus; they do not certify proficiency. Suggestions use the specialization and selected skills.")}</p>
            <div className="mt-3 space-y-3">
              {skillGroups.map(group => <div key={group.id}>
                <p className="mb-1.5 text-xs font-semibold text-text-muted">{en ? group.labelEn : group.labelUk}</p>
                <div className="flex flex-wrap gap-2">
                  {group.skills.map(skill => <label key={skill.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${packDraft.skillIds.includes(skill.id) ? "border-primary/40 bg-primary/5 text-primary-strong dark:text-primary-soft" : "border-border text-text-secondary hover:bg-bg-hover"}`}>
                    <input type="checkbox" className="accent-primary" checked={packDraft.skillIds.includes(skill.id)} onChange={event => setPackDraft(current => ({ ...current, skillIds: event.target.checked ? [...current.skillIds, skill.id].slice(0, 12) : current.skillIds.filter(id => id !== skill.id) }))} />
                    {en ? skill.labelEn : skill.labelUk}
                  </label>)}
                </div>
              </div>)}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-text-secondary">{copy("Доступ можна відкликати будь-коли. Посилання показується один раз.", "You can revoke access at any time. The link is shown only once.")}</p>
            <button type="button" disabled={!packDraft.workIds.length && !packDraft.evidenceIds.length} aria-expanded={packPreviewOpen} onClick={() => setPackPreviewOpen(current => !current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-bg-surface px-4 text-sm font-semibold text-text-primary transition hover:bg-bg-hover disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <Eye className="size-4" />{packPreviewOpen ? copy("Сховати попередній перегляд", "Hide pack preview") : copy("Переглянути пакет", "Preview pack")}
            </button>
            <button type="submit" disabled={savingPack || !packPreviewOpen || dashboard?.publicSharingAgeStatus !== "ADULT" || (!packDraft.workIds.length && !packDraft.evidenceIds.length)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 active:translate-y-px disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{savingPack ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}{savingPack ? copy("Створення…", "Creating…") : copy("Створити посилання", "Create share link")}</button>
          </div>
          {packPreviewOpen && <section className="mt-4 rounded-2xl border border-primary/20 bg-bg-surface p-4 sm:p-5" aria-labelledby="evidence-pack-preview-title">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-primary-strong dark:text-primary-soft">{copy("Вигляд для отримувача", "Recipient preview")}</p><h3 id="evidence-pack-preview-title" className="mt-1 text-xl font-bold">{packDraft.title.trim() || copy("Пакет матеріалів", "Evidence Pack")}</h3>{packDraft.specialization.trim() && <p className="mt-1 text-sm font-semibold text-text-secondary">{packDraft.specialization}</p>}</div>
              <p className="text-xs text-text-muted">{copy("Посилання діє", "Link expires in")} {packDraft.expiresInDays} {en ? (packDraft.expiresInDays === 1 ? "day" : "days") : (packDraft.expiresInDays === 1 ? "день" : "днів")}</p>
            </div>
            {packDraft.includeProfile && <div className="border-b border-border py-4">
              <h4 className="text-sm font-semibold">{copy("Профіль кандидата", "Candidate profile")}</h4>
              <div className="mt-2 flex items-start gap-3">
                {dashboard?.profile.shareAvatar && dashboard.avatarUrl && <img src={dashboard.avatarUrl} alt="" width={40} height={40} className="size-10 rounded-xl border border-border object-cover" />}
                <div><p className="font-semibold">{dashboard?.profile.displayName.trim() || dashboard?.username}</p>{dashboard?.profile.headline && <p className="mt-0.5 text-sm text-text-secondary">{dashboard.profile.headline}</p>}{dashboard?.profile.specialization && <p className="mt-0.5 text-xs text-text-muted">{dashboard.profile.specialization}</p>}{dashboard?.profile.summary && <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-text-secondary">{dashboard.profile.summary}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-secondary">{dashboard?.profile.githubUrl && <a href={dashboard.profile.githubUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-2.5 py-1.5">GitHub · {dashboard.profile.githubUrl}</a>}{dashboard?.profile.websiteUrl && <a href={dashboard.profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border px-2.5 py-1.5">{copy("Сайт", "Website")} · {dashboard.profile.websiteUrl}</a>}{dashboard?.profile.technologies.map(item => <span key={item} className="rounded-md border border-border px-2 py-1">{item}</span>)}</div>
                </div>
              </div>
            </div>}
            {!!packDraft.skillIds.length && <div className="border-b border-border py-4"><h4 className="text-sm font-semibold">{copy("Компетенції цього пакета", "Pack competencies")}</h4><div className="mt-2 flex flex-wrap gap-1.5">{dashboard?.skills.filter(skill => packDraft.skillIds.includes(skill.id)).map(skill => <span key={skill.id} className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary-strong dark:text-primary-soft">{en ? skill.labelEn : skill.labelUk}</span>)}</div><p className="mt-2 text-xs text-text-muted">{copy("Вибрані компетенції — напрям представлення, а не оцінка чи підтвердження рівня.", "Selected competencies describe the focus; they are not a score or certification.")}</p></div>}
            <div className="grid gap-4 pt-4 md:grid-cols-2">
              <div><h4 className="text-sm font-semibold">{copy("Роботи", "Practical work")} · {packDraft.workIds.length}</h4><div className="mt-2 space-y-2">{dashboard?.works.filter(item => packDraft.workIds.includes(item.id)).map(item => <article key={item.id} className="rounded-xl border border-border bg-bg-base p-3"><p className="font-semibold">{item.title}</p>{item.role && <p className="mt-0.5 text-xs text-text-muted">{item.role}</p>}{item.problem && <div className="mt-2"><p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{copy("Проблема", "Problem")}</p><p className="line-clamp-2 text-xs leading-5 text-text-secondary">{item.problem}</p></div>}{item.solution && <div className="mt-2"><p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{copy("Рішення", "Solution")}</p><p className="line-clamp-2 text-xs leading-5 text-text-secondary">{item.solution}</p></div>}{item.technologies.length > 0 && <p className="mt-2 text-[11px] text-text-muted">{item.technologies.join(" · ")}</p>}{!!item.skillIds.length && <p className="mt-1 text-[11px] text-primary-strong dark:text-primary-soft">{item.skillIds.map(id => { const skill = dashboard.skills.find(candidate => candidate.id === id); return skill ? (en ? skill.labelEn : skill.labelUk) : null; }).filter(Boolean).join(" · ")}</p>}<div className="mt-2 flex flex-wrap gap-2 text-[11px]">{item.repositoryUrl && <span className="text-text-secondary">{copy("Репозиторій", "Repository")}: {item.repositoryUrl}</span>}{item.demoUrl && <span className="text-text-secondary">{copy("Демо", "Demo")}: {item.demoUrl}</span>}{item.sourcePublicId && <span className="font-semibold text-primary-strong dark:text-primary-soft">{copy("Результат StudyCod", "StudyCod result")}</span>}</div></article>)}</div></div>
              <div><h4 className="text-sm font-semibold">{copy("Свідчення", "Skill Evidence")} · {packDraft.evidenceIds.length}</h4><div className="mt-2 space-y-2">{dashboard?.evidence.filter(item => packDraft.evidenceIds.includes(item.id)).map(item => <article key={item.id} className="rounded-xl border border-border bg-bg-base p-3"><p className="font-semibold">{item.sourceTitle}</p><p className="mt-0.5 text-xs text-text-muted">{evidenceSourceLabel(item.sourceType, en)} · {localizePortfolioEvidenceDetail(item.sourceType, item.sourceDetail, en)}</p>{item.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">{item.description}</p>}</article>)}</div></div>
            </div>
            <p className="mt-4 border-t border-border pt-3 text-xs text-text-muted">{copy("Отримувач побачить тільки матеріали з цього попереднього перегляду. Приватна навчальна історія та код не додаються автоматично.", "The recipient will see only the items in this preview. Private learning history and source code are not added automatically.")}</p>
          </section>}
          {createdPackUrl && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3"><label className="text-xs font-bold text-primary-strong dark:text-primary-soft">{copy("Нове посилання на пакет", "New Evidence Pack link")}<span className="mt-1.5 flex gap-2"><input readOnly className={`${fieldClass} mt-0 min-w-0 text-xs`} value={createdPackUrl} onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copyPackUrl()} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-bg-surface px-3 text-xs font-semibold text-text-primary hover:bg-bg-hover"><Copy className="size-3.5" />{copiedPackUrl ? copy("Скопійовано", "Copied") : copy("Копіювати", "Copy")}</button></span></label></div>}
        </form>

        {!!dashboard?.evidencePacks.length && <div className="mt-5"><h3 className="text-sm font-semibold">{copy("Створені посилання", "Created share links")}</h3><div className="mt-2 divide-y divide-border rounded-2xl border border-border px-4">{dashboard.evidencePacks.map(pack => { const expired = new Date(pack.expiresAt).getTime() <= Date.now(); const unavailable = Boolean(pack.revokedAt) || expired; return <article key={pack.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{pack.title}</p><span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${pack.revokedAt ? "bg-accent-error/10 text-accent-error" : expired ? "bg-bg-hover text-text-muted" : "bg-accent-success/10 text-accent-success"}`}>{pack.revokedAt ? copy("Відкликано", "Revoked") : expired ? copy("Термін минув", "Expired") : copy("Активне", "Active")}</span></div><p className="mt-1 text-xs text-text-muted">{pack.workCount} {copy("робіт", "work items")} · {pack.evidenceCount} {copy("свідчень", "evidence items")} · {pack.skillIds.length} {copy("компетенцій", "competencies")} · {copy("до", "until")} {new Date(pack.expiresAt).toLocaleDateString(en ? "en-GB" : "uk-UA")}</p></div><button type="button" onClick={() => void revokeEvidencePack(pack.id)} disabled={unavailable} className="min-h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold text-text-secondary transition hover:border-accent-error/40 hover:text-accent-error disabled:cursor-not-allowed disabled:opacity-40">{copy("Відкликати", "Revoke")}</button></article>; })}</div></div>}
      </section>
    </div>

    {formOpen && <section className="mt-5 rounded-3xl border border-primary/20 bg-bg-surface p-5 sm:p-7" aria-labelledby="portfolio-work-form-title">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="portfolio-work-form-title" className="text-lg font-bold">{editingId ? copy("Змінити роботу", "Edit work") : copy("Нова робота", "Add work")}</h2><p className="mt-1 text-sm text-text-secondary">{copy("Посилання перевіряються як HTTPS. StudyCod не завантажує зовнішні сторінки.", "Links must use HTTPS. StudyCod does not fetch external pages.")}</p></div><button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="min-h-9 rounded-lg px-3 text-sm font-semibold text-text-secondary transition hover:bg-bg-hover">{copy("Закрити", "Close")}</button></div>
      <form onSubmit={event => void saveWork(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">{copy("Назва", "Title")}<input required maxLength={160} className={fieldClass} value={work.title} onChange={event => setWork(current => ({ ...current, title: event.target.value }))} /></label>
        <label className="text-sm font-semibold">{copy("Твоя роль", "Your role")}<input maxLength={120} className={fieldClass} value={work.role} onChange={event => setWork(current => ({ ...current, role: event.target.value }))} placeholder={copy("Автор, розробник…", "Author, developer…")} /></label>
        <label className="text-sm font-semibold sm:col-span-2">{copy("Проблема", "Problem")}<textarea maxLength={4000} className={textAreaClass} value={work.problem} onChange={event => setWork(current => ({ ...current, problem: event.target.value }))} /></label>
        <label className="text-sm font-semibold sm:col-span-2">{copy("Рішення", "Solution")}<textarea maxLength={4000} className={textAreaClass} value={work.solution} onChange={event => setWork(current => ({ ...current, solution: event.target.value }))} /></label>
        <label className="text-sm font-semibold sm:col-span-2">{copy("Технології через кому", "Technologies, separated by commas")}<input className={fieldClass} value={work.technologies.join(", ")} onChange={event => setTechnologies(event.target.value)} placeholder="Java, SQL, REST" /></label>
        <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">{copy("Навички, які демонструє робота", "Skills this work demonstrates")}</legend><div className="mt-3 space-y-3">{skillGroups.map(group => <div key={group.id}><p className="mb-1.5 text-xs font-semibold text-text-muted">{en ? group.labelEn : group.labelUk}</p><div className="flex flex-wrap gap-2">{group.skills.map(skill => <label key={skill.id} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${work.skillIds.includes(skill.id) ? "border-primary/40 bg-primary/5 text-primary-strong dark:text-primary-soft" : "border-border text-text-secondary hover:bg-bg-hover"}`}><input type="checkbox" className="accent-primary" checked={work.skillIds.includes(skill.id)} onChange={event => setWork(current => ({ ...current, skillIds: event.target.checked ? [...current.skillIds, skill.id].slice(0, 12) : current.skillIds.filter(id => id !== skill.id) }))} />{en ? skill.labelEn : skill.labelUk}</label>)}</div></div>)}</div><p className="mt-2 text-xs text-text-muted">{copy("Це авторський опис роботи, не автоматична оцінка компетенцій.", "These are owner-selected labels, not an automated competence score.")}</p></fieldset>
        <label className="text-sm font-semibold">{copy("Посилання на код", "Source repository URL")}<input type="url" inputMode="url" className={fieldClass} value={work.repositoryUrl ?? ""} onChange={event => setWork(current => ({ ...current, repositoryUrl: event.target.value || null }))} placeholder="https://github.com/username/project" /></label>
        <label className="text-sm font-semibold">{copy("Демонстрація", "Demo URL")}<input type="url" inputMode="url" className={fieldClass} value={work.demoUrl ?? ""} onChange={event => setWork(current => ({ ...current, demoUrl: event.target.value || null }))} placeholder="https://example.com" /></label>
          <label className="text-sm font-semibold sm:col-span-2">{copy("Видимість роботи", "Work visibility")}<select className={fieldClass} value={work.visibility} onChange={event => setWork(current => ({ ...current, visibility: event.target.value as PortfolioWork["visibility"] }))}><option value="PRIVATE">{copy("Приватна", "Private")}</option><option value="PUBLIC" disabled={dashboard?.publicSharingAgeStatus !== "ADULT"}>{copy("Публічна", "Public")}</option></select></label>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 sm:col-span-2"><button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-text-secondary transition hover:bg-bg-hover">{copy("Скасувати", "Cancel")}</button><button type="submit" disabled={savingWork} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 active:translate-y-px disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{savingWork ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{savingWork ? copy("Збереження…", "Saving…") : copy("Зберегти роботу", "Save work")}</button></div>
      </form>
    </section>}
  </main>;
};
