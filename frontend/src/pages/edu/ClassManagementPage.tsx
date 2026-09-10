import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Check,
  Copy,
  Download,
  FileUp,
  Mail,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { ClassJoinCodeButton } from "../../components/ClassJoinCodeButton";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { api } from "../../lib/api/client";
import {
  addStudents,
  createClassAnnouncement,
  createParentInvite,
  deleteClassAnnouncement,
  exportStudents,
  getClass,
  getClassAnnouncements,
  getStudents,
  importStudents,
  updateClassAnnouncement,
  updateClassGradingSystem,
  type ClassAnnouncementDto,
  type ClassDetails,
  type Student,
  type StudentCredentials,
} from "../../lib/api/edu";
import {
  DEFAULT_GRADING_SYSTEM,
  GRADING_SYSTEMS,
  gradingSystemLabel,
  normalizeGradingSystem,
  type ClassGradingSystem,
} from "../../lib/gradingSystems";

const root =
  "min-h-[100dvh] bg-[#f4f7f3] px-4 py-6 text-[#142017] dark:bg-[#08100b] dark:text-[#edf5ef] sm:px-6 lg:px-10 lg:py-10";
const languageName = (language?: string) =>
  language === "CPP" ? "C++" : language === "JAVA" ? "Java" : "Python";
const initials = (student: Student) =>
  `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase() ||
  "У";

type DraftStudent = {
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
};
type OrgStaff = {
  userId: number;
  role: string;
  username: string | null;
  name: string | null;
};
const emptyStudent = (): DraftStudent => ({
  firstName: "",
  lastName: "",
  middleName: "",
  email: "",
});

const isSpreadsheetFile = (file: File) => /\.(?:xlsx|xls)$/i.test(file.name);

const readStudentTable = async (file: File): Promise<string> => {
  if (!isSpreadsheetFile(file)) return await file.text();

  const xlsx = await import("xlsx");
  const workbook = xlsx.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("EMPTY_STUDENT_TABLE");

  const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
  if (!csv.trim()) throw new Error("EMPTY_STUDENT_TABLE");
  return csv;
};

const parsePastedStudentList = (raw: string): { students: DraftStudent[]; invalidLines: number[] } => {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { students: [], invalidLines: [] };

  const splitLine = (line: string) => {
    const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === delimiter && !quoted) {
        cells.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const splitFullName = (value: string) => {
    const words = value
      .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return {
      lastName: words[0] || "",
      firstName: words[1] || "",
      middleName: words.slice(2).join(" "),
    };
  };

  const normalizeHeader = (value: string) => value
    .toLowerCase()
    .replace(/["'’ʼ]/g, "")
    .replace(/[\s_-]+/g, "");
  const firstCells = splitLine(lines[0]).map(normalizeHeader);
  const headerAliases = {
    lastName: ["прізвище", "призвище", "lastname", "last"],
    firstName: ["імя", "имя", "firstname", "first"],
    middleName: ["побатькові", "middlename", "middle"],
    email: ["email", "emailaddress", "емейл"],
    fullName: ["піб", "fullname", "імяпрізвище", "name"],
  } as const;
  const headerIndex = (aliases: readonly string[]) => firstCells.findIndex((cell) => aliases.includes(cell));
  const hasHeader = Object.values(headerAliases).some((aliases) => headerIndex(aliases) >= 0);
  const indexes = {
    lastName: headerIndex(headerAliases.lastName),
    firstName: headerIndex(headerAliases.firstName),
    middleName: headerIndex(headerAliases.middleName),
    email: headerIndex(headerAliases.email),
    fullName: headerIndex(headerAliases.fullName),
  };
  const students: DraftStudent[] = [];
  const invalidLines: number[] = [];

  lines.slice(hasHeader ? 1 : 0).forEach((line, offset) => {
    const lineNumber = offset + (hasHeader ? 2 : 1);
    const cells = splitLine(line);
    const item = hasHeader
      ? indexes.fullName >= 0
        ? { ...splitFullName(cells[indexes.fullName] || ""), email: indexes.email >= 0 ? cells[indexes.email] || "" : "" }
        : {
            lastName: indexes.lastName >= 0 ? cells[indexes.lastName] || "" : "",
            firstName: indexes.firstName >= 0 ? cells[indexes.firstName] || "" : "",
            middleName: indexes.middleName >= 0 ? cells[indexes.middleName] || "" : "",
            email: indexes.email >= 0 ? cells[indexes.email] || "" : "",
          }
      : cells.length === 1
        ? { ...splitFullName(cells[0] || ""), email: "" }
        : cells.length === 2
          ? { lastName: cells[0] || "", firstName: cells[1] || "", middleName: "", email: "" }
          : cells.length === 3 && !cells[2]?.includes("@")
            ? { lastName: cells[0] || "", firstName: cells[1] || "", middleName: cells[2] || "", email: "" }
            : cells.length >= 4
              ? { lastName: cells[0] || "", firstName: cells[1] || "", middleName: cells[2] || "", email: cells[3] || "" }
              : { lastName: cells[0] || "", firstName: cells[1] || "", middleName: "", email: cells[2] || "" };
    const student = {
      firstName: item.firstName.trim(),
      lastName: item.lastName.trim(),
      middleName: item.middleName.trim(),
      email: item.email.trim().toLowerCase(),
    };
    if (!student.firstName || !student.lastName || (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email))) invalidLines.push(lineNumber);
    else students.push(student);
  });

  return { students, invalidLines };
};

export const ClassManagementPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const id = Number(classId);
  const [classInfo, setClassInfo] = React.useState<ClassDetails | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [announcements, setAnnouncements] = React.useState<
    ClassAnnouncementDto[]
  >([]);
  const [activeTab, setActiveTab] = React.useState<
    "students" | "announcements" | "settings"
  >("students");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [draftStudents, setDraftStudents] = React.useState<DraftStudent[]>([
    emptyStudent(),
  ]);
  const [credentials, setCredentials] = React.useState<StudentCredentials[]>(
    [],
  );
  const [showCredentials, setShowCredentials] = React.useState(false);
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [showImport, setShowImport] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [addMode, setAddMode] = React.useState<"paste" | "manual">("paste");
  const [bulkStudentText, setBulkStudentText] = React.useState("");
  const [parentStudent, setParentStudent] = React.useState<Student | null>(
    null,
  );
  const [parentEmail, setParentEmail] = React.useState("");
  const [parentLink, setParentLink] = React.useState("");
  const [announcement, setAnnouncement] = React.useState({
    id: null as number | null,
    title: "",
    content: "",
    pinned: false,
  });
  const [gradingSystem, setGradingSystem] = React.useState<ClassGradingSystem>(
    DEFAULT_GRADING_SYSTEM,
  );
  const [saving, setSaving] = React.useState(false);
  const [addStudentsError, setAddStudentsError] = React.useState<string | null>(null);
  const [parentLinkCopied, setParentLinkCopied] = React.useState(false);
  const [orgStaff, setOrgStaff] = React.useState<OrgStaff[]>([]);
  const [assignedTeacherIds, setAssignedTeacherIds] = React.useState<number[]>(
    [],
  );
  const [announcementsUnavailable, setAnnouncementsUnavailable] =
    React.useState(false);
  const parsedBulkStudents = React.useMemo(
    () => parsePastedStudentList(bulkStudentText),
    [bulkStudentText],
  );

  const load = React.useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) return;
    setLoading(true);
    try {
      const [group, people] = await Promise.all([getClass(id), getStudents(id)]);
      setClassInfo(group);
      setAssignedTeacherIds(
        group.teacherIds?.length
          ? group.teacherIds
          : group.teacherId
            ? [group.teacherId]
            : [],
      );
      setStudents(people);
      setAnnouncementsUnavailable(false);
      try {
        const noticeData = await getClassAnnouncements(id);
        setAnnouncements(noticeData.announcements || []);
      } catch {
        // Announcements are a secondary panel; do not hide roster controls if
        // this optional request has a transient access or transport failure.
        setAnnouncements([]);
        setAnnouncementsUnavailable(true);
      }
      setGradingSystem(normalizeGradingSystem(group.gradingSystem));
      if (group.organizationId) {
        try {
          const { data } = await api.get(
            `/edu/orgs/${group.organizationId}/members`,
          );
          setOrgStaff(
            (data?.members ?? []).filter((member: OrgStaff) =>
              ["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(member.role),
            ),
          );
        } catch {
          // The organization roster is only needed for administrator-level
          // assignment controls. Teachers can use the class workspace without
          // access to the full organization member directory.
          setOrgStaff([]);
        }
      }
      setError(null);
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(
          caught,
          "Не вдалося завантажити керування класом.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openAddStudents = (mode: "paste" | "manual") => {
    setAddMode(mode);
    setBulkStudentText("");
    setDraftStudents([emptyStudent()]);
    setAddStudentsError(null);
    setShowAdd(true);
  };

  const closeAddStudents = () => {
    setShowAdd(false);
    setAddStudentsError(null);
  };

  const openImport = () => {
    setImportFile(null);
    setImportError(null);
    setShowImport(true);
  };

  const closeImport = () => {
    setShowImport(false);
    setImportFile(null);
    setImportError(null);
  };

  const submitStudents = async () => {
    setAddStudentsError(null);
    if (addMode === "paste" && parsedBulkStudents.invalidLines.length) {
      setAddStudentsError(`Перевірте рядки ${parsedBulkStudents.invalidLines.join(", ")}: потрібні прізвище та імʼя, а email має бути коректним, якщо його вказано.`);
      return;
    }
    const valid = (addMode === "paste" ? parsedBulkStudents.students : draftStudents)
      .map((item) => ({
        firstName: item.firstName.trim(),
        lastName: item.lastName.trim(),
        middleName: item.middleName.trim(),
        email: item.email.trim().toLowerCase() || undefined,
      }))
      .filter((item) => item.firstName && item.lastName);
    if (!valid.length) {
      setAddStudentsError(addMode === "paste" ? "Вставте список учнів у поле вище." : "Заповніть імʼя та прізвище хоча б одного учня.");
      return;
    }
    const emails = new Set<string>();
    const duplicateEmail = valid.find((item) => {
      if (!item.email) return false;
      if (emails.has(item.email)) return true;
      emails.add(item.email);
      return false;
    })?.email;
    if (duplicateEmail) {
      setAddStudentsError(`Email ${duplicateEmail} повторюється у формі. Перевірте рядки.`);
      return;
    }
    const existingEmails = new Set(students.map((student) => student.email?.trim().toLowerCase()).filter(Boolean));
    const alreadyInClass = valid.find((item) => item.email && existingEmails.has(item.email))?.email;
    if (alreadyInClass) {
      setAddStudentsError(`Email ${alreadyInClass} уже є в цьому класі.`);
      return;
    }
    setSaving(true);
    try {
      const result = await addStudents(id, valid);
      setCredentials(result.credentials);
      setShowCredentials(true);
      setShowAdd(false);
      setDraftStudents([emptyStudent()]);
      setBulkStudentText("");
      await load();
    } catch (caught) {
      const message = getErrorMessageFromUnknown(caught, "Не вдалося додати учнів.");
      setAddStudentsError(
        message === "INVALID_INPUT"
          ? "Перевірте імʼя та прізвище. Email необовʼязковий, але якщо його вказано — він має бути коректним."
          : message === "INTERNAL_SERVER_ERROR"
            ? "Сервер не зміг створити облікові записи. Спробуйте ще раз або додайте учнів по одному."
            : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const exportRoster = async () => {
    try {
      const blob = await exportStudents(id, false);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `students_${id}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          "Не вдалося експортувати список.",
        ),
      });
    }
  };

  const importRoster = async () => {
    if (!importFile) return;
    setImportError(null);
    setSaving(true);
    try {
      const result = await importStudents(id, await readStudentTable(importFile));
      if (!result.count) {
        setImportError("У файлі не знайдено учнів. Перевірте колонки: Прізвище, Імʼя, По батькові, Email, Пароль.");
        return;
      }
      setCredentials(result.credentials);
      setShowCredentials(true);
      setShowImport(false);
      setImportFile(null);
      await load();
    } catch (caught) {
      const message = getErrorMessageFromUnknown(caught, "Не вдалося імпортувати список.");
      setImportError(message === "EMPTY_STUDENT_TABLE"
        ? "Файл порожній або в ньому немає даних на першому аркуші."
        : message === "INVALID_STUDENT_IMPORT"
          ? "Не вдалося розпізнати файл. Перевірте рядки та колонки: Прізвище, Імʼя, По батькові, Email, Пароль."
          : message);
    } finally {
      setSaving(false);
    }
  };

  const sendParentInvite = async () => {
    if (!classInfo?.organizationId || !parentStudent || !parentEmail.trim())
      return;
    setSaving(true);
    try {
      const payload = await createParentInvite(classInfo.organizationId, {
        email: parentEmail.trim().toLowerCase(),
        studentId: parentStudent.id,
      });
      setParentLink(
        payload?.invite?.token
          ? `${window.location.origin}/invite/${payload.invite.token}`
          : "",
      );
      setParentLinkCopied(false);
      showToast({ type: "success", message: "Запрошення батькам створено" });
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          "Не вдалося створити запрошення.",
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const saveAnnouncement = async () => {
    if (!announcement.content.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: announcement.title.trim() || null,
        content: announcement.content.trim(),
        pinned: announcement.pinned,
      };
      if (announcement.id)
        await updateClassAnnouncement(id, announcement.id, payload);
      else await createClassAnnouncement(id, payload);
      setAnnouncement({ id: null, title: "", content: "", pinned: false });
      await load();
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          "Не вдалося зберегти оголошення.",
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const removeAnnouncement = async (item: ClassAnnouncementDto) => {
    if (!confirm("Видалити це оголошення?")) return;
    try {
      await deleteClassAnnouncement(id, item.id);
      await load();
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          "Не вдалося видалити оголошення.",
        ),
      });
    }
  };

  const saveGrading = async () => {
    setSaving(true);
    try {
      const updated = await updateClassGradingSystem(id, gradingSystem);
      setClassInfo(updated);
      showToast({ type: "success", message: "Систему оцінювання оновлено" });
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          "Не вдалося зберегти систему оцінювання.",
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const saveAssignedTeacher = async () => {
    if (!classInfo?.organizationId || !assignedTeacherIds.length) return;
    setSaving(true);
    try {
      await api.patch(`/edu/orgs/${classInfo.organizationId}/classes/${id}`, {
        teacherIds: assignedTeacherIds,
      });
      const primaryId = classInfo.teacherId && assignedTeacherIds.includes(classInfo.teacherId)
        ? classInfo.teacherId
        : assignedTeacherIds[0];
      setClassInfo((old) =>
        old
          ? {
              ...old,
              teacherId: primaryId,
              teacherIds: assignedTeacherIds,
              teacherName:
                orgStaff.find(
                  (member) => member.userId === primaryId,
                )?.name ||
                orgStaff.find(
                  (member) => member.userId === primaryId,
                )?.username ||
                null,
            }
          : old,
      );
      showToast({ type: "success", message: "Викладачів класу призначено" });
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          "Не вдалося призначити викладачів.",
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className={root}>
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-8 w-48 rounded-full bg-[#dfe8e0] dark:bg-white/[.08]" />
          <div className="h-48 rounded-[32px] bg-[#dfe8e0] dark:bg-white/[.08]" />
          <div className="h-[520px] rounded-[32px] bg-[#dfe8e0] dark:bg-white/[.08]" />
        </div>
      </div>
    );

  return (
    <div className={root}>
      <div className="mx-auto max-w-[1380px] space-y-6">
        <button
          type="button"
          onClick={() => navigate(`/edu/classes/${id}`)}
          className="inline-flex items-center gap-2 rounded-full border border-[#142018]/10 bg-white/80 px-4 py-2 text-sm font-bold text-[#536259] shadow-sm dark:border-white/10 dark:bg-white/[.06] dark:text-[#dce8df]"
        >
          <ArrowLeft className="size-4" />
          До класу
        </button>
        <header className="rounded-[28px] border border-[#1d3b29] bg-[linear-gradient(135deg,#13241a_0%,#0f1d15_100%)] p-5 text-white shadow-[0_24px_70px_rgba(7,24,13,.16)] sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#7bedb4]">
                Керування класом
              </p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.06em] sm:text-5xl">
                {classInfo?.name || "Клас"}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#c6d4c9] sm:text-base">
                Учні, комунікація та правила класу — в одному робочому просторі
                без зайвих службових екранів.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-[#c6d4c9]">
                {languageName(classInfo?.language)}
              </span>
              <span className="rounded-xl bg-white/[.08] px-3 py-2 text-sm font-bold text-[#c6d4c9]">
                {students.length} учнів
              </span>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-[#ff6b9d]/25 bg-[#fff0f4] px-4 py-3 text-sm text-[#bd3c62] dark:bg-[#ff6b9d]/10 dark:text-[#ffa5bf]">
            {error}
          </div>
        )}

        <div role="tablist" aria-label="Розділи класу" className="flex flex-wrap gap-1.5 rounded-2xl border border-[#142018]/10 bg-white/70 p-1.5 shadow-sm dark:border-white/10 dark:bg-[#111a14]">
          <button
            id="class-tab-students"
            role="tab"
            aria-selected={activeTab === "students"}
            aria-controls="class-panel-students"
            type="button"
            onClick={() => setActiveTab("students")}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d978]/60 ${activeTab === "students" ? "bg-[#e8f8ee] text-[#16834d] shadow-sm dark:bg-[#10271a] dark:text-[#7bedb4]" : "text-[#6b7a70] hover:bg-[#f3f8f3] hover:text-[#142018] dark:text-[#aebbb2] dark:hover:bg-white/[.06] dark:hover:text-white"}`}
          >
            <UsersRound aria-hidden="true" className="size-4" />
            <span>Учні</span>
          </button>
          <button
            id="class-tab-announcements"
            role="tab"
            aria-selected={activeTab === "announcements"}
            aria-controls="class-panel-announcements"
            type="button"
            onClick={() => setActiveTab("announcements")}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb454]/60 ${activeTab === "announcements" ? "bg-[#fff8ec] text-[#a86200] shadow-sm dark:bg-[#2a2011] dark:text-[#ffd58b]" : "text-[#6b7a70] hover:bg-[#f3f8f3] hover:text-[#142018] dark:text-[#aebbb2] dark:hover:bg-white/[.06] dark:hover:text-white"}`}
          >
            <Bell aria-hidden="true" className="size-4" />
            <span>Оголошення</span>
          </button>
          <button
            id="class-tab-settings"
            role="tab"
            aria-selected={activeTab === "settings"}
            aria-controls="class-panel-settings"
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b7cf6]/60 ${activeTab === "settings" ? "bg-[#f0edff] text-[#5b4bb7] shadow-sm dark:bg-[#211d3b] dark:text-[#b9afff]" : "text-[#6b7a70] hover:bg-[#f3f8f3] hover:text-[#142018] dark:text-[#aebbb2] dark:hover:bg-white/[.06] dark:hover:text-white"}`}
          >
            <Settings2 aria-hidden="true" className="size-4" />
            <span>Налаштування</span>
          </button>
        </div>

        {activeTab === "students" && (
          <section id="class-panel-students" role="tabpanel" aria-labelledby="class-tab-students" className="rounded-[28px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#7bedb4]">
                  Склад класу
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.05em] sm:text-3xl">
                  Учні та доступи
                </h2>
                <p className="mt-2 text-sm text-[#718075] dark:text-[#aab9ae]">
                  Додайте учнів вручну або імпортуйте їх зі списку.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={openImport}>
                  <FileUp className="mr-2 size-4" />
                  Імпорт таблиці
                </Button>
                <Button variant="ghost" onClick={() => void exportRoster()}>
                  <Download className="mr-2 size-4" />
                  Експорт
                </Button>
                <Button onClick={() => openAddStudents("paste")}>
                  <UserPlus className="mr-2 size-4" />
                  Додати учнів
                </Button>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {students.map((student) => (
                <article
                  key={student.id}
                  className="rounded-[24px] border border-[#142018]/10 bg-[#f7faf6] p-4 dark:border-white/10 dark:bg-white/[.045]"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-[#13241a] text-sm font-black text-[#7bedb4]">
                      {initials(student)}
                    </span>
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-black">
                        {student.lastName} {student.firstName}
                      </strong>
                      <span className="mt-1 block truncate text-xs text-[#718075] dark:text-[#aab9ae]">
                        {student.email || "Email ще не додано"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#142018]/8 pt-3 text-xs text-[#718075] dark:border-white/10 dark:text-[#aab9ae]">
                    <span>@{student.generatedUsername}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setParentStudent(student);
                        setParentEmail("");
                        setParentLink("");
                        setParentLinkCopied(false);
                      }}
                      className="font-bold text-[#16834d] dark:text-[#7bedb4]"
                    >
                      Запросити батьків
                    </button>
                  </div>
                </article>
              ))}
              {!students.length && (
                <div className="col-span-full rounded-[24px] border border-dashed border-[#142018]/15 bg-[#fbfdfb] p-7 text-center dark:border-white/10 dark:bg-white/[.02] sm:p-10">
                  <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                    <span className="grid size-12 place-items-center rounded-2xl bg-[#e8f8ee] text-[#16834d] dark:bg-[#10271a] dark:text-[#7bedb4]">
                      <UsersRound aria-hidden="true" className="size-6" />
                    </span>
                    <h3 className="mt-4 text-balance text-xl font-black">У класі ще немає учнів</h3>
                    <p className="mx-auto mt-2 max-w-lg text-center text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">
                      Вставте ПІБ по одному на рядок — логіни та паролі створяться автоматично.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button onClick={() => openAddStudents("paste")}>
                        <UserPlus className="mr-2 size-4" />
                        Вставити список учнів
                      </Button>
                      <Button variant="ghost" onClick={openImport}>
                        <FileUp className="mr-2 size-4" />
                        Завантажити таблицю
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "announcements" && (
          <section id="class-panel-announcements" role="tabpanel" aria-labelledby="class-tab-announcements" className="grid gap-6 xl:grid-cols-[1fr_420px]">
            {announcementsUnavailable && (
              <div className="xl:col-span-2 rounded-2xl border border-[#ffb454]/35 bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a11] dark:border-[#ffb454]/25 dark:bg-[#2a2011] dark:text-[#ffd58b]">
                Оголошення тимчасово недоступні. Список учнів та інші розділи класу працюють.
              </div>
            )}
            <div className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-7">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.15em] text-[#d97706]">
                    Комунікація
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-.055em]">
                    Оголошення класу
                  </h2>
                </div>
                <Button
                  onClick={() =>
                    setAnnouncement({
                      id: null,
                      title: "",
                      content: "",
                      pinned: false,
                    })
                  }
                >
                  <Plus className="mr-2 size-4" />
                  Нове
                </Button>
              </div>
              <div className="mt-6 space-y-3">
                {announcements.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[24px] border border-[#142018]/10 bg-[#f7faf6] p-5 dark:border-white/10 dark:bg-white/[.045]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-lg font-black">
                            {item.title || "Оголошення"}
                          </strong>
                          {item.pinned && (
                            <span className="rounded-full bg-[#fff1dc] px-2 py-1 text-[10px] font-black text-[#a55e00]">
                              ЗАКРІПЛЕНО
                            </span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">
                          {item.content}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setAnnouncement({
                              id: item.id,
                              title: item.title || "",
                              content: item.content,
                              pinned: item.pinned,
                            })
                          }
                          aria-label="Редагувати оголошення"
                          className="rounded-xl p-2 text-[#718075] hover:bg-white dark:hover:bg-white/[.08]"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeAnnouncement(item)}
                          aria-label="Видалити оголошення"
                          className="rounded-xl p-2 text-[#bd3c62] hover:bg-white dark:hover:bg-white/[.08]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!announcements.length && (
                  <div className="rounded-[24px] border border-dashed border-[#142018]/15 p-12 text-center text-sm text-[#6b7a70] dark:border-white/10 dark:text-[#aebbb2]">
                    Оголошень ще немає.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-[32px] bg-[#fff8ec] p-6 dark:bg-[#2a2011]">
              <p className="text-xs font-black uppercase tracking-[.15em] text-[#d97706]">
                Редактор
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {announcement.id ? "Редагувати" : "Нове повідомлення"}
              </h2>
              <input
                value={announcement.title}
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    title: event.target.value,
                  })
                }
                placeholder="Заголовок"
                className="mt-5 w-full rounded-xl border border-[#8a6b2d]/20 bg-white/75 px-4 py-3 text-sm outline-none dark:bg-white/[.07]"
              />
              <textarea
                value={announcement.content}
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    content: event.target.value,
                  })
                }
                placeholder="Текст оголошення"
                rows={8}
                className="mt-3 w-full resize-none rounded-xl border border-[#8a6b2d]/20 bg-white/75 px-4 py-3 text-sm outline-none dark:bg-white/[.07]"
              />
              <label className="mt-4 flex items-center gap-2 text-sm font-bold text-[#776e5d] dark:text-[#d1bd99]">
                <input
                  type="checkbox"
                  checked={announcement.pinned}
                  onChange={(event) =>
                    setAnnouncement({
                      ...announcement,
                      pinned: event.target.checked,
                    })
                  }
                />
                Закріпити зверху
              </label>
              <Button
                onClick={() => void saveAnnouncement()}
                disabled={saving || !announcement.content.trim()}
                className="mt-5 w-full"
              >
                <Save className="mr-2 size-4" />
                Зберегти
              </Button>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section id="class-panel-settings" role="tabpanel" aria-labelledby="class-tab-settings" className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-[#142018]/10 bg-white p-6 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14]">
              <p className="text-xs font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#7bedb4]">
                Викладачі класу
              </p>
              <h2 className="mt-2 text-2xl font-black">Призначення викладачів</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">
                До одного класу можна призначити кількох викладачів та
                асистентів організації.
              </p>
              <div className="mt-5 space-y-2">
                {orgStaff.map((member) => {
                  const checked = assignedTeacherIds.includes(member.userId);
                  return (
                    <label
                      key={member.userId}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#142018]/10 bg-[#f7faf6] px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[.05]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAssignedTeacherIds((current) =>
                            checked
                              ? current.filter((id) => id !== member.userId)
                              : [...current, member.userId],
                          )
                        }
                        className="size-4 accent-[#00c96d]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">
                          {member.name || member.username}
                        </span>
                        <span className="text-xs text-[#738278] dark:text-[#aebbb2]">
                          {member.role === "ORG_ADMIN"
                            ? "Адміністратор"
                            : member.role === "ASSISTANT"
                              ? "Асистент"
                              : "Викладач"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <Button
                onClick={() => void saveAssignedTeacher()}
                disabled={saving || !assignedTeacherIds.length}
                className="mt-5"
              >
                <Check className="mr-2 size-4" />
                Зберегти викладачів
              </Button>
            </div>
            <div className="rounded-[32px] border border-[#142018]/10 bg-white p-6 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14]">
              <p className="text-xs font-black uppercase tracking-[.15em] text-[#6b5bd4] dark:text-[#b9afff]">
                Оцінювання
              </p>
              <h2 className="mt-2 text-2xl font-black">Система оцінювання</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">
                Оберіть шкалу, яка буде використовуватись у журналі цього класу.
              </p>
              <select
                value={gradingSystem}
                onChange={(event) =>
                  setGradingSystem(event.target.value as ClassGradingSystem)
                }
                className="mt-5 w-full rounded-xl border border-[#142018]/10 bg-[#f7faf6] px-4 py-3 text-sm font-bold outline-none dark:border-white/10 dark:bg-white/[.05]"
              >
                {GRADING_SYSTEMS.map((system) => (
                  <option key={system} value={system}>
                    {gradingSystemLabel(system, false)}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => void saveGrading()}
                disabled={saving}
                className="mt-5"
              >
                <Save className="mr-2 size-4" />
                Зберегти систему
              </Button>
            </div>
            <div className="rounded-[32px] border border-[#142018]/10 bg-white p-6 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14]">
              <p className="text-xs font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#7bedb4]">
                Самостійне приєднання
              </p>
              <h2 className="mt-2 text-2xl font-black">Код класу</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">
                Учні можуть приєднатися до класу за коротким кодом без ручного
                створення облікового запису.
              </p>
              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-[#f7faf6] p-4 dark:bg-white/[.05]">
                <ClassJoinCodeButton classId={id} />
                <BookOpen className="size-5 text-[#16834d] dark:text-[#7bedb4]" />
              </div>
            </div>
          </section>
        )}
      </div>

      <Modal
        open={showAdd}
        onClose={closeAddStudents}
        title="Додати учнів"
        showCloseButton={false}
        panelClassName="max-w-2xl"
        bodyClassName="bg-bg-base/[.02]"
      >
        <div className="max-h-[70vh] space-y-5 overflow-y-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-accent-success">Швидкий старт</p>
              <p className="mt-1 text-sm text-text-secondary">Створимо доступи та покажемо їх один раз після додавання.</p>
            </div>
            <div role="tablist" aria-label="Спосіб додавання учнів" className="grid grid-cols-2 rounded-xl border border-border bg-bg-base/60 p-1">
              <button
                type="button"
                role="tab"
                aria-selected={addMode === "paste"}
                onClick={() => { setAddMode("paste"); setAddStudentsError(null); }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-success/60 ${addMode === "paste" ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                Вставити список
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={addMode === "manual"}
                onClick={() => { setAddMode("manual"); setAddStudentsError(null); }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-success/60 ${addMode === "manual" ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                По одному
              </button>
            </div>
          </div>
          {addStudentsError && (
            <div role="alert" aria-live="polite" className="rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm leading-5 text-accent-error">
              {addStudentsError}
            </div>
          )}
          {addMode === "paste" ? (
            <div className="rounded-2xl border border-border/80 bg-bg-surface/55 p-4 sm:p-5">
              <label htmlFor="bulk-student-list" className="block text-sm font-bold">Список учнів</label>
              <p className="mt-1 text-xs leading-5 text-text-secondary">Один ПІБ на рядок. Email не обовʼязковий — логін і пароль згенеруємо автоматично.</p>
              <textarea
                id="bulk-student-list"
                name="bulkStudentList"
                autoComplete="off"
                spellCheck={false}
                rows={8}
                value={bulkStudentText}
                onChange={(event) => { setBulkStudentText(event.target.value); setAddStudentsError(null); }}
                placeholder={"Шевченко Тарас Григорович\nМельник Софія\nабо: Шевченко\tТарас\tГригорович\tstudent@example.com\n…"}
                className="mt-3 min-h-44 w-full resize-y rounded-xl border border-border bg-bg-base px-3 py-3 text-sm leading-6 text-text-primary placeholder:text-text-secondary outline-none transition-colors focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40"
              />
              <div aria-live="polite" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-text-secondary">{bulkStudentText.trim() ? `Розпізнано учнів: ${parsedBulkStudents.students.length}` : "Формат: ПІБ по одному на рядок"}</span>
                {parsedBulkStudents.invalidLines.length > 0 && <span className="font-bold text-accent-error">Помилки у рядках: {parsedBulkStudents.invalidLines.join(", ")}</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {draftStudents.map((student, index) => (
                <fieldset key={index} className="grid gap-3 rounded-2xl border border-border/80 bg-bg-surface/55 p-4 sm:grid-cols-2">
                  <legend className="px-1 text-xs font-bold text-text-secondary">Учень {index + 1}</legend>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>Прізвище</span><input aria-label={`Прізвище учня ${index + 1}`} name={`student-${index}-lastName`} autoComplete="family-name" value={student.lastName} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, lastName: event.target.value } : item))} placeholder="Прізвище…" className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>Імʼя</span><input aria-label={`Імʼя учня ${index + 1}`} name={`student-${index}-firstName`} autoComplete="given-name" value={student.firstName} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, firstName: event.target.value } : item))} placeholder="Імʼя…" className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>По батькові</span><input aria-label={`По батькові учня ${index + 1}`} name={`student-${index}-middleName`} autoComplete="additional-name" value={student.middleName} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, middleName: event.target.value } : item))} placeholder="По батькові…" className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>Email <span className="font-normal text-text-muted">(необовʼязково)</span></span><input type="email" aria-label={`Email учня ${index + 1} (необовʼязково)`} name={`student-${index}-email`} autoComplete="email" spellCheck={false} value={student.email} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} placeholder="student@example.com…" className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                </fieldset>
              ))}
              <Button type="button" variant="ghost" onClick={() => setDraftStudents((list) => [...list, emptyStudent()])}><Plus className="mr-2 size-4" />Ще один рядок</Button>
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="ghost" className="text-text-secondary hover:text-text-primary" onClick={closeAddStudents}>
              Скасувати
            </Button>
            <Button onClick={() => void submitStudents()} disabled={saving}>
              {saving ? "Додаємо…" : addMode === "paste" && parsedBulkStudents.students.length ? `Додати ${parsedBulkStudents.students.length} учнів` : "Додати учнів"}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={showImport}
        onClose={closeImport}
        title="Імпорт учнів з таблиці"
        showCloseButton={false}
        panelClassName="max-w-xl"
        bodyClassName="bg-bg-base/[.02]"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-bg-surface/55 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-success/10 text-accent-success">
              <FileUp aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-bold text-text-primary">Завантажте готову таблицю</p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">Підтримуються CSV та Excel-файли з ПІБ, email і необовʼязковими паролями.</p>
            </div>
          </div>
          {importError && <div role="alert" aria-live="polite" className="rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm leading-5 text-accent-error">{importError}</div>}
          <div>
            <input
              id="student-table-file"
              name="studentTableFile"
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportError(null); }}
              className="sr-only"
            />
            <label htmlFor="student-table-file" className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border bg-bg-surface/40 px-4 py-4 transition-colors hover:border-accent-success/70 hover:bg-accent-success/5 focus-within:ring-2 focus-within:ring-accent-success/40">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-bg-base text-text-secondary">
                <FileUp aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text-primary">{importFile?.name || "Обрати CSV або Excel-файл"}</span>
                <span className="mt-0.5 block text-xs text-text-secondary">{importFile ? `${Math.max(1, Math.round(importFile.size / 1024))} КБ` : "Натисніть, щоб вибрати файл (.csv, .xlsx, .xls)"}</span>
              </span>
            </label>
          </div>
          <div className="rounded-xl bg-bg-base/60 px-3 py-2.5 text-xs leading-5 text-text-secondary">
            Колонки: <span className="font-semibold text-text-primary">Прізвище, Імʼя, По батькові, Email, Пароль</span>. Email і пароль можна залишити порожніми — пароль згенерується автоматично.
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={closeImport}>
              Скасувати
            </Button>
            <Button
              onClick={() => void importRoster()}
              disabled={saving || !importFile}
            >
              Імпортувати
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={showCredentials}
        onClose={() => setShowCredentials(false)}
        title="Облікові дані учнів"
        showCloseButton={false}
        panelClassName="max-w-2xl"
        bodyClassName="bg-bg-base/[.02]"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-accent-success/25 bg-accent-success/10 p-4">
            <p className="text-sm font-bold text-text-primary">Учнів додано успішно</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">Збережіть ці дані зараз — після закриття вікна паролі більше не покажемо.</p>
          </div>
          <div className="space-y-3">
            {credentials.map((item) => (
              <div key={`${item.email}-${item.username}`} className="rounded-2xl border border-border/80 bg-bg-surface/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[.12em] text-text-secondary">Учень</p>
                    <strong className="mt-1 block truncate text-sm text-text-primary">{item.lastName} {item.firstName}</strong>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent-success/10 px-2.5 py-1 text-[11px] font-bold text-accent-success">Доступ створено</span>
                </div>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-bg-base/70 px-3 py-2">
                    <dt className="text-[11px] font-bold uppercase tracking-[.1em] text-text-secondary">Логін</dt>
                    <dd className="mt-1 break-all font-mono text-sm text-text-primary">{item.username}</dd>
                  </div>
                  <div className="rounded-xl bg-bg-base/70 px-3 py-2">
                    <dt className="text-[11px] font-bold uppercase tracking-[.1em] text-text-secondary">Пароль</dt>
                    <dd className="mt-1 break-all font-mono text-sm text-text-primary">{item.password}</dd>
                  </div>
                </dl>
                {item.email && <p className="mt-3 truncate text-xs text-text-secondary">{item.email}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-end border-t border-border/70 pt-4">
            <Button onClick={() => setShowCredentials(false)}>Готово</Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!parentStudent}
        onClose={() => setParentStudent(null)}
        title="Запросити батьків"
        showCloseButton={false}
        panelClassName="max-w-lg"
        bodyClassName="bg-bg-base/[.02]"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-bg-surface/55 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-success/10 text-sm font-black text-accent-success">
              {parentStudent ? initials(parentStudent) : "У"}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-text-secondary">Учень</p>
              <p className="mt-1 truncate text-sm font-bold text-text-primary">{parentStudent?.lastName} {parentStudent?.firstName}</p>
            </div>
          </div>
          {parentLink ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-text-primary">Посилання готове</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">Надішліть його одному з батьків або опікунів.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label="Посилання для батьків"
                  name="parentInviteLink"
                  readOnly
                  value={parentLink}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-bg-base px-3 py-2 text-xs text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-success/40"
                />
                <Button
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => {
                    if (!navigator.clipboard) return;
                    void navigator.clipboard.writeText(parentLink).then(() => setParentLinkCopied(true)).catch(() => setParentLinkCopied(false));
                  }}
                >
                  <Copy className="mr-2 size-4" />
                  {parentLinkCopied ? "Скопійовано" : "Копіювати"}
                </Button>
              </div>
              <div className="flex justify-end border-t border-border/70 pt-4">
                <Button onClick={() => setParentStudent(null)}>
                <Check className="mr-2 size-4" />
                Готово
                </Button>
              </div>
            </div>
          ) : (
            <>
              <label className="grid gap-1.5 text-xs font-bold text-text-secondary" htmlFor="parent-invite-email">
                <span>Email батьків або опікунів</span>
                <input
                  id="parent-invite-email"
                  name="parentInviteEmail"
                  type="email"
                  autoComplete="email"
                  value={parentEmail}
                  onChange={(event) => setParentEmail(event.target.value)}
                  placeholder="parent@example.com…"
                  className="w-full rounded-xl border border-border bg-bg-base px-3 py-2.5 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40"
                />
                <span className="font-normal leading-5 text-text-muted">Батьки отримають окреме посилання для підтвердження контакту.</span>
              </label>
              <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setParentStudent(null)}>
                  Скасувати
                </Button>
                <Button
                  onClick={() => void sendParentInvite()}
                  disabled={saving || !parentEmail.trim()}
                >
                  <Mail className="mr-2 size-4" />
                  Створити
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ClassManagementPage;
