import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { AdminMailWorkspace } from "../components/admin/AdminMailWorkspace";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { getAdminUsers, getAdminUser, createAdminUser, updateAdminUser, updateUserRole, deleteAdminUser, getAdminClasses, createAdminClass, updateAdminClass, deleteAdminClass, getAdminStats, getAdminSupportTickets, replyAdminSupportTicket, getAdminMaintenance, enableAdminMaintenance, disableAdminMaintenance, getAdminSupportConversations, getAdminSupportConversation, postAdminSupportConversationMessage, getAdminLibraryTasks, approveAdminLibraryTask, rejectAdminLibraryTask, getAdminMaterialTopics, getAdminMaterialsDiagnostics, createAdminMaterialTopic, updateAdminMaterialTopic, deleteAdminMaterialTopic, reorderAdminMaterialTopics, importAdminMaterialTopicsYaml, syncAdminMaterialTopicsFromRepo, importAdminMaterialTopicsLegacy, exportAdminMaterialTopicsYaml, sendAdminBroadcastEmail, type AdminBroadcastDryRunResult, type AdminBroadcastSendResult, getAdminTheoryBlockRevisions, getAdminTheoryBlockRevision, rollbackAdminTheoryBlockRevision, translateAdminTheoryBlockToEn, type AdminTheoryBlockRevision, type MaintenanceState, type AdminUser, type AdminClass, type AdminStats, type AdminSupportTicket, type CreateUserData, type UpdateUserData, type CreateClassData, type AdminSupportChatConversation, type AdminSupportChatMessage, type AdminLibraryTask, type AdminLibraryTaskStatus, type AdminMaterialTopic, type AdminMaterialsDiagnostics, type AdminMaterialsLanguage } from "../lib/api/admin";
import { downloadSupportChatAttachment } from "../lib/api/support";
import { MarkdownView } from "../components/MarkdownView";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Users, BookOpen, BarChart3, Plus, Edit, Trash2, Shield, User as UserIcon, GraduationCap, Search, Wrench, CheckCircle, XCircle, Library, FileText, Save, GripVertical, History, Mail, RefreshCcw, Languages } from "lucide-react";
type Tab = "stats" | "users" | "classes" | "materials" | "library" | "emails" | "mailbox" | "support" | "maintenance";

type MaterialsLanguage = AdminMaterialsLanguage;
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day}T${h}:${min}`;
}

const SortableMaterialTopicRow: React.FC<{
  topic: AdminMaterialTopic;
  selected: boolean;
  onSelect: () => void;
}> = ({ topic, selected, onSelect }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: topic.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined
  };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-stretch gap-2 rounded-md border transition-fast ${selected ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
      <button onClick={onSelect} className="flex-1 text-left px-3 py-2 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-mono text-text-primary truncate">{topic.order}. {topic.title}</div>
            <div className="mt-0.5 text-[11px] font-mono text-text-secondary truncate">
              {topic.theoryBlock ? `Theory v${topic.theoryBlock.version}` : "No theory"}
            </div>
          </div>
        </div>
      </button>

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="px-2 flex items-center justify-center text-text-secondary hover:text-text-primary cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
    </div>
  );
};

export const AdminDashboardPage: React.FC = () => {
  const {
    t
  } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersFilter, setUsersFilter] = useState<{
    role?: string;
    userMode?: string;
  }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showEditClass, setShowEditClass] = useState(false);
  const [selectedClass, setSelectedClass] = useState<AdminClass | null>(null);
  const [showDeleteClassConfirm, setShowDeleteClassConfirm] = useState(false);
  const [classToDelete, setClassToDelete] = useState<number | null>(null);

  // Materials (global topics & theory by language)
  const [materialsLanguage, setMaterialsLanguage] = useState<MaterialsLanguage>("JAVA");
  const [materialsTopics, setMaterialsTopics] = useState<AdminMaterialTopic[]>([]);
  const [materialsSelectedTopicId, setMaterialsSelectedTopicId] = useState<number | null>(null);
  const [materialsSelectedTopic, setMaterialsSelectedTopic] = useState<AdminMaterialTopic | null>(null);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [materialsTranslatingEn, setMaterialsTranslatingEn] = useState(false);
  const [materialsDirty, setMaterialsDirty] = useState(false);
  const [materialsReordering, setMaterialsReordering] = useState(false);
  const [materialsRepoSyncing, setMaterialsRepoSyncing] = useState(false);

  const [materialsDiagnostics, setMaterialsDiagnostics] = useState<AdminMaterialsDiagnostics | null>(null);
  const [materialsLegacyImporting, setMaterialsLegacyImporting] = useState(false);

  const [materialsTheoryDirty, setMaterialsTheoryDirty] = useState(false);
  const [materialsAutoSaveState, setMaterialsAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const materialsAutoSaveSeq = useRef(0);

  const [showTheoryHistory, setShowTheoryHistory] = useState(false);
  const [theoryHistoryLoading, setTheoryHistoryLoading] = useState(false);
  const [theoryRevisions, setTheoryRevisions] = useState<AdminTheoryBlockRevision[]>([]);
  const [theorySelectedVersion, setTheorySelectedVersion] = useState<number | null>(null);
  const [theorySelectedSnapshot, setTheorySelectedSnapshot] = useState<{ title: string; content: string; level: number | null; tags: any } | null>(null);
  const [theoryRollbackBusy, setTheoryRollbackBusy] = useState(false);
  const [theoryRollbackComment, setTheoryRollbackComment] = useState("");

  const [showCreateMaterialTopic, setShowCreateMaterialTopic] = useState(false);
  const [creatingMaterialTopic, setCreatingMaterialTopic] = useState(false);
  const [newMaterialTopic, setNewMaterialTopic] = useState({
    title: "",
    description: "",
    order: "",
    language: "JAVA" as MaterialsLanguage,
    theoryContent: ""
  });
  const [showDeleteMaterialConfirm, setShowDeleteMaterialConfirm] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState<AdminMaterialTopic | null>(null);
  const [materialDraft, setMaterialDraft] = useState<{
    title: string;
    description: string;
    order: string;
    language: MaterialsLanguage;
    theoryTitle: string;
    theoryContent: string;
  } | null>(null);
  const [materialPreview, setMaterialPreview] = useState(false);

  const [showImportMaterialsYaml, setShowImportMaterialsYaml] = useState(false);
  const [materialsYamlText, setMaterialsYamlText] = useState<string>("");
  const [materialsYamlMode, setMaterialsYamlMode] = useState<"merge" | "replace">("merge");
  const [materialsYamlImporting, setMaterialsYamlImporting] = useState(false);
  const [materialsYamlFileKey, setMaterialsYamlFileKey] = useState(0);

  const [libraryStatus, setLibraryStatus] = useState<AdminLibraryTaskStatus>("PENDING");
  const [libraryTasks, setLibraryTasks] = useState<AdminLibraryTask[]>([]);
  const [librarySelectedTaskId, setLibrarySelectedTaskId] = useState<number | null>(null);
  const [librarySelectedTask, setLibrarySelectedTask] = useState<AdminLibraryTask | null>(null);
  const [libraryRejectReason, setLibraryRejectReason] = useState("");
  const [libraryActing, setLibraryActing] = useState(false);

  const [supportTickets, setSupportTickets] = useState<AdminSupportTicket[]>([]);
  const [supportView, setSupportView] = useState<"chat" | "legacy">("chat");
  const [supportConversations, setSupportConversations] = useState<AdminSupportChatConversation[]>([]);
  const [supportSelectedConversationId, setSupportSelectedConversationId] = useState<number | null>(null);
  const [supportMessages, setSupportMessages] = useState<AdminSupportChatMessage[]>([]);
  const [supportChatLoading, setSupportChatLoading] = useState(false);
  const [supportChatReplyText, setSupportChatReplyText] = useState("");
  const [supportChatSendEmail, setSupportChatSendEmail] = useState(true);
  const [showSupportTicket, setShowSupportTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<AdminSupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState | null>(null);
  const [maintenanceTitle, setMaintenanceTitle] = useState("Технічне обслуговування");
  const [maintenanceMessage, setMaintenanceMessage] = useState("Ми тимчасово виконуємо оновлення. Спробуйте трохи пізніше.");
  const [maintenanceUntil, setMaintenanceUntil] = useState<string>("");
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  // Emails (admin broadcast)
  const [emailSubject, setEmailSubject] = useState("");
  const [emailTitle, setEmailTitle] = useState("");
  const [emailContent, setEmailContent] = useState("");
  const [emailDelivery, setEmailDelivery] = useState<"MARKETING" | "NOTIFICATION">("MARKETING");
  const [emailAudience, setEmailAudience] = useState<"ALL" | "USERS" | "STUDENTS">("ALL");
  const [emailIncludeSubscribed, setEmailIncludeSubscribed] = useState(true);
  const [emailNotifyAllUsers, setEmailNotifyAllUsers] = useState(false);
  const [emailNotifyAllUsersConfirm, setEmailNotifyAllUsersConfirm] = useState("");
  const [emailRecipientUserIds, setEmailRecipientUserIds] = useState("");
  const [emailRecipientEmails, setEmailRecipientEmails] = useState("");
  const [emailSelectedClassIds, setEmailSelectedClassIds] = useState<number[]>([]);
  const [emailDryRun, setEmailDryRun] = useState(true);
  const [emailLimit, setEmailLimit] = useState("5000");
  const [emailSending, setEmailSending] = useState(false);
  const [emailLastResult, setEmailLastResult] = useState<AdminBroadcastDryRunResult | AdminBroadcastSendResult | null>(null);
  const [newUser, setNewUser] = useState<CreateUserData>({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "USER",
    userMode: "PERSONAL",
    lang: "JAVA"
  });
  const [editUser, setEditUser] = useState<UpdateUserData>({});
  const [newClass, setNewClass] = useState<CreateClassData>({
    name: "",
    language: "JAVA",
    teacherId: 0
  });
  const [editClass, setEditClass] = useState<Partial<CreateClassData>>({});
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  useEffect(() => {
    loadData();
  }, [activeTab, usersPage, usersFilter, supportView, libraryStatus, materialsLanguage]);

  const syncMaterialsFromRepoMenu = async () => {
    if (materialsRepoSyncing) return;

    if ((materialsDirty || materialsTheoryDirty) && activeTab === "materials") {
      const ok = window.confirm("You have unsaved changes in the materials editor. Sync will reload topics from the repo menu and may overwrite your draft. Continue?");
      if (!ok) return;
    }

    setMaterialsRepoSyncing(true);
    try {
      const res = await syncAdminMaterialTopicsFromRepo({
        language: materialsLanguage,
        mode: "merge"
      });

      const list = res.topics || [];
      setMaterialsTopics(list);

      const selected = materialsSelectedTopicId ? list.find(t => t.id === materialsSelectedTopicId) : list[0];
      setMaterialsSelectedTopic(selected || null);
      setMaterialsSelectedTopicId(selected?.id ?? null);
      setMaterialDraft(selected ? {
        title: selected.title,
        description: selected.description || "",
        order: String(selected.order ?? 0),
        language: selected.language,
        theoryTitle: selected.theoryBlock?.title || selected.title,
        theoryContent: selected.theoryBlock?.content || ""
      } : null);
      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");

      try {
        const diag = await getAdminMaterialsDiagnostics({ language: materialsLanguage });
        setMaterialsDiagnostics(diag);
      } catch {
        // ignore
      }

      const src = (res as any)?.source?.filePath ? ` (${(res as any).source.filePath})` : "";
      alert(`Synced from repo menu${src}. created=${res.created}, updated=${res.updated}, skipped=${res.skipped}`);
    } catch (error: any) {
      const data = error?.response?.data;
      const msg = data?.message || "Failed to sync from repo menu";
      const hint = data?.hint ? `\n\nHint: ${String(data.hint)}` : "";
      const detail = data?.detail ? `\n\nDetail: ${String(data.detail)}` : "";
      const details = data?.details
        ? `\n\nDetails: ${typeof data.details === "string" ? String(data.details) : JSON.stringify(data.details)}`
        : "";
      const fp = data?.filePath ? `\n\nFile: ${String(data.filePath)}` : "";
      const code = data?.code ? `\n\nCode: ${String(data.code)}` : "";
      const issues = Array.isArray(data?.errors) && data.errors.length
        ? `\n\nErrors: ${data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(", ")}`
        : "";
      alert(String(msg) + hint + detail + details + fp + code + issues);
    } finally {
      setMaterialsRepoSyncing(false);
    }
  };

  const importMaterialsFromLegacyDb = async () => {
    if (materialsLegacyImporting) return;
    if (materialsLanguage === "CPP") {
      alert("Legacy import is only available for JAVA/PYTHON (EDU tables). For CPP, use 'Sync from repo' or 'Import YAML'.");
      return;
    }
    setMaterialsLegacyImporting(true);
    try {
      const res = await importAdminMaterialTopicsLegacy({
        language: materialsLanguage,
        mode: "merge"
      });
      const list = res.topics || [];
      setMaterialsTopics(list);

      const selected = list[0] || null;
      setMaterialsSelectedTopic(selected);
      setMaterialsSelectedTopicId(selected?.id ?? null);
      setMaterialDraft(selected ? {
        title: selected.title,
        description: selected.description || "",
        order: String(selected.order ?? 0),
        language: selected.language,
        theoryTitle: selected.theoryBlock?.title || selected.title,
        theoryContent: selected.theoryBlock?.content || ""
      } : null);
      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");

      try {
        const diag = await getAdminMaterialsDiagnostics({ language: materialsLanguage });
        setMaterialsDiagnostics(diag);
      } catch {
        // ignore
      }

      alert(`Imported from legacy DB. created=${res.created}, updated=${res.updated}, skipped=${res.skipped}`);
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to import legacy topics");
    } finally {
      setMaterialsLegacyImporting(false);
    }
  };
  useEffect(() => {
    if (activeTab === "classes") {
      loadTeachers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "materials") return;
    if (!materialsSelectedTopic || !materialDraft) return;
    if (!materialsTheoryDirty) return;
    if (materialsSaving || materialsReordering) return;

    const content = materialDraft.theoryContent.trim();
    const title = (materialDraft.theoryTitle || materialDraft.title).trim();
    if (!content || !title) return;

    const seq = ++materialsAutoSaveSeq.current;
    const timer = window.setTimeout(async () => {
      // Ignore if a newer autosave request is scheduled.
      if (seq !== materialsAutoSaveSeq.current) return;

      setMaterialsAutoSaveState("saving");
      try {
        const res = await updateAdminMaterialTopic(materialsSelectedTopic.id, {
          theory: {
            title,
            content
          },
          theoryRevisionAction: "AUTO"
        });
        if (seq !== materialsAutoSaveSeq.current) return;

        const updated = res.topic;
        setMaterialsTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
        setMaterialsSelectedTopic(updated);
        setMaterialsTheoryDirty(false);
        setMaterialsAutoSaveState("saved");
        window.setTimeout(() => {
          setMaterialsAutoSaveState(s => s === "saved" ? "idle" : s);
        }, 1500);
      } catch (error: any) {
        if (seq !== materialsAutoSaveSeq.current) return;
        setMaterialsAutoSaveState("error");
      }
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeTab, materialsSelectedTopic?.id, materialDraft?.theoryTitle, materialDraft?.theoryContent, materialsTheoryDirty, materialsSaving, materialsReordering]);
  const loadTeachers = async () => {
    try {
      const teachersData = await getAdminUsers({
        role: "TEACHER",
        limit: 100
      });
      setTeachers(teachersData.users);
    } catch (error) {
      console.error("Failed to load teachers:", error);
    }
  };
  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "stats") {
        const statsData = await getAdminStats();
        setStats(statsData);
      } else if (activeTab === "users") {
        const usersData = await getAdminUsers({
          page: usersPage,
          limit: 20,
          ...usersFilter
        });
        setUsers(usersData.users);
        setUsersTotal(usersData.pagination.total);
      } else if (activeTab === "classes") {
        const classesData = await getAdminClasses();
        setClasses(classesData.classes);
      } else if (activeTab === "materials") {
        const data = await getAdminMaterialTopics({
          language: materialsLanguage
        });
        const list = data.topics || [];
        setMaterialsTopics(list);

        // Diagnostics: helps explain why list is empty (legacy topics, class topics, etc.)
        try {
          const diag = await getAdminMaterialsDiagnostics({ language: materialsLanguage });
          setMaterialsDiagnostics(diag);
        } catch {
          setMaterialsDiagnostics(null);
        }

        const selected = materialsSelectedTopicId ? list.find(t => t.id === materialsSelectedTopicId) : list[0];
        setMaterialsSelectedTopic(selected || null);
        setMaterialsSelectedTopicId(selected?.id ?? null);
        setMaterialDraft(selected ? {
          title: selected.title,
          description: selected.description || "",
          order: String(selected.order ?? 0),
          language: selected.language,
          theoryTitle: selected.theoryBlock?.title || selected.title,
          theoryContent: selected.theoryBlock?.content || ""
        } : null);
        setMaterialsDirty(false);
        setMaterialsTheoryDirty(false);
        setMaterialsAutoSaveState("idle");
      } else if (activeTab === "library") {
        const data = await getAdminLibraryTasks({
          status: libraryStatus
        });
        setLibraryTasks(data.tasks);
        const selected = librarySelectedTaskId ? data.tasks.find(t => t.id === librarySelectedTaskId) : data.tasks[0];
        setLibrarySelectedTask(selected || null);
        setLibrarySelectedTaskId(selected?.id ?? null);
        if ((selected?.status ?? libraryStatus) !== "REJECTED") {
          setLibraryRejectReason("");
        }
      } else if (activeTab === "support") {
        if (supportView === "legacy") {
          const data = await getAdminSupportTickets();
          setSupportTickets(data.tickets);
        } else {
          const data = await getAdminSupportConversations();
          setSupportConversations(data.conversations);
          if (!supportSelectedConversationId && data.conversations?.length) {
            setSupportSelectedConversationId(data.conversations[0].id);
          }
        }
      } else if (activeTab === "maintenance") {
        const data = await getAdminMaintenance();
        setMaintenanceState(data.state);
        setMaintenanceTitle(data.state.title || "Технічне обслуговування");
        setMaintenanceMessage(data.state.message || "");
        setMaintenanceUntil(toDatetimeLocalValue(data.state.until));
      } else if (activeTab === "emails") {
        // Need classes list for class-targeted emails.
        const classesData = await getAdminClasses();
        setClasses(classesData.classes);
      }
    } catch (error: any) {
      console.error("Failed to load data:", error);
      if (error.response?.status === 403) {
        alert("Access denied. Only SYSTEM_ADMIN can access this page.");
        window.location.href = "/";
      }
    } finally {
      setLoading(false);
    }
  };
  const handleEnableOrUpdateMaintenance = async () => {
    const title = maintenanceTitle.trim();
    const message = maintenanceMessage.trim();
    if (!title) {
      alert("Title is required");
      return;
    }
    if (!message) {
      alert("Message is required");
      return;
    }
    setMaintenanceSaving(true);
    try {
      const untilIso = maintenanceUntil ? new Date(maintenanceUntil).toISOString() : null;
      const res = await enableAdminMaintenance({
        title,
        message,
        until: untilIso
      });
      setMaintenanceState(res.state);
      window.dispatchEvent(new CustomEvent("studycod:adminMaintenance", {
        detail: {
          enabled: !!res.state.enabled
        }
      }));
      alert("Maintenance enabled/updated");
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to enable maintenance");
    } finally {
      setMaintenanceSaving(false);
    }
  };
  const handleDisableMaintenance = async () => {
    setMaintenanceSaving(true);
    try {
      const res = await disableAdminMaintenance();
      setMaintenanceState(res.state);
      window.dispatchEvent(new CustomEvent("studycod:adminMaintenance", {
        detail: {
          enabled: !!res.state.enabled
        }
      }));
      alert("Maintenance disabled");
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to disable maintenance");
    } finally {
      setMaintenanceSaving(false);
    }
  };
  const openSupportTicket = (t: AdminSupportTicket) => {
    setSelectedTicket(t);
    setReplyText("");
    setShowSupportTicket(true);
  };

  const openSupportConversation = async (conversationId: number) => {
    setSupportSelectedConversationId(conversationId);
    setSupportChatLoading(true);
    try {
      const data = await getAdminSupportConversation(conversationId);
      setSupportMessages(data.messages || []);
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to load conversation");
    } finally {
      setSupportChatLoading(false);
    }
  };

  const handleAdminSupportReply = async () => {
    if (!supportSelectedConversationId) return;
    const trimmed = supportChatReplyText.trim();
    if (!trimmed) {
      alert("Reply text is required");
      return;
    }
    setSupportChatLoading(true);
    try {
      const res = await postAdminSupportConversationMessage(supportSelectedConversationId, {
        text: trimmed,
        sendEmail: supportChatSendEmail
      });
      setSupportChatReplyText("");
      setSupportMessages(prev => [...prev, {
        id: res.message.id,
        senderType: "ADMIN",
        text: res.message.text,
        createdAt: res.message.createdAt,
        attachments: []
      }]);
      const list = await getAdminSupportConversations();
      setSupportConversations(list.conversations);
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to send reply");
    } finally {
      setSupportChatLoading(false);
    }
  };

  const downloadAdminAttachment = async (attachmentId: number) => {
    try {
      const { blob, filename } = await downloadSupportChatAttachment(attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to download");
    }
  };

  const selectLibraryTask = (taskId: number) => {
    setLibrarySelectedTaskId(taskId);
    const task = libraryTasks.find(t => t.id === taskId) || null;
    setLibrarySelectedTask(task);
    setLibraryRejectReason(task?.rejectionReason || "");
  };

  const refreshLibraryTasks = async () => {
    const data = await getAdminLibraryTasks({
      status: libraryStatus
    });
    setLibraryTasks(data.tasks);
    const nextSelected = data.tasks.find(t => t.id === librarySelectedTaskId) ?? data.tasks[0] ?? null;
    setLibrarySelectedTaskId(nextSelected?.id ?? null);
    setLibrarySelectedTask(nextSelected);
  };

  const handleApproveLibraryTask = async () => {
    if (!librarySelectedTaskId || !librarySelectedTask) return;
    if (librarySelectedTask.status !== "PENDING") {
      alert("Only PENDING tasks can be approved");
      return;
    }
    setLibraryActing(true);
    try {
      await approveAdminLibraryTask(librarySelectedTaskId);
      await refreshLibraryTasks();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to approve task");
    } finally {
      setLibraryActing(false);
    }
  };

  const handleRejectLibraryTask = async () => {
    if (!librarySelectedTaskId || !librarySelectedTask) return;
    if (librarySelectedTask.status !== "PENDING") {
      alert("Only PENDING tasks can be rejected");
      return;
    }
    const reason = libraryRejectReason.trim();
    if (!reason) {
      alert("Rejection reason is required");
      return;
    }
    setLibraryActing(true);
    try {
      await rejectAdminLibraryTask(librarySelectedTaskId, reason);
      await refreshLibraryTasks();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to reject task");
    } finally {
      setLibraryActing(false);
    }
  };

  const handleReplyToTicket = async () => {
    if (!selectedTicket) return;
    const trimmed = replyText.trim();
    if (!trimmed) {
      alert("Reply text is required");
      return;
    }
    setReplying(true);
    try {
      await replyAdminSupportTicket(selectedTicket.id, {
        replyText: trimmed
      });
      setShowSupportTicket(false);
      setSelectedTicket(null);
      setReplyText("");
      await loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to send reply");
    } finally {
      setReplying(false);
    }
  };
  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) {
      alert("Username and password are required");
      return;
    }
    try {
      await createAdminUser(newUser);
      setShowCreateUser(false);
      setNewUser({
        username: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        role: "USER",
        userMode: "PERSONAL",
        lang: "JAVA"
      });
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to create user");
    }
  };
  const handleEditUser = async () => {
    if (!selectedUser) return;
    try {
      await updateAdminUser(selectedUser.id, editUser);
      setShowEditUser(false);
      setSelectedUser(null);
      setEditUser({});
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to update user");
    }
  };
  const handleUpdateRole = async (userId: number, role: "USER" | "TEACHER" | "SYSTEM_ADMIN") => {
    try {
      await updateUserRole(userId, {
        role
      });
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to update role");
    }
  };
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteAdminUser(userToDelete);
      setShowDeleteUserConfirm(false);
      setUserToDelete(null);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to delete user");
    }
  };
  const handleCreateClass = async () => {
    if (!newClass.name || !newClass.teacherId) {
      alert("Name and teacher are required");
      return;
    }
    try {
      await createAdminClass(newClass);
      setShowCreateClass(false);
      setNewClass({
        name: "",
        language: "JAVA",
        teacherId: 0
      });
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to create class");
    }
  };
  const handleEditClass = async () => {
    if (!selectedClass) return;
    try {
      await updateAdminClass(selectedClass.id, editClass);
      setShowEditClass(false);
      setSelectedClass(null);
      setEditClass({});
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to update class");
    }
  };
  const handleDeleteClass = async () => {
    if (!classToDelete) return;
    try {
      await deleteAdminClass(classToDelete);
      setShowDeleteClassConfirm(false);
      setClassToDelete(null);
      loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to delete class");
    }
  };
  const openEditUser = async (user: AdminUser) => {
    setSelectedUser(user);
    setEditUser({
      email: user.email || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      lang: user.lang
    });
    setShowEditUser(true);
  };
  const openEditClass = (classItem: AdminClass) => {
    setSelectedClass(classItem);
    setEditClass({
      name: classItem.name,
      language: classItem.language,
      teacherId: classItem.teacherId
    });
    setShowEditClass(true);
  };

  const materialsSensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 6
    }
  }));

  const handleMaterialsDragEnd = async (event: DragEndEvent) => {
    const {
      active,
      over
    } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const oldIndex = materialsTopics.findIndex(t => t.id === active.id);
    const newIndex = materialsTopics.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const optimistic = arrayMove(materialsTopics, oldIndex, newIndex).map((t, idx) => ({
      ...t,
      order: idx + 1
    }));
    setMaterialsTopics(optimistic);

    const selectedId = materialsSelectedTopicId;
    if (selectedId) {
      const nextSelected = optimistic.find(t => t.id === selectedId) || null;
      if (nextSelected) setMaterialsSelectedTopic(nextSelected);
      if (!materialsDirty && materialDraft && nextSelected) {
        setMaterialDraft({
          ...materialDraft,
          order: String(nextSelected.order ?? 0)
        });
      }
    }

    setMaterialsReordering(true);
    try {
      const res = await reorderAdminMaterialTopics({
        language: materialsLanguage,
        orderedIds: optimistic.map(t => t.id)
      });
      const list = res.topics || [];
      setMaterialsTopics(list);
      if (selectedId) {
        const refreshed = list.find(t => t.id === selectedId) || null;
        setMaterialsSelectedTopic(refreshed);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to reorder topics");
      try {
        const data = await getAdminMaterialTopics({
          language: materialsLanguage
        });
        setMaterialsTopics(data.topics || []);
      } catch {
        // ignore
      }
    } finally {
      setMaterialsReordering(false);
    }
  };

  const selectMaterialTopic = (topicId: number) => {
    if (materialsDirty) {
      const ok = confirm("You have unsaved changes. Discard them?");
      if (!ok) return;
    }
    const selected = materialsTopics.find(t => t.id === topicId) || null;
    setMaterialsSelectedTopicId(topicId);
    setMaterialsSelectedTopic(selected);
    setMaterialDraft(selected ? {
      title: selected.title,
      description: selected.description || "",
      order: String(selected.order ?? 0),
      language: selected.language,
      theoryTitle: selected.theoryBlock?.title || selected.title,
      theoryContent: selected.theoryBlock?.content || ""
    } : null);
    setMaterialsDirty(false);
    setMaterialsTheoryDirty(false);
    setMaterialsAutoSaveState("idle");
    setMaterialPreview(false);
  };

  const openTheoryHistoryModal = async () => {
    const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
    if (!theoryBlockId) {
      alert("This topic has no theory yet");
      return;
    }
    setShowTheoryHistory(true);
    setTheoryHistoryLoading(true);
    setTheoryRevisions([]);
    setTheorySelectedVersion(null);
    setTheorySelectedSnapshot(null);
    setTheoryRollbackComment("");
    try {
      const res = await getAdminTheoryBlockRevisions(theoryBlockId);
      const list = res.revisions || [];
      setTheoryRevisions(list);

      const v = list[0]?.version;
      if (v) {
        setTheorySelectedVersion(v);
        const details = await getAdminTheoryBlockRevision(theoryBlockId, v);
        setTheorySelectedSnapshot(details.snapshot);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to load theory history");
    } finally {
      setTheoryHistoryLoading(false);
    }
  };

  const selectTheoryRevision = async (version: number) => {
    const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
    if (!theoryBlockId) return;
    setTheorySelectedVersion(version);
    setTheoryHistoryLoading(true);
    try {
      const details = await getAdminTheoryBlockRevision(theoryBlockId, version);
      setTheorySelectedSnapshot(details.snapshot);
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to load revision");
    } finally {
      setTheoryHistoryLoading(false);
    }
  };

  const handleRollbackTheory = async () => {
    const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
    if (!theoryBlockId || !theorySelectedVersion) return;

    if (materialsDirty || materialsTheoryDirty) {
      const ok = confirm("You have unsaved changes in the editor. Rolling back will refresh data and discard them. Continue?");
      if (!ok) return;
    }

    const ok = confirm(`Rollback theory to version ${theorySelectedVersion}?`);
    if (!ok) return;

    setTheoryRollbackBusy(true);
    try {
      await rollbackAdminTheoryBlockRevision(theoryBlockId, theorySelectedVersion, {
        comment: theoryRollbackComment.trim() || undefined
      });
      setShowTheoryHistory(false);
      setTheorySelectedSnapshot(null);
      setTheorySelectedVersion(null);
      await loadData();
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to rollback");
    } finally {
      setTheoryRollbackBusy(false);
    }
  };

  const handleSaveMaterial = async () => {
    if (!materialsSelectedTopic || !materialDraft) return;
    const title = materialDraft.title.trim();
    if (!title) {
      alert("Title is required");
      return;
    }
    const orderNum = materialDraft.order.trim() ? parseInt(materialDraft.order.trim(), 10) : 0;
    if (!Number.isFinite(orderNum) || orderNum < 0) {
      alert("Order must be a non-negative number");
      return;
    }

    setMaterialsSaving(true);
    try {
      const theoryContent = materialDraft.theoryContent.trim();
      const payload: any = {
        title,
        description: materialDraft.description.trim() || null,
        order: orderNum,
        language: materialDraft.language
      };
      if (theoryContent) {
        payload.theory = {
          title: materialDraft.theoryTitle.trim() || title,
          content: theoryContent
        };
      }

      const res = await updateAdminMaterialTopic(materialsSelectedTopic.id, payload);
      const updated = res.topic;

      setMaterialsTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
      setMaterialsSelectedTopic(updated);
      setMaterialsSelectedTopicId(updated.id);
      setMaterialDraft({
        title: updated.title,
        description: updated.description || "",
        order: String(updated.order ?? 0),
        language: updated.language,
        theoryTitle: updated.theoryBlock?.title || updated.title,
        theoryContent: updated.theoryBlock?.content || ""
      });
      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");
      alert("Saved");
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to save");
    } finally {
      setMaterialsSaving(false);
    }
  };

  const handleCreateMaterial = async () => {
    const title = newMaterialTopic.title.trim();
    if (!title) {
      alert("Title is required");
      return;
    }
    const orderStr = newMaterialTopic.order.trim();
    const orderNum = orderStr ? parseInt(orderStr, 10) : undefined;
    if (orderStr && (!Number.isFinite(orderNum) || (orderNum as number) < 0)) {
      alert("Order must be a non-negative number");
      return;
    }

    setCreatingMaterialTopic(true);
    try {
      const res = await createAdminMaterialTopic({
        title,
        description: newMaterialTopic.description.trim() || null,
        order: orderNum,
        language: newMaterialTopic.language,
        theory: newMaterialTopic.theoryContent.trim() ? {
          title,
          content: newMaterialTopic.theoryContent.trim()
        } : null
      });
      const created = res.topic;
      setShowCreateMaterialTopic(false);
      setNewMaterialTopic({
        title: "",
        description: "",
        order: "",
        language: newMaterialTopic.language,
        theoryContent: ""
      });

      // Refresh list quickly and select created.
      setMaterialsTopics(prev => [...prev, created].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      selectMaterialTopic(created.id);
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to create topic");
    } finally {
      setCreatingMaterialTopic(false);
    }
  };

  const handleImportMaterialsYaml = async () => {
    const yaml = materialsYamlText.trim();
    if (!yaml) {
      alert("YAML is required");
      return;
    }

    if (materialsDirty || materialsTheoryDirty) {
      const ok = confirm("You have unsaved changes. Import will refresh the list and may discard local edits. Continue?");
      if (!ok) return;
    }

    setMaterialsYamlImporting(true);
    try {
      const res = await importAdminMaterialTopicsYaml({
        language: materialsLanguage,
        yaml,
        mode: materialsYamlMode
      });
      const list = res.topics || [];
      setMaterialsTopics(list);
      setMaterialsSelectedTopicId(null);
      setMaterialsSelectedTopic(null);
      setMaterialDraft(null);

      // Select first topic after import.
      if (list.length) {
        setMaterialsSelectedTopicId(list[0].id);
        setMaterialsSelectedTopic(list[0]);
        setMaterialDraft({
          title: list[0].title,
          description: list[0].description || "",
          order: String(list[0].order ?? 0),
          language: list[0].language,
          theoryTitle: list[0].theoryBlock?.title || list[0].title,
          theoryContent: list[0].theoryBlock?.content || ""
        });
      }

      setMaterialsDirty(false);
      setMaterialsTheoryDirty(false);
      setMaterialsAutoSaveState("idle");
      setShowImportMaterialsYaml(false);
      alert(`Imported: created=${res.created}, updated=${res.updated}, skipped=${res.skipped}`);
    } catch (error: any) {
      const data = error?.response?.data;
      const msg = data?.message || "Failed to import YAML";
      const hint = data?.hint ? `\n\nHint: ${String(data.hint)}` : "";
      const detail = data?.detail ? `\n\nDetail: ${String(data.detail)}` : "";
      const details = data?.details
        ? `\n\nDetails: ${typeof data.details === "string" ? String(data.details) : JSON.stringify(data.details)}`
        : "";
      const fp = data?.filePath ? `\n\nFile: ${String(data.filePath)}` : "";
      const code = data?.code ? `\n\nCode: ${String(data.code)}` : "";
      const issues = Array.isArray(data?.errors) && data.errors.length
        ? `\n\nErrors: ${data.errors.map((e: any) => e?.message || e?.code || JSON.stringify(e)).join(", ")}`
        : "";
      alert(String(msg) + hint + detail + details + fp + code + issues);
    } finally {
      setMaterialsYamlImporting(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!materialToDelete) return;
    try {
      await deleteAdminMaterialTopic(materialToDelete.id);
      setMaterialsTopics(prev => prev.filter(t => t.id !== materialToDelete.id));
      if (materialsSelectedTopicId === materialToDelete.id) {
        setMaterialsSelectedTopicId(null);
        setMaterialsSelectedTopic(null);
        setMaterialDraft(null);
      }
      setShowDeleteMaterialConfirm(false);
      setMaterialToDelete(null);
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to delete topic");
    }
  };

  const parseEmailList = (raw: string): string[] => {
    // People often paste `\n` literally (from JSON, docs, etc.). Treat it like a newline.
    const normalized = String(raw || "").replace(/\\n/g, "\n");
    const items = normalized
      .split(/[\s,;]+/g)
      .map(s => s.trim())
      .filter(Boolean);
    const uniq = new Map<string, string>();
    for (const e of items) {
      const key = e.toLowerCase();
      if (!uniq.has(key)) uniq.set(key, e);
    }
    return Array.from(uniq.values());
  };

  const parseIdList = (raw: string): number[] => {
    const normalized = String(raw || "").replace(/\\n/g, "\n");
    const items = normalized
      .split(/[\s,;]+/g)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n) && Number.isInteger(n) && n > 0) as number[];

    const uniq = new Set<number>();
    for (const n of items) uniq.add(n);
    return Array.from(uniq.values());
  };

  const toggleEmailClassId = (classId: number) => {
    setEmailSelectedClassIds(prev => (prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]));
  };

  const runAdminBroadcastEmail = async (dryRun: boolean) => {
    if (emailSending) return;

    const subject = emailSubject.trim();
    const title = (emailTitle.trim() || subject).trim();
    const content = emailContent.trim();

    if (!subject) {
      alert("Subject is required");
      return;
    }
    if (!title) {
      alert("Title is required");
      return;
    }
    if (!content) {
      alert("Email content is required");
      return;
    }

    const parsedEmails = parseEmailList(emailRecipientEmails);
    const parsedUserIds = parseIdList(emailRecipientUserIds);
    const classIds = emailSelectedClassIds;
    const includeSubscribed = emailDelivery === "NOTIFICATION" ? false : !!emailIncludeSubscribed;
    const includeAllUsers = emailDelivery === "NOTIFICATION" && !!emailNotifyAllUsers;

    const hasTargets = includeAllUsers || parsedEmails.length > 0 || classIds.length > 0 || parsedUserIds.length > 0;
    if (!includeSubscribed && !hasTargets) {
      alert("No recipients selected. Enable subscribed audience and/or add class recipients/emails/user IDs.");
      return;
    }

    if (emailDelivery === "NOTIFICATION" && !hasTargets) {
      alert("Notification mode requires explicit recipients (classes and/or emails and/or user IDs).");
      return;
    }

    if (includeAllUsers && !dryRun) {
      const expected = "ALL USERS";
      if (emailNotifyAllUsersConfirm.trim() !== expected) {
        alert(`To send a mass notification to all users, type '${expected}' in the confirmation field.`);
        return;
      }
    }

    const limitNum = Number(emailLimit);
    const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(Math.floor(limitNum), 5000) : undefined;

    setEmailSending(true);
    setEmailLastResult(null);
    try {
      const res = await sendAdminBroadcastEmail({
        subject,
        title,
        delivery: emailDelivery,
        includeAllUsers,
        confirm: includeAllUsers ? emailNotifyAllUsersConfirm.trim() : undefined,
        content,
        includeSubscribed,
        audience: emailAudience,
        targets: {
          userIds: parsedUserIds.length ? parsedUserIds : undefined,
          classIds: classIds.length ? classIds : undefined,
          emails: parsedEmails.length ? parsedEmails : undefined,
        },
        dryRun,
        limit,
      });
      setEmailLastResult(res);
      if (!dryRun && res?.ok) {
        alert(`Email broadcast completed. recipients=${res.recipients}, sent=${res.sent}, failed=${res.failed}`);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || u.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) || u.lastName?.toLowerCase().includes(searchQuery.toLowerCase()));
  if (loading && activeTab === "stats") {
    return <div className="h-full flex items-center justify-center text-text-primary font-mono">
        {t("loading")}
      </div>;
  }
  return <div className="h-full flex flex-col bg-bg-base">
      {}
      <div className="border-b border-border p-4 bg-bg-secondary">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-mono font-bold text-text-primary flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Admin Panel
          </h1>
        </div>
      </div>

      {}
      <div className="flex gap-2 p-4 border-b border-border bg-bg-secondary">
        <Button variant={activeTab === "stats" ? "primary" : "secondary"} onClick={() => setActiveTab("stats")} className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Statistics
        </Button>
        <Button variant={activeTab === "users" ? "primary" : "secondary"} onClick={() => setActiveTab("users")} className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          Users
        </Button>
        <Button variant={activeTab === "classes" ? "primary" : "secondary"} onClick={() => setActiveTab("classes")} className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Classes
        </Button>

        <Button variant={activeTab === "materials" ? "primary" : "secondary"} onClick={() => setActiveTab("materials")} className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Materials
        </Button>

        <Button variant={activeTab === "library" ? "primary" : "secondary"} onClick={() => setActiveTab("library")} className="flex items-center gap-2">
          <Library className="w-4 h-4" />
          Library
        </Button>

        <Button variant={activeTab === "emails" ? "primary" : "secondary"} onClick={() => setActiveTab("emails")} className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Emails
        </Button>

        <Button variant={activeTab === "mailbox" ? "primary" : "secondary"} onClick={() => setActiveTab("mailbox")} className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Mailbox
        </Button>

        <Button variant={activeTab === "support" ? "primary" : "secondary"} onClick={() => setActiveTab("support")} className="flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Support
        </Button>

        <Button variant={activeTab === "maintenance" ? "primary" : "secondary"} onClick={() => setActiveTab("maintenance")} className="flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          Maintenance
        </Button>
      </div>

      {}
      <div className="flex-1 overflow-auto p-4">
        {}
        {activeTab === "stats" && stats && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">Total Users</h3>
                <Users className="w-5 h-5 text-text-secondary" />
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats.users.total}</p>
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Teachers:</span>
                  <span className="text-text-primary">{stats.users.teachers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Admins:</span>
                  <span className="text-text-primary">{stats.users.admins}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">User Modes</h3>
                <UserIcon className="w-5 h-5 text-text-secondary" />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Personal:</span>
                  <span className="text-text-primary font-semibold">{stats.users.byMode.PERSONAL}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Educational:</span>
                  <span className="text-text-primary font-semibold">{stats.users.byMode.EDUCATIONAL}</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-mono font-semibold text-text-primary">Total Classes</h3>
                <BookOpen className="w-5 h-5 text-text-secondary" />
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats.classes.total}</p>
            </Card>
          </div>}

        {}
        {activeTab === "users" && <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <Input type="text" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="flex gap-2">
                <select value={usersFilter.role || ""} onChange={e => setUsersFilter({
              ...usersFilter,
              role: e.target.value || undefined
            })} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                  <option value="">All Roles</option>
                  <option value="USER">User</option>
                  <option value="TEACHER">Teacher</option>
                  <option value="SYSTEM_ADMIN">Admin</option>
                </select>
                <select value={usersFilter.userMode || ""} onChange={e => setUsersFilter({
              ...usersFilter,
              userMode: e.target.value || undefined
            })} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                  <option value="">All Modes</option>
                  <option value="PERSONAL">Personal</option>
                  <option value="EDUCATIONAL">Educational</option>
                </select>
                <Button onClick={() => setShowCreateUser(true)} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create User
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-bg-secondary border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">ID</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Username</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Email</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Role</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Mode</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Language</th>
                      <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => <tr key={user.id} className="border-b border-border hover:bg-bg-secondary transition-fast">
                        <td className="px-4 py-2 text-sm text-text-primary font-mono">{user.id}</td>
                        <td className="px-4 py-2 text-sm text-text-primary">{user.username}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.email || "-"}</td>
                        <td className="px-4 py-2">
                          <select value={user.role} onChange={e => handleUpdateRole(user.id, e.target.value as "USER" | "TEACHER" | "SYSTEM_ADMIN")} className="px-2 py-1 border border-border bg-bg-secondary text-text-primary font-mono text-xs">
                            <option value="USER">USER</option>
                            <option value="TEACHER">TEACHER</option>
                            <option value="SYSTEM_ADMIN">ADMIN</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.userMode}</td>
                        <td className="px-4 py-2 text-sm text-text-secondary">{user.lang}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => openEditUser(user)} className="flex items-center gap-1">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => {
                        setUserToDelete(user.id);
                        setShowDeleteUserConfirm(true);
                      }} className="flex items-center gap-1 text-red-500 hover:text-red-700">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>)}
                  </tbody>
                </table>
              </div>
              {usersTotal > 20 && <div className="p-4 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    Showing {(usersPage - 1) * 20 + 1} - {Math.min(usersPage * 20, usersTotal)} of {usersTotal}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setUsersPage(p => Math.max(1, p - 1))} disabled={usersPage === 1}>
                      Previous
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setUsersPage(p => p + 1)} disabled={usersPage * 20 >= usersTotal}>
                      Next
                    </Button>
                  </div>
                </div>}
            </Card>
          </div>}

        {}
        {activeTab === "classes" && <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowCreateClass(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create Class
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classes.map(classItem => <Card key={classItem.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-mono font-semibold text-text-primary text-lg">{classItem.name}</h3>
                      <p className="text-sm text-text-secondary mt-1">{classItem.language}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditClass(classItem)} className="flex items-center gap-1">
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => {
                  setClassToDelete(classItem.id);
                  setShowDeleteClassConfirm(true);
                }} className="flex items-center gap-1 text-red-500 hover:text-red-700">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-text-secondary">
                      Teacher: <span className="text-text-primary">{classItem.teacherName}</span>
                    </p>
                    <p className="text-sm text-text-secondary mt-1">
                      Created: <span className="text-text-primary">{new Date(classItem.createdAt).toLocaleDateString()}</span>
                    </p>
                  </div>
                </Card>)}
            </div>
          </div>}

        {}
        {activeTab === "materials" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-primary">Learning materials</div>
                  <div className="mt-1 text-xs font-mono text-text-secondary">Global topics + theory by language (visible for all classes of that language).</div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono text-text-secondary">Language</div>
                  <select value={materialsLanguage} onChange={e => {
                setMaterialsLanguage(e.target.value as any);
                setMaterialsSelectedTopicId(null);
                setMaterialsSelectedTopic(null);
                setMaterialDraft(null);
                setMaterialsDirty(false);
              }} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                    <option value="JAVA">JAVA</option>
                    <option value="PYTHON">PYTHON</option>
                    <option value="CPP">CPP</option>
                  </select>

                  <Button variant="secondary" onClick={() => {
                setMaterialsYamlText("language: " + materialsLanguage + "\n" +
                  "topics:\n" +
                  "  - title: Introduction\n" +
                  "    description: Basic concepts\n" +
                  "    order: 1\n" +
                  "    theory:\n" +
                  "      title: Introduction\n" +
                  "      content: |\n" +
                  "        # Hello\n" +
                  "        This is **theory-only** markdown.\n");
                setMaterialsYamlMode("merge");
                setMaterialsYamlFileKey(k => k + 1);
                setShowImportMaterialsYaml(true);
              }} disabled={materialsRepoSyncing || materialsSaving || materialsReordering}>
                    Import YAML
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={syncMaterialsFromRepoMenu}
                    disabled={materialsRepoSyncing || materialsSaving || materialsReordering}
                    className="flex items-center gap-2"
                    title="Sync topics/theory from repo menu (theories/*_theory.yml)"
                  >
                    <RefreshCcw className={`w-4 h-4 ${materialsRepoSyncing ? "animate-spin" : ""}`} />
                    {materialsRepoSyncing ? "Syncing…" : "Sync from repo"}
                  </Button>

                  <Button variant="secondary" onClick={async () => {
                try {
                  const { blob, filename } = await exportAdminMaterialTopicsYaml({
                    language: materialsLanguage
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (error: any) {
                  alert(error.response?.data?.message || "Failed to export YAML");
                }
              }} disabled={materialsRepoSyncing || materialsSaving || materialsReordering}>
                    Export YAML
                  </Button>

                  <Button onClick={() => {
                setNewMaterialTopic({
                  title: "",
                  description: "",
                  order: "",
                  language: materialsLanguage,
                  theoryContent: ""
                });
                setShowCreateMaterialTopic(true);
              }} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Create topic
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 md:col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-mono font-semibold text-text-primary">Topics</div>
                  <div className="text-xs font-mono text-text-secondary">{materialsReordering ? "Reordering…" : materialsTopics.length}</div>
                </div>

                <DndContext sensors={materialsSensors} collisionDetection={closestCenter} onDragEnd={handleMaterialsDragEnd}>
                  <SortableContext items={materialsTopics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="mt-3 space-y-2">
                      {materialsTopics.map(topic => {
                        const isSelected = materialsSelectedTopicId === topic.id;
                        return <SortableMaterialTopicRow key={topic.id} topic={topic} selected={isSelected} onSelect={() => selectMaterialTopic(topic.id)} />;
                      })}
                      {!materialsTopics.length && <div className="text-sm font-mono text-text-secondary space-y-2">
                          <div>No global topics for {materialsLanguage}.</div>

                          {materialsDiagnostics ? <div className="text-[11px] font-mono text-text-secondary opacity-80">
                              In DB: legacy topics={materialsDiagnostics.legacyTopics}, class topics={materialsDiagnostics.topicsNewClass}
                            </div> : null}

                          {materialsDiagnostics?.legacyTopics ? <div>
                              <Button variant="secondary" size="sm" onClick={importMaterialsFromLegacyDb} disabled={materialsLegacyImporting}>
                                {materialsLegacyImporting ? "Importing…" : "Import from existing DB topics"}
                              </Button>
                            </div> : null}

                          {materialsDiagnostics?.topicsNewClass ? <div className="text-[11px] font-mono text-text-secondary opacity-80">
                              Note: class-specific topics exist, but this page shows only global topics (class = NULL).
                            </div> : null}
                        </div>}
                    </div>
                  </SortableContext>
                </DndContext>
              </Card>

              <Card className="p-4 md:col-span-2">
                {!materialsSelectedTopic || !materialDraft ? <div className="text-sm font-mono text-text-secondary">Select a topic to edit.</div> : <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-mono font-semibold text-text-primary">Edit topic</div>
                        <div className="mt-1 text-xs font-mono text-text-secondary">ID: {materialsSelectedTopic.id}{materialsDirty ? " • Unsaved changes" : ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => setMaterialPreview(p => !p)}>
                          {materialPreview ? "Hide preview" : "Preview"}
                        </Button>
                        {materialsAutoSaveState !== "idle" && <div className={`text-xs font-mono ${materialsAutoSaveState === "error" ? "text-red-500" : "text-text-secondary"}`}>
                            {materialsAutoSaveState === "saving" ? "Auto-saving…" : materialsAutoSaveState === "saved" ? "Auto-saved" : "Auto-save failed"}
                          </div>}
                        <Button onClick={handleSaveMaterial} disabled={materialsSaving || !materialsDirty}>
                          <Save className="w-4 h-4 mr-2" />
                          {materialsSaving ? "Saving..." : "Save"}
                        </Button>
                        <Button variant="secondary" onClick={() => {
                  setMaterialToDelete(materialsSelectedTopic);
                  setShowDeleteMaterialConfirm(true);
                }} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-mono text-text-secondary mb-1">Title</label>
                        <Input value={materialDraft.title} onChange={e => {
                    setMaterialDraft({
                      ...materialDraft,
                      title: e.target.value
                    });
                    setMaterialsDirty(true);
                  }} />
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-text-secondary mb-1">Order</label>
                        <Input value={materialDraft.order} onChange={e => {
                    setMaterialDraft({
                      ...materialDraft,
                      order: e.target.value
                    });
                    setMaterialsDirty(true);
                  }} />
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-text-secondary mb-1">Language</label>
                        <select value={materialDraft.language} onChange={e => {
                    setMaterialDraft({
                      ...materialDraft,
                      language: e.target.value as any
                    });
                    setMaterialsDirty(true);
                  }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                          <option value="JAVA">JAVA</option>
                          <option value="PYTHON">PYTHON</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-text-secondary mb-1">Description</label>
                      <textarea value={materialDraft.description} onChange={e => {
                  setMaterialDraft({
                    ...materialDraft,
                    description: e.target.value
                  });
                  setMaterialsDirty(true);
                }} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[80px]" />
                    </div>

                    <div className="border-t border-border pt-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="text-sm font-mono font-semibold text-text-primary">Theory (Markdown)</div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              const theoryBlockId = materialsSelectedTopic?.theoryBlock?.id;
                              if (!theoryBlockId) {
                                alert("This topic has no theory yet");
                                return;
                              }
                              if (materialsTheoryDirty || materialsDirty) {
                                alert("Save your changes first, then translate.");
                                return;
                              }

                              const ok = confirm("Translate this theory to English and store it in DB?");
                              if (!ok) return;

                              setMaterialsTranslatingEn(true);
                              try {
                                await translateAdminTheoryBlockToEn(theoryBlockId, { force: false });
                                alert("Saved EN translation.");
                              } catch (error: any) {
                                alert(error.response?.data?.message || "Failed to translate");
                              } finally {
                                setMaterialsTranslatingEn(false);
                              }
                            }}
                            disabled={!materialsSelectedTopic?.theoryBlock || materialsTranslatingEn || materialsSaving || materialsReordering}
                          >
                            <Languages className="w-4 h-4 mr-2" />
                            {materialsTranslatingEn ? "Translating…" : "Translate → EN"}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={openTheoryHistoryModal} disabled={!materialsSelectedTopic.theoryBlock}>
                            <History className="w-4 h-4 mr-2" />
                            History
                          </Button>
                          <Button variant="secondary" size="sm" onClick={async () => {
                    const ok = confirm("Remove theory from this topic?");
                    if (!ok) return;
                    try {
                      setMaterialsSaving(true);
                      const res = await updateAdminMaterialTopic(materialsSelectedTopic.id, {
                        clearTheory: true
                      });
                      const updated = res.topic;
                      setMaterialsTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
                      setMaterialsSelectedTopic(updated);
                      setMaterialDraft({
                        title: updated.title,
                        description: updated.description || "",
                        order: String(updated.order ?? 0),
                        language: updated.language,
                        theoryTitle: updated.title,
                        theoryContent: ""
                      });
                      setMaterialsDirty(false);
                      setMaterialsTheoryDirty(false);
                      setMaterialsAutoSaveState("idle");
                    } catch (error: any) {
                      alert(error.response?.data?.message || "Failed to remove theory");
                    } finally {
                      setMaterialsSaving(false);
                    }
                  }}>
                          Remove theory
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs font-mono text-text-secondary mb-1">Theory title</label>
                          <Input value={materialDraft.theoryTitle} onChange={e => {
                      setMaterialDraft({
                        ...materialDraft,
                        theoryTitle: e.target.value
                      });
                      setMaterialsDirty(true);
                      setMaterialsTheoryDirty(true);
                      setMaterialsAutoSaveState("idle");
                    }} />
                        </div>

                        <div>
                          <label className="block text-xs font-mono text-text-secondary mb-1">Theory content</label>
                          <textarea value={materialDraft.theoryContent} onChange={e => {
                      setMaterialDraft({
                        ...materialDraft,
                        theoryContent: e.target.value
                      });
                      setMaterialsDirty(true);
                      setMaterialsTheoryDirty(true);
                      setMaterialsAutoSaveState("idle");
                    }} className="w-full px-3 py-2 bg-bg-surface border border-border text-text-primary font-mono focus:outline-none focus:border-primary min-h-[240px]" placeholder="Write theory in Markdown..." />
                        </div>

                        {materialPreview && <div className="p-3 rounded-md border border-border bg-bg-code">
                            <div className="text-xs font-mono text-text-secondary mb-2">Preview</div>
                            <MarkdownView content={materialDraft.theoryContent || ""} />
                          </div>}
                      </div>
                    </div>
                  </div>}
              </Card>
            </div>
          </div>}

        {}
        {activeTab === "library" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-primary">Task library moderation</div>
                  <div className="mt-1 text-xs font-mono text-text-secondary">
                    Review teacher submissions and approve/reject for the public library.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs font-mono text-text-secondary">Status</div>
                  <select value={libraryStatus} onChange={e => {
                setLibraryStatus(e.target.value as AdminLibraryTaskStatus);
                setLibrarySelectedTaskId(null);
                setLibrarySelectedTask(null);
                setLibraryRejectReason("");
              }} className="px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="DRAFT">DRAFT</option>
                  </select>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 md:col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-mono font-semibold text-text-primary">Tasks</div>
                  <div className="text-xs font-mono text-text-secondary">{libraryTasks.length}</div>
                </div>

                <div className="mt-3 space-y-2">
                  {libraryTasks.map(task => {
                const isSelected = librarySelectedTaskId === task.id;
                const statusClass = task.status === "PENDING" ? "border-amber-400/60 text-amber-200 bg-amber-400/10" : task.status === "APPROVED" ? "border-emerald-400/60 text-emerald-200 bg-emerald-400/10" : task.status === "REJECTED" ? "border-red-400/60 text-red-200 bg-red-400/10" : "border-border text-text-secondary bg-bg-secondary";
                return <button key={task.id} onClick={() => selectLibraryTask(task.id)} className={`w-full text-left rounded-md border px-3 py-2 transition-fast ${isSelected ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-mono text-text-primary truncate">{task.title}</div>
                            <div className="mt-0.5 text-[11px] font-mono text-text-secondary truncate">
                              {task.author?.username ? `${task.author.username}${task.author.email ? ` (${task.author.email})` : ""}` : "Unknown author"}
                            </div>
                          </div>
                          <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusClass}`}>{task.status}</div>
                        </div>
                        <div className="mt-1 text-[11px] font-mono text-text-secondary flex items-center justify-between gap-2">
                          <span>{task.lang}</span>
                          <span>#{task.id}</span>
                        </div>
                      </button>;
              })}
                  {libraryTasks.length === 0 && <div className="text-xs font-mono text-text-secondary">No tasks for this filter.</div>}
                </div>
              </Card>

              <Card className="p-4 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-mono font-semibold text-text-primary">Details</div>
                  <div className="text-xs font-mono text-text-secondary">{librarySelectedTask ? `#${librarySelectedTask.id}` : "Select a task"}</div>
                </div>

                {!librarySelectedTask ? <div className="mt-4 text-sm text-text-secondary font-mono">Select a task from the list to review it.</div> : <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-mono font-semibold text-text-primary">{librarySelectedTask.title}</div>
                        <div className="mt-1 text-xs font-mono text-text-secondary">
                          Author: {librarySelectedTask.author?.username || "Unknown"}{librarySelectedTask.author?.email ? ` (${librarySelectedTask.author.email})` : ""}
                        </div>
                      </div>
                      <div className={`px-3 py-1 text-xs font-mono border rounded-md ${librarySelectedTask.status === "PENDING" ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : librarySelectedTask.status === "APPROVED" ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200" : librarySelectedTask.status === "REJECTED" ? "border-red-400/60 bg-red-400/10 text-red-200" : "border-border bg-bg-code text-text-secondary"}`}>
                        {librarySelectedTask.status}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="text-xs font-mono text-text-secondary">
                        <div>Language: <span className="text-text-primary">{librarySelectedTask.lang}</span></div>
                        <div className="mt-1">Max attempts: <span className="text-text-primary">{librarySelectedTask.maxAttempts}</span></div>
                      </div>
                      <div className="text-xs font-mono text-text-secondary">
                        <div>Submitted: <span className="text-text-primary">{librarySelectedTask.submittedAt ? new Date(librarySelectedTask.submittedAt).toLocaleString() : "-"}</span></div>
                        <div className="mt-1">Published: <span className="text-text-primary">{librarySelectedTask.publishedAt ? new Date(librarySelectedTask.publishedAt).toLocaleString() : "-"}</span></div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">Description</div>
                      <div className="rounded-md border border-border bg-bg-code p-3 text-sm text-text-primary whitespace-pre-wrap">
                        {librarySelectedTask.description || "(empty)"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">Template</div>
                      <pre className="rounded-md border border-border bg-bg-code p-3 text-xs text-text-primary overflow-auto max-h-[45vh]">{librarySelectedTask.template || ""}</pre>
                    </div>

                    {librarySelectedTask.status === "REJECTED" && <div>
                        <div className="text-xs font-mono text-text-secondary mb-1">Rejection reason</div>
                        <div className="rounded-md border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-100 whitespace-pre-wrap">
                          {librarySelectedTask.rejectionReason || "-"}
                        </div>
                      </div>}

                    <div className="pt-2 border-t border-border">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-mono text-text-secondary">
                          Updated: <span className="text-text-primary">{new Date(librarySelectedTask.updatedAt).toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="primary" onClick={handleApproveLibraryTask} disabled={libraryActing || librarySelectedTask.status !== "PENDING"} className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Approve
                          </Button>
                          <Button variant="secondary" onClick={handleRejectLibraryTask} disabled={libraryActing || librarySelectedTask.status !== "PENDING"} className="flex items-center gap-2 text-red-500 hover:text-red-700">
                            <XCircle className="w-4 h-4" />
                            Reject
                          </Button>
                        </div>
                      </div>

                      {librarySelectedTask.status === "PENDING" && <div className="mt-3">
                          <div className="text-xs font-mono text-text-secondary mb-1">Rejection reason (required for Reject)</div>
                          <textarea value={libraryRejectReason} onChange={e => setLibraryRejectReason(e.target.value)} rows={3} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Explain what needs fixing…" />
                        </div>}
                    </div>
                  </div>}
              </Card>
            </div>
          </div>}

        {}
        {activeTab === "emails" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-primary">Email announcements</div>
                  <div className="mt-1 text-xs font-mono text-text-secondary">
                    Send a newsletter to subscribers (Marketing) or send a targeted announcement (Notification/Updates).
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[11px] font-mono text-text-secondary mr-2">
                    Mode: <span className="text-text-primary">{emailDryRun ? "Dry run" : "Send"}</span>
                  </div>
                  <Button variant="secondary" onClick={() => setEmailLastResult(null)} disabled={emailSending || !emailLastResult}>
                    Clear result
                  </Button>
                  <Button variant="secondary" onClick={() => {
                setEmailDryRun(true);
                runAdminBroadcastEmail(true);
              }} disabled={emailSending}>
                    {emailSending ? "Working…" : "Dry run"}
                  </Button>
                  <Button variant="primary" onClick={() => {
                setEmailDryRun(false);
                runAdminBroadcastEmail(false);
              }} disabled={emailSending}>
                    {emailSending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-4 lg:col-span-2">
                <div className="text-sm font-mono font-semibold text-text-primary">Message</div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">Delivery</label>
                    <select value={emailDelivery} onChange={e => {
                  const v = e.target.value as "MARKETING" | "NOTIFICATION";
                  setEmailDelivery(v);
                  if (v === "NOTIFICATION") {
                    setEmailIncludeSubscribed(false);
                    setEmailAudience("ALL");
                    // keep existing targets; but mass-notify is off by default
                    setEmailNotifyAllUsers(false);
                    setEmailNotifyAllUsersConfirm("");
                  } else {
                    setEmailNotifyAllUsers(false);
                    setEmailNotifyAllUsersConfirm("");
                  }
                }} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm">
                      <option value="MARKETING">Marketing (subscribers, has unsubscribe)</option>
                      <option value="NOTIFICATION">Notification (targeted, no unsubscribe)</option>
                    </select>
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">
                      {emailDelivery === "MARKETING" ? "For subscribed recipients (may land in Promotions)." : "For specific classes/emails (aims for Updates/Notifications tab)."}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">Subject</label>
                    <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject line" />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-text-secondary mb-1">Title (headline inside email)</label>
                    <Input value={emailTitle} onChange={e => setEmailTitle(e.target.value)} placeholder="Defaults to subject" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-mono text-text-secondary mb-1">Content</label>
                  <textarea value={emailContent} onChange={e => setEmailContent(e.target.value)} rows={10} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Write the email body (plain text)." />
                  <div className="mt-2 text-[11px] font-mono text-text-secondary">
                    Tip: plain text will be converted to safe HTML (paragraphs split by blank lines).
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-sm font-mono font-semibold text-text-primary">Recipients</div>

                <div className="mt-3 space-y-3">
                  {emailDelivery === "NOTIFICATION" && <div className="space-y-2 rounded-md border border-border bg-bg-code p-3">
                      <div className="flex items-start gap-2">
                        <input type="checkbox" checked={emailNotifyAllUsers} onChange={e => {
                    const checked = e.target.checked;
                    setEmailNotifyAllUsers(checked);
                    if (checked) {
                      setEmailAudience("USERS");
                    }
                  }} className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-text-primary">Notify all users</div>
                          <div className="text-[11px] font-mono text-text-secondary">Sends to all verified USERS (ignores marketing subscription). Requires confirmation on Send.</div>
                        </div>
                      </div>

                      {emailNotifyAllUsers && <div>
                          <div className="text-[11px] font-mono text-text-secondary mb-1">Confirmation (type exactly: <span className="text-text-primary">ALL USERS</span>)</div>
                          <Input value={emailNotifyAllUsersConfirm} onChange={e => setEmailNotifyAllUsersConfirm(e.target.value)} placeholder="ALL USERS" />
                        </div>}
                    </div>}

                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={emailDelivery === "NOTIFICATION" ? false : emailIncludeSubscribed} onChange={e => setEmailIncludeSubscribed(e.target.checked)} disabled={emailDelivery === "NOTIFICATION"} className="mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-text-primary">Include subscribed recipients</div>
                      <div className="text-[11px] font-mono text-text-secondary">Respects marketing emails subscription flag.</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Subscribed audience</div>
                    <select value={emailAudience} onChange={e => setEmailAudience(e.target.value as any)} disabled={emailDelivery === "NOTIFICATION" || !emailIncludeSubscribed} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono text-sm disabled:opacity-50">
                      <option value="ALL">USERS + STUDENTS</option>
                      <option value="USERS">USERS only</option>
                      <option value="STUDENTS">STUDENTS only</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Add specific emails (comma / space / newline separated)</div>
                    <textarea value={emailRecipientEmails} onChange={e => setEmailRecipientEmails(e.target.value)} rows={4} className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="alice@example.com\nbob@example.com" />
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">
                      Parsed: {parseEmailList(emailRecipientEmails).length}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Add specific user IDs (comma / space / newline separated)</div>
                    <textarea value={emailRecipientUserIds} onChange={e => setEmailRecipientUserIds(e.target.value)} rows={2} className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="123\n456" />
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">
                      Parsed: {parseIdList(emailRecipientUserIds).length}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Add class recipients</div>
                    <div className="max-h-[220px] overflow-auto rounded-md border border-border bg-bg-code p-2">
                      {classes.length === 0 ? <div className="text-[11px] font-mono text-text-secondary">No classes loaded.</div> : <div className="space-y-1">
                          {classes
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(c => {
                        const checked = emailSelectedClassIds.includes(c.id);
                        return <label key={c.id} className="flex items-start gap-2 text-xs font-mono text-text-primary cursor-pointer select-none">
                                <input type="checkbox" checked={checked} onChange={() => toggleEmailClassId(c.id)} className="mt-0.5" />
                                <span className="min-w-0">
                                  <span className="truncate">{c.name}</span>
                                  <span className="ml-2 text-[11px] text-text-secondary">#{c.id} · {c.language}</span>
                                </span>
                              </label>;
                      })}
                        </div>}
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-text-secondary">Selected classes: {emailSelectedClassIds.length}</div>
                  </div>

                  <div>
                    <div className="text-xs font-mono text-text-secondary mb-1">Recipient limit (max 5000)</div>
                    <Input value={emailLimit} onChange={e => setEmailLimit(e.target.value)} placeholder="5000" />
                  </div>
                </div>
              </Card>
            </div>

            {emailLastResult && <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-mono font-semibold text-text-primary">Result</div>
                  <div className="text-xs font-mono text-text-secondary">{emailLastResult.dryRun ? "Dry run" : "Sent"}</div>
                </div>

                {emailLastResult.dryRun ? <div className="mt-3 space-y-3">
                    <div className="text-xs font-mono text-text-secondary">Recipients: <span className="text-text-primary">{emailLastResult.count}</span></div>
                    <div>
                      <div className="text-xs font-mono text-text-secondary mb-1">Sample (up to 20)</div>
                      <div className="rounded-md border border-border bg-bg-code p-3 text-xs font-mono text-text-primary overflow-auto">
                        {(emailLastResult.sample || []).map((r: any) => <div key={`${r.kind}:${r.id}`}>{r.email} <span className="text-text-secondary">({r.kind} #{r.id})</span></div>)}
                        {(emailLastResult.sample || []).length === 0 && <div className="text-text-secondary">(empty)</div>}
                      </div>
                    </div>
                  </div> : <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-md border border-border bg-bg-code p-3">
                      <div className="text-xs font-mono text-text-secondary">Recipients</div>
                      <div className="mt-1 text-lg font-mono font-semibold text-text-primary">{(emailLastResult as any).recipients}</div>
                    </div>
                    <div className="rounded-md border border-border bg-bg-code p-3">
                      <div className="text-xs font-mono text-text-secondary">Sent</div>
                      <div className="mt-1 text-lg font-mono font-semibold text-text-primary">{(emailLastResult as any).sent}</div>
                    </div>
                    <div className="rounded-md border border-border bg-bg-code p-3">
                      <div className="text-xs font-mono text-text-secondary">Failed</div>
                      <div className="mt-1 text-lg font-mono font-semibold text-text-primary">{(emailLastResult as any).failed}</div>
                    </div>
                  </div>}
              </Card>}
          </div>}

        {activeTab === "mailbox" && <AdminMailWorkspace />}

        {}
        {activeTab === "support" && <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={supportView === "chat" ? "primary" : "secondary"} onClick={() => setSupportView("chat")}>
                Chat
              </Button>
              <Button variant={supportView === "legacy" ? "primary" : "secondary"} onClick={() => setSupportView("legacy")}>
                Legacy tickets
              </Button>
            </div>

            {supportView === "chat" ? <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-4 md:col-span-1">
                  <div className="text-sm font-mono font-semibold text-text-primary">Conversations</div>
                  <div className="mt-3 space-y-2">
                    {supportConversations.map(c => <button key={c.id} onClick={() => openSupportConversation(c.id)} className={`w-full text-left rounded-md border px-3 py-2 transition-fast ${supportSelectedConversationId === c.id ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-mono text-text-secondary truncate">{c.userEmail}</div>
                            <div className="text-sm font-mono text-text-primary truncate">{c.subject}</div>
                          </div>
                          <div className={`text-[10px] font-mono px-2 py-0.5 rounded border ${c.status === "OPEN" ? "border-emerald-400/60 text-emerald-200 bg-emerald-400/10" : "border-border text-text-secondary bg-bg-secondary"}`}>
                            {c.status}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-text-secondary font-mono">
                          {new Date(c.lastMessageAt).toLocaleString()}
                        </div>
                      </button>)}
                    {supportConversations.length === 0 && <div className="text-xs font-mono text-text-secondary">No conversations yet.</div>}
                  </div>
                </Card>

                <Card className="p-4 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-mono font-semibold text-text-primary">Thread</div>
                    <div className="text-xs font-mono text-text-secondary">
                      {supportSelectedConversationId ? `#${supportSelectedConversationId}` : "Select a conversation"}
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-border bg-bg-code p-3 h-[55vh] overflow-auto">
                    {supportChatLoading && <div className="text-xs font-mono text-text-secondary">Loading…</div>}
                    {!supportChatLoading && supportSelectedConversationId && supportMessages.length === 0 && <div className="text-xs font-mono text-text-secondary">No messages.</div>}
                    <div className="space-y-3">
                      {supportMessages.map(m => {
                    const isUser = m.senderType === "USER";
                    return <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                            <div className={`max-w-[85%] rounded-lg border px-3 py-2 ${isUser ? "border-border bg-bg-secondary" : "border-primary/50 bg-primary/10"}`}>
                              <div className="text-[11px] font-mono text-text-secondary flex items-center justify-between gap-3">
                                <span>{m.senderType}</span>
                                <span>{new Date(m.createdAt).toLocaleString()}</span>
                              </div>
                              {m.text && <div className="mt-1 text-sm whitespace-pre-wrap">{m.text}</div>}

                              {m.attachments?.length ? <div className="mt-2 space-y-1">
                                  {m.attachments.map(a => <div key={a.id} className="flex items-center justify-between gap-2 border border-border rounded-md px-2 py-1 bg-bg-base">
                                      <div className="min-w-0">
                                        <div className="text-xs font-mono text-text-primary truncate">{a.originalName}</div>
                                        <div className="text-[11px] font-mono text-text-secondary">{Math.max(0, Math.round((a.sizeBytes || 0) / 1024))} KB</div>
                                      </div>
                                      <Button variant="secondary" size="sm" onClick={() => downloadAdminAttachment(a.id)}>
                                        Download
                                      </Button>
                                    </div>)}
                                </div> : null}
                            </div>
                          </div>;
                  })}
                    </div>
                  </div>

                  {supportSelectedConversationId && <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-mono text-text-secondary">Reply</div>
                        <label className="text-xs font-mono text-text-secondary flex items-center gap-2">
                          <input type="checkbox" checked={supportChatSendEmail} onChange={e => setSupportChatSendEmail(e.target.checked)} />
                          send email
                        </label>
                      </div>
                      <textarea value={supportChatReplyText} onChange={e => setSupportChatReplyText(e.target.value)} rows={4} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Type an admin reply…" />
                      <div className="flex justify-end">
                        <Button variant="primary" onClick={handleAdminSupportReply} disabled={supportChatLoading}>
                          {supportChatLoading ? "Sending…" : "Send"}
                        </Button>
                      </div>
                    </div>}
                </Card>
              </div> : <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-bg-secondary border-b border-border">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">ID</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Email</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Subject</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Status</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Created</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Answered</th>
                        <th className="px-4 py-2 text-left text-sm font-mono font-semibold text-text-primary">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supportTickets.map(t => <tr key={t.id} className="border-b border-border hover:bg-bg-secondary transition-fast">
                          <td className="px-4 py-2 text-sm text-text-primary font-mono">{t.id}</td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">{t.userEmail}</td>
                          <td className="px-4 py-2 text-sm text-text-primary">{t.subject}</td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">{t.status}</td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">
                            {new Date(t.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-text-secondary font-mono">
                            {t.answeredAt ? new Date(t.answeredAt).toLocaleString() : "-"}
                          </td>
                          <td className="px-4 py-2">
                            <Button variant="secondary" size="sm" onClick={() => openSupportTicket(t)}>
                              View / Reply
                            </Button>
                          </td>
                        </tr>)}
                      {supportTickets.length === 0 && <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-text-secondary font-mono text-sm">
                            No tickets yet.
                          </td>
                        </tr>}
                    </tbody>
                  </table>
                </div>
              </Card>}
          </div>}

        {}
        {activeTab === "maintenance" && <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-mono font-semibold text-text-primary">Global maintenance mode</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Коли увімкнено — сайт блокується для всіх, крім SYSTEM_ADMIN. Доступними залишаються /api/auth/* та /api/admin/*.
                  </p>
                </div>
                <div className={`px-3 py-1 text-xs font-mono border rounded-md ${maintenanceState?.enabled ? "border-amber-400/60 bg-amber-400/10 text-amber-200" : "border-border bg-bg-code text-text-secondary"}`}>
                  {maintenanceState?.enabled ? "ENABLED" : "DISABLED"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Title</div>
                  <Input value={maintenanceTitle} onChange={e => setMaintenanceTitle(e.target.value)} />
                </div>

                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Message</div>
                  <textarea value={maintenanceMessage} onChange={e => setMaintenanceMessage(e.target.value)} rows={5} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" />
                </div>

                <div>
                  <div className="text-xs font-mono text-text-secondary mb-1">Until (optional)</div>
                  <Input type="datetime-local" value={maintenanceUntil} onChange={e => setMaintenanceUntil(e.target.value)} />
                  <div className="mt-1 text-xs text-text-secondary">
                    Якщо порожньо — без таймера. Значення перетворюється в ISO (UTC) перед збереженням.
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleEnableOrUpdateMaintenance} disabled={maintenanceSaving} className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  {maintenanceState?.enabled ? "Update" : "Enable"}
                </Button>
                <Button variant="secondary" onClick={handleDisableMaintenance} disabled={maintenanceSaving} className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Disable
                </Button>
              </div>
            </Card>
          </div>}
      </div>

      {}
      <Modal isOpen={showCreateMaterialTopic} onClose={() => setShowCreateMaterialTopic(false)} title="Create topic (materials)">
        <div className="space-y-4">
          <Input label="Title" value={newMaterialTopic.title} onChange={e => setNewMaterialTopic({
          ...newMaterialTopic,
          title: e.target.value
        })} required />

          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Description</label>
            <textarea value={newMaterialTopic.description} onChange={e => setNewMaterialTopic({
            ...newMaterialTopic,
            description: e.target.value
          })} rows={4} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="Optional" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={newMaterialTopic.language} onChange={e => setNewMaterialTopic({
              ...newMaterialTopic,
              language: e.target.value as any
            })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
              </select>
            </div>
            <Input label="Order (optional)" value={newMaterialTopic.order} onChange={e => setNewMaterialTopic({
            ...newMaterialTopic,
            order: e.target.value
          })} />
          </div>

          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Theory (Markdown, optional)</label>
            <textarea value={newMaterialTopic.theoryContent} onChange={e => setNewMaterialTopic({
            ...newMaterialTopic,
            theoryContent: e.target.value
          })} rows={10} className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md" placeholder="If provided, it will be validated as theory-only (no practice/tasks sections)." />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateMaterialTopic(false)} disabled={creatingMaterialTopic}>
              Cancel
            </Button>
            <Button onClick={handleCreateMaterial} disabled={creatingMaterialTopic}>
              {creatingMaterialTopic ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteMaterialConfirm} onClose={() => {
      setShowDeleteMaterialConfirm(false);
      setMaterialToDelete(null);
    }} title="Delete topic">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary font-mono">
            Delete topic <span className="text-text-primary">{materialToDelete?.title}</span>?
          </p>
          <p className="text-xs text-text-secondary font-mono">
            Note: deletion is blocked if the topic still has tasks/control works.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => {
            setShowDeleteMaterialConfirm(false);
            setMaterialToDelete(null);
          }}>
              Cancel
            </Button>
            <Button onClick={handleDeleteMaterial} className="text-red-500 hover:text-red-700">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showImportMaterialsYaml} onClose={() => setShowImportMaterialsYaml(false)} title={`Import materials from YAML (${materialsLanguage})`}>
        <div className="space-y-4">
          <div className="text-xs font-mono text-text-secondary">
            Imports global topics (class = NULL) for the selected language. YAML can be pasted or uploaded from a .yml/.yaml file.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Mode</label>
              <select value={materialsYamlMode} onChange={e => setMaterialsYamlMode(e.target.value as any)} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="merge">merge (create/update by title)</option>
                <option value="replace">replace (delete existing empty global topics first)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Upload YAML file (optional)</label>
              <input
                key={materialsYamlFileKey}
                type="file"
                accept=".yml,.yaml,text/yaml,text/x-yaml"
                className="w-full text-xs font-mono text-text-secondary"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const text = await f.text();
                    setMaterialsYamlText(text);
                  } catch {
                    alert("Failed to read file");
                  }
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">YAML</label>
            <textarea
              value={materialsYamlText}
              onChange={e => setMaterialsYamlText(e.target.value)}
              rows={16}
              className="w-full border border-border bg-bg-code px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-primary transition-fast rounded-md"
              placeholder={"language: JAVA\ntopics:\n  - title: ...\n    description: ...\n    order: 1\n    theory:\n      content: |\n        # Markdown"}
            />
            <div className="mt-2 text-[11px] font-mono text-text-secondary">
              Tip: Use <code>content: |</code> for multi-line Markdown.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowImportMaterialsYaml(false)} disabled={materialsYamlImporting}>
              Cancel
            </Button>
            <Button onClick={handleImportMaterialsYaml} disabled={materialsYamlImporting}>
              {materialsYamlImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTheoryHistory} onClose={() => {
      setShowTheoryHistory(false);
      setTheorySelectedSnapshot(null);
      setTheorySelectedVersion(null);
      setTheoryRollbackComment("");
    }} title={`Theory history${materialsSelectedTopic ? ` — ${materialsSelectedTopic.title}` : ""}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-3 md:col-span-1">
            <div className="flex items-center justify-between">
              <div className="text-sm font-mono font-semibold text-text-primary">Revisions</div>
              <div className="text-xs font-mono text-text-secondary">{theoryRevisions.length}</div>
            </div>
            {theoryHistoryLoading && <div className="mt-2 text-xs font-mono text-text-secondary">Loading…</div>}
            <div className="mt-3 space-y-2 max-h-[420px] overflow-auto">
              {theoryRevisions.map(r => {
              const selected = theorySelectedVersion === r.version;
              return <button key={r.id} onClick={() => selectTheoryRevision(r.version)} className={`w-full text-left rounded-md border px-3 py-2 transition-fast ${selected ? "border-primary bg-bg-code" : "border-border hover:bg-bg-secondary"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono text-text-primary">v{r.version} <span className="text-text-secondary">({r.action})</span></div>
                      <div className="text-[11px] font-mono text-text-secondary">{new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                    {r.comment && <div className="mt-1 text-[11px] font-mono text-text-secondary truncate">{r.comment}</div>}
                  </button>;
            })}
              {!theoryRevisions.length && !theoryHistoryLoading && <div className="text-xs font-mono text-text-secondary">No revisions</div>}
            </div>
          </Card>

          <Card className="p-3 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-mono font-semibold text-text-primary">Snapshot</div>
              <div className="text-xs font-mono text-text-secondary">
                {theorySelectedVersion ? `Selected v${theorySelectedVersion}` : "Select a revision"}
              </div>
            </div>

            <div className="mt-3">
              {theorySelectedSnapshot ? <div className="p-3 rounded-md border border-border bg-bg-code">
                  <div className="text-xs font-mono text-text-secondary mb-2">{theorySelectedSnapshot.title}</div>
                  <MarkdownView content={theorySelectedSnapshot.content || ""} />
                </div> : <div className="text-xs font-mono text-text-secondary">No snapshot loaded</div>}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <Input label="Rollback comment (optional)" value={theoryRollbackComment} onChange={e => setTheoryRollbackComment(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowTheoryHistory(false)} disabled={theoryRollbackBusy}>
                  Close
                </Button>
                <Button onClick={handleRollbackTheory} disabled={theoryRollbackBusy || !theorySelectedVersion} className="text-amber-300">
                  {theoryRollbackBusy ? "Rolling back…" : "Rollback"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </Modal>

      {}
      <Modal isOpen={showCreateUser} onClose={() => setShowCreateUser(false)} title="Create User">
        <div className="space-y-4">
          <Input label="Username" value={newUser.username} onChange={e => setNewUser({
          ...newUser,
          username: e.target.value
        })} required />
          <Input label="Email" type="email" value={newUser.email} onChange={e => setNewUser({
          ...newUser,
          email: e.target.value
        })} />
          <Input label="Password" type="password" value={newUser.password} onChange={e => setNewUser({
          ...newUser,
          password: e.target.value
        })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={newUser.firstName} onChange={e => setNewUser({
            ...newUser,
            firstName: e.target.value
          })} />
            <Input label="Last Name" value={newUser.lastName} onChange={e => setNewUser({
            ...newUser,
            lastName: e.target.value
          })} />
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Role</label>
            <select value={newUser.role} onChange={e => setNewUser({
            ...newUser,
            role: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="USER">USER</option>
              <option value="TEACHER">TEACHER</option>
              <option value="SYSTEM_ADMIN">SYSTEM_ADMIN</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">User Mode</label>
            <select value={newUser.userMode} onChange={e => setNewUser({
            ...newUser,
            userMode: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="PERSONAL">PERSONAL</option>
              <option value="EDUCATIONAL">EDUCATIONAL</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
            <select value={newUser.lang} onChange={e => setNewUser({
            ...newUser,
            lang: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="JAVA">JAVA</option>
              <option value="PYTHON">PYTHON</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateUser(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>Create</Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showEditUser} onClose={() => setShowEditUser(false)} title="Edit User">
        {selectedUser && <div className="space-y-4">
            <Input label="Email" type="email" value={editUser.email || ""} onChange={e => setEditUser({
          ...editUser,
          email: e.target.value
        })} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" value={editUser.firstName || ""} onChange={e => setEditUser({
            ...editUser,
            firstName: e.target.value
          })} />
              <Input label="Last Name" value={editUser.lastName || ""} onChange={e => setEditUser({
            ...editUser,
            lastName: e.target.value
          })} />
            </div>
            <Input label="New Password (leave empty to keep current)" type="password" value={editUser.password || ""} onChange={e => setEditUser({
          ...editUser,
          password: e.target.value
        })} />
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={editUser.lang || selectedUser.lang} onChange={e => setEditUser({
            ...editUser,
            lang: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowEditUser(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditUser}>Save</Button>
            </div>
          </div>}
      </Modal>

      {}
      <Modal isOpen={showDeleteUserConfirm} onClose={() => setShowDeleteUserConfirm(false)} title="Delete User">
        <div className="space-y-4">
          <p className="text-text-primary">Are you sure you want to delete this user? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteUserConfirm(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleDeleteUser} className="text-red-500 hover:text-red-700">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showCreateClass} onClose={() => setShowCreateClass(false)} title="Create Class">
        <div className="space-y-4">
          <Input label="Class Name" value={newClass.name} onChange={e => setNewClass({
          ...newClass,
          name: e.target.value
        })} required />
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
            <select value={newClass.language} onChange={e => setNewClass({
            ...newClass,
            language: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value="JAVA">JAVA</option>
              <option value="PYTHON">PYTHON</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-mono text-text-primary mb-1">Teacher</label>
            <select value={newClass.teacherId || 0} onChange={e => setNewClass({
            ...newClass,
            teacherId: parseInt(e.target.value) || 0
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
              <option value={0}>Select teacher...</option>
              {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>
                  {teacher.username} ({teacher.email || "No email"})
                </option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateClass(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateClass}>Create</Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showEditClass} onClose={() => setShowEditClass(false)} title="Edit Class">
        {selectedClass && <div className="space-y-4">
            <Input label="Class Name" value={editClass.name || ""} onChange={e => setEditClass({
          ...editClass,
          name: e.target.value
        })} />
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Language</label>
              <select value={editClass.language || selectedClass.language} onChange={e => setEditClass({
            ...editClass,
            language: e.target.value as any
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value="JAVA">JAVA</option>
                <option value="PYTHON">PYTHON</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-mono text-text-primary mb-1">Teacher</label>
              <select value={editClass.teacherId || selectedClass.teacherId} onChange={e => setEditClass({
            ...editClass,
            teacherId: parseInt(e.target.value) || 0
          })} className="w-full px-3 py-2 border border-border bg-bg-secondary text-text-primary font-mono">
                <option value={0}>Select teacher...</option>
                {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>
                    {teacher.username} ({teacher.email || "No email"})
                  </option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowEditClass(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditClass}>Save</Button>
            </div>
          </div>}
      </Modal>

      {}
      <Modal isOpen={showDeleteClassConfirm} onClose={() => setShowDeleteClassConfirm(false)} title="Delete Class">
        <div className="space-y-4">
          <p className="text-text-primary">Are you sure you want to delete this class? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteClassConfirm(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleDeleteClass} className="text-red-500 hover:text-red-700">
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {}
      <Modal isOpen={showSupportTicket} onClose={() => {
      setShowSupportTicket(false);
      setSelectedTicket(null);
      setReplyText("");
    }} title={selectedTicket ? `Ticket #${selectedTicket.id}` : "Ticket"}>
        {selectedTicket && <div className="space-y-4">
            <div className="text-sm font-mono text-text-secondary">From: {selectedTicket.userEmail}</div>
            <div className="text-sm font-mono text-text-secondary">Subject: {selectedTicket.subject}</div>
            <div className="text-sm font-mono text-text-secondary">Status: {selectedTicket.status}</div>

            <div className="border border-border bg-bg-secondary p-3">
              <div className="text-xs font-mono text-text-muted uppercase tracking-wider mb-2">Message</div>
              <div className="text-sm text-text-primary whitespace-pre-wrap">{selectedTicket.message}</div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Reply</label>
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)} className="w-full min-h-[140px] resize-y bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors placeholder:text-text-muted" placeholder="Type your reply..." />
              <div className="text-xs text-text-secondary font-mono">
                Email will be sent from techical-support@studycod.space
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => {
            setShowSupportTicket(false);
            setSelectedTicket(null);
            setReplyText("");
          }} disabled={replying}>
                Cancel
              </Button>
              <Button onClick={handleReplyToTicket} disabled={replying}>
                {replying ? "Sending..." : "Send Reply"}
              </Button>
            </div>
          </div>}
      </Modal>
    </div>;
};