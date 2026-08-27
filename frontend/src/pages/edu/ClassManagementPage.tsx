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
  const [orgStaff, setOrgStaff] = React.useState<OrgStaff[]>([]);
  const [assignedTeacherIds, setAssignedTeacherIds] = React.useState<number[]>(
    [],
  );
  const [announcementsUnavailable, setAnnouncementsUnavailable] =
    React.useState(false);

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

  const submitStudents = async () => {
    const valid = draftStudents.filter(
      (item) =>
        item.firstName.trim() && item.lastName.trim() && item.email.trim(),
    );
    if (!valid.length) {
      showToast({
        type: "error",
        message: "Заповніть імʼя, прізвище та email хоча б одного учня.",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await addStudents(id, valid);
      setCredentials(result.credentials);
      setShowCredentials(true);
      setShowAdd(false);
      setDraftStudents([emptyStudent()]);
      await load();
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(caught, "Не вдалося додати учнів."),
      });
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
    setSaving(true);
    try {
      const result = await importStudents(id, await importFile.text());
      setCredentials(result.credentials);
      setShowCredentials(true);
      setShowImport(false);
      setImportFile(null);
      await load();
    } catch (caught) {
      showToast({
        type: "error",
        message: getErrorMessageFromUnknown(
          caught,
          "Не вдалося імпортувати список.",
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const sendParentInvite = async () => {
    if (!classInfo?.organizationId || !parentStudent || !parentEmail.trim())
      return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/edu/orgs/${classInfo.organizationId}/parent-invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: parentEmail.trim(),
            studentId: parentStudent.id,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message || "Не вдалося створити запрошення");
      setParentLink(
        payload?.invite?.token
          ? `${window.location.origin}/invite/${payload.invite.token}`
          : "",
      );
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
        <header className="rounded-[34px] bg-[#13241a] p-6 text-white shadow-[0_30px_90px_rgba(7,24,13,.18)] sm:p-9">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#7bedb4]">
                Керування класом
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-black tracking-[-.07em] sm:text-6xl">
                {classInfo?.name || "Клас"}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#c6d4c9]">
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

        <div className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setActiveTab("students")}
            className={`rounded-[26px] border p-5 text-left transition hover:-translate-y-0.5 ${activeTab === "students" ? "border-[#00d978]/35 bg-[#e8f8ee] dark:bg-[#10271a]" : "border-[#142018]/10 bg-white dark:border-white/10 dark:bg-[#111a14]"}`}
          >
            <UsersRound className="size-5 text-[#16834d] dark:text-[#7bedb4]" />
            <strong className="mt-5 block text-xl font-black">Учні</strong>
            <span className="mt-2 block text-sm text-[#6b7a70] dark:text-[#aebbb2]">
              Список, доступи й батьківські контакти
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("announcements")}
            className={`rounded-[26px] border p-5 text-left transition hover:-translate-y-0.5 ${activeTab === "announcements" ? "border-[#ffb454]/35 bg-[#fff8ec] dark:bg-[#2a2011]" : "border-[#142018]/10 bg-white dark:border-white/10 dark:bg-[#111a14]"}`}
          >
            <Bell className="size-5 text-[#d97706]" />
            <strong className="mt-5 block text-xl font-black">
              Оголошення
            </strong>
            <span className="mt-2 block text-sm text-[#6b7a70] dark:text-[#aebbb2]">
              Повідомлення, дедлайни та важливі зміни
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`rounded-[26px] border p-5 text-left transition hover:-translate-y-0.5 ${activeTab === "settings" ? "border-[#8b7cf6]/35 bg-[#f0edff] dark:bg-[#211d3b]" : "border-[#142018]/10 bg-white dark:border-white/10 dark:bg-[#111a14]"}`}
          >
            <Settings2 className="size-5 text-[#6b5bd4] dark:text-[#b9afff]" />
            <strong className="mt-5 block text-xl font-black">
              Налаштування
            </strong>
            <span className="mt-2 block text-sm text-[#6b7a70] dark:text-[#aebbb2]">
              Оцінювання та приєднання до класу
            </span>
          </button>
        </div>

        {activeTab === "students" && (
          <section className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#7bedb4]">
                  Склад класу
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-.055em]">
                  Учні та доступи
                </h2>
                <p className="mt-2 text-sm text-[#718075] dark:text-[#aab9ae]">
                  Додайте учнів вручну або імпортуйте їх зі списку.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setShowImport(true)}>
                  <FileUp className="mr-2 size-4" />
                  Імпорт CSV
                </Button>
                <Button variant="ghost" onClick={() => void exportRoster()}>
                  <Download className="mr-2 size-4" />
                  Експорт
                </Button>
                <Button onClick={() => setShowAdd(true)}>
                  <UserPlus className="mr-2 size-4" />
                  Створити облікові записи учнів
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
                        {student.email}
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
                      }}
                      className="font-bold text-[#16834d] dark:text-[#7bedb4]"
                    >
                      Запросити батьків
                    </button>
                  </div>
                </article>
              ))}
              {!students.length && (
                <div className="col-span-full rounded-[24px] border border-dashed border-[#142018]/15 p-12 text-center dark:border-white/10">
                  <UsersRound className="mx-auto size-9 text-[#16834d] dark:text-[#7bedb4]" />
                  <h3 className="mt-4 text-xl font-black">
                    Клас поки порожній
                  </h3>
                  <p className="mt-2 text-sm text-[#6b7a70] dark:text-[#aebbb2]">
                    Додайте першого учня, щоб почати навчання.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "announcements" && (
          <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
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
          <section className="grid gap-6 lg:grid-cols-2">
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
        onClose={() => setShowAdd(false)}
        title="Створити облікові записи учнів"
        showCloseButton={false}
      >
        <div className="max-h-[70vh] space-y-3 overflow-y-auto">
          {draftStudents.map((student, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-2">
              <input
                value={student.lastName}
                onChange={(event) =>
                  setDraftStudents((list) =>
                    list.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, lastName: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Прізвище"
                className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
              />
              <input
                value={student.firstName}
                onChange={(event) =>
                  setDraftStudents((list) =>
                    list.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, firstName: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Імʼя"
                className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
              />
              <input
                value={student.middleName}
                onChange={(event) =>
                  setDraftStudents((list) =>
                    list.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, middleName: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="По батькові"
                className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={student.email}
                onChange={(event) =>
                  setDraftStudents((list) =>
                    list.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, email: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Email"
                className="rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
              />
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() =>
              setDraftStudents((list) => [...list, emptyStudent()])
            }
          >
            <Plus className="mr-2 size-4" />
            Ще один рядок
          </Button>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>
              Скасувати
            </Button>
            <Button onClick={() => void submitStudents()} disabled={saving}>
              Додати
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Імпорт учнів з CSV"
        showCloseButton={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Формат: Імʼя, Прізвище, По батькові, Email.
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            className="w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowImport(false)}>
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
      >
        <div className="space-y-3">
          {credentials.map((item) => (
            <div
              key={`${item.email}-${item.username}`}
              className="rounded-xl border border-border bg-bg-surface p-3 text-sm"
            >
              <strong>
                {item.lastName} {item.firstName}
              </strong>
              <div className="mt-1 text-text-secondary">{item.email}</div>
              <div className="font-mono">
                {item.username} / {item.password}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={() => setShowCredentials(false)}>Готово</Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!parentStudent}
        onClose={() => setParentStudent(null)}
        title="Запросити батьків"
        showCloseButton={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Учень:{" "}
            <strong>
              {parentStudent?.lastName} {parentStudent?.firstName}
            </strong>
          </p>
          {parentLink ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Надішліть це посилання батькам:
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={parentLink}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-bg-surface px-3 py-2 text-xs"
                />
                <Button
                  variant="ghost"
                  onClick={() =>
                    void navigator.clipboard?.writeText(parentLink)
                  }
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <Button className="w-full" onClick={() => setParentStudent(null)}>
                <Check className="mr-2 size-4" />
                Готово
              </Button>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={parentEmail}
                onChange={(event) => setParentEmail(event.target.value)}
                placeholder="Email батьків"
                className="w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
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
