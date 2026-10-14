import React from "react";
import { useIsPresent } from "framer-motion";
import { isAxiosError } from "axios";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";
import { ClassJoinCodeButton } from "../../components/ClassJoinCodeButton";
import { useClassCredentialRecovery } from "./useClassCredentialRecovery";
import { ClassCredentialRecoveryPanel } from "./ClassCredentialRecoveryPanel";
import { CredentialWorkflowModal } from "./CredentialWorkflowModal";
import { showToast } from "../../lib/toast";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { api } from "../../lib/api/client";
import { clearGetMeCache } from "../../lib/api/profile";
import type { User } from "../../types";
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
  regeneratePassword,
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
  "min-h-[100dvh] bg-bg-base px-4 py-6 text-text-primary sm:px-6 lg:px-10 lg:py-10";
const initials = (student: Student) =>
  `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase() ||
  tr("У", "S");

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

  const xlsx = await import("@e965/xlsx");
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

export const ClassManagementPage: React.FC<{ user?: Pick<User, "id" | "role" | "eduContexts"> | null }> = ({ user }) => {
  const isPresent = useIsPresent();
  const { i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = Number(classId);
  const [classInfo, setClassInfo] = React.useState<ClassDetails | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [announcements, setAnnouncements] = React.useState<
    ClassAnnouncementDto[]
  >([]);
  const [activeTab, setActiveTab] = React.useState<
    "students" | "announcements" | "settings"
  >(searchParams.get("tab") === "settings" ? "settings" : "students");
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
  const [credentialClassId, setCredentialClassId] = React.useState<number | null>(null);
  const [credentialReason, setCredentialReason] = React.useState<"CREATED" | "RESET">("CREATED");
  const [credentialError, setCredentialError] = React.useState<string | null>(null);
  const [credentialsCopied, setCredentialsCopied] = React.useState(false);
  const [credentialsDownloading, setCredentialsDownloading] = React.useState(false);
  const [resetStudent, setResetStudent] = React.useState<Student | null>(null);
  const [resetError, setResetError] = React.useState<string | null>(null);
  const rosterPending = React.useRef(false);
  const rosterGeneration = React.useRef(0);
  const routeId = React.useRef(id); routeId.current = id;
  const loadGeneration = React.useRef(0);
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
  const [assignedPrimaryTeacherId, setAssignedPrimaryTeacherId] = React.useState<number | null>(null);
  const [assignmentError, setAssignmentError] = React.useState<string | null>(null);
  const assignmentPending = React.useRef(false);
  const gradingPending = React.useRef(false);
  const assignmentErrorRef = React.useRef<HTMLParagraphElement>(null);
  const canAssignTeachers = user?.role === "SYSTEM_ADMIN" || user?.eduContexts?.organizations.some(org => org.orgId === classInfo?.organizationId && org.role === "ORG_ADMIN") === true;
  const primaryCandidates = orgStaff.filter(member => assignedTeacherIds.includes(member.userId) && ["ORG_ADMIN", "TEACHER"].includes(member.role));
  React.useEffect(() => { if (assignmentError) assignmentErrorRef.current?.focus(); }, [assignmentError]);
  const [announcementsUnavailable, setAnnouncementsUnavailable] =
    React.useState(false);
  const parsedBulkStudents = React.useMemo(
    () => parsePastedStudentList(bulkStudentText),
    [bulkStudentText],
  );

  const load = React.useCallback(async () => {
    if (!Number.isSafeInteger(id) || id <= 0) { setError(tr("Клас не знайдено.", "Class not found.")); setLoading(false); return; }
    const generation = ++loadGeneration.current;
    const current = () => generation === loadGeneration.current && routeId.current === id;
    setLoading(true);
    try {
      const [group, people] = await Promise.all([getClass(id), getStudents(id)]);
      if (!current()) return;
      setClassInfo(group);
      setAssignedPrimaryTeacherId(group.teacherId ?? null);
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
        if (!current()) return;
        setAnnouncements(noticeData.announcements || []);
      } catch {
        if (!current()) return;
        // Announcements are a secondary panel; do not hide roster controls if
        // this optional request has a transient access or transport failure.
        setAnnouncements([]);
        setAnnouncementsUnavailable(true);
      }
      setGradingSystem(normalizeGradingSystem(group.gradingSystem));
      setOrgStaff([]);
      if (group.organizationId) {
        try {
          const { data } = await api.get(
            `/edu/orgs/${group.organizationId}/members`,
          );
          if (!current()) return;
          setOrgStaff(
            (data?.members ?? []).filter((member: OrgStaff) =>
              ["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(member.role),
            ),
          );
        } catch {
          if (!current()) return;
          // The organization roster is only needed for administrator-level
          // assignment controls. Teachers can use the class workspace without
          // access to the full organization member directory.
          setOrgStaff([]);
        }
      }
      setError(null);
    } catch (caught) {
      if (!current()) return;
      setError(
        getErrorMessageFromUnknown(
          caught,
          tr("Не вдалося завантажити керування класом.", "Could not load class management."),
        ),
      );
    } finally {
      if (current()) setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
    return () => { ++loadGeneration.current; };
  }, [load]);
  const recovery = useClassCredentialRecovery({ classId: id, userId: user?.id,
    onReady: (result, kind) => {
      ++rosterGeneration.current; rosterPending.current = false; setSaving(false);
      setCredentialClassId(id); setCredentials(result.credentials); setCredentialReason(kind === "CREATE" || kind === "IMPORT" ? "CREATED" : "RESET"); setCredentialError(null); setCredentialsCopied(false);
      setShowCredentials(true); setShowAdd(false); setShowImport(false); setResetStudent(null); setDraftStudents([emptyStudent()]); setBulkStudentText(""); setImportFile(null); void load();
    },
    onPending: () => { ++rosterGeneration.current; rosterPending.current = false; setSaving(false); setShowAdd(false); setShowImport(false); setResetStudent(null); },
    onCancelled: kind => { ++rosterGeneration.current; rosterPending.current = false; setSaving(false); if (kind === "CREATE") setShowAdd(true); if (kind === "IMPORT") setShowImport(true); },
  });
  React.useEffect(() => {
    ++rosterGeneration.current; rosterPending.current = false; setSaving(false);
    setShowCredentials(false); setCredentials([]); setCredentialClassId(null); setShowAdd(false); setShowImport(false); setResetStudent(null);
    setClassInfo(previous => previous?.id === id ? previous : null); setStudents([]);
  }, [id]);
  React.useEffect(() => {
    if (!showCredentials && !recovery.hasUnresolved) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventLoss); return () => window.removeEventListener("beforeunload", preventLoss);
  }, [showCredentials, recovery.hasUnresolved]);

  const openAddStudents = (mode: "paste" | "manual") => {
    if (!classInfo || classInfo.id !== id || loading || error || !recovery.canStart) return;
    setAddMode(mode);
    setBulkStudentText("");
    setDraftStudents([emptyStudent()]);
    setAddStudentsError(null);
    setShowAdd(true);
  };

  const closeAddStudents = () => {
    if (rosterPending.current) return;
    setShowAdd(false);
    setAddStudentsError(null);
  };

  const openImport = () => {
    if (!classInfo || classInfo.id !== id || loading || error || !recovery.canStart) return;
    setImportFile(null);
    setImportError(null);
    setShowImport(true);
  };

  const closeImport = () => {
    if (rosterPending.current) return;
    setShowImport(false);
    setImportFile(null);
    setImportError(null);
  };

  const submitStudents = async () => {
    if (rosterPending.current) return;
    setAddStudentsError(null);
    if (addMode === "paste" && parsedBulkStudents.invalidLines.length) {
      setAddStudentsError(tr(`Перевірте рядки ${parsedBulkStudents.invalidLines.join(", ")}: потрібні прізвище та імʼя, а email має бути коректним, якщо його вказано.`, `Check rows ${parsedBulkStudents.invalidLines.join(", ")}: last name and first name are required, and any email must be valid.`));
      return;
    }
    const valid = (addMode === "paste" ? parsedBulkStudents.students : draftStudents)
      .map((item) => ({
        firstName: item.firstName.trim(),
        lastName: item.lastName.trim(),
        middleName: item.middleName.trim(),
        email: item.email.trim().toLowerCase() || undefined,
      }))
      .filter((item) => item.firstName || item.lastName || item.middleName || item.email);
    if (valid.some(item => !item.firstName || !item.lastName || item.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email))) { setAddStudentsError(tr("Кожен заповнений рядок має містити ім’я та прізвище; email, якщо вказано, має бути коректним.", "Every populated row needs a first and last name; any email must be valid.")); return; }
    if (!valid.length) {
      setAddStudentsError(addMode === "paste" ? tr("Вставте список учнів у поле вище.", "Paste the student list in the field above.") : tr("Заповніть імʼя та прізвище хоча б одного учня.", "Enter a first and last name for at least one student."));
      return;
    }
    if (valid.length > 200 || valid.some(item => item.firstName.length > 100 || item.lastName.length > 100 || item.middleName.length > 100)) { setAddStudentsError(tr("Додайте до 200 учнів за раз; кожне поле імені має містити до 100 символів.", "Add up to 200 students at a time; each name field may contain up to 100 characters.")); return; }
    const emails = new Set<string>();
    const duplicateEmail = valid.find((item) => {
      if (!item.email) return false;
      if (emails.has(item.email)) return true;
      emails.add(item.email);
      return false;
    })?.email;
    if (duplicateEmail) {
      setAddStudentsError(tr(`Email ${duplicateEmail} повторюється у формі. Перевірте рядки.`, `Email ${duplicateEmail} appears more than once. Check the rows.`));
      return;
    }
    const existingEmails = new Set(students.map((student) => student.email?.trim().toLowerCase()).filter(Boolean));
    const alreadyInClass = valid.find((item) => item.email && existingEmails.has(item.email))?.email;
    if (alreadyInClass) {
      setAddStudentsError(tr(`Email ${alreadyInClass} уже є в цьому класі.`, `Email ${alreadyInClass} is already in this class.`));
      return;
    }
    rosterPending.current = true; setSaving(true);
    const generation = ++rosterGeneration.current;
    try {
      const result = await recovery.execute("CREATE", key => addStudents(id, valid, key));
      if (!result) return;
      if (routeId.current !== id || generation !== rosterGeneration.current) return;
    } catch (caught) {
      if (routeId.current !== id || generation !== rosterGeneration.current) return;
      const message = getErrorMessageFromUnknown(caught, tr("Не вдалося додати учнів.", "Could not add students."));
      setAddStudentsError(
        message === "INVALID_INPUT"
          ? tr("Перевірте імʼя та прізвище. Email необовʼязковий, але якщо його вказано — він має бути коректним.", "Check the first and last names. Email is optional, but if provided it must be valid.")
          : message === "INTERNAL_SERVER_ERROR"
            ? tr("Сервер не зміг створити облікові записи. Спробуйте ще раз або додайте учнів по одному.", "The server could not create the accounts. Try again or add students one at a time.")
            : message,
      );
    } finally {
      if (generation === rosterGeneration.current) { rosterPending.current = false; setSaving(false); }
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
          tr("Не вдалося експортувати список.", "Could not export the list."),
        ),
      });
    }
  };

  const importRoster = async () => {
    if (!importFile || rosterPending.current) return;
    if (importFile.size > 5_000_000) { setImportError(tr("Файл має бути до 5 МБ.", "The file may be up to 5 MB.")); return; }
    setImportError(null);
    rosterPending.current = true; setSaving(true);
    const generation = ++rosterGeneration.current;
    try {
      const csv = await readStudentTable(importFile);
      const result = await recovery.execute("IMPORT", key => importStudents(id, csv, key));
      if (!result) return;
      if (routeId.current !== id || generation !== rosterGeneration.current) return;
      if (!result.count) {
        setImportError(tr("У файлі не знайдено учнів. Перевірте колонки: Прізвище, Імʼя, По батькові, Email, Пароль.", "No students were found. Check the columns: Last name, First name, Middle name, Email, Password."));
        return;
      }
    } catch (caught) {
      if (routeId.current !== id || generation !== rosterGeneration.current) return;
      const message = getErrorMessageFromUnknown(caught, tr("Не вдалося імпортувати список.", "Could not import the list."));
      const invalidLines = isAxiosError(caught) && Array.isArray(caught.response?.data?.invalidLines) ? caught.response!.data.invalidLines as number[] : [];
      setImportError(message === "EMPTY_STUDENT_TABLE"
        ? tr("Файл порожній або в ньому немає даних на першому аркуші.", "The file is empty or the first sheet has no data.")
        : message === "INVALID_STUDENT_IMPORT"
          ? tr("Не вдалося розпізнати файл. Перевірте рядки та колонки: Прізвище, Імʼя, По батькові, Email, Пароль.", "Could not read the file. Check the rows and columns: Last name, First name, Middle name, Email, Password.")
          : invalidLines.length ? `${message} ${tr("Рядки", "Rows")}: ${invalidLines.join(", ")}.` : message);
    } finally {
      if (generation === rosterGeneration.current) { rosterPending.current = false; setSaving(false); }
    }
  };

  const credentialText = () => credentials.map(item => [
    `${tr("Учень", "Student")}: ${[item.lastName, item.firstName, item.middleName].filter(Boolean).join(" ").replace(/\s+/g, " ")}`,
    ...(item.email ? [`Email: ${item.email}`] : []),
    `${tr("Логін", "Username")}: ${item.username}`, `${tr("Пароль", "Password")}: ${item.password}`,
  ].join("\n")).join("\n\n");
  const copyCredentials = async () => { setCredentialError(null); setCredentialsCopied(false);
    try { await navigator.clipboard.writeText(credentialText()); setCredentialsCopied(true); }
    catch { setCredentialError(tr("Не вдалося скопіювати дані. Завантажте таблицю або скопіюйте їх вручну.", "Could not copy the details. Download the spreadsheet or copy them manually.")); }
  };
  const downloadCredentials = async () => {
    if (credentialsDownloading) return;
    setCredentialsDownloading(true); setCredentialError(null);
    try {
      const xlsx = await import("@e965/xlsx");
      const sheet = xlsx.utils.aoa_to_sheet([
        ["First name", "Last name", "Middle name", "Email", "Username", "Password"],
        ...credentials.map(item => [item.firstName, item.lastName, item.middleName || "", item.email, item.username, item.password]),
      ]);
      const workbook = xlsx.utils.book_new(); xlsx.utils.book_append_sheet(workbook, sheet, "Student logins");
      const url = URL.createObjectURL(new Blob([xlsx.write(workbook, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a"); link.href = url; link.download = `class_${id}_student_logins.xlsx`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setCredentialError(tr("Не вдалося завантажити таблицю. Скопіюйте дані або спробуйте ще раз.", "Could not download the spreadsheet. Copy the details or try again.")); }
    finally { setCredentialsDownloading(false); }
  };
  const resetPassword = async () => {
    if (!resetStudent || rosterPending.current) return;
    const target = resetStudent; rosterPending.current = true; setSaving(true); setResetError(null);
    const generation = ++rosterGeneration.current;
    try { await recovery.execute("RESET", async key => { const result = await regeneratePassword(target.id, key); return { count: 1, credentials: result.credentials || [{ ...target, middleName: target.middleName || "", username: result.username, password: result.password }] }; });
    } catch (caught) { if (routeId.current === id && generation === rosterGeneration.current) setResetError(getErrorMessageFromUnknown(caught, tr("Не вдалося отримати новий пароль. Оновіть список перед повторним скиданням.", "Could not retrieve the new password. Refresh the roster before resetting again."))); }
    finally { if (generation === rosterGeneration.current) { rosterPending.current = false; setSaving(false); } }
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
      showToast({ type: "success", message: tr("Запрошення батькам створено", "Parent invitation created") });
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          tr("Не вдалося створити запрошення.", "Could not create the invitation."),
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
          tr("Не вдалося зберегти оголошення.", "Could not save the announcement."),
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const removeAnnouncement = async (item: ClassAnnouncementDto) => {
    if (!confirm(tr("Видалити це оголошення?", "Delete this announcement?"))) return;
    try {
      await deleteClassAnnouncement(id, item.id);
      await load();
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          tr("Не вдалося видалити оголошення.", "Could not delete the announcement."),
        ),
      });
    }
  };

  const saveGrading = async () => {
    if (gradingPending.current || assignmentPending.current) return;
    gradingPending.current = true;
    const generation = loadGeneration.current;
    setSaving(true);
    try {
      const updated = await updateClassGradingSystem(id, gradingSystem);
      if (generation !== loadGeneration.current || routeId.current !== id) return;
      setClassInfo(previous => previous?.id === id ? { ...previous, ...updated } : previous);
      showToast({ type: "success", message: tr("Систему оцінювання оновлено", "Grading system updated") });
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          tr("Не вдалося зберегти систему оцінювання.", "Could not save the grading system."),
        ),
      });
    } finally {
      gradingPending.current = false;
      setSaving(false);
    }
  };

  const saveAssignedTeacher = async () => {
    if (!canAssignTeachers || assignmentPending.current || !classInfo?.organizationId || !primaryCandidates.some(member => member.userId === assignedPrimaryTeacherId)) return;
    assignmentPending.current = true;
    setAssignmentError(null);
    setSaving(true);
    try {
      const { data } = await api.patch(`/edu/orgs/${classInfo.organizationId}/classes/${id}`, {
        teacherIds: assignedTeacherIds,
        primaryTeacherId: assignedPrimaryTeacherId,
      });
      const primaryId = data.teacherId as number;
      clearGetMeCache({ clearSnapshot: true });
      setAssignedTeacherIds(data.teacherIds);
      setAssignedPrimaryTeacherId(primaryId);
      setClassInfo((old) =>
        old
          ? {
              ...old,
              teacherId: primaryId,
              teacherIds: data.teacherIds,
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
      showToast({ type: "success", message: tr("Викладачів класу призначено", "Class teachers assigned") });
    } catch (caught) {
      setAssignmentError(getErrorMessageFromUnknown(caught, tr("Не вдалося призначити викладачів.", "Could not assign teachers.")));
    } finally {
      assignmentPending.current = false;
      setSaving(false);
    }
  };

  if ((loading && !classInfo || classInfo && classInfo.id !== id) && !showCredentials && !recovery.showPrompt)
    return (
      <div className={root}>
        <div className="mx-auto max-w-7xl animate-pulse space-y-6">
          <div className="h-8 w-48 rounded-full bg-bg-hover dark:bg-white/[.08]" />
          <div className="h-48 rounded-[32px] bg-bg-hover dark:bg-white/[.08]" />
          <div className="h-[520px] rounded-[32px] bg-bg-hover dark:bg-white/[.08]" />
        </div>
      </div>
    );

  return (
    <div className={root}>
      <div className="mx-auto max-w-[1380px] space-y-6">
        <button
          type="button"
          onClick={() => navigate(`/edu/classes/${id}`)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/10 bg-white/80 px-4 py-2 text-sm font-bold text-text-muted shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:border-white/10 dark:bg-white/[.06] dark:text-text-primary"
        >
          <ArrowLeft className="size-4" />
          {tr("До класу", "Back to class")}
        </button>
        {searchParams.get("return") === "members" && classInfo?.organizationId && <button type="button" onClick={() => navigate(`/edu/organization?org=${classInfo.organizationId}`)} className="ml-2 min-h-11 rounded-xl px-4 text-sm font-semibold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">{tr("До учасників закладу", "Back to organization members")}</button>}
        <header className="rounded-[28px] border border-border bg-bg-surface p-5 text-text-primary shadow-[0_24px_70px_rgba(7,24,13,.16)] sm:p-7">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-primary-soft">
                {tr("Керування класом", "Class management")}
              </p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.06em] sm:text-5xl">
                {classInfo?.name || tr("Клас", "Class")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-primary sm:text-base">
                {tr("Учні, комунікація та правила класу — в одному робочому просторі без зайвих службових екранів.", "Students, communication, and class settings in one workspace.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-xl bg-white/[.08] px-3 py-2 text-sm font-bold text-text-primary">
                {students.length} {tr("учнів", "students")}
              </span>
            </div>
          </div>
        </header>

        {error && (
            <div role="alert" className="rounded-2xl border border-accent-error/25 bg-bg-hover px-4 py-3 text-sm text-accent-error dark:bg-accent-error/10 dark:text-accent-error">
              <p>{error}</p><Button variant="ghost" className="mt-3 min-h-11" disabled={loading} onClick={() => void load()}>{tr("Оновити список класу", "Refresh class roster")}</Button>
          </div>
        )}
        <ClassCredentialRecoveryPanel recovery={recovery} credentialsVisible={showCredentials && credentialClassId === id} />

        <div role="tablist" aria-label={tr("Розділи класу", "Class sections")} className="flex flex-wrap gap-1.5 rounded-2xl border border-border/10 bg-white/70 p-1.5 shadow-sm dark:border-white/10 dark:bg-bg-code">
          <button
            id="class-tab-students"
            role="tab"
            aria-selected={activeTab === "students"}
            aria-controls="class-panel-students"
            type="button"
            onClick={() => setActiveTab("students")}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${activeTab === "students" ? "bg-bg-hover text-primary-strong shadow-sm dark:bg-bg-base dark:text-primary-soft" : "text-text-muted hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-white/[.06] dark:hover:text-white"}`}
          >
            <UsersRound aria-hidden="true" className="size-4" />
            <span>{tr("Учні", "Students")}</span>
          </button>
          <button
            id="class-tab-announcements"
            role="tab"
            aria-selected={activeTab === "announcements"}
            aria-controls="class-panel-announcements"
            type="button"
            onClick={() => setActiveTab("announcements")}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-warn/60 ${activeTab === "announcements" ? "bg-bg-hover text-accent-warn shadow-sm dark:bg-[var(--surface-warning)] dark:text-accent-warn" : "text-text-muted hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-white/[.06] dark:hover:text-white"}`}
          >
            <Bell aria-hidden="true" className="size-4" />
            <span>{tr("Оголошення", "Announcements")}</span>
          </button>
          <button
            id="class-tab-settings"
            role="tab"
            aria-selected={activeTab === "settings"}
            aria-controls="class-panel-settings"
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b7cf6]/60 ${activeTab === "settings" ? "bg-bg-hover text-[#5b4bb7] shadow-sm dark:bg-[#211d3b] dark:text-[#b9afff]" : "text-text-muted hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-white/[.06] dark:hover:text-white"}`}
          >
            <Settings2 aria-hidden="true" className="size-4" />
            <span>{tr("Налаштування", "Settings")}</span>
          </button>
        </div>

        {activeTab === "students" && (
          <section id="class-panel-students" role="tabpanel" aria-labelledby="class-tab-students" className="rounded-[28px] border border-border/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">
                  {tr("Склад класу", "Class roster")}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.05em] sm:text-3xl">
                  {tr("Учні та доступи", "Students and access")}
                </h2>
                <p className="mt-2 text-sm text-text-muted dark:text-text-secondary">
                  {tr("Додайте учнів вручну або імпортуйте їх зі списку.", "Add students manually or import them from a list.")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={openImport} disabled={!classInfo || loading || Boolean(error) || !recovery.canStart}>
                  <FileUp className="mr-2 size-4" />
                  {tr("Імпорт таблиці", "Import spreadsheet")}
                </Button>
                <Button variant="ghost" onClick={() => void exportRoster()}>
                  <Download className="mr-2 size-4" />
                  {tr("Експорт", "Export")}
                </Button>
                <Button onClick={() => openAddStudents("paste")} disabled={!classInfo || loading || Boolean(error) || !recovery.canStart}>
                  <UserPlus className="mr-2 size-4" />
                  {tr("Додати учнів", "Add students")}
                </Button>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {students.map((student) => (
                <article
                  key={student.id}
                  className="rounded-[24px] border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.045]"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl bg-bg-base text-sm font-black text-primary-soft">
                      {initials(student)}
                    </span>
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-black">
                        {student.lastName} {student.firstName}
                      </strong>
                      <span className="mt-1 block truncate text-xs text-text-muted dark:text-text-secondary">
                        {student.email || tr("Email ще не додано", "No email added")}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/8 pt-3 text-xs text-text-muted dark:border-white/10 dark:text-text-secondary">
                    <span className="min-w-0 break-all">@{student.generatedUsername}</span>
                    <button type="button" disabled={!recovery.canStart} aria-label={tr(`Скинути пароль для ${student.lastName} ${student.firstName}`, `Reset password for ${student.lastName} ${student.firstName}`)} onClick={() => { setResetError(null); setResetStudent(student); }} className="min-h-11 font-semibold text-primary-strong disabled:opacity-50">{tr("Новий пароль", "Reset password")}</button>
                    <button
                      type="button"
                      disabled={!recovery.canStart}
                      title={!recovery.canStart ? tr("Спочатку завершіть видачу доступів учням.", "Finish issuing student access first.") : undefined}
                      onClick={() => {
                        setParentStudent(student);
                        setParentEmail("");
                        setParentLink("");
                        setParentLinkCopied(false);
                      }}
                      className="min-h-11 font-bold text-primary-strong disabled:opacity-50 dark:text-primary-soft"
                    >
                      {tr("Запросити батьків", "Invite a parent")}
                    </button>
                  </div>
                </article>
              ))}
              {!students.length && (
                <div className="col-span-full rounded-[24px] border border-dashed border-border/15 bg-bg-surface p-7 text-center dark:border-white/10 dark:bg-white/[.02] sm:p-10">
                  <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
                    <span className="grid size-12 place-items-center rounded-2xl bg-bg-hover text-primary-strong dark:bg-bg-base dark:text-primary-soft">
                      <UsersRound aria-hidden="true" className="size-6" />
                    </span>
                    <h3 className="mt-4 text-balance text-xl font-black">{tr("У класі ще немає учнів", "There are no students in this class yet")}</h3>
                    <p className="mx-auto mt-2 max-w-lg text-center text-sm leading-6 text-text-muted dark:text-text-secondary">
                      {tr("Вставте ПІБ по одному на рядок — логіни та паролі створяться автоматично.", "Paste one student name per line. Usernames and passwords will be created automatically.")}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <Button onClick={() => openAddStudents("paste")} disabled={!classInfo || loading || Boolean(error) || !recovery.canStart}>
                        <UserPlus className="mr-2 size-4" />
                        {tr("Вставити список учнів", "Paste student list")}
                      </Button>
                      <Button variant="ghost" onClick={openImport} disabled={!classInfo || loading || Boolean(error) || !recovery.canStart}>
                        <FileUp className="mr-2 size-4" />
                        {tr("Завантажити таблицю", "Upload spreadsheet")}
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
              <div className="xl:col-span-2 rounded-2xl border border-accent-warn/35 bg-bg-hover px-4 py-3 text-sm text-accent-warn dark:border-accent-warn/25 dark:bg-[var(--surface-warning)] dark:text-accent-warn">
                {tr("Оголошення тимчасово недоступні. Список учнів та інші розділи класу працюють.", "Announcements are temporarily unavailable. The student list and other class sections are working.")}
              </div>
            )}
            <div className="rounded-[32px] border border-border/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code sm:p-7">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.15em] text-accent-warn">
                    {tr("Комунікація", "Communication")}
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-.055em]">
                    {tr("Оголошення класу", "Class announcements")}
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
                  {tr("Нове", "New")}
                </Button>
              </div>
              <div className="mt-6 space-y-3">
                {announcements.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-[24px] border border-border/10 bg-bg-hover p-5 dark:border-white/10 dark:bg-white/[.045]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-lg font-black">
                            {item.title || tr("Оголошення", "Announcement")}
                          </strong>
                          {item.pinned && (
                            <span className="rounded-full bg-bg-hover px-2 py-1 text-[10px] font-black text-accent-warn">
                              {tr("ЗАКРІПЛЕНО", "PINNED")}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-muted dark:text-text-secondary">
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
                          aria-label={tr("Редагувати оголошення", "Edit announcement")}
                          className="rounded-xl p-2 text-text-muted hover:bg-white dark:hover:bg-white/[.08]"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeAnnouncement(item)}
                          aria-label={tr("Видалити оголошення", "Delete announcement")}
                          className="rounded-xl p-2 text-accent-error hover:bg-white dark:hover:bg-white/[.08]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!announcements.length && (
                  <div className="rounded-[24px] border border-dashed border-border/15 p-12 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">
                    {tr("Оголошень ще немає.", "No announcements yet.")}
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-[32px] bg-bg-hover p-6 dark:bg-[var(--surface-warning)]">
              <p className="text-xs font-black uppercase tracking-[.15em] text-accent-warn">
                {tr("Редактор", "Editor")}
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {announcement.id ? tr("Редагувати", "Edit") : tr("Нове повідомлення", "New announcement")}
              </h2>
              <input
                value={announcement.title}
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    title: event.target.value,
                  })
                }
                placeholder={tr("Заголовок", "Title")}
                className="mt-5 w-full rounded-xl border border-accent-warn/20 bg-white/75 px-4 py-3 text-sm outline-none dark:bg-white/[.07]"
              />
              <textarea
                value={announcement.content}
                onChange={(event) =>
                  setAnnouncement({
                    ...announcement,
                    content: event.target.value,
                  })
                }
                placeholder={tr("Текст оголошення", "Announcement text")}
                rows={8}
                className="mt-3 w-full resize-none rounded-xl border border-accent-warn/20 bg-white/75 px-4 py-3 text-sm outline-none dark:bg-white/[.07]"
              />
              <label className="mt-4 flex items-center gap-2 text-sm font-bold text-accent-warn dark:text-accent-warn">
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
                {tr("Закріпити зверху", "Pin to top")}
              </label>
              <Button
                onClick={() => void saveAnnouncement()}
                disabled={saving || !announcement.content.trim()}
                className="mt-5 w-full"
              >
                <Save className="mr-2 size-4" />
                {tr("Зберегти", "Save")}
              </Button>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section id="class-panel-settings" role="tabpanel" aria-labelledby="class-tab-settings" className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-border/10 bg-white p-6 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code">
              <p className="text-xs font-black uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">
                {tr("Викладачі класу", "Class teachers")}
              </p>
              <h2 className="mt-2 text-2xl font-black">{canAssignTeachers ? tr("Призначення викладачів", "Assign teachers") : tr("Відповідальний за клас", "Class responsibility")}</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
                {canAssignTeachers ? tr("Оберіть відповідального вчителя. Інші призначені викладачі й асистенти зберігають доступ відповідно до своєї ролі.", "Choose the responsible teacher. Other assigned teachers and assistants keep access according to their role.") : tr("Призначення та передавання класу виконує адміністратор закладу.", "The organization administrator assigns teachers and transfers class responsibility.")}
              </p>
              {!canAssignTeachers && <p className="mt-4 text-sm font-semibold">{classInfo?.teacherName || tr("Уточніть в адміністратора закладу", "Contact your organization administrator")}</p>}
              {canAssignTeachers && <>
              <div className="mt-5 space-y-2">
                {orgStaff.map((member) => {
                  const checked = assignedTeacherIds.includes(member.userId);
                  return (
                    <label
                      key={member.userId}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[.05]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving}
                        onChange={() => {
                          const next = checked ? assignedTeacherIds.filter(id => id !== member.userId) : [...assignedTeacherIds, member.userId];
                          setAssignedTeacherIds(next);
                          if (!next.includes(assignedPrimaryTeacherId ?? -1)) setAssignedPrimaryTeacherId(orgStaff.find(candidate => next.includes(candidate.userId) && ["ORG_ADMIN", "TEACHER"].includes(candidate.role))?.userId ?? null);
                        }}
                        className="size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">
                          {member.name || member.username}
                        </span>
                        <span className="text-xs text-text-muted dark:text-text-secondary">
                          {member.role === "ORG_ADMIN"
                            ? tr("Адміністратор", "Administrator")
                            : member.role === "ASSISTANT"
                              ? tr("Асистент", "Assistant")
                              : tr("Викладач", "Teacher")}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <label className="mt-5 grid min-w-0 gap-2 text-sm font-semibold">{tr("Відповідальний вчитель", "Responsible teacher")}
                <select value={assignedPrimaryTeacherId ?? ""} disabled={saving} onChange={event => setAssignedPrimaryTeacherId(Number(event.target.value))} className="min-h-11 min-w-0 w-full rounded-xl border border-border bg-bg-base px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                  <option value="" disabled>{tr("Оберіть вчителя", "Choose a teacher")}</option>
                  {primaryCandidates.map(member => <option key={member.userId} value={member.userId}>{member.name || member.username || `#${member.userId}`}</option>)}
                </select>
              </label>
              {!primaryCandidates.length && <p className="mt-2 text-sm text-text-secondary">{tr("Додайте хоча б одного вчителя або адміністратора. Асистент не може бути відповідальним за клас.", "Select at least one teacher or administrator. An assistant cannot be responsible for the class.")}</p>}
              {assignmentError && <p ref={assignmentErrorRef} tabIndex={-1} role="alert" className="mt-3 rounded-xl bg-accent-error/10 p-3 text-sm text-accent-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-error">{assignmentError}</p>}
              <Button
                onClick={() => void saveAssignedTeacher()}
                disabled={saving || !primaryCandidates.some(member => member.userId === assignedPrimaryTeacherId)}
                className="mt-5 min-h-11"
              >
                <Check className="mr-2 size-4" />
                {tr("Зберегти викладачів", "Save teachers")}
              </Button>
              </>}
            </div>
            <div className="rounded-[32px] border border-border/10 bg-white p-6 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code">
              <p className="text-xs font-black uppercase tracking-[.15em] text-[#6b5bd4] dark:text-[#b9afff]">
                {tr("Оцінювання", "Grading")}
              </p>
              <h2 className="mt-2 text-2xl font-black">{tr("Система оцінювання", "Grading system")}</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
                {tr("Оберіть шкалу, яка буде використовуватись у журналі цього класу.", "Choose the grading scale used in this class journal.")}
              </p>
              <select
                value={gradingSystem}
                onChange={(event) =>
                  setGradingSystem(event.target.value as ClassGradingSystem)
                }
                className="mt-5 w-full rounded-xl border border-border/10 bg-bg-hover px-4 py-3 text-sm font-bold outline-none dark:border-white/10 dark:bg-white/[.05]"
              >
                {GRADING_SYSTEMS.map((system) => (
                  <option key={system} value={system}>
                    {gradingSystemLabel(system, isEn)}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => void saveGrading()}
                disabled={saving}
                className="mt-5 min-h-11"
              >
                <Save className="mr-2 size-4" />
                {tr("Зберегти систему", "Save grading system")}
              </Button>
            </div>
            <div className="rounded-[32px] border border-border/10 bg-white p-6 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code">
              <p className="text-xs font-black uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">
                {tr("Самостійне приєднання", "Self-enrollment")}
              </p>
              <h2 className="mt-2 text-2xl font-black">{tr("Код класу", "Class code")}</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
                {tr("Учні можуть приєднатися до класу за коротким кодом без ручного створення облікового запису.", "Students can join the class with a short code without an account being created manually.")}
              </p>
              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-bg-hover p-4 dark:bg-white/[.05]">
                <ClassJoinCodeButton classId={id} />
                <BookOpen className="size-5 text-primary-strong dark:text-primary-soft" />
              </div>
            </div>
          </section>
        )}
      </div>

      <CredentialWorkflowModal
        open={isPresent && showAdd}
        closable={!saving}
        onClose={closeAddStudents}
        title={tr("Додати учнів", "Add students")}
        showCloseButton={false}
        panelClassName="max-w-2xl"
        bodyClassName="bg-bg-base/[.02]"
      >
        <fieldset disabled={saving} className="max-h-[70vh] space-y-5 overflow-y-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-accent-success">{tr("Швидкий старт", "Quick start")}</p>
              <p className="mt-1 text-sm text-text-secondary">{tr("Створимо логіни й паролі. Збережіть їх і підтвердьте завершення видачі.", "We will create usernames and passwords. Save them and confirm that issuing access is complete.")}</p>
            </div>
            <div role="tablist" aria-label={tr("Спосіб додавання учнів", "How to add students")} className="grid grid-cols-2 rounded-xl border border-border bg-bg-base/60 p-1">
              <button
                type="button"
                role="tab"
                aria-selected={addMode === "paste"}
                onClick={() => { setAddMode("paste"); setAddStudentsError(null); }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-success/60 ${addMode === "paste" ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                {tr("Вставити список", "Paste list")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={addMode === "manual"}
                onClick={() => { setAddMode("manual"); setAddStudentsError(null); }}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-success/60 ${addMode === "manual" ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
              >
                {tr("По одному", "One at a time")}
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
              <label htmlFor="bulk-student-list" className="block text-sm font-bold">{tr("Список учнів", "Student list")}</label>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Спочатку прізвище, потім ім’я; один учень на рядок. Email не обовʼязковий — логін і пароль згенеруємо автоматично.", "Enter surname, then first name, with one student per line. Email is optional; a username and password will be generated automatically.")}</p>
              <textarea
                id="bulk-student-list"
                name="bulkStudentList"
                autoComplete="off"
                spellCheck={false}
                rows={8}
                value={bulkStudentText}
                onChange={(event) => { setBulkStudentText(event.target.value); setAddStudentsError(null); }}
                placeholder={tr("Шевченко Тарас Григорович\nМельник Софія\nабо: Шевченко\tТарас\tГригорович\tstudent@example.com\n…", "Taylor Alex Jordan\nMorgan Sam\nor: Taylor\tAlex\tJordan\tstudent@example.com\n…")}
                className="mt-3 min-h-44 w-full resize-y rounded-xl border border-border bg-bg-base px-3 py-3 text-sm leading-6 text-text-primary placeholder:text-text-secondary outline-none transition-colors focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40"
              />
              <div aria-live="polite" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-text-secondary">{bulkStudentText.trim() ? tr(`Розпізнано учнів: ${parsedBulkStudents.students.length}`, `Students recognized: ${parsedBulkStudents.students.length}`) : tr("Формат: ПІБ по одному на рядок", "Format: one student name per line")}</span>
                {parsedBulkStudents.invalidLines.length > 0 && <span className="font-bold text-accent-error">{tr(`Помилки у рядках: ${parsedBulkStudents.invalidLines.join(", ")}`, `Errors on rows: ${parsedBulkStudents.invalidLines.join(", ")}`)}</span>}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {draftStudents.map((student, index) => (
                <fieldset key={index} className="grid gap-3 rounded-2xl border border-border/80 bg-bg-surface/55 p-4 sm:grid-cols-2">
                  <legend className="px-1 text-xs font-bold text-text-secondary">{tr("Учень", "Student")} {index + 1}</legend>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>{tr("Прізвище", "Last name")}</span><input aria-label={tr(`Прізвище учня ${index + 1}`, `Student ${index + 1} last name`)} name={`student-${index}-lastName`} autoComplete="family-name" value={student.lastName} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, lastName: event.target.value } : item))} placeholder={tr("Прізвище…", "Last name…")} className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>{tr("Імʼя", "First name")}</span><input aria-label={tr(`Імʼя учня ${index + 1}`, `Student ${index + 1} first name`)} name={`student-${index}-firstName`} autoComplete="given-name" value={student.firstName} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, firstName: event.target.value } : item))} placeholder={tr("Імʼя…", "First name…")} className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>{tr("По батькові", "Middle name")}</span><input aria-label={tr(`По батькові учня ${index + 1}`, `Student ${index + 1} middle name`)} name={`student-${index}-middleName`} autoComplete="additional-name" value={student.middleName} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, middleName: event.target.value } : item))} placeholder={tr("По батькові…", "Middle name…")} className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                  <label className="grid gap-1.5 text-xs font-bold text-text-secondary"><span>Email <span className="font-normal text-text-muted">({tr("необовʼязково", "optional")})</span></span><input type="email" aria-label={tr(`Email учня ${index + 1} (необовʼязково)`, `Student ${index + 1} email (optional)`)} name={`student-${index}-email`} autoComplete="email" spellCheck={false} value={student.email} onChange={(event) => setDraftStudents((list) => list.map((item, itemIndex) => itemIndex === index ? { ...item, email: event.target.value } : item))} placeholder="student@example.com…" className="rounded-xl border border-border bg-bg-base px-3 py-2 text-sm font-normal text-text-primary placeholder:text-text-secondary outline-none focus:border-accent-success focus-visible:ring-2 focus-visible:ring-accent-success/40" /></label>
                </fieldset>
              ))}
              <Button type="button" variant="ghost" onClick={() => setDraftStudents((list) => [...list, emptyStudent()])}><Plus className="mr-2 size-4" />{tr("Ще один рядок", "Add another row")}</Button>
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="ghost" className="text-text-secondary hover:text-text-primary" onClick={closeAddStudents}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={() => void submitStudents()} disabled={saving}>
              {saving ? tr("Додаємо…", "Adding…") : addMode === "paste" && parsedBulkStudents.students.length ? tr(`Додати ${parsedBulkStudents.students.length} учнів`, `Add ${parsedBulkStudents.students.length} students`) : tr("Додати учнів", "Add students")}
            </Button>
          </div>
        </fieldset>
      </CredentialWorkflowModal>
      <CredentialWorkflowModal
        open={isPresent && showImport}
        closable={!saving}
        onClose={closeImport}
        title={tr("Імпорт учнів з таблиці", "Import students from a spreadsheet")}
        showCloseButton={false}
        panelClassName="max-w-xl"
        bodyClassName="bg-bg-base/[.02]"
      >
        <fieldset disabled={saving} className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-bg-surface/55 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-success/10 text-accent-success">
              <FileUp aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-bold text-text-primary">{tr("Завантажте готову таблицю", "Upload a spreadsheet")}</p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Підтримуються CSV та Excel-файли з ПІБ, email і необовʼязковими паролями.", "CSV and Excel files with student names, email, and optional passwords are supported.")}</p>
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
                <span className="block truncate text-sm font-bold text-text-primary">{importFile?.name || tr("Обрати CSV або Excel-файл", "Choose a CSV or Excel file")}</span>
                <span className="mt-0.5 block text-xs text-text-secondary">{importFile ? `${Math.max(1, Math.round(importFile.size / 1024))} ${tr("КБ", "KB")}` : tr("Натисніть, щоб вибрати файл (.csv, .xlsx, .xls)", "Select a file (.csv, .xlsx, .xls)")}</span>
              </span>
            </label>
          </div>
          <div className="rounded-xl bg-bg-base/60 px-3 py-2.5 text-xs leading-5 text-text-secondary">
            {tr("Колонки:", "Columns:")} <span className="font-semibold text-text-primary">{tr("Прізвище, Імʼя, По батькові, Email, Пароль", "Last name, First name, Middle name, Email, Password")}</span>. {tr("Email і пароль можна залишити порожніми — пароль згенерується автоматично.", "Email and password may be left blank. A password will be generated automatically.")}
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={closeImport}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button
              onClick={() => void importRoster()}
              disabled={saving || !importFile}
            >
              {tr("Імпортувати", "Import")}
            </Button>
          </div>
        </fieldset>
      </CredentialWorkflowModal>
      <CredentialWorkflowModal
        open={isPresent && showCredentials && credentialClassId === id}
        onClose={() => {}}
        closable={false}
        title={tr("Облікові дані учнів", "Student login details")}
        showCloseButton={false}
        panelClassName="max-w-2xl"
        bodyClassName="bg-bg-base/[.02]"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-accent-success/25 bg-accent-success/10 p-4">
            <p className="text-sm font-bold text-text-primary">{credentialReason === "RESET" ? tr("Новий пароль готовий", "New password ready") : tr("Учнів додано успішно", "Students added successfully")}</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Збережіть ці дані та підтвердьте збереження. До підтвердження їх можна відновити протягом 30 хвилин. Після підтвердження паролі видаляються з відновлення.", "Save these details and confirm saving. Until confirmation, they can be recovered for up to 30 minutes. Confirmation removes the passwords from recovery.")}</p>
          </div>
          <div className="flex flex-wrap gap-3"><Button className="min-h-11" onClick={() => void copyCredentials()}><Copy className="mr-2 size-4" />{credentialsCopied ? tr("Скопійовано", "Copied") : tr("Скопіювати дані", "Copy details")}</Button><Button variant="ghost" className="min-h-11" disabled={credentialsDownloading} onClick={() => void downloadCredentials()}><Download className="mr-2 size-4" />{credentialsDownloading ? tr("Готуємо файл…", "Preparing file…") : tr("Завантажити Excel", "Download Excel")}</Button></div>
          {credentialError && <p role="alert" className="text-sm text-accent-error">{credentialError}</p>}
          <div className="space-y-3">
            {credentials.map((item) => (
              <div key={`${item.email}-${item.username}`} className="rounded-2xl border border-border/80 bg-bg-surface/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[.12em] text-text-secondary">{tr("Учень", "Student")}</p>
                    <strong className="mt-1 block truncate text-sm text-text-primary">{item.lastName} {item.firstName}</strong>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent-success/10 px-2.5 py-1 text-[11px] font-bold text-accent-success">{tr("Доступ створено", "Access created")}</span>
                </div>
                <dl className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-bg-base/70 px-3 py-2">
                    <dt className="text-[11px] font-bold uppercase tracking-[.1em] text-text-secondary">{tr("Логін", "Username")}</dt>
                    <dd className="mt-1 break-all font-mono text-sm text-text-primary">{item.username}</dd>
                  </div>
                  <div className="rounded-xl bg-bg-base/70 px-3 py-2">
                    <dt className="text-[11px] font-bold uppercase tracking-[.1em] text-text-secondary">{tr("Пароль", "Password")}</dt>
                    <dd className="mt-1 break-all font-mono text-sm text-text-primary">{item.password}</dd>
                  </div>
                </dl>
                {item.email && <p className="mt-3 truncate text-xs text-text-secondary">{item.email}</p>}
              </div>
            ))}
          </div>
          <div className="flex justify-end border-t border-border/70 pt-4">
            <Button className="min-h-11" disabled={credentialsDownloading || recovery.busy} onClick={() => { void recovery.acknowledge().then(confirmed => { if (confirmed) { setShowCredentials(false); setCredentials([]); setCredentialError(null); setCredentialsCopied(false); } else setCredentialError(tr("Не вдалося завершити видачу доступів. Ваші дані залишаються тут; спробуйте ще раз.", "Could not finish issuing access. Your details remain here; try again.")); }); }}>{tr("Дані збережено — закрити", "Details saved — close")}</Button>
          </div>
        </div>
      </CredentialWorkflowModal>
      <CredentialWorkflowModal open={isPresent && resetStudent !== null} title={tr("Скинути пароль учня", "Reset student password")} onClose={() => !saving && setResetStudent(null)} closable={!saving}>
        <p className="text-sm text-text-secondary">{resetStudent?.lastName} {resetStudent?.firstName}. {tr("Попередній пароль для входу в клас перестане працювати. Новий пароль з’явиться в наступному вікні — збережіть його й передайте учню.", "The previous classroom login password will stop working. Save the new password shown in the next dialog and give it to the student.")}</p>
        {resetError && <p role="alert" className="mt-4 text-sm text-accent-error">{resetError}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-3"><Button variant="ghost" disabled={saving} onClick={() => setResetStudent(null)}>{tr("Скасувати", "Cancel")}</Button><Button disabled={saving} onClick={() => void resetPassword()}>{saving ? tr("Змінюємо…", "Resetting…") : tr("Створити новий пароль", "Create new password")}</Button></div>
      </CredentialWorkflowModal>
      <Modal
        open={isPresent && !!parentStudent}
        onClose={() => setParentStudent(null)}
        title={tr("Запросити батьків", "Invite a parent")}
        showCloseButton={false}
        panelClassName="max-w-lg"
        bodyClassName="bg-bg-base/[.02]"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-bg-surface/55 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-success/10 text-sm font-black text-accent-success">
              {parentStudent ? initials(parentStudent) : tr("У", "S")}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-text-secondary">{tr("Учень", "Student")}</p>
              <p className="mt-1 truncate text-sm font-bold text-text-primary">{parentStudent?.lastName} {parentStudent?.firstName}</p>
            </div>
          </div>
          {parentLink ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-text-primary">{tr("Посилання готове", "Invitation link ready")}</p>
                <p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Надішліть його одному з батьків або опікунів.", "Send it to a parent or guardian.")}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label={tr("Посилання для батьків", "Parent invitation link")}
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
                  {parentLinkCopied ? tr("Скопійовано", "Copied") : tr("Копіювати", "Copy")}
                </Button>
              </div>
              <div className="flex justify-end border-t border-border/70 pt-4">
                <Button onClick={() => setParentStudent(null)}>
                <Check className="mr-2 size-4" />
                {tr("Готово", "Done")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <label className="grid gap-1.5 text-xs font-bold text-text-secondary" htmlFor="parent-invite-email">
                <span>{tr("Email батьків або опікунів", "Parent or guardian email")}</span>
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
                <span className="font-normal leading-5 text-text-muted">{tr("Батьки отримають окреме посилання для підтвердження контакту.", "The parent will receive a separate link to confirm their contact details.")}</span>
              </label>
              <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setParentStudent(null)}>
                  {tr("Скасувати", "Cancel")}
                </Button>
                <Button
                  onClick={() => void sendParentInvite()}
                  disabled={saving || !parentEmail.trim()}
                >
                  <Mail className="mr-2 size-4" />
                  {tr("Створити", "Create")}
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
