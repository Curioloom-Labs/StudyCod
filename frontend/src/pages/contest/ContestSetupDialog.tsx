import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Sparkles,
  Trophy,
  UsersRound,
  X,
  ImagePlus,
} from "lucide-react";
import { createContest, type ContestBannerTheme, type ContestParticipantAccessMode, type ContestScoringMode, type ContestScoreboardVisibility, type ContestVisibility } from "../../lib/api/contests";
import { getClasses, uploadStatementImage, type Class } from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { CONTEST_BANNER_THEMES, CONTEST_ICONS } from "./contestBranding";

type SetupStep = "details" | "access" | "schedule";
type ContestDifficulty = "EASY" | "MEDIUM" | "HARD" | "";

type ContestDraft = {
  title: string;
  description: string;
  tags: string[];
  tagInput: string;
  difficulty: ContestDifficulty;
  visibility: ContestVisibility;
  joinCode: string;
  classId: string;
  scoringMode: ContestScoringMode;
  icon: string;
  iconImageUrl: string | null;
  bannerTheme: ContestBannerTheme;
  bannerImageUrl: string | null;
  scoreboardVisibility: ContestScoreboardVisibility;
  participantAccessMode: ContestParticipantAccessMode;
  allowUpsolve: boolean;
  scheduleEnabled: boolean;
  startsAt: string;
  endsAt: string;
};

const DEFAULT_DRAFT: ContestDraft = {
  title: "",
  description: "",
  tags: [],
  tagInput: "",
  difficulty: "",
  visibility: "PUBLIC",
  joinCode: "",
  classId: "",
  scoringMode: "IOI",
  icon: "🏆",
  iconImageUrl: null,
  bannerTheme: "forest",
  bannerImageUrl: null,
  scoreboardVisibility: "LIVE",
  participantAccessMode: "SELF_REGISTRATION",
  allowUpsolve: true,
  scheduleEnabled: false,
  startsAt: "",
  endsAt: "",
};

const STEPS: Array<{ id: SetupStep; title: string; description: string }> = [
  { id: "details", title: "Про контест", description: "Назва, опис і теми" },
  { id: "access", title: "Доступ і правила", description: "Аудиторія та оцінювання" },
  { id: "schedule", title: "Розклад", description: "Дата старту та тривалість" },
];

const fieldClass = "mt-2 w-full rounded-xl border border-[#18271c]/14 bg-white px-4 py-3 text-sm text-[#1e2d22] outline-none transition placeholder:text-[#94a097] focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#0d1510] dark:text-[#edf3ef]";
const cardClass = "rounded-2xl border border-[#18271c]/10 bg-white p-4 text-left transition hover:border-[#16834d]/35 hover:bg-[#f8fbf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#111b14] dark:hover:bg-white/[.045]";

function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function endAfter(start: string, minutes: number): string {
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) return "";
  return localDateTimeValue(new Date(parsed.getTime() + minutes * 60_000));
}

function displayDate(value: string): string {
  if (!value) return "Не заплановано";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Перевір дату"
    : new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getDraftStorageKey(scope: string): string {
  return `studycod:contest-setup:${scope}`;
}

function readSavedDraft(scope: string): ContestDraft | null {
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContestDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...DEFAULT_DRAFT,
      ...parsed,
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8) : [],
      // Invite codes are deliberately excluded from browser persistence.
      joinCode: "",
    };
  } catch {
    return null;
  }
}

function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = new Uint8Array(8);
  window.crypto.getRandomValues(values);
  return `SC-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

export function ContestSetupDialog({
  scope,
  onClose,
  onCreated,
}: {
  scope: string;
  onClose: () => void;
  onCreated: (contestId: number, openAccounts: boolean) => void;
}) {
  const storageKey = React.useMemo(() => getDraftStorageKey(scope), [scope]);
  const [initial] = React.useState(() => readSavedDraft(scope));
  const [draft, setDraft] = React.useState<ContestDraft>(() => initial ?? DEFAULT_DRAFT);
  const [step, setStep] = React.useState<SetupStep>("details");
  const [stepError, setStepError] = React.useState("");
  const [fieldError, setFieldError] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [classesLoading, setClassesLoading] = React.useState(false);
  const [classesError, setClassesError] = React.useState("");
  const [classesLoaded, setClassesLoaded] = React.useState(false);
  const [classesRetry, setClassesRetry] = React.useState(0);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [iconUploading, setIconUploading] = React.useState(false);
  const [bannerUploading, setBannerUploading] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);
  const closeRef = React.useRef(onClose);
  const creatingRef = React.useRef(creating);
  const uploadingRef = React.useRef(false);
  const restored = Boolean(initial);
  closeRef.current = onClose;
  creatingRef.current = creating;
  uploadingRef.current = iconUploading || bannerUploading;

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creatingRef.current && !uploadingRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      restoreFocus?.focus();
    };
  }, []);

  React.useEffect(() => {
    const { joinCode: _privateCode, ...safeDraft } = draft;
    const hasContent = Boolean(
      safeDraft.title.trim() || safeDraft.description.trim() || safeDraft.tags.length ||
      safeDraft.difficulty || safeDraft.visibility !== "PUBLIC" || safeDraft.classId ||
      safeDraft.scheduleEnabled || safeDraft.startsAt || safeDraft.endsAt ||
      safeDraft.scoringMode !== "IOI" || !safeDraft.allowUpsolve ||
      safeDraft.icon !== "🏆" || Boolean(safeDraft.iconImageUrl) || safeDraft.bannerTheme !== "forest" || Boolean(safeDraft.bannerImageUrl) ||
      safeDraft.scoreboardVisibility !== "LIVE" || safeDraft.participantAccessMode !== "SELF_REGISTRATION",
    );
    try {
      if (hasContent) window.localStorage.setItem(storageKey, JSON.stringify(safeDraft));
      else window.localStorage.removeItem(storageKey);
    } catch {
      // The wizard remains usable when storage is unavailable.
    }
  }, [draft, storageKey]);

  React.useEffect(() => {
    if (draft.visibility !== "CLASS" || classesLoaded) return;
    let active = true;
    setClassesLoading(true);
    setClassesError("");
    getClasses()
      .then((items) => {
        if (active) {
          setClasses(Array.isArray(items) ? items : []);
          setClassesLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (active) setClassesError(getErrorMessageFromUnknown(error, "Не вдалося завантажити класи."));
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classesLoaded, classesRetry, draft.visibility]);

  const update = <K extends keyof ContestDraft>(key: K, value: ContestDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === "joinCode") setCopiedCode(false);
    setStepError("");
    setFieldError("");
  };

  const uploadBanner = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setFieldError("Додай PNG, JPG, WebP або AVIF до 8 МБ.");
      return;
    }
    setBannerUploading(true);
    setFieldError("");
    try {
      const uploaded = await uploadStatementImage(file);
      update("bannerImageUrl", uploaded.url);
    } catch (error: unknown) {
      setFieldError(getErrorMessageFromUnknown(error, "Не вдалося завантажити банер."));
    } finally {
      setBannerUploading(false);
    }
  };

  const uploadIconImage = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setFieldError("Додай PNG, JPG, WebP або AVIF до 8 МБ.");
      return;
    }
    setIconUploading(true);
    setFieldError("");
    try {
      const uploaded = await uploadStatementImage(file);
      update("iconImageUrl", uploaded.url);
    } catch (error: unknown) {
      setFieldError(getErrorMessageFromUnknown(error, "Не вдалося завантажити іконку."));
    } finally {
      setIconUploading(false);
    }
  };

  const addTag = (raw: string) => {
    const candidates = raw.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (!candidates.length) return;
    const additions: string[] = [];
    let error = "";
    for (const candidate of candidates) {
      if (candidate.length > 32) {
        error = "Тема має містити не більше 32 символів.";
        continue;
      }
      const duplicate = [...draft.tags, ...additions].some((tag) => tag.toLowerCase() === candidate.toLowerCase());
      if (duplicate) continue;
      if (draft.tags.length + additions.length >= 8) {
        error = "Можна додати до 8 тем.";
        break;
      }
      additions.push(candidate);
    }
    setDraft((current) => ({ ...current, tags: [...current.tags, ...additions], tagInput: "" }));
    setStepError("");
    setFieldError(error);
  };

  const choosePreset = (preset: "practice" | "icpc" | "classroom") => {
    setDraft((current) => ({
      ...current,
      visibility: preset === "classroom" ? "CLASS" : "PUBLIC",
      scoringMode: preset === "icpc" ? "ICPC" : "IOI",
      allowUpsolve: preset !== "icpc",
    }));
    setStepError("");
    setFieldError("");
  };

  const copyInviteCode = async () => {
    if (!draft.joinCode) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(draft.joinCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1500);
    } catch {
      setFieldError("Не вдалося скопіювати код. Виділи його та скопіюй вручну.");
    }
  };

  const setScheduleStart = (value: string) => {
    const currentEnd = draft.startsAt && draft.endsAt
      ? Math.round((new Date(draft.endsAt).getTime() - new Date(draft.startsAt).getTime()) / 60_000)
      : 120;
    setDraft((current) => ({
      ...current,
      scheduleEnabled: true,
      startsAt: value,
      endsAt: currentEnd > 0 ? endAfter(value, currentEnd) : current.endsAt,
    }));
    setStepError("");
  };

  const setDuration = (minutes: number) => {
    const startsAt = draft.startsAt || localDateTimeValue(new Date(Date.now() + 5 * 60_000));
    setDraft((current) => ({
      ...current,
      scheduleEnabled: true,
      startsAt,
      endsAt: endAfter(startsAt, minutes),
    }));
    setStepError("");
  };

  const validateStep = (target: SetupStep): boolean => {
    if (target === "details") {
      if (draft.title.trim().length < 3) {
        setFieldError("Назва має містити щонайменше 3 символи.");
        titleRef.current?.focus();
        return false;
      }
      if (draft.title.trim().length > 255) {
        setFieldError("Назва має містити не більше 255 символів.");
        titleRef.current?.focus();
        return false;
      }
      if (draft.tags.length > 8 || draft.tags.some((tag) => tag.length > 32)) {
        setFieldError("Перевір теми: до 8 штук, кожна до 32 символів.");
        return false;
      }
    }
    if (target === "access") {
      if (draft.visibility === "PRIVATE_CODE" && draft.joinCode.trim().length < 4) {
        setFieldError("Код-запрошення має містити щонайменше 4 символи.");
        return false;
      }
      if (draft.visibility === "PRIVATE_CODE" && draft.joinCode.trim().length > 64) {
        setFieldError("Код-запрошення має містити не більше 64 символів.");
        return false;
      }
      if (draft.visibility === "CLASS" && !draft.classId) {
        setFieldError("Оберіть клас, для якого створюється контест.");
        return false;
      }
    }
    if (target === "schedule" && draft.scheduleEnabled) {
      if (!draft.startsAt || !draft.endsAt) {
        setFieldError("Вкажіть початок і завершення або вимкніть розклад.");
        return false;
      }
      const startsAt = new Date(draft.startsAt);
      const endsAt = new Date(draft.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        setFieldError("Час завершення має бути пізніше за початок.");
        return false;
      }
    }
    if (target === "schedule" && draft.scoreboardVisibility === "AFTER_END" && !draft.scheduleEnabled) {
      setFieldError("Щоб відкрити таблицю після завершення, задай час фінішу в розкладі.");
      return false;
    }
    setFieldError("");
    return true;
  };

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;
    if (step !== "schedule") {
      if (!validateStep(step)) return;
      setStep(STEPS[stepIndex + 1].id);
      return;
    }
    for (const currentStep of STEPS) {
      if (!validateStep(currentStep.id)) {
        setStep(currentStep.id);
        setStepError("Перевір налаштування перед створенням.");
        return;
      }
    }
    setCreating(true);
    setStepError("");
    try {
      const result = await createContest({
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        tags: draft.tags,
        difficulty: draft.difficulty || null,
        visibility: draft.visibility,
        ...(draft.visibility === "PRIVATE_CODE" ? { joinCode: draft.joinCode.trim() } : {}),
        ...(draft.visibility === "CLASS" ? { classId: Number(draft.classId) } : {}),
        ...(draft.scheduleEnabled ? {
          startsAt: new Date(draft.startsAt).toISOString(),
          endsAt: new Date(draft.endsAt).toISOString(),
        } : {}),
        isPublished: false,
        allowUpsolve: draft.allowUpsolve,
        scoringMode: draft.scoringMode,
        icon: draft.icon,
        iconImageUrl: draft.iconImageUrl,
        bannerTheme: draft.bannerTheme,
        bannerImageUrl: draft.bannerImageUrl,
        scoreboardVisibility: draft.scoreboardVisibility,
        participantAccessMode: draft.participantAccessMode,
      });
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore unavailable storage */ }
      onCreated(result.id, draft.participantAccessMode === "ISSUED_ACCOUNTS");
    } catch (error: unknown) {
      setStepError(getErrorMessageFromUnknown(error, "Не вдалося створити чернетку контесту."));
    } finally {
      setCreating(false);
    }
  };

  const classId = Number(draft.classId);
  const selectedClass = classes.find((item) => item.id === classId);
  const scheduleDuration = draft.startsAt && draft.endsAt
    ? Math.round((new Date(draft.endsAt).getTime() - new Date(draft.startsAt).getTime()) / 60_000)
    : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "локальний час";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#071009]/60 p-2 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating && !iconUploading && !bannerUploading) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contest-setup-title"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[28px] border border-white/50 bg-[#fbfcfa] shadow-[0_32px_120px_rgba(0,0,0,.35)] dark:border-white/10 dark:bg-[#101a13] sm:max-h-[calc(100dvh-2rem)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#19291d]/10 px-5 py-4 dark:border-white/10 sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e8f8ee] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]"><Trophy aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#16834d] dark:text-[#72edb0]">Налаштування контесту</p>
              <h2 id="contest-setup-title" className="mt-0.5 truncate text-lg font-bold tracking-tight text-[#162219] dark:text-[#f0f5f1] sm:text-xl">Збери свій формат</h2>
            </div>
            <span className="hidden rounded-full bg-[#f0f5f1] px-3 py-1 text-xs font-semibold text-[#607067] dark:bg-white/[.06] dark:text-[#a9b7ad] sm:inline-flex">{restored ? "Чернетку відновлено" : "Автозбереження увімкнено"}</span>
          </div>
          <button type="button" onClick={onClose} disabled={creating || iconUploading || bannerUploading} aria-label="Закрити налаштування контесту" className="grid size-10 shrink-0 place-items-center rounded-xl text-[#6d7a70] transition hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] disabled:opacity-50 dark:text-[#a9b7ad] dark:hover:bg-white/[.07]"><X aria-hidden="true" className="size-5" /></button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)]">
            <nav aria-label="Кроки створення контесту" className="flex shrink-0 gap-2 overflow-x-auto border-b border-[#19291d]/10 px-4 py-3 dark:border-white/10 lg:block lg:space-y-2 lg:overflow-visible lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
              {STEPS.map((item, index) => {
                const active = step === item.id;
                const done = index < stepIndex;
                return (
                  <button key={item.id} type="button" onClick={() => { setStep(item.id); setStepError(""); setFieldError(""); }} aria-current={active ? "step" : undefined} className={`flex min-w-[190px] flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] lg:w-full ${active ? "bg-[#153321] text-white dark:bg-[#00d978] dark:text-[#062211]" : "text-[#627168] hover:bg-[#eff5ef] dark:text-[#a9b7ad] dark:hover:bg-white/[.05]"}`}>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${active ? "bg-white/15 dark:bg-black/10" : done ? "bg-[#e0f7e8] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-[#edf1ed] text-[#6d7a70] dark:bg-white/[.07] dark:text-[#a9b7ad]"}`}>{done ? <Check aria-hidden="true" className="size-4" /> : `0${index + 1}`}</span>
                    <span className="min-w-0"><span className="block text-sm font-bold">{item.title}</span><span className={`mt-0.5 hidden text-xs lg:block ${active ? "text-white/70 dark:text-[#12351f]/75" : "text-[#849087] dark:text-[#8d9c91]"}`}>{item.description}</span></span>
                    <ChevronRight aria-hidden="true" className={`ml-auto hidden size-4 lg:block ${active ? "opacity-70" : "opacity-35"}`} />
                  </button>
                );
              })}
              <div className="mt-6 hidden rounded-2xl bg-[#f1f6f2] p-4 text-xs leading-5 text-[#69776d] dark:bg-white/[.04] dark:text-[#a9b7ad] lg:block">
                Чернетка зберігається в цьому браузері. Код-запрошення з міркувань безпеки не зберігається.
              </div>
            </nav>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
              {stepError && <div role="alert" aria-live="polite" className="mb-4 rounded-xl border border-[#d84848]/20 bg-[#fff1ef] px-4 py-3 text-sm font-semibold text-[#a93232] dark:bg-[#451d1a] dark:text-[#ffb0a6]">{stepError}</div>}
              {fieldError && <div role="alert" aria-live="polite" className="mb-4 rounded-xl border border-[#d84848]/20 bg-[#fff1ef] px-4 py-3 text-sm font-semibold text-[#a93232] dark:bg-[#451d1a] dark:text-[#ffb0a6]">{fieldError}</div>}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-w-0">
                  {step === "details" && <section aria-labelledby="contest-details-heading">
                    <div className="mb-5"><h3 id="contest-details-heading" className="text-xl font-bold tracking-tight text-[#162219] dark:text-[#f0f5f1]">Спочатку — ідея контесту</h3><p className="mt-1 text-sm leading-6 text-[#738076] dark:text-[#9eaca1]">Ця інформація допоможе учасникам швидко зрозуміти формат і рівень.</p></div>
                    <div className="space-y-4">
                      <label htmlFor="contest-setup-title-input" className="block text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Назва контесту <span className="text-[#b65151]">*</span>
                        <input ref={titleRef} id="contest-setup-title-input" name="title" autoComplete="off" maxLength={255} value={draft.title} onChange={(event) => update("title", event.target.value)} aria-invalid={Boolean(fieldError && draft.title.trim().length < 3)} className={fieldClass} placeholder="Наприклад, Весняний алгоритмічний спринт…" />
                        <span className="mt-1 flex justify-between text-xs font-normal text-[#819087] dark:text-[#8f9e93]"><span>Коротко й зрозуміло для учасників</span><span className="tabular-nums">{draft.title.length}/255</span></span>
                      </label>
                      <label htmlFor="contest-setup-description" className="block text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Опис
                        <textarea id="contest-setup-description" name="description" autoComplete="off" maxLength={50000} value={draft.description} onChange={(event) => update("description", event.target.value)} rows={4} className={`${fieldClass} min-h-28 resize-y leading-6`} placeholder="Що розв’язуватимуть? Для кого цей контест? Додай важливі деталі…" />
                        <span className="mt-1 block text-right text-xs font-normal tabular-nums text-[#819087] dark:text-[#8f9e93]">{draft.description.length}/50&nbsp;000</span>
                      </label>
                      <fieldset>
                        <legend className="text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Іконка</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {CONTEST_ICONS.map((icon) => <button key={icon} type="button" onClick={() => { update("iconImageUrl", null); update("icon", icon); }} aria-label={`Обрати іконку ${icon}`} aria-pressed={!draft.iconImageUrl && draft.icon === icon} className={`grid size-11 place-items-center rounded-xl border text-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] ${!draft.iconImageUrl && draft.icon === icon ? "border-[#16834d]/55 bg-[#e8f5ec] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/10" : "border-[#18271c]/10 hover:bg-[#f5f8f5] dark:border-white/10 dark:hover:bg-white/[.04]"}`}>{icon}</button>)}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {draft.iconImageUrl && <img src={draft.iconImageUrl} alt="" className="size-11 rounded-xl border border-[#18271c]/10 bg-white object-cover dark:border-white/10 dark:bg-white/[.05]" />}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#18271c]/10 px-3 py-2 text-sm font-semibold text-[#425146] transition hover:bg-white focus-within:ring-2 focus-within:ring-[#00c875] dark:border-white/10 dark:text-[#dce7df] dark:hover:bg-white/[.06]">
                            <ImagePlus aria-hidden="true" className="size-4" />{iconUploading ? "Завантажую іконку…" : draft.iconImageUrl ? "Замінити зображення" : "Завантажити зображення"}
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={iconUploading} onChange={(event) => { void uploadIconImage(event.target.files?.[0]); event.target.value = ""; }} />
                          </label>
                          {draft.iconImageUrl && <button type="button" onClick={() => update("iconImageUrl", null)} disabled={iconUploading} className="text-sm font-semibold text-[#69776d] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:text-[#a9b7ad]">Прибрати</button>}
                          <span className="text-xs text-[#819087] dark:text-[#8f9e93]">PNG, JPG, WebP або AVIF · до 8 МБ</span>
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Обкладинка</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {(Object.entries(CONTEST_BANNER_THEMES) as Array<[ContestBannerTheme, (typeof CONTEST_BANNER_THEMES)[ContestBannerTheme]]>).map(([theme, item]) => <button key={theme} type="button" onClick={() => update("bannerTheme", theme)} aria-pressed={draft.bannerTheme === theme} className={`h-14 rounded-xl border px-3 text-left text-xs font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] ${draft.bannerTheme === theme ? "ring-2 ring-[#00c875] ring-offset-2 dark:ring-offset-[#101a13]" : "border-white/20 opacity-80 hover:opacity-100"}`} style={{ background: item.background }}>{item.label}</button>)}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {draft.bannerImageUrl && <img src={draft.bannerImageUrl} alt="Попередній перегляд банера" className="h-14 w-28 rounded-xl border border-[#18271c]/10 object-cover dark:border-white/10" />}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#18271c]/10 px-3 py-2 text-sm font-semibold text-[#425146] transition hover:bg-white focus-within:ring-2 focus-within:ring-[#00c875] dark:border-white/10 dark:text-[#dce7df] dark:hover:bg-white/[.06]">
                            <ImagePlus aria-hidden="true" className="size-4" />{bannerUploading ? "Завантажую…" : draft.bannerImageUrl ? "Замінити банер" : "Додати зображення"}
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={bannerUploading} onChange={(event) => { void uploadBanner(event.target.files?.[0]); event.target.value = ""; }} />
                          </label>
                          {draft.bannerImageUrl && <button type="button" onClick={() => update("bannerImageUrl", null)} className="text-sm font-semibold text-[#69776d] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:text-[#a9b7ad]">Прибрати зображення</button>}
                          <span className="text-xs text-[#819087] dark:text-[#8f9e93]">PNG, JPG, WebP або AVIF · до 8 МБ</span>
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor="contest-setup-tag-input" className="block text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Теми й технології</label>
                        <div className="mt-2 flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-[#18271c]/14 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-[#00c875] dark:border-white/10 dark:bg-[#0d1510]">
                          {draft.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-[#e8f5ec] px-2.5 py-1.5 text-xs font-semibold text-[#21643d] dark:bg-[#00ff88]/10 dark:text-[#8deeb6]">{tag}<button type="button" onClick={() => update("tags", draft.tags.filter((item) => item !== tag))} aria-label={`Видалити тему ${tag}`} className="rounded p-0.5 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:hover:bg-white/10"><X aria-hidden="true" className="size-3.5" /></button></span>)}
                          <input id="contest-setup-tag-input" name="tags" autoComplete="off" value={draft.tagInput} onChange={(event) => update("tagInput", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(draft.tagInput); } else if (event.key === "Backspace" && !draft.tagInput && draft.tags.length) update("tags", draft.tags.slice(0, -1)); }} onBlur={() => { if (draft.tagInput.trim()) addTag(draft.tagInput); }} className="min-w-[160px] flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-[#94a097] focus-visible:ring-0 dark:text-[#edf3ef]" placeholder={draft.tags.length < 8 ? "Додай тему й натисни Enter…" : "Ліміт 8 тем"} aria-label="Додати тему" />
                          {draft.tags.length < 8 && <button type="button" onClick={() => addTag(draft.tagInput)} aria-label="Додати тему" className="grid size-8 shrink-0 place-items-center rounded-lg text-[#16834d] hover:bg-[#e8f5ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875]"><Plus aria-hidden="true" className="size-4" /></button>}
                        </div>
                        <p className="mt-1 text-xs text-[#819087] dark:text-[#8f9e93]">До 8 тем, наприклад: графи, Python, динамічне програмування.</p>
                      </div>
                      <fieldset>
                        <legend className="text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Рівень складності</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {([["", "Автовизначення"], ["EASY", "Початковий"], ["MEDIUM", "Середній"], ["HARD", "Складний"]] as Array<[ContestDifficulty, string]>).map(([value, label]) => <button key={value || "auto"} type="button" aria-pressed={draft.difficulty === value} onClick={() => update("difficulty", value)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] ${draft.difficulty === value ? "border-[#16834d]/45 bg-[#e8f5ec] text-[#21643d] dark:bg-[#00ff88]/10 dark:text-[#8deeb6]" : "border-[#18271c]/10 text-[#69776d] hover:bg-[#f5f8f5] dark:border-white/10 dark:text-[#a9b7ad] dark:hover:bg-white/[.04]"}`}>{label}</button>)}
                        </div>
                      </fieldset>
                    </div>
                  </section>}

                  {step === "access" && <section aria-labelledby="contest-access-heading">
                    <div className="mb-5"><h3 id="contest-access-heading" className="text-xl font-bold tracking-tight text-[#162219] dark:text-[#f0f5f1]">Кому і за якими правилами</h3><p className="mt-1 text-sm leading-6 text-[#738076] dark:text-[#9eaca1]">Зміни тип змагання в будь-який момент до створення.</p></div>
                    <div className="mb-5 rounded-2xl bg-[#f1f6f2] p-4 dark:bg-white/[.035]">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#738076] dark:text-[#9eaca1]">Швидкі шаблони</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => choosePreset("practice")} className="rounded-full border border-[#18271c]/10 bg-white px-3 py-2 text-xs font-semibold text-[#536257] transition hover:border-[#16834d]/35 hover:bg-[#edf5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#111b14] dark:text-[#b7c4ba] dark:hover:bg-white/[.06]">Тренувальний IOI</button>
                        <button type="button" onClick={() => choosePreset("icpc")} className="rounded-full border border-[#18271c]/10 bg-white px-3 py-2 text-xs font-semibold text-[#536257] transition hover:border-[#16834d]/35 hover:bg-[#edf5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#111b14] dark:text-[#b7c4ba] dark:hover:bg-white/[.06]">ICPC спринт</button>
                        <button type="button" onClick={() => choosePreset("classroom")} className="rounded-full border border-[#18271c]/10 bg-white px-3 py-2 text-xs font-semibold text-[#536257] transition hover:border-[#16834d]/35 hover:bg-[#edf5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#111b14] dark:text-[#b7c4ba] dark:hover:bg-white/[.06]">Контест для класу</button>
                      </div>
                      <p className="mt-2 text-xs text-[#819087] dark:text-[#8f9e93]">Шаблон задає доступ, оцінювання та дорішування — кожне поле можна змінити нижче.</p>
                    </div>
                    <div className="mb-5 grid gap-3 md:grid-cols-3">
                      <button type="button" onClick={() => update("visibility", "PUBLIC")} aria-pressed={draft.visibility === "PUBLIC"} className={`${cardClass} ${draft.visibility === "PUBLIC" ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><UsersRound aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">Відкритий</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Знайдуть у каталозі й зможуть зареєструватися.</span></button>
                      <button type="button" onClick={() => update("visibility", "PRIVATE_CODE")} aria-pressed={draft.visibility === "PRIVATE_CODE"} className={`${cardClass} ${draft.visibility === "PRIVATE_CODE" ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><LockKeyhole aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">За кодом</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Доступ лише для тих, хто має код-запрошення.</span></button>
                      <button type="button" onClick={() => update("visibility", "CLASS")} aria-pressed={draft.visibility === "CLASS"} className={`${cardClass} ${draft.visibility === "CLASS" ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><CalendarClock aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">Для класу</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Контест доступний учням обраного класу.</span></button>
                    </div>

                    {draft.visibility === "PRIVATE_CODE" && <div className="mb-5 rounded-2xl border border-[#18271c]/10 bg-[#f7faf7] p-4 dark:border-white/10 dark:bg-white/[.035]">
                      <label htmlFor="contest-setup-code" className="block text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Код-запрошення</label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input id="contest-setup-code" name="joinCode" autoComplete="off" spellCheck={false} maxLength={64} value={draft.joinCode} onChange={(event) => update("joinCode", event.target.value)} className={`${fieldClass} mt-0 font-mono uppercase tracking-wider`} placeholder="Наприклад, SPRING-26" />
                        <button type="button" onClick={() => update("joinCode", newInviteCode())} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#18271c]/10 px-4 py-3 text-sm font-semibold text-[#425146] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:text-[#dce7df] dark:hover:bg-white/[.06]"><Sparkles aria-hidden="true" className="size-4" />Згенерувати</button>
                        <button type="button" onClick={() => { void copyInviteCode(); }} disabled={!draft.joinCode} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#18271c]/10 px-4 py-3 text-sm font-semibold text-[#425146] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] disabled:opacity-45 dark:border-white/10 dark:text-[#dce7df] dark:hover:bg-white/[.06]"><Copy aria-hidden="true" className="size-4" />{copiedCode ? "Скопійовано" : "Копіювати"}</button>
                      </div>
                      <p className="mt-2 text-xs text-[#738076] dark:text-[#9eaca1]">4–64 символи. Код не потрапляє в каталог і не зберігається в автозбереженій чернетці.</p>
                    </div>}

                    {draft.visibility === "CLASS" && <div className="mb-5 rounded-2xl border border-[#18271c]/10 bg-[#f7faf7] p-4 dark:border-white/10 dark:bg-white/[.035]">
                      <label htmlFor="contest-setup-class" className="block text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Клас</label>
                      <select id="contest-setup-class" name="classId" value={draft.classId} onChange={(event) => update("classId", event.target.value)} className={fieldClass} disabled={classesLoading}>
                        <option value="">{classesLoading ? "Завантажую класи…" : "Оберіть клас"}</option>
                        {classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.studentsCount} учнів</option>)}
                      </select>
                      {classesError && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#a93232]"><p role="alert">{classesError}</p><button type="button" onClick={() => { setClassesError(""); setClassesLoaded(false); setClassesRetry((current) => current + 1); }} className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875]">Спробувати ще раз</button></div>}
                      {!classesLoading && classesLoaded && !classesError && classes.length === 0 && <p className="mt-2 text-xs text-[#738076] dark:text-[#9eaca1]">У профілі немає доступних класів. Спочатку створи клас у модулі «Освіта».</p>}
                      <p className="mt-2 text-xs text-[#738076] dark:text-[#9eaca1]">Учні класу побачать контест у своєму списку після публікації.</p>
                    </div>}

                    <fieldset>
                      <legend className="text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Реєстрація учасників</legend>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <button type="button" aria-pressed={draft.participantAccessMode === "SELF_REGISTRATION"} onClick={() => update("participantAccessMode", "SELF_REGISTRATION")} className={`${cardClass} ${draft.participantAccessMode === "SELF_REGISTRATION" ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><UsersRound aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">Самостійна реєстрація</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Учасники приєднуються через сторінку контесту.</span></button>
                        <button type="button" aria-pressed={draft.participantAccessMode === "ISSUED_ACCOUNTS"} onClick={() => update("participantAccessMode", "ISSUED_ACCOUNTS")} className={`${cardClass} ${draft.participantAccessMode === "ISSUED_ACCOUNTS" ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><LockKeyhole aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">Тимчасові акаунти</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Організатор додає список людей і видає окремі доступи.</span></button>
                      </div>
                      {draft.participantAccessMode === "ISSUED_ACCOUNTS" && <p className="mt-2 rounded-xl bg-[#f1f6f2] px-3 py-2 text-xs leading-5 text-[#69776d] dark:bg-white/[.04] dark:text-[#a9b7ad]">Після створення відкриється розділ акаунтів: завантаж XLSX, XLS, ODS, CSV чи TSV або встав список людей, перевір його й згенеруй доступи.</p>}
                    </fieldset>

                    <fieldset className="mt-5">
                      <legend className="text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Таблиця результатів</legend>
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        {([ ["LIVE", "Показувати одразу", "Учасники бачать поточний рейтинг."], ["AFTER_END", "Після завершення", "Відкривається після часу фінішу."], ["ORGANIZERS_ONLY", "Лише організаторам", "Прихована від учасників постійно."] ] as Array<[ContestScoreboardVisibility, string, string]>).map(([mode, label, description]) => <button key={mode} type="button" aria-pressed={draft.scoreboardVisibility === mode} onClick={() => update("scoreboardVisibility", mode)} className={`${cardClass} ${draft.scoreboardVisibility === mode ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><span className="block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">{label}</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">{description}</span></button>)}
                      </div>
                    </fieldset>

                    <fieldset className="mt-5">
                      <legend className="text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Модель оцінювання</legend>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {([["IOI", "Часткові бали · IOI", "Кожна задача дає бали за пройдені тести. Підходить для тренувань і олімпіад."], ["ICPC", "Розв’язання + штраф · ICPC", "Рейтинг за кількістю повністю розв’язаних задач і штрафним часом."]] as Array<[ContestScoringMode, string, string]>).map(([mode, label, description]) => <button key={mode} type="button" aria-pressed={draft.scoringMode === mode} onClick={() => update("scoringMode", mode)} className={`${cardClass} ${draft.scoringMode === mode ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><span className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-[#233329] dark:text-[#e5eee7]">{label}</span>{draft.scoringMode === mode && <Check aria-hidden="true" className="size-4 shrink-0 text-[#16834d]" />}</span><span className="mt-2 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">{description}</span></button>)}
                      </div>
                    </fieldset>
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#18271c]/10 px-4 py-3.5 text-sm dark:border-white/10">
                      <input type="checkbox" name="allowUpsolve" checked={draft.allowUpsolve} onChange={(event) => update("allowUpsolve", event.target.checked)} className="mt-0.5 size-4 accent-[#00b869]" />
                      <span><span className="block font-bold text-[#26352a] dark:text-[#e5eee7]">Дозволити дорішування після фінішу</span><span className="mt-1 block text-xs leading-5 font-normal text-[#738076] dark:text-[#9eaca1]">Після завершення можна надсилати розв’язки, але вони не змінюватимуть офіційний результат.</span></span>
                    </label>
                  </section>}

                  {step === "schedule" && <section aria-labelledby="contest-schedule-heading">
                    <div className="mb-5"><h3 id="contest-schedule-heading" className="text-xl font-bold tracking-tight text-[#162219] dark:text-[#f0f5f1]">Коли відбудеться контест?</h3><p className="mt-1 text-sm leading-6 text-[#738076] dark:text-[#9eaca1]">Можна залишити без дат, запустити одразу або задати точний час.</p></div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button type="button" aria-pressed={!draft.scheduleEnabled} onClick={() => { setDraft((current) => ({ ...current, scheduleEnabled: false })); setStepError(""); }} className={`${cardClass} ${!draft.scheduleEnabled ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><Clock3 aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">Без розкладу</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Контент доступний за правилами доступу одразу після публікації.</span></button>
                      <button type="button" aria-pressed={Boolean(draft.scheduleEnabled && draft.startsAt && new Date(draft.startsAt).getTime() <= Date.now() + 10 * 60_000)} onClick={() => { const start = localDateTimeValue(new Date(Date.now() + 5 * 60_000)); setScheduleStart(start); }} className={`${cardClass} ${draft.scheduleEnabled && draft.startsAt && new Date(draft.startsAt).getTime() <= Date.now() + 10 * 60_000 ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><Sparkles aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">Почати за 5 хв</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Підготуй задачі та запроси учасників.</span></button>
                      <button type="button" aria-pressed={draft.scheduleEnabled && Boolean(draft.startsAt) && new Date(draft.startsAt).getTime() > Date.now() + 10 * 60_000} onClick={() => { const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(18, 0, 0, 0); setScheduleStart(localDateTimeValue(start)); }} className={`${cardClass} ${draft.scheduleEnabled && draft.startsAt && new Date(draft.startsAt).getTime() > Date.now() + 10 * 60_000 ? "border-[#16834d]/55 bg-[#f0faf3] ring-1 ring-[#16834d]/25 dark:bg-[#00ff88]/[.07]" : ""}`}><CalendarClock aria-hidden="true" className="size-5 text-[#16834d] dark:text-[#72edb0]" /><span className="mt-3 block text-sm font-bold text-[#233329] dark:text-[#e5eee7]">Запланувати</span><span className="mt-1 block text-xs leading-5 text-[#738076] dark:text-[#9eaca1]">Обери дату, час і тривалість.</span></button>
                    </div>
                    {draft.scheduleEnabled && <div className="mt-5 rounded-2xl border border-[#18271c]/10 bg-[#f7faf7] p-4 dark:border-white/10 dark:bg-white/[.035] sm:p-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label htmlFor="contest-setup-starts-at" className="block text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Старт <span className="text-[#b65151">*</span><input id="contest-setup-starts-at" name="startsAt" type="datetime-local" value={draft.startsAt} onChange={(event) => setScheduleStart(event.target.value)} className={fieldClass} /></label>
                        <label htmlFor="contest-setup-ends-at" className="block text-sm font-bold text-[#26352a] dark:text-[#e5eee7]">Фініш <span className="text-[#b65151">*</span><input id="contest-setup-ends-at" name="endsAt" type="datetime-local" value={draft.endsAt} onChange={(event) => update("endsAt", event.target.value)} className={fieldClass} /></label>
                      </div>
                      <div className="mt-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-[#738076] dark:text-[#9eaca1]">Швидка тривалість</div>
                        <div className="mt-2 flex flex-wrap gap-2">{([[60, "1 год"], [90, "1,5 год"], [120, "2 год"], [180, "3 год"], [240, "4 год"]] as Array<[number, string]>).map(([minutes, label]) => <button key={minutes} type="button" aria-pressed={scheduleDuration === minutes} onClick={() => setDuration(minutes)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] ${scheduleDuration === minutes ? "border-[#16834d]/45 bg-[#e8f5ec] text-[#21643d] dark:bg-[#00ff88]/10 dark:text-[#8deeb6]" : "border-[#18271c]/10 bg-white text-[#536257] hover:border-[#16834d]/35 hover:bg-[#edf5ef] dark:border-white/10 dark:bg-[#111b14] dark:text-[#b7c4ba] dark:hover:bg-white/[.06]"}`}>{label}</button>)}<span className="self-center text-xs text-[#819087]">або задай час завершення вручну</span></div>
                      </div>
                      <p className="mt-4 text-xs text-[#738076] dark:text-[#9eaca1]">Час показано у часовому поясі <span className="font-semibold">{timeZone}</span>.</p>
                    </div>}
                    <div className="mt-5 rounded-2xl bg-[#f1f6f2] px-4 py-3 text-sm leading-6 text-[#5f6d63] dark:bg-white/[.04] dark:text-[#a9b7ad]"><span className="font-bold text-[#243329] dark:text-[#e5eee7]">Після створення:</span> зможеш додати задачі, переглянути таблицю та опублікувати чернетку, коли все буде готово.</div>
                  </section>}
                </div>

                <aside aria-label="Підсумок налаштувань" className="h-fit rounded-[22px] border border-[#18271c]/10 bg-[#f5f8f5] p-4 dark:border-white/10 dark:bg-white/[.035] xl:sticky xl:top-0">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#16834d] dark:text-[#72edb0]"><Sparkles aria-hidden="true" className="size-4" />Підсумок</div>
                  <div className="mt-3 overflow-hidden rounded-2xl p-4 text-white" style={{ background: draft.bannerImageUrl ? `linear-gradient(90deg, rgba(8, 22, 13, .78), rgba(8, 22, 13, .18)), url("${draft.bannerImageUrl}") center / cover` : CONTEST_BANNER_THEMES[draft.bannerTheme].background }}>
                    {draft.iconImageUrl ? <img src={draft.iconImageUrl} alt="" className="size-11 rounded-xl border border-white/20 object-cover shadow" /> : <div className="text-3xl" aria-hidden="true">{draft.icon}</div>}
                    <h3 className="mt-2 break-words text-lg font-bold leading-snug">{draft.title.trim() || "Назва твого контесту"}</h3>
                  </div>
                  <p className="mt-2 line-clamp-3 break-words text-sm leading-5 text-[#718075] dark:text-[#9eaca1]">{draft.description.trim() || "Короткий опис з’явиться тут."}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">{draft.tags.length ? draft.tags.map((tag) => <span key={tag} className="max-w-full truncate rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#66746a] dark:bg-white/[.06] dark:text-[#b7c4ba]">{tag}</span>) : <span className="text-xs text-[#8a968d]">Без тем</span>}</div>
                  <dl className="mt-4 space-y-3 border-t border-[#18271c]/10 pt-4 text-xs dark:border-white/10">
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#819087] dark:text-[#8f9e93]">Доступ</dt><dd className="text-right font-semibold text-[#38483c] dark:text-[#dce7df]">{draft.visibility === "PUBLIC" ? "Відкритий" : draft.visibility === "PRIVATE_CODE" ? "За кодом" : selectedClass?.name || (draft.classId ? `Клас #${draft.classId}` : "Клас не обрано")}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#819087] dark:text-[#8f9e93]">Оцінювання</dt><dd className="text-right font-semibold text-[#38483c] dark:text-[#dce7df]">{draft.scoringMode === "IOI" ? "Часткові бали · IOI" : "Розв’язання · ICPC"}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#819087] dark:text-[#8f9e93]">Реєстрація</dt><dd className="text-right font-semibold text-[#38483c] dark:text-[#dce7df]">{draft.participantAccessMode === "ISSUED_ACCOUNTS" ? "Тимчасові акаунти" : "Самостійна"}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#819087] dark:text-[#8f9e93]">Таблиця</dt><dd className="text-right font-semibold text-[#38483c] dark:text-[#dce7df]">{draft.scoreboardVisibility === "LIVE" ? "Одразу" : draft.scoreboardVisibility === "AFTER_END" ? "Після фінішу" : "Лише організаторам"}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#819087] dark:text-[#8f9e93]">Старт</dt><dd className="text-right font-semibold text-[#38483c] dark:text-[#dce7df]">{draft.scheduleEnabled ? displayDate(draft.startsAt) : "Без розкладу"}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#819087] dark:text-[#8f9e93]">Фініш</dt><dd className="text-right font-semibold text-[#38483c] dark:text-[#dce7df]">{draft.scheduleEnabled ? displayDate(draft.endsAt) : "Без розкладу"}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-[#819087] dark:text-[#8f9e93]">Дорішування</dt><dd className="text-right font-semibold text-[#38483c] dark:text-[#dce7df]">{draft.allowUpsolve ? "Дозволено" : "Вимкнено"}</dd></div>
                  </dl>
                </aside>
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-[#19291d]/10 bg-[#fbfcfa] px-4 py-3 dark:border-white/10 dark:bg-[#101a13] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="flex items-center gap-2">
              {stepIndex > 0 ? <button type="button" onClick={() => { setStep(STEPS[stepIndex - 1].id); setStepError(""); setFieldError(""); }} disabled={creating || iconUploading || bannerUploading} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#59675d] transition hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:text-[#b7c4ba] dark:hover:bg-white/[.06]"><ArrowLeft aria-hidden="true" className="size-4" />Назад</button> : <button type="button" onClick={onClose} disabled={creating || iconUploading || bannerUploading} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-[#59675d] transition hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:text-[#b7c4ba] dark:hover:bg-white/[.06]">Скасувати</button>}
              <span className="hidden text-xs text-[#819087] dark:text-[#8f9e93] sm:inline">Крок {stepIndex + 1} з {STEPS.length}</span>
            </div>
            <button type="submit" disabled={creating || iconUploading || bannerUploading || (step === "access" && draft.visibility === "CLASS" && (classesLoading || !classes.length))} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#153321] px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(20,67,40,.16)] transition hover:bg-[#214a31] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] disabled:cursor-wait disabled:opacity-60 dark:bg-[#00d978] dark:text-[#062211] dark:hover:bg-[#35ed94]">
              {creating ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />Створюю чернетку…</> : step === "schedule" ? <>Створити чернетку<ArrowRight aria-hidden="true" className="size-4" /></> : <>Далі<ArrowRight aria-hidden="true" className="size-4" /></>}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
