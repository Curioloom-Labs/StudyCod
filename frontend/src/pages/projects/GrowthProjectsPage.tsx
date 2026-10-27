import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, CircleAlert, Code2, FileCode2, FolderKanban, LoaderCircle, Plus, Save, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { getCachedMeUser } from "../../lib/api/profile";
import {
  cancelGrowthAssessment, cancelGrowthJob, createGrowthProject, createGrowthPublication, finishGrowthAssessment, getGrowthCatalog, getGrowthJob,
  getGrowthProject, getGrowthProjects, getGrowthExecutionPage, getLegacyGrowthProjects, importLegacyGrowthProject, runGrowthCheck, saveGrowthDraft,
  getGrowthVersion, getGrowthVersionPage, restoreGrowthVersion, revokeGrowthPublication, replaceGrowthPublicationVersion, rotateGrowthPublicationLink, setGrowthProjectArchived, setGrowthPublicationReviews,
  setGrowthReviewPublic, startGrowthAssessment, submitGrowthVersion,
  requestGrowthReview, type GrowthDraft, type GrowthFile, type GrowthRuntime, type GrowthStage,
} from "../../lib/api/growthProjects";

const FullGrowthCodeEditor = React.lazy(() => import("../../components/CodeEditor").then(module => ({ default: module.CodeEditor })));
type GrowthEditorMode = "light" | "monaco";

function initialGrowthEditorMode(): GrowthEditorMode {
  try {
    const saved = localStorage.getItem("studycod-growth-editor-mode");
    if (saved === "light" || saved === "monaco") return saved;
  } catch { /* use the device-based default */ }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weakDevice = window.matchMedia("(max-width: 767px)").matches
    || (Number.isFinite(nav.hardwareConcurrency) && nav.hardwareConcurrency <= 4)
    || (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4)
    || typeof nav.deviceMemory !== "number";
  return weakDevice ? "light" : "monaco";
}

type Catalog = { families: Array<{ key: string; title: string; summary: string; recommendedPrep: string; skills: string[]; runtimes: GrowthRuntime[]; stages: Array<{ key: GrowthStage; title: string; description: string; examples: Array<{ input: string; output: string }> }> }> };

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("studycod-growth-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveRecovery(key: string, draft: GrowthDraft) {
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put({ key, draft, savedAt: Date.now() });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* recovery is best-effort */ }
}
async function readRecovery(key: string): Promise<GrowthDraft | null> {
  try {
    const db = await openDraftDb();
    const value = await new Promise<any>((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close(); return value?.draft ?? null;
  } catch { return null; }
}
function messageOf(error: any, fallback: string) { return String(error?.response?.data?.message ?? error?.response?.data?.code ?? fallback); }
function nextActionLabel(action: string, en: boolean): string {
  const labels: Record<string, [string, string]> = {
    CONTINUE: ["Продовжити роботу", "Continue working"], WAIT: ["Перевірка триває", "Check in progress"],
    SUBMIT: ["Зарахувати версію", "Submit version"], CHECK: ["Перевірити чернетку", "Check draft"],
    DEFENSE: ["Пройти захист", "Start defense"], CONTINUE_DEFENSE: ["Продовжити захист", "Continue defense"],
    TRANSFER: ["Виконати задачу перенесення", "Try transfer task"], CONTINUE_TRANSFER: ["Продовжити перенесення", "Continue transfer"],
    PORTFOLIO: ["Оформити роботу", "Prepare portfolio"], ARCHIVED: ["В архіві · історію збережено", "Archived · history preserved"],
  };
  const label = labels[action] ?? labels.CONTINUE;
  return en ? label[1] : label[0];
}

export const GrowthProjectsPage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language.toLowerCase().startsWith("en");
  const [catalog, setCatalog] = React.useState<Catalog | null>(null);
  const [projects, setProjects] = React.useState<Array<Record<string, any>>>([]);
  const [legacyProjects, setLegacyProjects] = React.useState<Array<Record<string, any>>>([]);
  const [selected, setSelected] = React.useState<Record<string, any> | null>(null);
  const [viewedVersion, setViewedVersion] = React.useState<Record<string, any> | null>(null);
  const [reviewVersionId, setReviewVersionId] = React.useState("");
  const [reviewEvidenceIds, setReviewEvidenceIds] = React.useState<string[]>([]);
  const [publicationVersionId, setPublicationVersionId] = React.useState("");
  const [publicationEvidenceIds, setPublicationEvidenceIds] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState<GrowthDraft>({ files: [], examples: [], explanation: "" });
  const [revision, setRevision] = React.useState(1);
  const [activeFile, setActiveFile] = React.useState("");
  const [assessment, setAssessment] = React.useState<Record<string, any> | null>(null);
  const [workspaceTab, setWorkspaceTab] = React.useState<"work" | "history" | "portfolio">("work");
  const [homeTab, setHomeTab] = React.useState<"mine" | "catalog" | "previous">("mine");
  const [job, setJob] = React.useState<Record<string, any> | null>(null);
  const [explanation, setExplanation] = React.useState("");
  const [exampleInput, setExampleInput] = React.useState("");
  const [exampleOutput, setExampleOutput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loadingOlderVersions, setLoadingOlderVersions] = React.useState(false);
  const [loadingOlderExecutions, setLoadingOlderExecutions] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const [editorMode, setEditorMode] = React.useState<GrowthEditorMode>(initialGrowthEditorMode);
  const [error, setError] = React.useState("");
  const [homeLoadState, setHomeLoadState] = React.useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = React.useState("");
  const [params, setParams] = useSearchParams();
  const ownerScope = String(getCachedMeUser()?.id ?? "anonymous");
  const isSystemAdmin = getCachedMeUser()?.role === "SYSTEM_ADMIN";
  const lastServerDraft = React.useRef("");
  const lastRemoteSaveAt = React.useRef(0);
  const autosaveBusy = React.useRef(false);
  const projectId = params.get("project");
  const assessmentId = assessment?.id as string | undefined;
  const file = draft.files.find(item => item.path === activeFile) ?? draft.files[0];
  const selectedFamily = selected ? catalog?.families.find(item => item.key === selected.family) : undefined;
  const selectedStage = selectedFamily?.stages.find(item => item.key === selected?.stage);
  const publicExamples = assessment ? (assessment.card?.examples ?? []) : (selectedStage?.examples ?? []);
  React.useEffect(() => setWorkspaceTab("work"), [projectId]);
  const latestV3Version = selected?.versions?.find((item: any) => item.stage_key === "V3");
  const defensePassedForLatest = selected?.attempts?.some((item: any) => item.kind === "DEFENSE" && item.status === "PASSED" && item.source_version_id === latestV3Version?.id) ?? false;
  const reviewVersion = selected?.versions?.find((item: any) => item.id === reviewVersionId) ?? selected?.versions?.[0];
  const reviewableAttempts = selected?.attempts?.filter((item: any) => item.status === "PASSED" && item.source_version_id === reviewVersion?.id) ?? [];
  const publicationVersion = selected?.versions?.find((item: any) => item.id === publicationVersionId) ?? selected?.versions?.[0];
  const publishableAttempts = selected?.attempts?.filter((item: any) => item.status === "PASSED" && item.source_version_id === publicationVersion?.id) ?? [];
  const jobMatchesCurrentContext = Boolean(selected && job?.context === (assessmentId ? "assessment:" + assessmentId : selected.stage));

  const refresh = React.useCallback(async () => setProjects(await getGrowthProjects()), []);
  const loadHome = React.useCallback(async () => {
    setHomeLoadState("loading");
    setError("");
    const [catalogResult, projectsResult, legacyProjectsResult] = await Promise.allSettled([
      getGrowthCatalog(),
      getGrowthProjects(),
      getLegacyGrowthProjects(),
    ]);
    if (catalogResult.status === "fulfilled") setCatalog(catalogResult.value);
    if (projectsResult.status === "fulfilled") setProjects(projectsResult.value);
    if (legacyProjectsResult.status === "fulfilled") setLegacyProjects(legacyProjectsResult.value);
    const failure = [catalogResult, projectsResult, legacyProjectsResult].find(result => result.status === "rejected");
    if (failure?.status === "rejected") {
      setError(messageOf(failure.reason, en ? "Could not load projects. Try again." : "Не вдалося завантажити проєкти. Спробуй ще раз."));
      setHomeLoadState("error");
      return;
    }
    setHomeLoadState("ready");
  }, [en]);
  React.useEffect(() => {
    void loadHome();
  }, [loadHome]);
  React.useEffect(() => {
    setReviewVersionId(selected?.versions?.[0]?.id ?? "");
    setReviewEvidenceIds([]);
    setPublicationVersionId(selected?.versions?.[0]?.id ?? "");
    setPublicationEvidenceIds([]);
  }, [selected?.id, selected?.versions?.[0]?.id]);
  React.useEffect(() => {
    if (!projectId) { setSelected(null); setAssessment(null); setJob(null); return; }
    let cancelled = false;
    setBusy(true);
    void getGrowthProject(projectId).then(async project => {
      if (cancelled) return;
      setSelected(project); setViewedVersion(null); setDraft(project.draft); setRevision(Number(project.revision)); setActiveFile(project.draft.files[0]?.path ?? "");
      setExplanation(project.draft.explanation ?? "");
      lastServerDraft.current = JSON.stringify(project.draft); lastRemoteSaveAt.current = 0; setSaveState("saved");
      const attempt = project.attempts?.find((item: any) => item.status === "ACTIVE");
      if (attempt) {
        const response = await fetch("/api/projects/" + project.id + "/assessments/" + attempt.id, { credentials: "include" });
        if (response.ok && !cancelled) {
          const data = await response.json(); setAssessment(data.assessment); setDraft(data.assessment.draft);
          setRevision(Number(data.assessment.revision)); setActiveFile(data.assessment.draft.files[0]?.path ?? "");
          setExplanation(data.assessment.draft.explanation ?? "");
          lastServerDraft.current = JSON.stringify(data.assessment.draft); lastRemoteSaveAt.current = 0; setSaveState("saved");
          const localAttempt = await readRecovery(ownerScope + ":" + project.id + ":" + attempt.id);
          if (localAttempt && JSON.stringify(localAttempt) !== JSON.stringify(data.assessment.draft) && !cancelled && window.confirm(en ? "A local recovery copy differs from the server. Restore it?" : "Локальна копія відрізняється від серверної. Відновити її?")) { setDraft(localAttempt); setExplanation(localAttempt.explanation ?? ""); }
        }
      } else {
        const local = await readRecovery(ownerScope + ":" + project.id + ":" + project.stage);
        if (local && JSON.stringify(local) !== JSON.stringify(project.draft) && !cancelled && window.confirm(en ? "A local recovery copy differs from the server. Restore it?" : "Локальна копія відрізняється від серверної. Відновити її?")) { setDraft(local); setExplanation(local.explanation ?? ""); }
      }
      const context = attempt?.id ? `assessment:${attempt.id}` : project.stage;
      const stored = sessionStorage.getItem("growth-job:" + project.id + ":" + (attempt?.id ?? project.stage));
      let found = stored ? await getGrowthJob(stored).catch(() => null) : null;
      if (!found) found = project.executions?.find((item: any) => item.context === context) ?? null;
      if (!cancelled && found) setJob(found);
    }).catch(err => { if (!cancelled) setError(messageOf(err, "Не вдалося відкрити проєкт")); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [projectId, en, ownerScope]);
  React.useEffect(() => {
    if (!selected) return;
    const key = ownerScope + ":" + selected.id + ":" + (assessmentId ?? selected.stage);
    const timer = window.setTimeout(() => { void saveRecovery(key, draft); }, 500);
    return () => window.clearTimeout(timer);
  }, [selected, assessmentId, draft, ownerScope]);
  React.useEffect(() => {
    if (!selected || selected.source || !draft.files.length) return;
    const serialized = JSON.stringify(draft);
    if (serialized === lastServerDraft.current) { setSaveState("saved"); return; }
    setSaveState("unsaved");
    let timer = 0;
    const delay = Math.max(2000, 5000 - (Date.now() - lastRemoteSaveAt.current));
    timer = window.setTimeout(async () => {
      if (autosaveBusy.current || serialized === lastServerDraft.current) return;
      autosaveBusy.current = true;
      setSaveState("saving");
      try {
        const saved = await saveGrowthDraft(selected.id, draft, revision, assessmentId);
        lastServerDraft.current = serialized; lastRemoteSaveAt.current = Date.now(); setRevision(saved.revision); setSaveState("saved");
      } catch { setSaveState("error"); }
      finally { autosaveBusy.current = false; }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [selected, draft, revision, assessmentId]);
  React.useEffect(() => {
    try { localStorage.setItem("studycod-growth-editor-mode", editorMode); } catch { /* preference is optional */ }
  }, [editorMode]);
  React.useEffect(() => {
    if (!job?.id || !["QUEUED", "RUNNING"].includes(job.state)) return;
    let cancelled = false; let timer = 0; let delay = 2000;
    const poll = async () => {
      if (document.visibilityState === "hidden") { timer = window.setTimeout(poll, 10000); return; }
      const next = await getGrowthJob(job.id).catch(() => null);
      if (cancelled) return;
      if (next) {
        setJob(next);
        setSelected((current: any) => current ? { ...current, executions: [next, ...(current.executions ?? []).filter((item: any) => item.id !== next.id)] } : current);
        if (!["QUEUED", "RUNNING"].includes(next.state)) { void refresh(); return; }
      }
      delay = Math.min(10000, delay * 2); timer = window.setTimeout(poll, delay);
    };
    timer = window.setTimeout(poll, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [job?.id, job?.state, refresh]);

  const startProject = async (family: string, runtime: GrowthRuntime) => {
    setBusy(true); setError("");
    try { const result = await createGrowthProject(family, runtime); await refresh(); setParams({ project: result.id }); }
    catch (err) { setError(messageOf(err, "Не вдалося створити проєкт")); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    setSaveState("saving");
    try { const result = await saveGrowthDraft(selected.id, draft, revision, assessmentId); lastServerDraft.current = JSON.stringify(draft); lastRemoteSaveAt.current = Date.now(); setRevision(result.revision); setSaveState("saved"); setNotice(en ? "Draft saved" : "Чернетку збережено"); }
    catch (err) { setSaveState("error"); setError(messageOf(err, "Помилка збереження")); } finally { setBusy(false); }
  };
  const check = async () => {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      setSaveState("saving");
      const saved = await saveGrowthDraft(selected.id, draft, revision, assessmentId); lastServerDraft.current = JSON.stringify(draft); lastRemoteSaveAt.current = Date.now(); setRevision(saved.revision); setSaveState("saved");
      const result = await runGrowthCheck(selected.id, selected.stage as GrowthStage, saved.revision, assessmentId);
      const queuedJob = { id: result.jobId, state: "QUEUED", context: assessmentId ? `assessment:${assessmentId}` : selected.stage, createdAt: new Date().toISOString() };
      setJob(queuedJob);
      setSelected((current: any) => current ? { ...current, executions: [queuedJob, ...(current.executions ?? []).filter((item: any) => item.id !== queuedJob.id)] } : current);
      sessionStorage.setItem("growth-job:" + selected.id + ":" + (assessmentId ?? selected.stage), result.jobId);
      setNotice(en ? "Queued on the shared Judge. The result is saved if you leave." : "Перевірку додано до спільної черги. Результат збережеться, навіть якщо закрити сторінку.");
    } catch (err) { setError(messageOf(err, "Не вдалося додати перевірку")); } finally { setBusy(false); }
  };
  const cancelCheck = async () => {
    if (!selected || !job?.id) return;
    setBusy(true); setError("");
    try {
      await cancelGrowthJob(selected.id, job.id);
      setJob(await getGrowthJob(job.id));
      setNotice(en ? "Execution cancelled." : "Виконання скасовано.");
    } catch (err) { setError(messageOf(err, "Не вдалося скасувати перевірку")); }
    finally { setBusy(false); }
  };
  const startAssessment = async (kind: "DEFENSE" | "TRANSFER") => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const storageKey = "growth-assessment-idempotency:" + selected.id + ":" + kind;
      const key = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
      const next = await startGrowthAssessment(selected.id, kind, key); sessionStorage.removeItem(storageKey); setAssessment(next); setJob(null);
      setDraft(next.draft); setRevision(next.revision); setActiveFile(next.draft.files[0]?.path ?? ""); setExplanation(next.draft.explanation ?? "");
    } catch (err) { setError(messageOf(err, "Не вдалося почати спробу")); } finally { setBusy(false); }
  };
  const cancelAssessment = async () => {
    if (!selected || !assessment) return;
    setBusy(true); setError("");
    try {
      await cancelGrowthAssessment(selected.id, assessment.id);
      sessionStorage.removeItem("growth-job:" + selected.id + ":" + assessment.id);
      sessionStorage.removeItem("growth-assessment-idempotency:" + selected.id + ":" + assessment.kind);
      setAssessment(null); setJob(null);
      const latest = await getGrowthProject(selected.id); setSelected(latest); setDraft(latest.draft); setRevision(Number(latest.revision)); setActiveFile(latest.draft.files[0]?.path ?? ""); setExplanation(latest.draft.explanation ?? "");
      lastServerDraft.current = JSON.stringify(latest.draft); lastRemoteSaveAt.current = Date.now(); await refresh();
    } catch (err) { setError(messageOf(err, "Не вдалося скасувати спробу")); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!selected || !job?.id || !jobMatchesCurrentContext) return;
    setBusy(true); setError("");
    try {
      const storageKey = "growth-version-idempotency:" + selected.id + ":" + job.id;
      const fingerprint = JSON.stringify({ jobId: job.id, revision, explanation });
      let stored: { key?: string; fingerprint?: string } = {};
      try { stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}"); } catch { stored = {}; }
      const key = stored.fingerprint === fingerprint && stored.key ? stored.key : crypto.randomUUID();
      sessionStorage.setItem(storageKey, JSON.stringify({ key, fingerprint }));
      await submitGrowthVersion(selected.id, job.id, revision, explanation, key); sessionStorage.removeItem(storageKey); setJob(null); setExplanation("");
      sessionStorage.removeItem("growth-job:" + selected.id + ":" + selected.stage);
      const latest = await getGrowthProject(selected.id); setSelected(latest); setDraft(latest.draft); setRevision(Number(latest.revision)); setActiveFile(latest.draft.files[0]?.path ?? ""); setExplanation(latest.draft.explanation ?? "");
      await refresh(); setParams({ project: selected.id });
    } catch (err) { setError(messageOf(err, "Не вдалося зарахувати версію")); } finally { setBusy(false); }
  };
  const finish = async () => {
    if (!selected || !assessment || !jobMatchesCurrentContext) return;
    setBusy(true); setError("");
    try {
      await finishGrowthAssessment(selected.id, assessment.id, explanation); sessionStorage.removeItem("growth-assessment-idempotency:" + selected.id + ":" + assessment.kind); setAssessment(null); setJob(null);
      const latest = await getGrowthProject(selected.id); setSelected(latest); setDraft(latest.draft); setRevision(Number(latest.revision)); setActiveFile(latest.draft.files[0]?.path ?? ""); setExplanation(latest.draft.explanation ?? "");
      lastServerDraft.current = JSON.stringify(latest.draft); lastRemoteSaveAt.current = Date.now(); await refresh();
    }
    catch (err) { setError(messageOf(err, "Не вдалося завершити спробу")); } finally { setBusy(false); }
  };
  const publish = async (version: Record<string, any>, channel: "LINK" | "PROFILE") => {
    if (!selected) return;
    const title = window.prompt(en ? "Portfolio title" : "Назва роботи", catalog?.families.find(item => item.key === selected.family)?.title ?? "StudyCod");
    if (!title) return;
    setBusy(true); setError("");
    try {
      const includeReviews = window.confirm(en ? "Include any reviews made public for this version?" : "Додати опубліковані автором рецензії саме цієї версії?");
      const assessmentIds = publicationVersion?.id === version.id ? publicationEvidenceIds : [];
      const payload = { versionId: version.id, channel, title, description: explanation, assessmentIds, includeReviews, demoIndex: selected.source ? undefined : 0 };
      const idempotencyStorageKey = "growth-publication-idempotency:" + selected.id + ":" + channel + ":" + version.id;
      const fingerprint = JSON.stringify(payload);
      let savedKey: { key?: string; fingerprint?: string } = {};
      try { savedKey = JSON.parse(sessionStorage.getItem(idempotencyStorageKey) ?? "{}"); } catch { savedKey = {}; }
      const idempotencyKey = savedKey.fingerprint === fingerprint && savedKey.key ? savedKey.key : crypto.randomUUID();
      sessionStorage.setItem(idempotencyStorageKey, JSON.stringify({ key: idempotencyKey, fingerprint }));
      const result = await createGrowthPublication(selected.id, payload, idempotencyKey);
      sessionStorage.removeItem(idempotencyStorageKey);
      setNotice(result.url ? ((en ? "Share link: " : "Посилання: ") + window.location.origin + result.url) : (en ? "Added to your public profile." : "Додано до публічної вітрини профілю."));
      setSelected(await getGrowthProject(selected.id));
    } catch (err) { setError(messageOf(err, "Не вдалося опублікувати")); } finally { setBusy(false); }
  };
  const updateFile = (content: string) => setDraft(old => ({ ...old, files: old.files.map(item => item.path === file?.path ? { ...item, content } : item) }));
  const indentLightEditor = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.shiftKey || event.currentTarget.readOnly) return;
    event.preventDefault();
    const editor = event.currentTarget;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText("\t", start, end, "end");
    updateFile(editor.value);
    window.requestAnimationFrame(() => editor.setSelectionRange(start + 1, start + 1));
  };
  const addExample = () => {
    if (!exampleInput && !exampleOutput) return;
    setDraft(old => ({ ...old, examples: [...old.examples, { input: exampleInput, output: exampleOutput }] }));
    setExampleInput(""); setExampleOutput("");
  };
  const importPreviousWork = async (source: Record<string, any>) => {
    setBusy(true); setError("");
    try { const result = await importLegacyGrowthProject(source.kind, Number(source.sourceId)); await refresh(); setParams({ project: result.id }); }
    catch (err) { setError(messageOf(err, "Не вдалося додати попередню роботу")); } finally { setBusy(false); }
  };
  const toggleArchive = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { await setGrowthProjectArchived(selected.id, !selected.archived); setSelected(await getGrowthProject(selected.id)); await refresh(); }
    catch (err) { setError(messageOf(err, "Не вдалося змінити стан архіву")); }
    finally { setBusy(false); }
  };
  const loadVersion = async (versionId: string) => {
    if (!selected) return;
    setBusy(true); setError("");
    try { setViewedVersion(await getGrowthVersion(selected.id, versionId)); }
    catch (err) { setError(messageOf(err, "Не вдалося відкрити версію")); }
    finally { setBusy(false); }
  };
  const loadOlderVersions = async () => {
    if (!selected || loadingOlderVersions) return;
    const currentVersions = selected.versions ?? [];
    const last = currentVersions[currentVersions.length - 1];
    if (!last) return;
    setLoadingOlderVersions(true); setError("");
    try {
      const page = await getGrowthVersionPage(selected.id, String(last.created_at), String(last.id));
      setSelected((current: any) => current?.id === selected.id ? {
        ...current,
        versions: [...(current.versions ?? []), ...page.versions.filter(version => !(current.versions ?? []).some((item: any) => item.id === version.id))],
        versionsHasMore: page.hasMore,
      } : current);
    } catch (err) { setError(messageOf(err, "Не вдалося завантажити старіші версії")); }
    finally { setLoadingOlderVersions(false); }
  };
  const loadOlderExecutions = async () => {
    if (!selected || loadingOlderExecutions) return;
    const currentExecutions = selected.executions ?? [];
    const last = currentExecutions[currentExecutions.length - 1];
    if (!last) return;
    setLoadingOlderExecutions(true); setError("");
    try {
      const page = await getGrowthExecutionPage(selected.id, String(last.createdAt), String(last.id));
      setSelected((current: any) => current?.id === selected.id ? {
        ...current,
        executions: [...(current.executions ?? []), ...page.executions.filter(item => !(current.executions ?? []).some((entry: any) => entry.id === item.id))],
        executionsHasMore: page.hasMore,
      } : current);
    } catch (err) { setError(messageOf(err, "Не вдалося завантажити попередні результати")); }
    finally { setLoadingOlderExecutions(false); }
  };
  const selectExecution = async (execution: Record<string, any>) => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const full = await getGrowthJob(String(execution.id));
      setJob(full);
      if (full.context?.startsWith("assessment:")) {
        const attemptId = full.context.slice("assessment:".length);
        const attempt = selected.attempts?.find((item: any) => item.id === attemptId);
        if (attempt?.status === "ACTIVE") {
          const response = await fetch("/api/projects/" + selected.id + "/assessments/" + attemptId, { credentials: "include" });
          if (response.ok) setAssessment((await response.json()).assessment);
        }
      }
    } catch (err) { setError(messageOf(err, "Не вдалося відкрити результат перевірки")); }
    finally { setBusy(false); }
  };
  const restoreVersion = async () => {
    if (!selected || !viewedVersion || assessment) return;
    setBusy(true); setError("");
    try {
      const restored = await restoreGrowthVersion(selected.id, viewedVersion.id, revision);
      setDraft(restored.draft); setRevision(restored.revision); setExplanation(restored.draft.explanation ?? "");
      setActiveFile(restored.draft.files[0]?.path ?? ""); lastServerDraft.current = JSON.stringify(restored.draft); lastRemoteSaveAt.current = Date.now();
      setSelected(await getGrowthProject(selected.id)); setNotice(en ? "Version copied into the current draft." : "Версію скопійовано в поточну чернетку.");
    } catch (err) { setError(messageOf(err, "Не вдалося відновити версію")); }
    finally { setBusy(false); }
  };

  return <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 pb-16 sm:px-6 lg:px-8">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-primary-soft"><FolderKanban className="h-4 w-4" />StudyCod · {en ? "Project practice" : "Проєктна практика"}</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{en ? "Build something useful, one step at a time" : "Створюй корисні проєкти крок за кроком"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{en ? "Start small, add real features, and keep the versions you are proud to show." : "Почни з малого, додавай справжні можливості й зберігай версії, які хочеш показати іншим."}</p>
      </div>
      {selected && <button type="button" onClick={() => setParams({})} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-bg-hover"><ArrowLeft className="h-4 w-4" />{en ? "All projects" : "Усі проєкти"}</button>}
      {!selected && <div className="flex gap-2"><button type="button" onClick={() => window.location.assign("/projects/reviews")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-bg-hover">{en ? "Review inbox" : "Черга рецензій"}</button>{isSystemAdmin && <button type="button" onClick={() => window.location.assign("/projects/admin/reviews")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-bg-hover">{en ? "Admin review queue" : "Адмінчерга рецензій"}</button>}</div>}
    </header>
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300"><span>{error}</span>{!selected && homeLoadState === "error" && <button type="button" onClick={() => void loadHome()} className="min-h-10 shrink-0 rounded-lg border border-red-400/30 px-3 font-semibold hover:bg-red-500/10">{en ? "Try again" : "Спробувати ще"}</button>}</div>}
    {notice && <div role="status" className="mb-4 break-all rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary-soft">{notice}</div>}

    {!selected && <>
      <nav aria-label={en ? "Project views" : "Розділи проєктів"} className="mb-6 flex w-full flex-wrap gap-1 rounded-xl border border-border bg-bg-surface p-1">
        {([ ["mine", en ? "My projects" : "Мої проєкти"], ["catalog", en ? "Explore projects" : "Обрати проєкт"], ["previous", en ? "Previous work" : "Попередні роботи"] ] as const).map(([tab, label]) => <button key={tab} type="button" aria-pressed={homeTab === tab} onClick={() => setHomeTab(tab)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${homeTab === tab ? "bg-bg-hover text-primary-soft" : "text-text-secondary hover:bg-bg-hover/70 hover:text-text-primary"}`}>
          {label}{tab === "mine" && <span className="ml-2 text-xs tabular-nums text-text-muted">{projects.length}</span>}{tab === "previous" && <span className="ml-2 text-xs tabular-nums text-text-muted">{legacyProjects.length}</span>}
        </button>)}
      </nav>
      {homeLoadState === "loading" && <div className="grid gap-3 md:grid-cols-2" role="status" aria-label={en ? "Loading projects" : "Завантаження проєктів"}><div className="h-28 animate-pulse rounded-2xl bg-bg-hover" /><div className="h-28 animate-pulse rounded-2xl bg-bg-hover" /></div>}
      {homeLoadState === "ready" && homeTab === "mine" && <section className="mb-8">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold">{en ? "My projects" : "Мої проєкти"}</h2><p className="mt-1 text-sm text-text-secondary">{en ? "Continue a draft or open a saved result." : "Продовж чернетку або відкрий збережений результат."}</p></div><span className="rounded-full bg-bg-hover px-3 py-1 text-sm">{projects.length}</span></div>
        {projects.length ? <div className="grid gap-3 md:grid-cols-2">{projects.map(project => {
          const family = catalog?.families.find(item => item.key === project.family_key);
          return <button type="button" key={project.id} onClick={() => setParams({ project: project.id })} className="rounded-2xl border border-border bg-bg-surface p-5 text-left shadow-sm transition hover:border-primary-soft">
            <div className="text-xs font-bold uppercase tracking-wide text-primary-soft">{project.source ? (en ? "Prior learning · " : "Попередня робота · ") : ""}{project.runtime} · {project.current_stage}</div><div className="mt-2 text-lg font-bold">{family?.title ?? project.source?.title ?? project.family_key}</div>
            <div className="mt-1 text-sm text-text-secondary">{nextActionLabel(project.nextAction, en)}</div>
          </button>;
        })}</div> : <div className="rounded-2xl border border-dashed border-border p-6 text-center"><p className="text-sm text-text-secondary">{en ? "You do not have a project yet. Explore the catalogue to choose a starting point." : "Поки немає робіт. Перейди в каталог, щоб обрати перший проєкт."}</p><button type="button" onClick={() => setHomeTab("catalog")} className="mt-3 min-h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary-soft">{en ? "Explore projects" : "Обрати проєкт"}</button></div>}
      </section>}
      {homeLoadState === "ready" && homeTab === "previous" && <section className="mb-8 rounded-2xl border border-border/70 bg-bg-surface p-5">
        <div className="mb-4"><h2 className="text-xl font-bold">{en ? "Bring in previous work" : "Додай попередню роботу"}</h2><p className="mt-1 text-sm leading-6 text-text-secondary">{en ? "Add a copy to your portfolio. The original stays in its course or mini-project, and the copy is clearly marked as prior learning." : "Додай копію до портфоліо. Оригінал залишиться в курсі чи мініпроєкті, а копія матиме позначку про попереднє навчання."}</p></div>
        <div className="grid gap-2 sm:grid-cols-2">{legacyProjects.map(source => <article key={source.kind + ":" + source.sourceId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-base p-4"><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{source.title}</h3><p className="mt-1 truncate text-xs text-text-muted">{source.description || source.kind} · {source.runtime}</p></div>{source.imported ? <span className="rounded-full bg-primary/10 px-3 py-2 text-xs font-semibold text-primary-soft">{en ? "Already added" : "Уже додано"}</span> : <button type="button" disabled={busy} onClick={() => void importPreviousWork(source)} className="min-h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">{en ? "Add copy" : "Додати копію"}</button>}</article>)}{!legacyProjects.length && <p className="text-sm text-text-secondary">{en ? "No previous project work found yet." : "Попередніх проєктів поки не знайдено."}</p>}</div>
      </section>}
      {homeLoadState === "ready" && homeTab === "catalog" && <section><h2 className="mb-1 text-xl font-bold">{en ? "Explore project tracks" : "Обери напрям проєкту"}</h2><p className="mb-4 text-sm text-text-secondary">{en ? "Start with a small console program. You can grow it in stages and keep each checked version." : "Почни з невеликої консольної програми. Її можна розвивати поступово й зберігати кожну перевірену версію."}</p>
        <div className="grid gap-4">{catalog?.families.map(family => <article key={family.key} className="rounded-2xl border border-border bg-bg-surface p-5">
          <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-primary-soft">{en ? "Three staged versions" : "Три послідовні версії"}</div><h3 className="mt-2 text-xl font-bold">{family.title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{family.summary}</p></div><Code2 className="h-5 w-5 text-primary-soft" /></div>
          <p className="mt-3 text-xs leading-5 text-text-muted">{family.recommendedPrep}</p><div className="mt-4 flex flex-wrap gap-2">{family.skills.map(skill => <span key={skill} className="rounded-full bg-bg-hover px-3 py-1 text-xs text-text-secondary">{skill}</span>)}</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">{family.stages.map(stage => <div key={stage.key} className="rounded-xl bg-bg-base p-3"><div className="text-xs font-bold text-primary-soft">{stage.key}</div><div className="mt-1 text-sm font-semibold">{stage.title}</div><p className="mt-1 text-xs leading-5 text-text-secondary">{stage.description}</p></div>)}</div>
          <div className="mt-4 flex flex-wrap gap-2">{family.runtimes.map(runtime => <button type="button" disabled={busy} key={runtime} onClick={() => void startProject(family.key, runtime)} className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold hover:border-primary-soft disabled:opacity-50">{en ? "Start" : "Почати"} · {runtime}</button>)}</div>
        </article>) ?? <div className="h-32 animate-pulse rounded-2xl bg-bg-hover" />}</div>
      </section>}
    </>}

    {selected && <>
      <nav aria-label={en ? "Project workspace" : "Робочі розділи проєкту"} className="mb-4 flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-bg-surface p-1">
        {([["work", en ? "Build" : "Розробка"], ["history", en ? "History" : "Історія"], ["portfolio", en ? "Portfolio & review" : "Портфоліо й відгук"]] as const).map(([tab, label]) => <button key={tab} type="button" aria-pressed={workspaceTab === tab} onClick={() => setWorkspaceTab(tab)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${workspaceTab === tab ? "bg-bg-hover text-primary-soft" : "text-text-secondary hover:bg-bg-hover/70 hover:text-text-primary"}`}>
          {label}{tab === "history" && <span className="ml-2 text-xs tabular-nums text-text-muted">{selected.executions?.length ?? 0}</span>}{tab === "portfolio" && <span className="ml-2 text-xs tabular-nums text-text-muted">{selected.versions?.length ?? 0}</span>}
        </button>)}
      </nav>
      <div className={`grid gap-5 ${workspaceTab === "work" ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1"}`}>
      {workspaceTab === "work" && <section className="min-w-0 rounded-2xl border border-border bg-bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div>
          <div className="text-xs font-bold uppercase tracking-wider text-primary-soft">{selected.runtime} · {assessment ? (assessment.kind === "DEFENSE" ? (en ? "Defense" : "Захист") : assessment.kind === "COMPANY_TASK" ? (en ? "Company task" : "Завдання компанії") : (en ? "Transfer" : "Перенесення")) : selected.stage}</div>
          <h2 className="mt-2 text-2xl font-bold">{selectedFamily?.title ?? selected.source?.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{assessment?.card?.prompt ?? selected.source?.description ?? selectedStage?.description}</p>
        </div><div className="flex gap-1 rounded-xl bg-bg-hover p-1">{(["V1", "V2", "V3"] as GrowthStage[]).map(stage => <span key={stage} className={"rounded-lg px-3 py-2 text-xs font-bold " + (selected.stage === stage ? "bg-bg-surface text-primary-soft" : "text-text-muted")}>{stage}</span>)}</div></div>
        {assessment && <div className="mt-4 rounded-xl border border-accent-warn/30 bg-accent-warn/5 p-3 text-sm leading-6 text-text-secondary">{en ? "Built-in AI is disabled for this attempt; documentation is allowed. The platform cannot verify whether outside help was used." : "Вбудований AI вимкнений для цієї спроби; документацією користуватися можна. Платформа не може перевірити використання зовнішньої допомоги."}</div>}
        {!!publicExamples.length && <details className="mt-4 rounded-xl border border-border bg-bg-base"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{en ? "Public examples" : "Публічні приклади"}</summary><div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">{publicExamples.map((example: any, index: number) => <div key={index} className="min-w-0"><div className="text-xs font-semibold text-text-muted">{en ? "Input" : "Ввід"}</div><pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-[#101713] p-3 font-mono text-xs text-[#e5f1e8]">{example.input}</pre><div className="mt-2 text-xs font-semibold text-text-muted">{en ? "Expected output" : "Очікуваний вивід"}</div><pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-[#101713] p-3 font-mono text-xs text-[#e5f1e8]">{example.output}</pre></div>)}</div></details>}
        <div className="mt-5 flex flex-wrap gap-2">{draft.files.map(item => <button type="button" key={item.path} onClick={() => setActiveFile(item.path)} className={"inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold " + (file?.path === item.path ? "bg-primary/10 text-primary-soft" : "bg-bg-hover text-text-secondary")}><FileCode2 className="h-3.5 w-3.5" />{item.path}</button>)}</div>
        {selected.source && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-6 text-text-secondary">{en ? "Imported from prior learning. This snapshot was not checked against the new project catalogue." : "Імпортовано з попереднього навчання. Цей знімок не перевірявся за новим каталогом проєктів."}</div>}
        {file && <div className="mt-2 overflow-hidden rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-base px-3 py-2">
            <span className="font-mono text-xs text-text-muted">{file.path} · {new Blob([file.content]).size.toLocaleString()} B</span>
            <div className="flex gap-1 rounded-lg bg-bg-hover p-1" role="group" aria-label={en ? "Editor mode" : "Режим редактора"}>
              <button type="button" aria-pressed={editorMode === "light"} onClick={() => setEditorMode("light")} className={"min-h-8 rounded-md px-2 text-xs font-semibold " + (editorMode === "light" ? "bg-bg-surface text-primary-soft" : "text-text-muted")}>{en ? "Light" : "Легкий"}</button>
              <button type="button" aria-pressed={editorMode === "monaco"} onClick={() => setEditorMode("monaco")} className={"min-h-8 rounded-md px-2 text-xs font-semibold " + (editorMode === "monaco" ? "bg-bg-surface text-primary-soft" : "text-text-muted")}>Monaco</button>
            </div>
          </div>
          {editorMode === "monaco" ? <React.Suspense fallback={<textarea aria-label={file.path} spellCheck={false} readOnly={Boolean(selected.source)} value={file.content} onChange={event => updateFile(event.target.value)} onKeyDown={indentLightEditor} className="min-h-[340px] w-full resize-y bg-[#101713] p-4 font-mono text-[13px] leading-6 text-[#e5f1e8] outline-none" />}>
            <FullGrowthCodeEditor language={String(selected.runtime).toLowerCase() as "python" | "java" | "cpp"} value={file.content} onChange={selected.source ? undefined : updateFile} readOnly={Boolean(selected.source)} height="340px" minimap={false} enableSemanticLsp={false} filePath={file.path} showMobileToolbar={false} />
          </React.Suspense> : <textarea aria-label={file.path} spellCheck={false} readOnly={Boolean(selected.source)} value={file.content} onChange={event => updateFile(event.target.value)} onKeyDown={indentLightEditor} className="min-h-[340px] w-full resize-y bg-[#101713] p-4 font-mono text-[13px] leading-6 text-[#e5f1e8] outline-none" />}
        </div>}
        {!selected.source && <section className="mt-5 rounded-xl bg-bg-base p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">{en ? "Your test examples" : "Твої тестові приклади"}</h3><p className="mt-1 text-xs text-text-secondary">{draft.examples.length} {en ? "saved" : "збережено"}</p></div><span className="text-right text-xs text-text-muted">{selected.stage === "V1" && !assessment ? (en ? "Optional for V1" : "Необов’язкові для V1") : (en ? "Add at least 2" : "Потрібно щонайменше 2")}</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><textarea aria-label={en ? "Example input" : "Вхідні дані"} value={exampleInput} onChange={event => setExampleInput(event.target.value)} placeholder={en ? "Input" : "Вхідні дані"} className="min-h-20 rounded-lg border border-border bg-bg-surface p-3 font-mono text-xs" /><textarea aria-label={en ? "Expected output" : "Очікуваний результат"} value={exampleOutput} onChange={event => setExampleOutput(event.target.value)} placeholder={en ? "Expected output" : "Очікуваний результат"} className="min-h-20 rounded-lg border border-border bg-bg-surface p-3 font-mono text-xs" /></div>
          <button type="button" onClick={addExample} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold"><Plus className="h-3.5 w-3.5" />{en ? "Add example" : "Додати приклад"}</button>
          {draft.examples.map((example, index) => <div key={index} className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-bg-surface p-3 text-xs"><span className="truncate font-mono text-text-secondary">{index + 1}. {example.input || "∅"} → {example.output || "∅"}</span><button type="button" onClick={() => setDraft(old => ({ ...old, examples: old.examples.filter((_, current) => current !== index) }))} className="text-text-muted">{en ? "Remove" : "Видалити"}</button></div>)}
        </section>}
        {!selected.source && <label className="mt-5 block text-sm font-semibold">{en ? "Explain your solution and how you checked it" : "Опиши рішення та як ти його перевірив"}<textarea value={explanation} onChange={event => { const value = event.target.value; setExplanation(value); setDraft(old => ({ ...old, explanation: value })); }} rows={3} maxLength={8000} className="mt-2 w-full rounded-xl border border-border bg-bg-base p-3 text-sm font-normal" /></label>}
        {!selected.source && <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={() => void save()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><Save className="h-4 w-4" />{en ? "Save" : "Зберегти"}</button><span role="status" className="text-xs text-text-muted">{saveState === "saving" ? (en ? "Saving…" : "Зберігається…") : saveState === "saved" ? (en ? "Saved on server" : "Збережено на сервері") : saveState === "error" ? (en ? "Not saved on server · retry with Save" : "Не збережено на сервері · натисни «Зберегти»") : (en ? "Unsaved changes" : "Є незбережені зміни")}</span><button type="button" disabled={busy || ["QUEUED", "RUNNING"].includes(job?.state)} onClick={() => void check()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"><Code2 className="h-4 w-4" />{en ? "Check" : "Перевірити"}</button>{assessment && <button type="button" disabled={busy || job?.state !== "COMPLETED" || !jobMatchesCurrentContext} onClick={() => void finish()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent-warn/40 px-4 text-sm font-semibold disabled:opacity-50"><ShieldCheck className="h-4 w-4" />{en ? "Finish attempt" : "Завершити спробу"}</button>}</div>}
        {job && <div className="mt-4 rounded-xl border border-border bg-bg-base p-4"><div className="flex items-center gap-2 text-sm font-semibold">{["QUEUED", "RUNNING"].includes(job.state) ? <LoaderCircle className="h-4 w-4 animate-spin text-primary-soft" /> : job.result?.passed ? <Check className="h-4 w-4 text-emerald-500" /> : <CircleAlert className="h-4 w-4 text-accent-warn" />}{job.state === "QUEUED" ? (en ? "Waiting for Judge" : "Очікує Judge") : job.state === "RUNNING" ? (en ? "Checking…" : "Перевіряється…") : job.state === "COMPLETED" ? (job.result?.passed ? (en ? "Required tests passed" : "Обов’язкові тести пройдено") : (en ? "Some tests failed" : "Частина тестів не пройдена")) : job.state === "CANCELLED" ? (en ? "Cancelled" : "Скасовано") : (en ? "Infrastructure error — retry is available" : "Збій виконання — можна повторити")}</div>{job.result && <div className="mt-2 text-xs text-text-secondary">{!jobMatchesCurrentContext && <p className="mt-2 text-xs text-text-muted">{en ? "Historical result. It cannot submit the current stage." : "\u0406\u0441\u0442\u043e\u0440\u0438\u0447\u043d\u0438\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442. \u041d\u0438\u043c \u043d\u0435 \u043c\u043e\u0436\u043d\u0430 \u0437\u0430\u0440\u0430\u0445\u0443\u0432\u0430\u0442\u0438 \u043f\u043e\u0442\u043e\u0447\u043d\u0438\u0439 \u0435\u0442\u0430\u043f."}</p>}{job.result.testsPassed}/{job.result.testsTotal} {en ? "required checks" : "обов’язкових тестів"}</div>}{["QUEUED", "RUNNING"].includes(job.state) && <button type="button" disabled={busy} onClick={() => void cancelCheck()} className="mt-3 min-h-9 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">{en ? "Cancel execution" : "Скасувати виконання"}</button>}{job.state === "COMPLETED" && job.result?.passed && !assessment && <button type="button" disabled={busy || explanation.trim().length < 12 || !jobMatchesCurrentContext} onClick={() => void submit()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />{en ? "Submit version" : "Зарахувати версію"}</button>}</div>}
      </section>}
      <aside className="space-y-4">
        <section hidden={workspaceTab !== "work"} className="rounded-2xl border border-border bg-bg-surface p-5"><h3 className="font-bold">{en ? "Next step" : "Наступний крок"}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{en ? "The starter code and documentation are deliberately small. Build one working behavior at a time." : "Стартовий код навмисно мінімальний. Реалізуй і перевір одну поведінку за раз."}</p><button type="button" disabled={busy} onClick={() => void toggleArchive()} className="mt-3 min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">{selected.archived ? (en ? "Restore from archive" : "Повернути з архіву") : (en ? "Archive project" : "Архівувати проєкт")}</button>{assessment && <button type="button" disabled={busy} onClick={() => void cancelAssessment()} className="ml-2 mt-3 min-h-9 rounded-lg border border-accent-warn/40 px-3 text-xs font-semibold">{en ? "Cancel attempt" : "Скасувати спробу"}</button>}
          {selected.stage === "V3" && !assessment && <div className="mt-4 grid gap-2"><button type="button" disabled={busy} onClick={() => void startAssessment("DEFENSE")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />{en ? "Start defense" : "Пройти захист"}</button><button type="button" disabled={busy || !defensePassedForLatest} onClick={() => void startAssessment("TRANSFER")} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-45">{en ? "Try transfer task" : "Перевірити перенесення"}</button></div>}</section>
        <section hidden={workspaceTab !== "history"} className="rounded-2xl border border-border bg-bg-surface p-5">
          <h3 className="font-bold">{en ? "Check history" : "Історія перевірок"}</h3>
          <div className="mt-3 space-y-2">
            {selected.executions?.map((execution: any) => <button key={execution.id} type="button" disabled={busy} onClick={() => void selectExecution(execution)} className={`w-full rounded-xl border bg-bg-base p-3 text-left text-sm hover:border-primary/40 ${job?.id === execution.id ? "border-primary/50" : "border-transparent"}`}>
              <span className="flex flex-wrap items-center justify-between gap-2"><strong>{execution.context?.startsWith("assessment:") ? (en ? "Assessment" : "Спроба") : execution.context}</strong><span className="text-xs text-text-muted">{new Date(execution.createdAt).toLocaleString(en ? "en-GB" : "uk-UA")}</span></span>
              <span className="mt-1 block text-xs text-text-secondary">{execution.state === "COMPLETED" ? (execution.result?.passed ? (en ? "Passed" : "Пройдено") : (en ? "Failed" : "Не пройдено")) : execution.state === "QUEUED" ? (en ? "Queued" : "У черзі") : execution.state === "RUNNING" ? (en ? "Running" : "Виконується") : execution.state === "CANCELLED" ? (en ? "Cancelled" : "Скасовано") : (en ? "Execution error" : "Помилка виконання")}{execution.result && ` · ${execution.result.testsPassed}/${execution.result.testsTotal} ${en ? "required tests" : "обов’язкових тестів"}`}{execution.errorCode ? ` · ${execution.errorCode}` : ""}</span>
            </button>)}
            {!selected.executions?.length && <p className="text-sm text-text-muted">{en ? "Checks will appear here and remain available after later attempts." : "Перевірки з’являтимуться тут і залишатимуться доступними після наступних спроб."}</p>}
            {selected.executionsHasMore && <button type="button" disabled={loadingOlderExecutions} onClick={() => void loadOlderExecutions()} className="min-h-9 w-full rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">{loadingOlderExecutions ? (en ? "Loading…" : "Завантаження…") : (en ? "Load older checks" : "Завантажити старіші перевірки")}</button>}
          </div>
        </section><section hidden={workspaceTab !== "history"} className="rounded-2xl border border-border bg-bg-surface p-5"><h3 className="font-bold">{en ? "Frozen versions" : "Зафіксовані версії"}</h3><div className="mt-3 space-y-2">{selected.versions?.map((version: any) => <div key={version.id} className="rounded-xl bg-bg-base p-3 text-sm"><strong>{version.stage_key} · #{version.sequence_no}</strong><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void loadVersion(version.id)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{en ? "View snapshot" : "Переглянути"}</button><button type="button" disabled={busy} onClick={() => void publish(version, "LINK")} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{en ? "Share link" : "За посиланням"}</button><button type="button" disabled={busy} onClick={() => void publish(version, "PROFILE")} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{en ? "Add to profile" : "У профіль"}</button></div></div>)}{!selected.versions?.length && <p className="text-sm text-text-muted">{en ? "Your first snapshot appears after submitting V1." : "Перший знімок з’явиться після зарахування V1."}</p>}{selected.versionsHasMore && <button type="button" disabled={loadingOlderVersions} onClick={() => void loadOlderVersions()} className="mt-2 min-h-9 w-full rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">{loadingOlderVersions ? (en ? "Loading…" : "Завантаження…") : (en ? "Load older versions" : "Завантажити старіші версії")}</button>}</div></section>
        {viewedVersion && <section hidden={workspaceTab !== "history"} className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><div className="flex items-start justify-between gap-2"><h3 className="font-bold">{en ? "Snapshot" : "Знімок"} · {viewedVersion.stage} · #{viewedVersion.sequence}</h3><button type="button" onClick={() => setViewedVersion(null)} className="text-xs text-text-muted">{en ? "Close" : "Закрити"}</button></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-text-secondary">{viewedVersion.explanation}</p><div className="mt-3 space-y-2">{viewedVersion.files?.map((item: GrowthFile) => <details key={item.path} className="rounded-lg bg-bg-base p-3"><summary className="cursor-pointer text-xs font-semibold">{item.path}</summary><pre className="mt-2 max-h-56 overflow-auto text-xs leading-5">{item.content}</pre></details>)}</div><button type="button" disabled={busy || Boolean(assessment) || Boolean(selected.source)} onClick={() => void restoreVersion()} className="mt-3 min-h-9 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">{en ? "Copy into current draft" : "Скопіювати в поточну чернетку"}</button></section>}
        <section hidden={workspaceTab !== "portfolio"} className="rounded-2xl border border-border bg-bg-surface p-5"><h3 className="font-bold">{en ? "Publications" : "Публікації"}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{en ? "Each publication stays fixed to its selected version until you explicitly replace it." : "Кожна публікація прив’язана до вибраної версії, доки ти явно її не заміниш."}</p>{selected.versions?.length > 0 && <><label className="mt-3 block text-xs font-semibold">{en ? "Version to publish" : "Версія для публікації"}<select value={publicationVersion?.id ?? ""} onChange={event => { setPublicationVersionId(event.target.value); setPublicationEvidenceIds([]); }} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-bg-base px-2 text-sm">{selected.versions.map((version: any) => <option key={version.id} value={version.id}>{version.stage_key} · #{version.sequence_no}</option>)}</select></label>{publishableAttempts.length > 0 && <fieldset className="mt-3 space-y-2"><legend className="text-xs font-semibold">{en ? "Include passed evidence" : "Додати результати захисту й перенесення"}</legend>{publishableAttempts.map((attempt: any) => <label key={attempt.id} className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={publicationEvidenceIds.includes(attempt.id)} onChange={event => setPublicationEvidenceIds(old => event.target.checked ? [...old, attempt.id] : old.filter(id => id !== attempt.id))} />{attempt.kind === "DEFENSE" ? (en ? "Requirement-change defense" : "Захист зміни вимог") : (en ? "Transfer task" : "Задача на перенесення")}</label>)}</fieldset>}</>}{selected.publications?.filter((item: any) => !item.revoked).map((publication: any) => <div key={publication.id} className="mt-3 rounded-xl bg-bg-base p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">{publication.title}</strong><div className="mt-1 text-xs text-text-muted">{publication.channel === "LINK" ? (en ? "Share link" : "Посилання") : (en ? "Public profile" : "Публічний профіль")} · {publication.version_id}</div></div><button type="button" disabled={busy} onClick={async () => { if (!window.confirm(en ? "Revoke this publication?" : "Відкликати цю публікацію?")) return; setBusy(true); try { await revokeGrowthPublication(selected.id, publication.id); setSelected(await getGrowthProject(selected.id)); setNotice(en ? "Publication revoked." : "Публікацію відкликано."); } catch (err) { setError(messageOf(err, "Не вдалося відкликати публікацію")); } finally { setBusy(false); } }} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{en ? "Revoke" : "Відкликати"}</button></div>{publication.channel === "LINK" && <div className="mt-2 break-all text-xs text-primary-soft">{window.location.origin}/portfolio/{publication.public_id}</div>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || !publicationVersion} onClick={async () => { setBusy(true); try { await replaceGrowthPublicationVersion(selected.id, publication.id, { versionId: publicationVersion!.id, assessmentIds: publicationEvidenceIds, demoIndex: selected.source ? undefined : 0 }); setSelected(await getGrowthProject(selected.id)); setNotice(en ? "Published version updated." : "Версію публікації оновлено."); } catch (err) { setError(messageOf(err, "Не вдалося замінити опубліковану версію")); } finally { setBusy(false); } }} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{en ? "Use selected version" : "Оновити версію"}</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await setGrowthPublicationReviews(selected.id, publication.id, !publication.review_visible); setSelected(await getGrowthProject(selected.id)); } catch (err) { setError(messageOf(err, "Не вдалося оновити видимість відгуків")); } finally { setBusy(false); } }} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{publication.review_visible ? (en ? "Hide public reviews" : "Приховати відгуки") : (en ? "Show public reviews" : "Показати відгуки")}</button>{publication.channel === "LINK" && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await rotateGrowthPublicationLink(selected.id, publication.id); setSelected(await getGrowthProject(selected.id)); setNotice(en ? "Share link replaced." : "Посилання замінено."); } catch (err) { setError(messageOf(err, "Не вдалося змінити посилання")); } finally { setBusy(false); } }} className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold">{en ? "Replace link" : "Змінити посилання"}</button>}</div></div>)}{!selected.publications?.some((item: any) => !item.revoked) && <p className="mt-3 text-sm text-text-muted">{en ? "No active publications." : "Активних публікацій немає."}</p>}</section>
        <section hidden={workspaceTab !== "portfolio"} className="rounded-2xl border border-border bg-bg-surface p-5"><h3 className="font-bold">{en ? "Human review" : "Рецензія людини"}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{en ? "A reviewer sees only the frozen version and evidence you select." : "Рецензент побачить лише зафіксовану версію та вибрані тобою свідчення."}</p>{selected.versions?.length > 0 && <><label className="mt-3 block text-xs font-semibold">{en ? "Version for review" : "Версія для рецензії"}<select value={reviewVersion?.id ?? ""} onChange={event => { setReviewVersionId(event.target.value); setReviewEvidenceIds([]); }} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-bg-base px-2 text-sm">{selected.versions.map((version: any) => <option key={version.id} value={version.id}>{version.stage_key} · #{version.sequence_no}</option>)}</select></label>{reviewableAttempts.length > 0 && <fieldset className="mt-3 space-y-2"><legend className="text-xs font-semibold">{en ? "Include passed evidence" : "Додати результати захисту й перенесення"}</legend>{reviewableAttempts.map((attempt: any) => <label key={attempt.id} className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={reviewEvidenceIds.includes(attempt.id)} onChange={event => setReviewEvidenceIds(old => event.target.checked ? [...old, attempt.id] : old.filter(id => id !== attempt.id))} />{attempt.kind === "DEFENSE" ? (en ? "Requirement-change defense" : "Захист зміни вимог") : (en ? "Transfer task" : "Задача на перенесення")}</label>)}</fieldset>}<button type="button" disabled={busy || !reviewVersion} onClick={async () => { const username = window.prompt(en ? "Reviewer username. Leave blank to request an appointed reviewer." : "Username запрошеного рецензента. Залиш порожнім для запиту призначеного рецензента."); if (username === null) return; setBusy(true); try { const result = await requestGrowthReview(selected.id, reviewVersion!.id, username, reviewEvidenceIds); setNotice(en ? "Review request created: " + result.status : "Запит на рецензію створено: " + result.status); setSelected(await getGrowthProject(selected.id)); } catch (err) { setError(messageOf(err, "Не вдалося створити запит")); } finally { setBusy(false); } }} className="mt-3 min-h-10 w-full rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50">{en ? "Request review" : "Запросити рецензію"}</button></>}{selected.reviews?.map((review: any) => <div key={review.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg-base p-3 text-xs text-text-secondary"><span>{review.kind} · {review.status}</span>{review.status === "SUBMITTED" && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await setGrowthReviewPublic(review.id, !review.author_public); setSelected(await getGrowthProject(selected.id)); } catch (err) { setError(messageOf(err, "Не вдалося змінити публічність відгуку")); } finally { setBusy(false); } }} className="rounded-md border border-border px-2 py-1 font-semibold">{review.author_public ? (en ? "Hide review" : "Приховати відгук") : (en ? "Show review" : "Показати відгук")}</button>}</div>)}</section>
        <section hidden={workspaceTab !== "work"} className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><h3 className="font-bold">{en ? "Local recovery" : "Локальне відновлення"}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{en ? "An emergency copy is kept in IndexedDB. Every Judge run uses its own saved code snapshot." : "Аварійна копія зберігається в IndexedDB. Кожен запуск Judge отримує окрему зафіксовану копію коду."}</p></section>
      </aside>
      </div>
    </>}
  </main>;
};
