import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  approveAdminLibraryTask,
  createAdminClass,
  createAdminMaterialTopic,
  createAdminUser,
  deleteAdminClass,
  deleteAdminMaterialTopic,
  deleteAdminUser,
  disableAdminMaintenance,
  enableAdminMaintenance,
  exportAdminMaterialTopicsYaml,
  getAdminClasses,
  getAdminJudgeDeadLetter,
  getAdminJudgeLoad,
  getAdminLibraryTasks,
  getAdminMailStatus,
  getAdminMaintenance,
  getAdminMaterialTopics,
  getAdminStats,
  getAdminUsers,
  importAdminMaterialTopicsLegacy,
  replayAdminJudgeDeadLetter,
  rejectAdminLibraryTask,
  sendAdminBroadcastEmail,
  syncAdminMaterialTopicsFromRepo,
  updateAdminClass,
  updateAdminMaterialTopic,
  updateAdminUser,
  updateUserRole,
  type AdminBroadcastDryRunResult,
  type AdminBroadcastSendResult,
  type AdminClass,
  type AdminJudgeDeadLetterItem,
  type AdminJudgeDeadLetterReplayResult,
  type AdminJudgeLoad,
  type AdminLibraryTask,
  type AdminLibraryTaskStatus,
  type AdminMaterialTopic,
  type AdminMaterialsLanguage,
  type AdminStats,
  type AdminUser,
  type MaintenanceState,
} from "../../lib/api/admin";
import { AdminMailWorkspace } from "../../components/admin/AdminMailWorkspace";
import { createCertificateTemplate, getCertificateTemplateById, listCertificateTemplates, updateCertificateTemplate } from "../../lib/api/certificates";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { BookOpen, Boxes, Check, ChevronRight, CircleDot, FileText, Inbox, LayoutDashboard, Library, Plus, RotateCw, Save, Send, ShieldCheck, Trash2, UserRoundPlus, Users, Wrench, X } from "lucide-react";
import { useDialogA11y } from "../../components/ui/useDialogA11y";
import { tr } from "../../i18n";

const isPreview = (): boolean => Boolean(import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true");
const languages: AdminMaterialsLanguage[] = ["JAVA", "PYTHON", "CPP"];
const fieldKeys = ["contest_name", "name", "full_name", "place", "score", "max_score", "date", "organizer", "signature", "certificate_id", "qr_code"] as const;

type Tab = "overview" | "people" | "classes" | "materials" | "library" | "judge" | "maintenance" | "broadcast" | "mailbox" | "certificates";
const tabs: Array<{ id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Огляд", Icon: LayoutDashboard },
  { id: "people", label: "Люди", Icon: Users },
  { id: "classes", label: "Класи", Icon: Boxes },
  { id: "materials", label: "Матеріали", Icon: BookOpen },
  { id: "library", label: "Бібліотека", Icon: Library },
  { id: "judge", label: "Judge", Icon: RotateCw },
  { id: "maintenance", label: "Maintenance", Icon: Wrench },
  { id: "broadcast", label: "Розсилки", Icon: Send },
  { id: "mailbox", label: "Mailbox", Icon: Inbox },
  { id: "certificates", label: "Сертифікати", Icon: FileText },
];

const Surface: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <section className={`workshop-panel rounded-[24px] border border-border/10 bg-white p-5 shadow-[0_18px_42px_-36px_rgba(10,36,18,.5)] dark:border-white/10 dark:bg-bg-surface ${className}`}>{children}</section>
);
const Label: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone = "text-primary-strong dark:text-primary-soft" }) => <div className={`text-xs font-semibold uppercase tracking-[.16em] ${tone}`}>{children}</div>;
const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className = "", ...props }) => <label className="block text-sm font-semibold text-text-secondary dark:text-text-primary">{label && <span>{label}</span>}<input {...props} className={`mt-2 w-full rounded-xl border border-border/10 bg-bg-surface px-3 py-3 text-sm font-normal outline-none focus:border-primary dark:border-white/10 dark:bg-white/[.035] ${className}`} /></label>;
const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }> = ({ label, className = "", ...props }) => <label className="block text-sm font-semibold text-text-secondary dark:text-text-primary">{label && <span>{label}</span>}<textarea {...props} className={`mt-2 w-full rounded-xl border border-border/10 bg-bg-surface px-3 py-3 text-sm font-normal outline-none focus:border-primary dark:border-white/10 dark:bg-white/[.035] ${className}`} /></label>;
const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }> = ({ label, className = "", children, ...props }) => <label className="block text-sm font-semibold text-text-secondary dark:text-text-primary">{label && <span>{label}</span>}<select {...props} className={`mt-2 w-full rounded-xl border border-border/10 bg-bg-surface px-3 py-3 text-sm font-normal outline-none focus:border-primary dark:border-white/10 dark:bg-white/[.035] ${className}`}>{children}</select></label>;
const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { muted?: boolean }> = ({ muted, className = "", ...props }) => <button type="button" {...props} className={`${muted ? "border border-border/10 bg-bg-hover text-text-secondary dark:border-white/10 dark:bg-white/[.05] dark:text-text-primary" : "bg-primary text-primary-foreground"} rounded-xl px-4 py-3 text-sm font-bold transition hover:opacity-85 disabled:opacity-45 ${className}`} />;

type CertificateTemplate = Awaited<ReturnType<typeof getCertificateTemplateById>>["template"];
type CertificateListItem = { id: number; name: string; isActive: boolean; type?: string; version?: number; contestId?: number | null };
type UserDraft = { email: string; firstName: string; lastName: string; password: string; role: AdminUser["role"] };
type NewUserDraft = { username: string; email: string; password: string; firstName: string; lastName: string; role: AdminUser["role"]; userMode: AdminUser["userMode"] };
type BroadcastDraft = { subject: string; title: string; content: string; delivery: "MARKETING" | "NOTIFICATION"; emails: string; classIds: string; userIds: string; includeSubscribed: boolean; includeAllUsers: boolean; confirm: string; dryRun: boolean };
type CertificateDraft = { name: string; type: "studycod" | "custom"; htmlTemplate: string; cssTemplate: string; isActive: boolean; fields: CertificateTemplate["fields"] };

export const AdminWorkspacePage: React.FC = () => {
  const { i18n } = useTranslation();
  const inEnglish = i18n.language.toLowerCase().startsWith("en");
  const tabLabel = (id: Tab, fallback: string) => ({
    overview: inEnglish ? "Overview" : "Огляд",
    people: inEnglish ? "People" : "Люди",
    classes: inEnglish ? "Classes" : "Класи",
    materials: inEnglish ? "Materials" : "Матеріали",
    library: inEnglish ? "Library" : "Бібліотека",
    judge: inEnglish ? "Judging" : "Перевірка рішень",
    maintenance: inEnglish ? "Platform settings" : "Налаштування платформи",
    broadcast: inEnglish ? "Announcements" : "Розсилки",
    mailbox: inEnglish ? "Mail" : "Пошта",
    certificates: inEnglish ? "Certificates" : "Сертифікати",
  } satisfies Record<Tab, string>)[id] ?? fallback;
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [judge, setJudge] = useState<AdminJudgeLoad | null>(null);
  const [deadLetterItems, setDeadLetterItems] = useState<AdminJudgeDeadLetterItem[]>([]);
  const [deadLetterTotal, setDeadLetterTotal] = useState(0);
  const [deadLetterLimit, setDeadLetterLimit] = useState("50");
  const [deadLetterReplay, setDeadLetterReplay] = useState<AdminJudgeDeadLetterReplayResult | null>(null);
  const [deadLetterBusy, setDeadLetterBusy] = useState(false);
  const [mailOk, setMailOk] = useState<boolean | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState<number | null>(null);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userDraft, setUserDraft] = useState({ email: "", firstName: "", lastName: "", password: "", role: "USER" as AdminUser["role"] });
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", firstName: "", lastName: "", role: "TEACHER" as AdminUser["role"], userMode: "EDUCATIONAL" as AdminUser["userMode"] });
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; email: string; password: string; role: AdminUser["role"] } | null>(null);

  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [classDraft, setClassDraft] = useState({ id: 0, name: "", teacherId: 0 });

  const [materialsLanguage, setMaterialsLanguage] = useState<AdminMaterialsLanguage>("PYTHON");
  const [topics, setTopics] = useState<AdminMaterialTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [materialDraft, setMaterialDraft] = useState({ title: "", description: "", order: "0", theoryTitle: "", theoryContent: "" });

  const [libraryStatus, setLibraryStatus] = useState<AdminLibraryTaskStatus>("PENDING");
  const [library, setLibrary] = useState<AdminLibraryTask[]>([]);
  const [selectedLibraryTask, setSelectedLibraryTask] = useState<AdminLibraryTask | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [maintenanceDraft, setMaintenanceDraft] = useState({ title: tr("Технічне обслуговування", "Scheduled maintenance"), message: tr("Ми тимчасово виконуємо оновлення. Спробуйте трохи пізніше.", "We’re making updates. Please try again shortly."), until: "" });
  const [broadcast, setBroadcast] = useState({ subject: "", title: "", content: "", delivery: "NOTIFICATION" as "MARKETING" | "NOTIFICATION", emails: "", classIds: "", userIds: "", includeSubscribed: false, includeAllUsers: false, confirm: "", dryRun: true });
  const [broadcastResult, setBroadcastResult] = useState<AdminBroadcastDryRunResult | AdminBroadcastSendResult | unknown | null>(null);

  const [certificates, setCertificates] = useState<CertificateListItem[]>([]);
  const [certificateDetails, setCertificateDetails] = useState<CertificateTemplate | null>(null);
  const [certificateDraft, setCertificateDraft] = useState<{ name: string; type: "studycod" | "custom"; htmlTemplate: string; cssTemplate: string; isActive: boolean; fields: CertificateTemplate["fields"] }>({ name: "", type: "custom", htmlTemplate: "", cssTemplate: "", isActive: true, fields: [] });

  const reportError = (cause: unknown, fallback: string) => {
    const msg = getErrorMessageFromUnknown(cause, fallback);
    setError(msg);
    showToast({ type: "error", message: msg });
  };

  const loadPeople = async (page = 1, append = false) => {
    if (append) setUsersLoadingMore(true);
    const [nextUsers, nextClasses] = await Promise.all([getAdminUsers({ page, limit: 100 }), getAdminClasses()]);
    setUsers((prev) => append ? [...prev, ...nextUsers.users.filter((nextUser) => !prev.some((oldUser) => oldUser.id === nextUser.id))] : nextUsers.users);
    setUsersPage(nextUsers.pagination.page);
    setUsersTotal(nextUsers.pagination.total);
    setClasses(nextClasses.classes);
    if (append) setUsersLoadingMore(false);
  };

  const load = async () => {
    setLoading(true); setError(null);
    if (isPreview()) {
      const demoUsers = [{ id: 1, username: "oksana", firstName: "Оксана", lastName: "Коваль", email: "oksana@example.test", role: "USER", userMode: "PERSONAL", emailVerified: true, iad: 0, avatarUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] as AdminUser[];
      // The local preview uses representative records only. Aggregate and service
      // metrics must come from the API, so leave them unavailable in preview.
      setStats(null);
      setJudge(null);
      setUsers(demoUsers); setUsersTotal(1); setClasses([{ id: 1, name: "10-Б · StudyCod", teacherId: 2, teacherName: "Ірина Кравець", createdAt: "", updatedAt: "" }]);
      setTopics([{ id: 1, order: 1, title: "Змінні та типи", description: "База", language: "PYTHON", theoryBlock: { id: 1, title: "Змінні", content: "Markdown theory", version: 3, level: null, tags: null, createdAt: "", updatedAt: "" } }]);
      setLibrary([{ id: 11, title: "Сума парних", description: "Опишіть алгоритм.", template: "n = int(input())", lang: "PYTHON", maxAttempts: 15, status: "PENDING", rejectionReason: null, submittedAt: "", publishedAt: null, createdAt: "", updatedAt: "", author: { id: 1, username: "mentor-anna", email: "anna@example.test" } }]);
      setDeadLetterItems([{ jobId: "job_demo_1", submissionId: "1042", state: "FAILED", attempts: 3, updatedAt: new Date().toISOString(), finishedAt: null, error: "Runner timeout" }]); setDeadLetterTotal(1);
      setMaintenance(null);
      setMailOk(null); setCertificates([{ id: 1, name: "StudyCod achievement", isActive: true, type: "custom", version: 1, contestId: null }]);
      setLoading(false); return;
    }
    try {
      if (tab === "overview") {
        const [nextStats, nextJudge, state, mail, templates] = await Promise.all([getAdminStats(), getAdminJudgeLoad().catch(() => null), getAdminMaintenance().catch(() => null), getAdminMailStatus().catch(() => null), listCertificateTemplates({ includeInactive: true, limit: 8 }).catch(() => null)]);
        setStats(nextStats); setJudge(nextJudge); setMaintenance(state?.state ?? null); setMailOk(mail?.ok ?? null); setCertificates((templates?.templates ?? []).map((item) => ({ id: item.id, name: item.name, isActive: item.isActive, type: item.type, version: item.version, contestId: item.contestId })));
      }
      if (tab === "people") await loadPeople(1, false);
      if (tab === "classes") {
        const [r, teacherUsers, adminUsers] = await Promise.all([
          getAdminClasses(),
          getAdminUsers({ page: 1, limit: 100, role: "TEACHER" }),
          getAdminUsers({ page: 1, limit: 100, role: "SYSTEM_ADMIN" }),
        ]);
        setClasses(r.classes);
        setUsers([...teacherUsers.users, ...adminUsers.users.filter((admin) => !teacherUsers.users.some((teacher) => teacher.id === admin.id))]);
      }
      if (tab === "materials") { const r = await getAdminMaterialTopics({ language: materialsLanguage }); setTopics(r.topics); if (!selectedTopicId && r.topics[0]) selectTopic(r.topics[0]); }
      if (tab === "library") { const r = await getAdminLibraryTasks({ status: libraryStatus }); setLibrary(r.tasks); setSelectedLibraryTask((prev) => prev ? r.tasks.find((t) => t.id === prev.id) ?? null : r.tasks[0] ?? null); }
      if (tab === "judge") { const [latestLoad, dead] = await Promise.all([getAdminJudgeLoad().catch(() => null), getAdminJudgeDeadLetter({ limit: parseLimit(deadLetterLimit, 200) })]); setJudge(latestLoad); setDeadLetterItems(dead.items || []); setDeadLetterTotal(Number.isFinite(dead.total) ? dead.total : (dead.items || []).length); }
      if (tab === "maintenance") { const r = await getAdminMaintenance(); setMaintenance(r.state); setMaintenanceDraft({ title: r.state.title || tr("Технічне обслуговування", "Scheduled maintenance"), message: r.state.message || "", until: isoToLocalDateTimeInput(r.state.until) }); }
      if (tab === "mailbox") { const mail = await getAdminMailStatus(); setMailOk(mail.ok); }
      if (tab === "certificates") { const r = await listCertificateTemplates({ includeInactive: true, limit: 300 }); setCertificates((r.templates ?? []).map((item) => ({ id: item.id, name: item.name, isActive: item.isActive, type: item.type, version: item.version, contestId: item.contestId }))); }
    } catch (cause) {
      reportError(cause, tr("Не вдалося завантажити дані.", "Could not load data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tab, libraryStatus, materialsLanguage]);

  const selectUser = (user: AdminUser) => {
    setSelectedUser(user);
    setUserDraft({ email: user.email || "", firstName: user.firstName || "", lastName: user.lastName || "", password: "", role: user.role });
  };
  const saveSelectedUser = async () => {
    if (!selectedUser) return;
    try {
      await updateAdminUser(selectedUser.id, { email: userDraft.email || undefined, firstName: userDraft.firstName, lastName: userDraft.lastName, password: userDraft.password || undefined });
      if (userDraft.role !== selectedUser.role) await updateUserRole(selectedUser.id, { role: userDraft.role });
      setSelectedUser(null); await loadPeople(1, false); showToast({ type: "success", message: tr("Користувача оновлено.", "User updated.") });
    } catch (cause) { reportError(cause, tr("Не вдалося оновити користувача.", "Could not update the user.")); }
  };
  const removeSelectedUser = async () => {
    if (!selectedUser || !window.confirm(tr(`Видалити ${selectedUser.username}?`, `Delete ${selectedUser.username}?`))) return;
    try { await deleteAdminUser(selectedUser.id); setSelectedUser(null); await loadPeople(1, false); } catch (cause) { reportError(cause, tr("Не вдалося видалити користувача.", "Could not delete the user.")); }
  };
  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const payload = {
        ...newUser,
        userMode: newUser.role === "TEACHER" ? "EDUCATIONAL" as const : newUser.userMode,
        emailVerified: true,
      };
      await createAdminUser(payload);
      setCreatedCredentials({ username: payload.username, email: payload.email, password: payload.password, role: payload.role });
      setShowCreateUser(false);
      setNewUser({ username: "", email: "", password: "", firstName: "", lastName: "", role: "TEACHER", userMode: "EDUCATIONAL" });
      await loadPeople(1, false);
      showToast({ type: "success", message: tr(`Акаунт ${payload.username} створено.`, `Account ${payload.username} created.`) });
    } catch (cause) { reportError(cause, tr("Не вдалося створити акаунт.", "Could not create the account.")); }
  };

  const saveClass = async () => {
    try {
      if (classDraft.id) await updateAdminClass(classDraft.id, { name: classDraft.name, teacherId: Number(classDraft.teacherId) });
      else await createAdminClass({ name: classDraft.name, teacherId: Number(classDraft.teacherId) });
      setClassDraft({ id: 0, name: "", teacherId: 0 }); const r = await getAdminClasses(); setClasses(r.classes);
    } catch (cause) { reportError(cause, tr("Не вдалося зберегти клас.", "Could not save the class.")); }
  };
  const removeClass = async (item: AdminClass) => {
    if (!window.confirm(tr(`Видалити клас ${item.name}?`, `Delete class ${item.name}?`))) return;
    try { await deleteAdminClass(item.id); const r = await getAdminClasses(); setClasses(r.classes); } catch (cause) { reportError(cause, tr("Не вдалося видалити клас.", "Could not delete the class.")); }
  };

  const selectTopic = (topic: AdminMaterialTopic) => {
    setSelectedTopicId(topic.id);
    setMaterialDraft({ title: topic.title, description: topic.description || "", order: String(topic.order ?? 0), theoryTitle: topic.theoryBlock?.title || topic.title, theoryContent: topic.theoryBlock?.content || "" });
  };
  const newTopic = () => { setSelectedTopicId(null); setMaterialDraft({ title: "", description: "", order: String((topics.at(-1)?.order ?? 0) + 1), theoryTitle: "", theoryContent: "" }); };
  const saveTopic = async () => {
    try {
      const payload = { title: materialDraft.title, description: materialDraft.description, order: Number(materialDraft.order) || 0, language: materialsLanguage, theory: materialDraft.theoryContent.trim() ? { title: materialDraft.theoryTitle || materialDraft.title, content: materialDraft.theoryContent } : null };
      const result = selectedTopicId ? await updateAdminMaterialTopic(selectedTopicId, payload) : await createAdminMaterialTopic(payload);
      const r = await getAdminMaterialTopics({ language: materialsLanguage }); setTopics(r.topics); selectTopic(result.topic); showToast({ type: "success", message: tr("Матеріал збережено.", "Material saved.") });
    } catch (cause) { reportError(cause, tr("Не вдалося зберегти матеріал.", "Could not save the material.")); }
  };
  const removeTopic = async () => {
    if (!selectedTopicId || !window.confirm(tr("Видалити тему?", "Delete this topic?"))) return;
    try { await deleteAdminMaterialTopic(selectedTopicId); setSelectedTopicId(null); const r = await getAdminMaterialTopics({ language: materialsLanguage }); setTopics(r.topics); } catch (cause) { reportError(cause, tr("Не вдалося видалити тему.", "Could not delete the topic.")); }
  };
  const syncMaterials = async (mode: "repo" | "legacy" | "export") => {
    try {
      if (mode === "repo") await syncAdminMaterialTopicsFromRepo({ language: materialsLanguage, mode: "merge" });
      if (mode === "legacy" && materialsLanguage !== "CPP") await importAdminMaterialTopicsLegacy({ language: materialsLanguage, mode: "merge" });
      if (mode === "export") {
        const r = await exportAdminMaterialTopicsYaml({ language: materialsLanguage });
        const url = URL.createObjectURL(r.blob); const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url);
      }
      const r = await getAdminMaterialTopics({ language: materialsLanguage }); setTopics(r.topics);
    } catch (cause) { reportError(cause, tr("Операція з матеріалами не вдалася.", "The material operation failed.")); }
  };

  const moderate = async (task: AdminLibraryTask, action: "approve" | "reject") => {
    setBusyId(task.id);
    try {
      if (action === "approve") await approveAdminLibraryTask(task.id);
      else await rejectAdminLibraryTask(task.id, rejectReason.trim() || tr("Потрібне доопрацювання перед публікацією.", "Revisions are needed before publication."));
      const r = await getAdminLibraryTasks({ status: libraryStatus }); setLibrary(r.tasks); setSelectedLibraryTask(r.tasks.find((t) => t.id === task.id) ?? r.tasks[0] ?? null);
    } catch (cause) { reportError(cause, tr("Не вдалося оновити задачу.", "Could not update the task.")); } finally { setBusyId(null); }
  };

  const refreshDeadLetter = async () => {
    try {
      const [latestLoad, dead] = await Promise.all([getAdminJudgeLoad().catch(() => null), getAdminJudgeDeadLetter({ limit: parseLimit(deadLetterLimit, 200) })]);
      setJudge(latestLoad);
      setDeadLetterItems(dead.items || []);
      setDeadLetterTotal(Number.isFinite(dead.total) ? dead.total : (dead.items || []).length);
    } catch (cause) { reportError(cause, tr("Не вдалося завантажити judge DLQ.", "Could not load the judge dead-letter queue.")); }
  };
  const replayDeadLetter = async () => {
    setDeadLetterBusy(true);
    try {
      const replay = await replayAdminJudgeDeadLetter({ limit: parseLimit(deadLetterLimit, 500) });
      setDeadLetterReplay(replay);
      await refreshDeadLetter();
      showToast({ type: "success", message: `DLQ replay: moved ${replay.moved}, skipped ${replay.skipped}.` });
    } catch (cause) { reportError(cause, tr("Не вдалося replay judge DLQ.", "Could not replay the judge dead-letter queue.")); } finally { setDeadLetterBusy(false); }
  };

  const saveMaintenance = async (enabled: boolean) => {
    try {
      const next = enabled ? await enableAdminMaintenance({ title: maintenanceDraft.title, message: maintenanceDraft.message, until: localDateTimeInputToIso(maintenanceDraft.until) }) : await disableAdminMaintenance();
      setMaintenance(next.state);
    } catch (cause) { reportError(cause, tr("Не вдалося оновити maintenance.", "Could not update maintenance settings.")); }
  };
  const sendBroadcast = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await sendAdminBroadcastEmail({
        subject: broadcast.subject,
        title: broadcast.title,
        content: broadcast.content,
        delivery: broadcast.delivery,
        includeSubscribed: broadcast.includeSubscribed,
        includeAllUsers: broadcast.includeAllUsers,
        confirm: broadcast.confirm || undefined,
        dryRun: broadcast.dryRun,
        targets: {
          emails: splitList(broadcast.emails),
          classIds: splitNumbers(broadcast.classIds),
          userIds: splitNumbers(broadcast.userIds),
        },
      });
      setBroadcastResult(result);
    } catch (cause) { reportError(cause, tr("Не вдалося виконати розсилку.", "Could not send the announcement.")); }
  };

  const openCertificate = async (id: number) => {
    try {
      const data = isPreview() ? { template: { id, contestId: null, name: "StudyCod achievement", type: "custom" as const, htmlTemplate: "<h1>{{full_name}}</h1>", cssTemplate: ".certificate{padding:48px}", fields: fieldKeys.map((fieldKey) => ({ fieldKey, isEnabled: true, isRequired: fieldKey === "name" })), isActive: true, version: 1 } } : await getCertificateTemplateById(id);
      setCertificateDetails(data.template);
      setCertificateDraft({ name: data.template.name, type: data.template.type, htmlTemplate: data.template.htmlTemplate || "", cssTemplate: data.template.cssTemplate || "", isActive: data.template.isActive, fields: data.template.fields });
    } catch (cause) { reportError(cause, tr("Не вдалося відкрити шаблон сертифікату.", "Could not open the certificate template.")); }
  };
  const saveCertificate = async () => {
    if (!certificateDetails) return;
    try {
      if (certificateDetails.id > 0) await updateCertificateTemplate(certificateDetails.id, certificateDraft);
      else await createCertificateTemplate(certificateDraft);
      setCertificateDetails(null); const r = await listCertificateTemplates({ includeInactive: true, limit: 300 }); setCertificates(r.templates); showToast({ type: "success", message: tr("Шаблон сертифікату оновлено.", "Certificate template updated.") });
    } catch (cause) { reportError(cause, tr("Не вдалося оновити сертифікат.", "Could not update the certificate.")); }
  };

  const createCertificate = () => {
    setCertificateDetails({ id: 0, contestId: null, name: tr("Новий шаблон", "New template"), type: "custom", htmlTemplate: "<div class=\"certificate\"><h1>{{full_name}}</h1><p>{{contest_name}}</p><strong>{{score}} / {{max_score}}</strong></div>", cssTemplate: ".certificate{padding:48px;font-family:system-ui;text-align:center;background:#f4fbf6;color:#102218}", fields: fieldKeys.map((fieldKey) => ({ fieldKey, isEnabled: ["full_name", "contest_name", "score", "max_score"].includes(fieldKey), isRequired: fieldKey === "full_name" })), isActive: true, version: 1 } as CertificateTemplate);
    setCertificateDraft({ name: tr("Новий шаблон", "New template"), type: "custom", htmlTemplate: "<div class=\"certificate\"><h1>{{full_name}}</h1><p>{{contest_name}}</p><strong>{{score}} / {{max_score}}</strong></div>", cssTemplate: ".certificate{padding:48px;font-family:system-ui;text-align:center;background:#f4fbf6;color:#102218}", isActive: true, fields: fieldKeys.map((fieldKey) => ({ fieldKey, isEnabled: ["full_name", "contest_name", "score", "max_score"].includes(fieldKey), isRequired: fieldKey === "full_name" })) });
  };

  const usersByRole = useMemo(() => ({ teachers: users.filter((user) => user.role === "TEACHER").length, admins: users.filter((user) => user.role === "SYSTEM_ADMIN").length }), [users]);
  const hasMoreUsers = usersTotal === null ? false : users.length < usersTotal;

  return <div className="workshop-admin min-h-full bg-bg-base px-4 py-6 text-text-primary sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1600px]">
    <header aria-labelledby="admin-workspace-title" className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end"><div><Label><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{inEnglish ? "PLATFORM ADMINISTRATION" : "КЕРУВАННЯ ПЛАТФОРМОЮ"}</span></Label><h1 id="admin-workspace-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.045em] sm:text-3xl">{inEnglish ? "Platform administration" : "Адміністрування платформи"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{inEnglish ? "Review service issues, accounts, learning content and operations." : "Перевіряй стан платформи, керуй обліковими записами, матеріалами й операціями."}</p>{isPreview() && <p className="mt-3 w-fit rounded-lg border border-accent-warn/25 bg-accent-warn/10 px-3 py-2 text-xs font-semibold text-accent-warn dark:text-accent-warn">{inEnglish ? "Local preview · example records, no live platform metrics" : "Локальна демонстрація · прикладові записи, без статистики платформи"}</p>}</div></header>
    <nav aria-label={inEnglish ? "Administrative sections" : "Розділи адміністрування"} className="workshop-admin__tabs mt-2 flex gap-1 overflow-x-auto border-b border-border">{tabs.map(({ id, label, Icon }) => <button type="button" key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${tab === id ? "border-primary text-primary-strong dark:text-primary-soft" : "border-transparent text-text-muted hover:text-text-primary"}`}><Icon className="h-4 w-4" />{tabLabel(id, label)}</button>)}</nav>
    {error && <div role="alert" className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-accent-error/30 bg-bg-hover p-4 text-sm text-accent-error dark:bg-accent-error/10 dark:text-accent-error"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label={inEnglish ? "Dismiss error" : "Закрити повідомлення про помилку"}><X className="h-4 w-4" /></button></div>}
    {loading ? <div className="mt-5 grid gap-4 md:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-[24px] bg-bg-hover dark:bg-white/[.045]" />)}</div> : <div className="mt-5">
      {tab === "overview" && <Overview stats={stats} judge={judge} maintenance={maintenance} mailOk={mailOk} certificates={certificates} go={setTab} inEnglish={inEnglish} preview={isPreview()} />}
      {tab === "people" && <PeoplePanel users={users} usersTotal={usersTotal} hasMoreUsers={hasMoreUsers} usersLoadingMore={usersLoadingMore} usersPage={usersPage} classes={classes} usersByRole={usersByRole} onMore={() => loadPeople(usersPage + 1, true).catch((c) => reportError(c, tr("Не вдалося завантажити користувачів.", "Could not load users.")))} onSelect={selectUser} onCreate={() => setShowCreateUser(true)} />}
      {tab === "classes" && <ClassesPanel classes={classes} users={users} draft={classDraft} setDraft={setClassDraft} onSave={saveClass} onDelete={removeClass} />}
      {tab === "materials" && <MaterialsPanel language={materialsLanguage} setLanguage={setMaterialsLanguage} topics={topics} selectedTopicId={selectedTopicId} draft={materialDraft} setDraft={setMaterialDraft} selectTopic={selectTopic} newTopic={newTopic} saveTopic={saveTopic} removeTopic={removeTopic} syncMaterials={syncMaterials} />}
      {tab === "library" && <LibraryPanel status={libraryStatus} setStatus={setLibraryStatus} tasks={library} selected={selectedLibraryTask} setSelected={setSelectedLibraryTask} rejectReason={rejectReason} setRejectReason={setRejectReason} busyId={busyId} moderate={moderate} />}
      {tab === "judge" && <JudgePanel judge={judge} items={deadLetterItems} total={deadLetterTotal} limit={deadLetterLimit} setLimit={setDeadLetterLimit} lastReplay={deadLetterReplay} busy={deadLetterBusy} refresh={refreshDeadLetter} replay={replayDeadLetter} />}
      {tab === "maintenance" && <MaintenancePanel maintenance={maintenance} draft={maintenanceDraft} setDraft={setMaintenanceDraft} save={saveMaintenance} />}
      {tab === "broadcast" && <BroadcastPanel broadcast={broadcast} setBroadcast={setBroadcast} result={broadcastResult} send={sendBroadcast} />}
      {tab === "mailbox" && <AdminMailWorkspace />}
      {tab === "certificates" && <CertificatesPanel certificates={certificates} open={openCertificate} create={createCertificate} />}
    </div>}
    {showCreateUser && <CreateUserModal newUser={newUser} setNewUser={setNewUser} close={() => setShowCreateUser(false)} submit={createUser} />}
    {createdCredentials && <CreatedCredentialsModal credentials={createdCredentials} close={() => setCreatedCredentials(null)} />}
    {selectedUser && <UserModal selectedUser={selectedUser} draft={userDraft} setDraft={setUserDraft} close={() => setSelectedUser(null)} save={saveSelectedUser} remove={removeSelectedUser} />}
    {certificateDetails && <CertificateModal details={certificateDetails} draft={certificateDraft} setDraft={setCertificateDraft} close={() => setCertificateDetails(null)} save={saveCertificate} />}
  </div></div>;
};

const Overview: React.FC<{ stats: AdminStats | null; judge: AdminJudgeLoad | null; maintenance: MaintenanceState | null; mailOk: boolean | null; certificates: CertificateListItem[]; go: (tab: Tab) => void; inEnglish: boolean; preview: boolean }> = ({ stats, judge, maintenance, mailOk, certificates, go, inEnglish, preview }) => <>
  {!preview && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Metric value={stats?.users.total ?? "—"} label={inEnglish ? "users" : "користувачів"} />
    <Metric value={stats?.users.teachers ?? "—"} label={inEnglish ? "teachers" : "викладачів"} tone="text-primary-strong dark:text-primary-soft" />
    <Metric value={stats?.classes.total ?? "—"} label={inEnglish ? "active classes" : "активних класів"} />
    <Metric value={judge?.queued ?? "—"} label={inEnglish ? "in review queue" : "у черзі перевірки"} tone="text-accent-warn" />
  </div>}
  <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
    <Surface>
      <Label>{inEnglish ? "System status" : "Стан системи"}</Label>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Status label={inEnglish ? "Review queue" : "Черга перевірок"} value={judge ? `${judge.active} ${inEnglish ? "active" : "активних"} · ${judge.queued} ${inEnglish ? "queued" : "у черзі"}` : inEnglish ? "No data" : "Немає даних"} healthy={judge !== null && judge.queued < 20} />
        <Status label={inEnglish ? "Platform availability" : "Доступність платформи"} value={maintenance === null ? inEnglish ? "No data" : "Немає даних" : maintenance.enabled ? inEnglish ? "Maintenance is enabled" : "Технічне обслуговування ввімкнено" : inEnglish ? "Available" : "Доступна"} healthy={maintenance !== null && !maintenance.enabled} />
        <Status label={inEnglish ? "Administrator email" : "Пошта адміністратора"} value={mailOk === null ? inEnglish ? "No data" : "Немає даних" : mailOk ? inEnglish ? "Connected" : "Підключено" : inEnglish ? "Needs attention" : "Потребує уваги"} healthy={mailOk === true} />
        <Status label={inEnglish ? "Certificates" : "Сертифікати"} value={preview ? inEnglish ? "Example template in the certificates section" : "Приклад шаблону в розділі сертифікатів" : certificates.length ? `${certificates.filter((item) => item.isActive).length} ${inEnglish ? "active templates" : "активних шаблонів"}` : inEnglish ? "No data" : "Немає даних"} healthy={!preview && certificates.length > 0} />
      </div>
    </Surface>
    <Surface className="bg-bg-hover dark:border-accent-warn/20 dark:bg-accent-warn/[.07]">
      <Label tone="text-accent-warn">{inEnglish ? "Quick actions" : "Швидкі дії"}</Label>
      <div className="mt-5 space-y-2">
        <Quick label={inEnglish ? "Review task submissions" : "Модерація бібліотеки"} onClick={() => go("library")} />
        <Quick label={inEnglish ? "Edit learning materials" : "Редактор матеріалів"} onClick={() => go("materials")} />
        <Quick label={inEnglish ? "Manage certificates" : "Сертифікати"} onClick={() => go("certificates")} />
      </div>
    </Surface>
  </div>
</>;

const PeoplePanel: React.FC<{ users: AdminUser[]; usersTotal: number | null; hasMoreUsers: boolean; usersLoadingMore: boolean; usersPage: number; classes: AdminClass[]; usersByRole: { teachers: number; admins: number }; onMore: () => void; onSelect: (user: AdminUser) => void; onCreate: () => void }> = ({ users, usersTotal, hasMoreUsers, usersLoadingMore, classes, usersByRole, onMore, onSelect, onCreate }) => <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Surface><div className="flex items-start justify-between gap-4"><div><Label>{tr("Облікові записи", "Accounts")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Люди на платформі", "People on the platform")}</h2><p className="mt-2 text-sm text-text-muted dark:text-text-secondary">{tr("Адміністратор створює акаунти, передає логін і пароль та окремо призначає викладача до класів.", "Admins create accounts, share login details, and assign teachers to classes.")}</p></div><PrimaryButton onClick={onCreate} className="inline-flex items-center gap-2"><UserRoundPlus className="h-4 w-4" />{tr("Створити акаунт", "Create account")}</PrimaryButton></div><div className="mt-5 max-h-[680px] overflow-auto divide-y divide-border/8 pr-1 dark:divide-white/8">{users.map((user) => <button type="button" key={user.id} onClick={() => onSelect(user)} className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-bg-hover dark:hover:bg-white/[.04]"><div className="flex min-w-0 items-center gap-3 px-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{user.username.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><div className="truncate font-semibold">{user.firstName || user.username} {user.lastName || ""}</div><div className="truncate text-sm text-text-muted dark:text-text-secondary">{user.email || user.username}</div></div></div><div className="flex shrink-0 flex-wrap justify-end gap-2 px-2"><Pill>{user.role}</Pill><Pill green>{user.userMode}</Pill></div></button>)}</div>{hasMoreUsers && <PrimaryButton muted disabled={usersLoadingMore} onClick={onMore} className="mt-5 w-full">{usersLoadingMore ? tr("Завантажуємо…", "Loading…") : tr("Показати ще", "Show more")}</PrimaryButton>}</Surface><Surface><Label>{tr("Навчальна структура", "Learning structure")}</Label><div className="mt-5 grid grid-cols-2 gap-3"><Metric value={usersByRole.teachers} label={tr("викладачів у завантажених", "teachers loaded")} /><Metric value={usersByRole.admins} label={tr("адміністраторів", "administrators")} /></div><div className="mt-5 space-y-2">{classes.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-bg-hover px-3 py-3 text-sm dark:bg-white/[.04]"><span className="font-semibold">{item.name}</span><span className="text-text-muted dark:text-text-secondary">{item.teacherName}</span></div>)}</div></Surface></div>;

const ClassesPanel: React.FC<{ classes: AdminClass[]; users: AdminUser[]; draft: { id: number; name: string; teacherId: number }; setDraft: React.Dispatch<React.SetStateAction<{ id: number; name: string; teacherId: number }>>; onSave: () => void; onDelete: (item: AdminClass) => void }> = ({ classes, users, draft, setDraft, onSave, onDelete }) => { const navigate = useNavigate(); return <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><Surface><Label>{tr("Клас", "Class")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{draft.id ? tr("Редагувати клас", "Edit class") : tr("Новий клас", "New class")}</h2><div className="mt-5 space-y-3"><Field label={tr("Назва", "Name")} value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} /><Select label={tr("Викладач", "Teacher")} value={draft.teacherId} onChange={(e) => setDraft((p) => ({ ...p, teacherId: Number(e.target.value) }))}><option value={0}>{tr("Оберіть викладача", "Select a teacher")}</option>{users.filter((u) => u.role === "TEACHER" || u.role === "SYSTEM_ADMIN").map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}</Select><div className="flex gap-2"><PrimaryButton onClick={onSave}><Save className="mr-2 inline h-4 w-4" />{tr("Зберегти", "Save")}</PrimaryButton><PrimaryButton muted onClick={() => setDraft({ id: 0, name: "", teacherId: 0 })}>{tr("Очистити", "Clear")}</PrimaryButton></div></div></Surface><Surface><Label>{tr("Усі класи", "All classes")}</Label><div className="mt-5 space-y-2">{classes.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div><div className="font-semibold">{item.name}</div><div className="text-sm text-text-muted dark:text-text-secondary">{item.teacherName}</div></div><div className="flex gap-2"><PrimaryButton muted onClick={() => navigate(`/edu/classes/${item.id}`)}>{tr("Відкрити", "Open")}</PrimaryButton><PrimaryButton muted onClick={() => setDraft({ id: item.id, name: item.name, teacherId: item.teacherId })}>{tr("Редагувати", "Edit")}</PrimaryButton><PrimaryButton muted aria-label={tr("Видалити клас", "Delete class")} onClick={() => onDelete(item)}><Trash2 className="h-4 w-4" /></PrimaryButton></div></div>)}</div></Surface></div>; };

const MaterialsPanel: React.FC<{ language: AdminMaterialsLanguage; setLanguage: (v: AdminMaterialsLanguage) => void; topics: AdminMaterialTopic[]; selectedTopicId: number | null; draft: { title: string; description: string; order: string; theoryTitle: string; theoryContent: string }; setDraft: React.Dispatch<React.SetStateAction<{ title: string; description: string; order: string; theoryTitle: string; theoryContent: string }>>; selectTopic: (t: AdminMaterialTopic) => void; newTopic: () => void; saveTopic: () => void; removeTopic: () => void; syncMaterials: (mode: "repo" | "legacy" | "export") => void }> = ({ language, setLanguage, topics, selectedTopicId, draft, setDraft, selectTopic, newTopic, saveTopic, removeTopic, syncMaterials }) => <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]"><Surface><div className="flex items-start justify-between gap-3"><div><Label>{tr("Матеріали", "Materials")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Теми та персональна теорія", "Topics and theory")}</h2></div><Select value={language} onChange={(e) => setLanguage(e.target.value as AdminMaterialsLanguage)}>{languages.map((l) => <option key={l}>{l}</option>)}</Select></div><div className="mt-5 flex flex-wrap gap-2"><PrimaryButton onClick={newTopic}><Plus className="mr-2 inline h-4 w-4" />{tr("Нова тема", "New topic")}</PrimaryButton><PrimaryButton muted onClick={() => syncMaterials("repo")}>Sync repo</PrimaryButton><PrimaryButton muted disabled={language === "CPP"} onClick={() => syncMaterials("legacy")}>Legacy import</PrimaryButton><PrimaryButton muted onClick={() => syncMaterials("export")}>Export YAML</PrimaryButton></div><div className="mt-5 max-h-[640px] overflow-auto space-y-2">{topics.map((topic) => <button type="button" key={topic.id} onClick={() => selectTopic(topic)} className={`w-full rounded-2xl p-4 text-left transition ${selectedTopicId === topic.id ? "bg-primary/10 ring-1 ring-primary/35 dark:bg-primary/10" : "bg-bg-hover hover:bg-bg-hover dark:bg-white/[.04] dark:hover:bg-white/[.07]"}`}><div className="font-semibold">{topic.order}. {topic.title}</div><div className="mt-1 text-sm text-text-muted dark:text-text-secondary">{topic.theoryBlock ? `Theory v${topic.theoryBlock.version}` : tr("Без теоретичного блоку", "No theory block")}</div></button>)}</div></Surface><Surface><Label>{tr("Редактор", "Editor")}</Label><div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px]"><Field label={tr("Назва теми", "Topic name")} value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} /><Field label={tr("Порядок", "Order")} value={draft.order} onChange={(e) => setDraft((p) => ({ ...p, order: e.target.value }))} /></div><TextArea label={tr("Опис", "Description")} rows={3} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} className="mt-2" /><Field label={tr("Назва теорії", "Theory title")} value={draft.theoryTitle} onChange={(e) => setDraft((p) => ({ ...p, theoryTitle: e.target.value }))} className="mt-2" /><TextArea label={tr("Теорія Markdown", "Markdown theory")} rows={14} value={draft.theoryContent} onChange={(e) => setDraft((p) => ({ ...p, theoryContent: e.target.value }))} className="mt-2 font-mono text-xs" /><div className="mt-4 flex flex-wrap gap-2"><PrimaryButton onClick={saveTopic}><Save className="mr-2 inline h-4 w-4" />{tr("Зберегти", "Save")}</PrimaryButton><PrimaryButton muted onClick={removeTopic} disabled={!selectedTopicId}><Trash2 className="mr-2 inline h-4 w-4" />{tr("Видалити", "Delete")}</PrimaryButton></div></Surface></div>;

const LibraryPanel: React.FC<{ status: AdminLibraryTaskStatus; setStatus: (s: AdminLibraryTaskStatus) => void; tasks: AdminLibraryTask[]; selected: AdminLibraryTask | null; setSelected: (t: AdminLibraryTask) => void; rejectReason: string; setRejectReason: (v: string) => void; busyId: number | null; moderate: (task: AdminLibraryTask, action: "approve" | "reject") => void }> = ({ status, setStatus, tasks, selected, setSelected, rejectReason, setRejectReason, busyId, moderate }) => <div className="grid gap-5 xl:grid-cols-[.78fr_1.22fr]"><Surface><div className="flex items-start justify-between gap-4"><div><Label tone="text-accent-warn">{tr("Модерація", "Moderation")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Бібліотека задач", "Task library")}</h2></div><Select value={status} onChange={(e) => setStatus(e.target.value as AdminLibraryTaskStatus)}><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="DRAFT">Draft</option></Select></div><div className="mt-5 space-y-3">{tasks.map((task) => <button type="button" key={task.id} onClick={() => setSelected(task)} className={`w-full rounded-2xl border p-4 text-left ${selected?.id === task.id ? "border-primary/50 bg-primary/10 dark:bg-primary/10" : "border-border/8 bg-bg-surface dark:border-white/8 dark:bg-white/[.025]"}`}><div className="font-semibold">{task.title}</div><div className="mt-1 text-sm text-text-muted dark:text-text-secondary">{task.lang} · {task.author?.username || "Unknown author"} · #{task.id}</div></button>)}</div></Surface><Surface>{selected ? <div><Label>{tr("Деталі задачі", "Task details")}</Label><div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-semibold tracking-[-.04em]">{selected.title}</h2><p className="mt-1 text-sm text-text-muted dark:text-text-secondary">{selected.lang} · {tr("максимум спроб", "max attempts")} {selected.maxAttempts}</p></div><Pill green={selected.status === "APPROVED"}>{selected.status}</Pill></div><TextBlock title={tr("Опис", "Description")}>{selected.description || "(empty)"}</TextBlock><TextBlock title="Template" mono>{selected.template || ""}</TextBlock>{selected.rejectionReason && <TextBlock title={tr("Причина відхилення", "Rejection reason")}>{selected.rejectionReason}</TextBlock>}<TextArea label={tr("Причина відхилення", "Rejection reason")} rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} /><div className="mt-4 flex flex-wrap gap-2"><PrimaryButton disabled={busyId === selected.id || selected.status !== "PENDING"} onClick={() => moderate(selected, "approve")}><Check className="mr-2 inline h-4 w-4" />Approve</PrimaryButton><PrimaryButton muted disabled={busyId === selected.id || selected.status !== "PENDING"} onClick={() => moderate(selected, "reject")}>Reject</PrimaryButton></div></div> : <div className="text-sm text-text-muted">{tr("Оберіть задачу.", "Select a task.")}</div>}</Surface></div>;

const JudgePanel: React.FC<{ judge: AdminJudgeLoad | null; items: AdminJudgeDeadLetterItem[]; total: number; limit: string; setLimit: (value: string) => void; lastReplay: AdminJudgeDeadLetterReplayResult | null; busy: boolean; refresh: () => void; replay: () => void }> = ({ judge, items, total, limit, setLimit, lastReplay, busy, refresh, replay }) => <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]"><Surface><Label>Judge operations</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Черга перевірок", "Review queue")}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Status label="Mode" value={judge?.mode ?? "—"} healthy={judge?.mode === "distributed"} /><Status label="Active / queued" value={judge ? `${judge.active} / ${judge.queued}` : "—"} healthy={(judge?.queued ?? 0) < 20} /><Status label="DLQ length" value={String(judge?.deadLetterQueueLength ?? total)} healthy={(judge?.deadLetterQueueLength ?? total) === 0} /><Status label="Avg execution" value={judge ? `${Math.round(judge.avgExecutionTimeMs)} ms` : "—"} healthy /></div><div className="mt-5 flex flex-wrap items-end gap-3"><Field label="DLQ limit" value={limit} onChange={(e) => setLimit(e.target.value)} /><PrimaryButton muted onClick={refresh}>{tr("Оновити", "Refresh")}</PrimaryButton><PrimaryButton onClick={replay} disabled={busy || judge?.mode === "local"}>{busy ? tr("Replay…", "Replaying…") : tr("Replay DLQ", "Replay dead-letter queue")}</PrimaryButton></div>{lastReplay && <div className="mt-4 rounded-2xl bg-primary/10 p-4 text-sm dark:bg-primary/10">{tr("Останній повторний запуск", "Last replay")}: {lastReplay.moved} {tr("перезапущено", "moved")}, {lastReplay.skipped} {tr("пропущено", "skipped")}, {lastReplay.remaining} {tr("залишилося", "remaining")}, {lastReplay.queued} {tr("у черзі", "queued")}. </div>}</Surface><Surface><Label>Dead-letter jobs</Label><div className="mt-4 space-y-3">{items.map((item) => <div key={item.jobId} className="rounded-2xl border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.04]"><div className="flex flex-wrap items-center justify-between gap-3"><div className="font-semibold">{item.jobId}</div><Pill>{item.state || "unknown"}</Pill></div><div className="mt-2 text-sm text-text-muted dark:text-text-secondary">submission {item.submissionId || "—"} · attempts {item.attempts} · {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : tr("без дати", "no date")}</div>{item.error && <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl bg-bg-code p-3 text-xs text-text-primary">{item.error}</pre>}</div>)}{!items.length && <div className="rounded-2xl bg-bg-hover p-5 text-sm text-text-muted dark:bg-white/[.04]">{tr("DLQ порожня.", "The dead-letter queue is empty.")}</div>}</div></Surface></div>;

const MaintenancePanel: React.FC<{ maintenance: MaintenanceState | null; draft: { title: string; message: string; until: string }; setDraft: React.Dispatch<React.SetStateAction<{ title: string; message: string; until: string }>>; save: (enabled: boolean) => void }> = ({ maintenance, draft, setDraft, save }) => <Surface><Label tone="text-accent-warn">{tr("Обслуговування", "Maintenance")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Стан платформи", "Platform status")}</h2><div className={`mt-5 rounded-2xl p-5 ${maintenance?.enabled ? "bg-bg-hover dark:bg-accent-error/10" : "bg-primary/10 dark:bg-primary/10"}`}><div className="flex items-center gap-3"><CircleDot className={`h-5 w-5 ${maintenance?.enabled ? "text-accent-error" : "text-primary-strong dark:text-primary-soft"}`} /><div><div className="font-semibold">{maintenance?.enabled ? tr("Maintenance увімкнено", "Maintenance is enabled") : tr("Платформа доступна", "Platform is available")}</div><div className="mt-1 text-sm text-text-muted dark:text-text-secondary">{maintenance?.message || tr("Немає активних обмежень.", "No active restrictions.")}</div></div></div></div><div className="mt-5 grid gap-3 md:grid-cols-2"><Field label={tr("Заголовок", "Title")} value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} /><label className="block text-sm font-semibold text-text-secondary dark:text-text-primary"><span>{tr("Завершити о (необов’язково)", "End at (optional)")}</span><input type="datetime-local" value={draft.until} onChange={(e) => setDraft((p) => ({ ...p, until: e.target.value }))} className="mt-2 w-full rounded-xl border border-border/10 bg-bg-surface px-3 py-3 text-sm font-normal outline-none focus:border-primary dark:border-white/10 dark:bg-white/[.035]" /><span className="mt-1 block text-xs font-normal text-text-muted dark:text-text-secondary">{tr("Час указано за часовим поясом браузера; сервер збереже його коректно.", "Time uses your browser’s time zone; the server will store it correctly.")}</span></label></div><TextArea className="mt-3" rows={4} label={tr("Повідомлення", "Message")} value={draft.message} onChange={(e) => setDraft((p) => ({ ...p, message: e.target.value }))} /><div className="mt-4 flex gap-2"><PrimaryButton onClick={() => save(true)}>{tr("Увімкнути", "Enable")}</PrimaryButton><PrimaryButton muted onClick={() => save(false)}>{tr("Вимкнути", "Disable")}</PrimaryButton></div></Surface>;

const BroadcastPanel: React.FC<{ broadcast: BroadcastDraft; setBroadcast: React.Dispatch<React.SetStateAction<BroadcastDraft>>; result: unknown; send: (event: React.FormEvent) => void }> = ({ broadcast, setBroadcast, result, send }) => <Surface><Label>{tr("Розсилки", "Announcements")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Email/notification broadcast</h2><form onSubmit={send} className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]"><div className="space-y-3"><Field label="Subject" value={broadcast.subject} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, subject: e.target.value }))} /><Field label="Title" value={broadcast.title} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, title: e.target.value }))} /><TextArea label="Content" rows={8} value={broadcast.content} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, content: e.target.value }))} /><div className="flex flex-wrap gap-2"><PrimaryButton type="submit" onClick={() => setBroadcast((p: BroadcastDraft) => ({ ...p, dryRun: true }))}>Dry run</PrimaryButton><PrimaryButton muted type="submit" onClick={() => setBroadcast((p: BroadcastDraft) => ({ ...p, dryRun: false }))}>Send</PrimaryButton></div></div><div className="space-y-3"><Select label="Delivery" value={broadcast.delivery} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, delivery: e.target.value as BroadcastDraft["delivery"] }))}><option value="NOTIFICATION">Notification</option><option value="MARKETING">Marketing</option></Select><TextArea label="Emails" rows={3} value={broadcast.emails} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, emails: e.target.value }))} /><TextArea label="Class IDs" rows={2} value={broadcast.classIds} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, classIds: e.target.value }))} /><TextArea label="User IDs" rows={2} value={broadcast.userIds} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, userIds: e.target.value }))} /><label className="flex gap-2 text-sm"><input type="checkbox" checked={broadcast.includeSubscribed} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, includeSubscribed: e.target.checked }))} />Include subscribed</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={broadcast.includeAllUsers} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, includeAllUsers: e.target.checked }))} />Notify all users</label><Field label="Confirm" value={broadcast.confirm} onChange={(e) => setBroadcast((p: BroadcastDraft) => ({ ...p, confirm: e.target.value }))} /></div></form>{result ? <pre className="mt-4 overflow-auto rounded-2xl bg-bg-hover p-4 text-xs dark:bg-white/[.04]">{JSON.stringify(result, null, 2)}</pre> : null}</Surface>;

const CertificatesPanel: React.FC<{ certificates: CertificateListItem[]; open: (id: number) => void; create: () => void }> = ({ certificates, open, create }) => <Surface><div className="flex flex-wrap items-start justify-between gap-4"><div><Label>{tr("Сертифікати", "Certificates")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Шаблони сертифікатів", "Certificate templates")}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Створюй і редагуй шаблон у новій адмінці, одразу перевіряючи його візуальний результат.", "Create and edit templates in the admin workspace and preview the result as you work.")}</p></div><PrimaryButton onClick={create}><Plus className="mr-2 inline h-4 w-4" />{tr("Новий шаблон", "New template")}</PrimaryButton></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{certificates.map((item) => <button type="button" onClick={() => open(item.id)} key={item.id} className="rounded-2xl border border-border/8 bg-bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/35 dark:border-white/8 dark:bg-white/[.025]"><div className="font-semibold">{item.name}</div><div className="mt-2 text-sm text-text-muted dark:text-text-secondary">{item.isActive ? tr("Активний шаблон", "Active template") : tr("Чернетка або вимкнений", "Draft or inactive")}</div><div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-text-muted dark:text-text-secondary"><Pill>{item.type || "template"}</Pill>{item.version ? <Pill>v{item.version}</Pill> : null}{item.contestId ? <Pill>contest #{item.contestId}</Pill> : null}</div></button>)}</div></Surface>;

const CreateUserModal: React.FC<{ newUser: NewUserDraft; setNewUser: React.Dispatch<React.SetStateAction<NewUserDraft>>; close: () => void; submit: (e: React.FormEvent) => void }> = ({ newUser, setNewUser, close, submit }) => <ModalFrame close={close}><form onSubmit={submit} className="space-y-3"><Label>{tr("Створення акаунта", "Create account")}</Label><p className="text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Для викладача обери роль TEACHER: режим EDU встановиться автоматично.", "For a teacher, choose the TEACHER role; EDU mode will be set automatically.")}</p><div className="grid gap-3 sm:grid-cols-2"><Field label={tr("Ім’я", "First name")} value={newUser.firstName} onChange={(e) => setNewUser((p: NewUserDraft) => ({ ...p, firstName: e.target.value }))} /><Field label={tr("Прізвище", "Last name")} value={newUser.lastName} onChange={(e) => setNewUser((p: NewUserDraft) => ({ ...p, lastName: e.target.value }))} /></div><Field label="Username" required value={newUser.username} onChange={(e) => setNewUser((p: NewUserDraft) => ({ ...p, username: e.target.value }))} /><Field label="Email" value={newUser.email} onChange={(e) => setNewUser((p: NewUserDraft) => ({ ...p, email: e.target.value }))} /><Field label="Password" required type="password" value={newUser.password} onChange={(e) => setNewUser((p: NewUserDraft) => ({ ...p, password: e.target.value }))} /><div className="grid grid-cols-2 gap-3"><Select label="Role" value={newUser.role} onChange={(e) => setNewUser((p: NewUserDraft) => ({ ...p, role: e.target.value as NewUserDraft["role"] }))}><option>USER</option><option>TEACHER</option><option>SUPPORT</option><option>SYSTEM_ADMIN</option></Select><Select label="Mode" value={newUser.userMode} onChange={(e) => setNewUser((p: NewUserDraft) => ({ ...p, userMode: e.target.value as NewUserDraft["userMode"] }))}><option>PERSONAL</option><option>EDUCATIONAL</option><option>CONTEST</option></Select></div><PrimaryButton className="w-full">{tr("Створити акаунт і показати дані", "Create account and show credentials")}</PrimaryButton></form></ModalFrame>;
const CreatedCredentialsModal: React.FC<{ credentials: { username: string; email: string; password: string; role: AdminUser["role"] }; close: () => void }> = ({ credentials, close }) => <ModalFrame close={close}><Label>{tr("Дані нового акаунта", "New account credentials")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{tr("Передайте викладачу ці дані", "Share these details with the teacher")}</h2><p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Пароль показується зараз, бо після закриття цього вікна його не можна буде відновити з адмінки.", "The password is shown now because it cannot be recovered from the admin panel after you close this window.")}</p><div className="mt-5 space-y-3 rounded-2xl bg-bg-hover p-4 font-mono text-sm dark:bg-white/[.04]"><div><span className="text-text-muted dark:text-text-secondary">{tr("Логін", "Username")}</span><strong className="ml-3">{credentials.username}</strong></div><div><span className="text-text-muted dark:text-text-secondary">Email</span><strong className="ml-3">{credentials.email || "—"}</strong></div><div><span className="text-text-muted dark:text-text-secondary">{tr("Пароль", "Password")}</span><strong className="ml-3">{credentials.password}</strong></div><div><span className="text-text-muted dark:text-text-secondary">{tr("Роль", "Role")}</span><strong className="ml-3">{credentials.role}</strong></div></div><PrimaryButton className="mt-5 w-full" onClick={close}>{tr("Готово", "Done")}</PrimaryButton></ModalFrame>;
const UserModal: React.FC<{ selectedUser: AdminUser; draft: UserDraft; setDraft: React.Dispatch<React.SetStateAction<UserDraft>>; close: () => void; save: () => void; remove: () => void }> = ({ selectedUser, draft, setDraft, close, save, remove }) => <ModalFrame close={close}><Label>{tr("Користувач", "User")}</Label><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">@{selectedUser.username}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Email" value={draft.email} onChange={(e) => setDraft((p: UserDraft) => ({ ...p, email: e.target.value }))} /><Field label={tr("Ім’я", "First name")} value={draft.firstName} onChange={(e) => setDraft((p: UserDraft) => ({ ...p, firstName: e.target.value }))} /><Field label={tr("Прізвище", "Last name")} value={draft.lastName} onChange={(e) => setDraft((p: UserDraft) => ({ ...p, lastName: e.target.value }))} /><Field label={tr("Новий пароль", "New password")} type="password" value={draft.password} onChange={(e) => setDraft((p: UserDraft) => ({ ...p, password: e.target.value }))} /><Select label="Role" value={draft.role} onChange={(e) => setDraft((p: UserDraft) => ({ ...p, role: e.target.value as UserDraft["role"] }))}><option>USER</option><option>TEACHER</option><option>SUPPORT</option><option>SYSTEM_ADMIN</option></Select></div><div className="mt-5 flex flex-wrap gap-2"><PrimaryButton onClick={save}>{tr("Зберегти", "Save")}</PrimaryButton><PrimaryButton muted onClick={remove}><Trash2 className="mr-2 inline h-4 w-4" />{tr("Видалити", "Delete")}</PrimaryButton></div></ModalFrame>;
const CertificateModal: React.FC<{ details: CertificateTemplate; draft: CertificateDraft; setDraft: React.Dispatch<React.SetStateAction<CertificateDraft>>; close: () => void; save: () => void }> = ({ details, draft, setDraft, close, save }) => {
  const previewHtml = useMemo(() => {
    const sampleValues: Record<string, string> = { contest_name: "StudyCod Challenge", name: "Nikita", full_name: "Нікіта Рубан", place: "1", score: "96", max_score: "100", date: "14.07.2026", organizer: "StudyCod", signature: "StudyCod team", certificate_id: "SC-2026-0021", qr_code: "✓" };
    const html = String(draft.htmlTemplate || "<div class=\"certificate\"><h1>{{full_name}}</h1><p>{{contest_name}}</p></div>").replace(/{{\s*([\w-]+)\s*}}/g, (_match, key) => sampleValues[String(key)] ?? `[${String(key)}]`);
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;background:#f4f7f4}body{padding:24px;box-sizing:border-box}${String(draft.cssTemplate || "")}</style></head><body>${html}</body></html>`;
  }, [draft.htmlTemplate, draft.cssTemplate]);
  const addField = (fieldKey: string) => setDraft((p: CertificateDraft) => ({ ...p, htmlTemplate: `${String(p.htmlTemplate || "").trim()}\n<span>{{${fieldKey}}}</span>` }));
  return (
    <ModalFrame close={close} wide>
      <Label>{tr("Сертифікат", "Certificate")} {details.id > 0 ? `#${details.id}` : `· ${tr("новий", "new")}`}</Label>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{draft.name}</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_140px]">
        <Field label={tr("Назва", "Name")} value={draft.name} onChange={(e) => setDraft((p: CertificateDraft) => ({ ...p, name: e.target.value }))} />
        <Select label={tr("Тип", "Type")} value={draft.type} onChange={(e) => setDraft((p: CertificateDraft) => ({ ...p, type: e.target.value as CertificateDraft["type"] }))}>
          <option value="custom">custom</option>
          <option value="studycod">studycod</option>
        </Select>
        <label className="mt-8 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((p: CertificateDraft) => ({ ...p, isActive: e.target.checked }))} />
          {tr("Активний", "Active")}
        </label>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <TextArea label="HTML" rows={12} value={draft.htmlTemplate} onChange={(e) => setDraft((p: CertificateDraft) => ({ ...p, htmlTemplate: e.target.value }))} className="font-mono text-xs" />
          <TextArea label="CSS" rows={12} value={draft.cssTemplate} onChange={(e) => setDraft((p: CertificateDraft) => ({ ...p, cssTemplate: e.target.value }))} className="font-mono text-xs" />
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{tr("Додати поле до макета", "Add a field to the layout")}</div>
            <div className="flex flex-wrap gap-2">
              {fieldKeys.map((fieldKey) => <button type="button" key={fieldKey} onClick={() => addField(fieldKey)} className="rounded-lg border border-border/10 px-2.5 py-1.5 text-xs font-semibold dark:border-white/10">{`{{${fieldKey}}}`}</button>)}
            </div>
          </div>
        </div>
        <div className="min-h-[440px] rounded-2xl border border-border/10 bg-bg-hover p-3 dark:border-white/10 dark:bg-white/[.04]">
          <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{tr("Візуальний попередній перегляд", "Visual preview")}</span><span className="text-xs text-text-muted">{tr("локальне середовище", "local sandbox")}</span></div>
          <iframe title={tr("Попередній перегляд сертифіката", "Certificate preview")} sandbox="" srcDoc={previewHtml} className="h-[410px] w-full rounded-xl border border-border/10 bg-white dark:border-white/10" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fieldKeys.map((fieldKey) => {
          const current = draft.fields.find((f) => f.fieldKey === fieldKey) ?? { fieldKey, isEnabled: false, isRequired: false };
          const enabledId = `certificate-${fieldKey}-enabled`;
          const requiredId = `certificate-${fieldKey}-required`;
          return (
            <div key={fieldKey} className="rounded-xl bg-bg-hover p-3 text-sm dark:bg-white/[.04]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{fieldKey}</span>
                <input id={enabledId} type="checkbox" aria-label={`Enable ${fieldKey}`} checked={current.isEnabled} onChange={(e) => setDraft((p: CertificateDraft) => ({ ...p, fields: upsertField(p.fields, fieldKey, { isEnabled: e.target.checked, isRequired: e.target.checked ? current.isRequired : false }) }))} />
              </div>
              <label htmlFor={requiredId} className="mt-2 flex gap-2 text-xs text-text-muted">
                <input id={requiredId} type="checkbox" disabled={!current.isEnabled} checked={current.isRequired} onChange={(e) => setDraft((p: CertificateDraft) => ({ ...p, fields: upsertField(p.fields, fieldKey, { isEnabled: current.isEnabled, isRequired: e.target.checked }) }))} />
                {tr("обов’язкове", "required")}
              </label>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex justify-end"><PrimaryButton onClick={save}>{details.id > 0 ? tr("Зберегти зміни", "Save changes") : tr("Створити шаблон", "Create template")}</PrimaryButton></div>
    </ModalFrame>
  );
};

const ModalFrame: React.FC<{ children: React.ReactNode; close: () => void; wide?: boolean }> = ({ children, close, wide }) => {
  const panelRef = useDialogA11y({ open: true, onClose: close });
  return <div data-dialog-a11y="direct" data-material="admin-dialog-scrim" className="fixed inset-0 z-[70] grid place-items-center bg-bg-code/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={panelRef as React.RefObject<HTMLElement>} data-dialog-a11y="direct" role="dialog" aria-modal="true" aria-label={tr("Діалог адміністрування", "Admin dialog")} tabIndex={-1} data-material="admin-dialog" className={`max-h-[88dvh] w-full overflow-auto rounded-[26px] bg-white p-6 text-text-primary shadow-2xl dark:bg-bg-surface dark:text-text-primary ${wide ? "max-w-6xl" : "max-w-xl"}`}><button type="button" onClick={close} aria-label={tr("Закрити", "Close")} className="float-right rounded-xl p-2 transition hover:bg-bg-hover dark:hover:bg-white/[.06]"><X className="h-5 w-5" /></button>{children}</section></div>;
};
const Metric: React.FC<{ value: React.ReactNode; label: string; tone?: string }> = ({ value, label, tone = "text-text-primary dark:text-text-primary" }) => <Surface className="p-4"><div className={`text-3xl font-semibold tracking-[-.06em] ${tone}`}>{value}</div><div className="mt-1 text-sm text-text-muted dark:text-text-secondary">{label}</div></Surface>;
const Status: React.FC<{ label: string; value: string; healthy?: boolean }> = ({ label, value, healthy = false }) => <div className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${healthy ? "bg-primary" : "bg-accent-warn"}`} />{label}</div><div className="mt-3 text-sm text-text-muted dark:text-text-secondary">{value}</div></div>;
const Quick: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => <button type="button" onClick={onClick} className="flex w-full items-center justify-between rounded-xl bg-white/70 px-4 py-3 text-left text-sm font-semibold text-text-muted transition hover:bg-white dark:bg-white/[.05] dark:text-text-primary dark:hover:bg-white/[.1]"><span>{label}</span><ChevronRight className="h-4 w-4" /></button>;
const Pill: React.FC<{ children: React.ReactNode; green?: boolean }> = ({ children, green }) => <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${green ? "bg-bg-hover text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-bg-hover text-text-muted dark:bg-white/[.06] dark:text-text-secondary"}`}>{children}</span>;
const TextBlock: React.FC<{ title: string; children: React.ReactNode; mono?: boolean }> = ({ title, children, mono }) => <div className="mt-4"><div className="mb-1 text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{title}</div><pre className={`max-h-[340px] overflow-auto whitespace-pre-wrap rounded-2xl bg-bg-hover p-4 text-sm dark:bg-white/[.04] ${mono ? "font-mono text-xs" : "font-sans"}`}>{children}</pre></div>;
function splitList(value: string): string[] { return value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean); }
function splitNumbers(value: string): number[] { return splitList(value).map(Number).filter((x) => Number.isFinite(x) && x > 0); }
function parseLimit(value: string, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Math.min(50, max);
  return Math.min(parsed, max);
}
function isoToLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function localDateTimeInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function upsertField(fields: CertificateTemplate["fields"], fieldKey: typeof fieldKeys[number], patch: { isEnabled: boolean; isRequired: boolean }): CertificateTemplate["fields"] {
  const next = fields.filter((f) => f.fieldKey !== fieldKey);
  next.push({ fieldKey, ...patch });
  const order = new Map<string, number>(fieldKeys.map((key, index) => [key, index]));
  return next.sort((a, b) => (order.get(a.fieldKey) ?? fieldKeys.length) - (order.get(b.fieldKey) ?? fieldKeys.length));
}
