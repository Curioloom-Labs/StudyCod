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
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

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
  safetyAlertsEnabled: boolean;
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
  safetyAlertsEnabled: false,
  scheduleEnabled: false,
  startsAt: "",
  endsAt: "",
};

const STEPS: Array<{ id: SetupStep; title: string; description: string }> = [
  { id: "details", title: "Про контест", description: "Назва, опис і теми" },
  { id: "access", title: "Доступ і правила", description: "Аудиторія та оцінювання" },
  { id: "schedule", title: "Розклад", description: "Дата старту та тривалість" },
];

const fieldClass = "mt-2 w-full rounded-xl border border-border/14 bg-white px-4 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-base dark:text-text-primary";
const cardClass = "rounded-2xl border border-border/10 bg-white p-4 text-left transition hover:border-primary-strong/35 hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-surface dark:hover:bg-white/[.045]";

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
  if (!value) return tr("Не заплановано", "Not scheduled");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? tr("Перевір дату", "Check the date")
    : new Intl.DateTimeFormat(tr("uk-UA", "en-US"), { dateStyle: "medium", timeStyle: "short" }).format(date);
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
  useTranslation();
  const localizedSteps = STEPS.map((item) => ({
    ...item,
    title: item.id === "details" ? tr("Про контест", "About the contest") : item.id === "access" ? tr("Доступ і правила", "Access and rules") : tr("Розклад", "Schedule"),
    description: item.id === "details" ? tr("Назва, опис і теми", "Title, description, and topics") : item.id === "access" ? tr("Аудиторія та оцінювання", "Audience and scoring") : tr("Дата старту та тривалість", "Start date and duration"),
  }));
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
    const releaseScrollLock = lockBodyScroll();
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
      releaseScrollLock();
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
      safeDraft.safetyAlertsEnabled ||
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
        if (active) setClassesError(getErrorMessageFromUnknown(error, tr("Не вдалося завантажити класи.", "Could not load classes.")));
      })
      .finally(() => {
        if (active) setClassesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classesLoaded, classesRetry, draft.visibility]);

  const update = <K extends keyof ContestDraft>(key: K, value: ContestDraft[K]) => {
    if (key === "participantAccessMode" && value === "SELF_REGISTRATION" && draft.visibility === "TEMPORARY_ACCOUNTS") return;
    setDraft((current) => key === "visibility"
      ? {
          ...current,
          visibility: value as ContestVisibility,
          ...(value === "TEMPORARY_ACCOUNTS"
            ? { participantAccessMode: "ISSUED_ACCOUNTS" as const }
            : current.visibility === "TEMPORARY_ACCOUNTS"
              ? { participantAccessMode: "SELF_REGISTRATION" as const }
              : {}),
        }
      : { ...current, [key]: value });
    if (key === "joinCode") setCopiedCode(false);
    setStepError("");
    setFieldError("");
  };

  const uploadBanner = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setFieldError(tr("Додай PNG, JPG, WebP або AVIF до 8 МБ.", "Add a PNG, JPG, WebP, or AVIF image up to 8 MB."));
      return;
    }
    setBannerUploading(true);
    setFieldError("");
    try {
      const uploaded = await uploadStatementImage(file);
      update("bannerImageUrl", uploaded.url);
    } catch (error: unknown) {
      setFieldError(getErrorMessageFromUnknown(error, tr("Не вдалося завантажити банер.", "Could not upload banner.")));
    } finally {
      setBannerUploading(false);
    }
  };

  const uploadIconImage = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setFieldError(tr("Додай PNG, JPG, WebP або AVIF до 8 МБ.", "Add a PNG, JPG, WebP, or AVIF image up to 8 MB."));
      return;
    }
    setIconUploading(true);
    setFieldError("");
    try {
      const uploaded = await uploadStatementImage(file);
      update("iconImageUrl", uploaded.url);
    } catch (error: unknown) {
      setFieldError(getErrorMessageFromUnknown(error, tr("Не вдалося завантажити іконку.", "Could not upload icon.")));
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
        error = tr("Тема має містити не більше 32 символів.", "A topic can be up to 32 characters.");
        continue;
      }
      const duplicate = [...draft.tags, ...additions].some((tag) => tag.toLowerCase() === candidate.toLowerCase());
      if (duplicate) continue;
      if (draft.tags.length + additions.length >= 8) {
        error = tr("Можна додати до 8 тем.", "You can add up to 8 topics.");
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
      setFieldError(tr("Не вдалося скопіювати код. Виділи його та скопіюй вручну.", "Could not copy the code. Select it and copy it manually."));
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
        setFieldError(tr("Назва має містити щонайменше 3 символи.", "The title must be at least 3 characters long."));
        titleRef.current?.focus();
        return false;
      }
      if (draft.title.trim().length > 255) {
        setFieldError(tr("Назва має містити не більше 255 символів.", "The title can be up to 255 characters."));
        titleRef.current?.focus();
        return false;
      }
      if (draft.tags.length > 8 || draft.tags.some((tag) => tag.length > 32)) {
        setFieldError(tr("Перевір теми: до 8 штук, кожна до 32 символів.", "Check the topics: up to 8, each no longer than 32 characters."));
        return false;
      }
    }
    if (target === "access") {
      if (draft.visibility === "PRIVATE_CODE" && draft.joinCode.trim().length < 4) {
        setFieldError(tr("Код-запрошення має містити щонайменше 4 символи.", "The invite code must be at least 4 characters long."));
        return false;
      }
      if (draft.visibility === "PRIVATE_CODE" && draft.joinCode.trim().length > 64) {
        setFieldError(tr("Код-запрошення має містити не більше 64 символів.", "The invite code can be up to 64 characters."));
        return false;
      }
      if (draft.visibility === "CLASS" && !draft.classId) {
        setFieldError(tr("Оберіть клас, для якого створюється контест.", "Select the class for this contest."));
        return false;
      }
    }
    if (target === "schedule" && draft.scheduleEnabled) {
      if (!draft.startsAt || !draft.endsAt) {
        setFieldError(tr("Вкажіть початок і завершення або вимкніть розклад.", "Set both a start and end time, or turn off the schedule."));
        return false;
      }
      const startsAt = new Date(draft.startsAt);
      const endsAt = new Date(draft.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        setFieldError(tr("Час завершення має бути пізніше за початок.", "The end time must be after the start time."));
        return false;
      }
    }
    if (target === "schedule" && draft.scoreboardVisibility === "AFTER_END" && !draft.scheduleEnabled) {
      setFieldError(tr("Щоб відкрити таблицю після завершення, задай час фінішу в розкладі.", "Set an end time in the schedule to release the scoreboard after the contest."));
      return false;
    }
    setFieldError("");
    return true;
  };

  const stepIndex = localizedSteps.findIndex((item) => item.id === step);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;
    if (step !== "schedule") {
      if (!validateStep(step)) return;
      setStep(localizedSteps[stepIndex + 1].id);
      return;
    }
    for (const currentStep of localizedSteps) {
      if (!validateStep(currentStep.id)) {
        setStep(currentStep.id);
        setStepError(tr("Перевір налаштування перед створенням.", "Review the settings before creating the contest."));
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
        safetyAlertsEnabled: draft.safetyAlertsEnabled,
        scoringMode: draft.scoringMode,
        icon: draft.icon,
        iconImageUrl: draft.iconImageUrl,
        bannerTheme: draft.bannerTheme,
        bannerImageUrl: draft.bannerImageUrl,
        scoreboardVisibility: draft.scoreboardVisibility,
        participantAccessMode: draft.visibility === "TEMPORARY_ACCOUNTS" ? "ISSUED_ACCOUNTS" : draft.participantAccessMode,
      });
      try { window.localStorage.removeItem(storageKey); } catch { /* ignore unavailable storage */ }
      onCreated(result.id, draft.participantAccessMode === "ISSUED_ACCOUNTS");
    } catch (error: unknown) {
      setStepError(getErrorMessageFromUnknown(error, tr("Не вдалося створити чернетку контесту.", "Could not create contest draft.")));
    } finally {
      setCreating(false);
    }
  };

  const classId = Number(draft.classId);
  const selectedClass = classes.find((item) => item.id === classId);
  const scheduleDuration = draft.startsAt && draft.endsAt
    ? Math.round((new Date(draft.endsAt).getTime() - new Date(draft.startsAt).getTime()) / 60_000)
    : null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || tr("локальний час", "local time");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-bg-code/60 p-2 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating && !iconUploading && !bannerUploading) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contest-setup-title"
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[28px] border border-white/50 bg-bg-surface shadow-[0_32px_120px_rgba(0,0,0,.35)] dark:border-white/10 dark:bg-bg-code sm:max-h-[calc(100dvh-2rem)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/10 px-5 py-4 dark:border-white/10 sm:px-7 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg-hover text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><Trophy aria-hidden="true" className="size-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">{tr("Налаштування контесту", "Contest setup")}</p>
              <h2 id="contest-setup-title" className="mt-0.5 truncate text-lg font-bold tracking-tight text-text-primary dark:text-text-primary sm:text-xl">{tr("Збери свій формат", "Build your format")}</h2>
            </div>
            <span className="hidden rounded-full bg-bg-hover px-3 py-1 text-xs font-semibold text-text-muted dark:bg-white/[.06] dark:text-text-secondary sm:inline-flex">{restored ? tr("Чернетку відновлено", "Draft restored") : tr("Автозбереження увімкнено", "Autosave is on")}</span>
          </div>
          <button type="button" onClick={onClose} disabled={creating || iconUploading || bannerUploading} aria-label={tr("Закрити налаштування контесту", "Close contest setup")} className="grid size-10 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 dark:text-text-secondary dark:hover:bg-white/[.07]"><X aria-hidden="true" className="size-5" /></button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)]">
            <nav aria-label={tr("Кроки створення контесту", "Contest setup steps")} className="flex shrink-0 gap-2 overflow-x-auto border-b border-border/10 px-4 py-3 dark:border-white/10 lg:block lg:space-y-2 lg:overflow-visible lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
              {localizedSteps.map((item, index) => {
                const active = step === item.id;
                const done = index < stepIndex;
                return (
                  <button key={item.id} type="button" onClick={() => { setStep(item.id); setStepError(""); setFieldError(""); }} aria-current={active ? "step" : undefined} className={`flex min-w-[190px] flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:w-full ${active ? "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground" : "text-text-muted hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-white/[.05]"}`}>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${active ? "bg-white/15 dark:bg-black/10" : done ? "bg-[var(--surface-primary)] text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-bg-hover text-text-muted dark:bg-white/[.07] dark:text-text-secondary"}`}>{done ? <Check aria-hidden="true" className="size-4" /> : `0${index + 1}`}</span>
                    <span className="min-w-0"><span className="block text-sm font-bold">{item.title}</span><span className={`mt-0.5 hidden text-xs lg:block ${active ? "text-white/70 dark:text-text-primary/75" : "text-text-muted dark:text-text-muted"}`}>{item.description}</span></span>
                    <ChevronRight aria-hidden="true" className={`ml-auto hidden size-4 lg:block ${active ? "opacity-70" : "opacity-35"}`} />
                  </button>
                );
              })}
              <div className="mt-6 hidden rounded-2xl bg-bg-surface p-4 text-xs leading-5 text-text-muted dark:bg-white/[.04] dark:text-text-secondary lg:block">
                {tr("Чернетка зберігається в цьому браузері. Код-запрошення з міркувань безпеки не зберігається.", "The draft is saved in this browser. For security, the invite code is not saved.")}
              </div>
            </nav>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
              {stepError && <div role="alert" aria-live="polite" className="mb-4 rounded-xl border border-accent-error/20 bg-bg-hover px-4 py-3 text-sm font-semibold text-accent-error dark:bg-[var(--surface-error)] dark:text-accent-error">{stepError}</div>}
              {fieldError && <div role="alert" aria-live="polite" className="mb-4 rounded-xl border border-accent-error/20 bg-bg-hover px-4 py-3 text-sm font-semibold text-accent-error dark:bg-[var(--surface-error)] dark:text-accent-error">{fieldError}</div>}

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-w-0">
                  {step === "details" && <section aria-labelledby="contest-details-heading">
                    <div className="mb-5"><h3 id="contest-details-heading" className="text-xl font-bold tracking-tight text-text-primary dark:text-text-primary">{tr("Спочатку — ідея контесту", "Start with the contest idea")}</h3><p className="mt-1 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Ця інформація допоможе учасникам швидко зрозуміти формат і рівень.", "This helps participants quickly understand the format and difficulty.")}</p></div>
                    <div className="space-y-4">
                      <label htmlFor="contest-setup-title-input" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Назва контесту", "Contest title")} <span className="text-[#b65151">*</span>
                        <input ref={titleRef} id="contest-setup-title-input" name="title" autoComplete="off" maxLength={255} value={draft.title} onChange={(event) => update("title", event.target.value)} aria-invalid={Boolean(fieldError && draft.title.trim().length < 3)} className={fieldClass} placeholder={tr("Наприклад, Весняний алгоритмічний спринт…", "For example, Spring algorithm sprint…")} />
                        <span className="mt-1 flex justify-between text-xs font-normal text-text-muted dark:text-text-muted"><span>{tr("Коротко й зрозуміло для учасників", "Keep it short and clear for participants")}</span><span className="tabular-nums">{draft.title.length}/255</span></span>
                      </label>
                      <label htmlFor="contest-setup-description" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Опис", "Description")}
                        <textarea id="contest-setup-description" name="description" autoComplete="off" maxLength={50000} value={draft.description} onChange={(event) => update("description", event.target.value)} rows={4} className={`${fieldClass} min-h-28 resize-y leading-6`} placeholder={tr("Що розв’язуватимуть? Для кого цей контест? Додай важливі деталі…", "What will participants solve? Who is this contest for? Add any details…")} />
                        <span className="mt-1 block text-right text-xs font-normal tabular-nums text-text-muted dark:text-text-muted">{draft.description.length}/50&nbsp;000</span>
                      </label>
                      <fieldset>
                      <legend className="text-sm font-bold text-text-primary dark:text-text-primary">{tr("Іконка", "Icon")}</legend>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {CONTEST_ICONS.map((icon) => <button key={icon} type="button" onClick={() => { update("iconImageUrl", null); update("icon", icon); }} aria-label={tr(`Обрати іконку ${icon}`, `Choose icon ${icon}`)} aria-pressed={!draft.iconImageUrl && draft.icon === icon} className={`grid size-11 place-items-center rounded-xl border text-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${!draft.iconImageUrl && draft.icon === icon ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/10" : "border-border/10 hover:bg-bg-hover dark:border-white/10 dark:hover:bg-white/[.04]"}`}>{icon}</button>)}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {draft.iconImageUrl && <img src={draft.iconImageUrl} alt="" className="size-11 rounded-xl border border-border/10 bg-white object-cover dark:border-white/10 dark:bg-white/[.05]" />}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/10 px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-white focus-within:ring-2 focus-within:ring-primary dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.06]">
                            <ImagePlus aria-hidden="true" className="size-4" />{iconUploading ? tr("Завантажую іконку…", "Uploading icon…") : draft.iconImageUrl ? tr("Замінити зображення", "Replace image") : tr("Завантажити зображення", "Upload image")}
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={iconUploading} onChange={(event) => { void uploadIconImage(event.target.files?.[0]); event.target.value = ""; }} />
                          </label>
                          {draft.iconImageUrl && <button type="button" onClick={() => update("iconImageUrl", null)} disabled={iconUploading} className="text-sm font-semibold text-text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-text-secondary">{tr("Прибрати", "Remove")}</button>}
                          <span className="text-xs text-text-muted dark:text-text-muted">PNG, JPG, WebP {tr("або", "or")} AVIF · {tr("до", "up to")} 8 MB</span>
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="text-sm font-bold text-text-primary dark:text-text-primary">{tr("Обкладинка", "Cover image")}</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {(Object.entries(CONTEST_BANNER_THEMES) as Array<[ContestBannerTheme, (typeof CONTEST_BANNER_THEMES)[ContestBannerTheme]]>).map(([theme, item]) => <button key={theme} type="button" onClick={() => update("bannerTheme", theme)} aria-pressed={draft.bannerTheme === theme} className={`h-14 rounded-xl border px-3 text-left text-xs font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${draft.bannerTheme === theme ? "ring-2 ring-primary ring-offset-2 dark:ring-offset-[#101a13]" : "border-white/20 opacity-80 hover:opacity-100"}`} style={{ background: item.background }}>{item.label}</button>)}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {draft.bannerImageUrl && <img src={draft.bannerImageUrl} alt={tr("Попередній перегляд банера", "Banner preview")} className="h-14 w-28 rounded-xl border border-border/10 object-cover dark:border-white/10" />}
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border/10 px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-white focus-within:ring-2 focus-within:ring-primary dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.06]">
                            <ImagePlus aria-hidden="true" className="size-4" />{bannerUploading ? tr("Завантажую…", "Uploading…") : draft.bannerImageUrl ? tr("Замінити банер", "Replace banner") : tr("Додати зображення", "Add image")}
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/avif" className="sr-only" disabled={bannerUploading} onChange={(event) => { void uploadBanner(event.target.files?.[0]); event.target.value = ""; }} />
                          </label>
                          {draft.bannerImageUrl && <button type="button" onClick={() => update("bannerImageUrl", null)} className="text-sm font-semibold text-text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-text-secondary">{tr("Прибрати зображення", "Remove image")}</button>}
                          <span className="text-xs text-text-muted dark:text-text-muted">PNG, JPG, WebP {tr("або", "or")} AVIF · {tr("до", "up to")} 8 MB</span>
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor="contest-setup-tag-input" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Теми й технології", "Topics and technologies")}</label>
                        <div className="mt-2 flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-border/14 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-primary dark:border-white/10 dark:bg-bg-base">
                    {draft.tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-bg-hover px-2.5 py-1.5 text-xs font-semibold text-text-muted dark:bg-primary/10 dark:text-primary-strong">{tag}<button type="button" onClick={() => update("tags", draft.tags.filter((item) => item !== tag))} aria-label={tr(`Видалити тему ${tag}`, `Remove topic ${tag}`)} className="rounded p-0.5 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10"><X aria-hidden="true" className="size-3.5" /></button></span>)}
                          <input id="contest-setup-tag-input" name="tags" autoComplete="off" value={draft.tagInput} onChange={(event) => update("tagInput", event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(draft.tagInput); } else if (event.key === "Backspace" && !draft.tagInput && draft.tags.length) update("tags", draft.tags.slice(0, -1)); }} onBlur={() => { if (draft.tagInput.trim()) addTag(draft.tagInput); }} className="min-w-[160px] flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-text-secondary focus-visible:ring-0 dark:text-text-primary" placeholder={draft.tags.length < 8 ? tr("Додай тему й натисни Enter…", "Add a topic and press Enter…") : tr("Ліміт 8 тем", "8-topic limit reached")} aria-label={tr("Додати тему", "Add topic")} />
                          {draft.tags.length < 8 && <button type="button" onClick={() => addTag(draft.tagInput)} aria-label={tr("Додати тему", "Add topic")} className="grid size-8 shrink-0 place-items-center rounded-lg text-primary-strong hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus aria-hidden="true" className="size-4" /></button>}
                        </div>
                        <p className="mt-1 text-xs text-text-muted dark:text-text-muted">{tr("До 8 тем, наприклад: графи, Python, динамічне програмування.", "Up to 8 topics, for example: graphs, Python, dynamic programming.")}</p>
                      </div>
                      <fieldset>
                        <legend className="text-sm font-bold text-text-primary dark:text-text-primary">{tr("Рівень складності", "Difficulty")}</legend>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {([["", tr("Автовизначення", "Auto")], ["EASY", tr("Початковий", "Beginner")], ["MEDIUM", tr("Середній", "Intermediate")], ["HARD", tr("Складний", "Advanced")]] as Array<[ContestDifficulty, string]>).map(([value, label]) => <button key={value || "auto"} type="button" aria-pressed={draft.difficulty === value} onClick={() => update("difficulty", value)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${draft.difficulty === value ? "border-primary-strong/45 bg-bg-hover text-text-muted dark:bg-primary/10 dark:text-primary-strong" : "border-border/10 text-text-muted hover:bg-bg-hover dark:border-white/10 dark:text-text-secondary dark:hover:bg-white/[.04]"}`}>{label}</button>)}
                        </div>
                      </fieldset>
                    </div>
                  </section>}

                  {step === "access" && <section aria-labelledby="contest-access-heading">
                    <div className="mb-5"><h3 id="contest-access-heading" className="text-xl font-bold tracking-tight text-text-primary dark:text-text-primary">{tr("Кому і за якими правилами", "Audience and rules")}</h3><p className="mt-1 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Зміни тип змагання в будь-який момент до створення.", "You can change the contest type any time before creating it.")}</p></div>
                    <div className="mb-5 rounded-2xl bg-bg-surface p-4 dark:bg-white/[.035]">
                      <p className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-text-secondary">{tr("Швидкі шаблони", "Quick presets")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => choosePreset("practice")} className="rounded-full border border-border/10 bg-white px-3 py-2 text-xs font-semibold text-text-muted transition hover:border-primary-strong/35 hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-surface dark:text-text-secondary dark:hover:bg-white/[.06]">{tr("Тренувальний IOI", "IOI practice")}</button>
                        <button type="button" onClick={() => choosePreset("icpc")} className="rounded-full border border-border/10 bg-white px-3 py-2 text-xs font-semibold text-text-muted transition hover:border-primary-strong/35 hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-surface dark:text-text-secondary dark:hover:bg-white/[.06]">ICPC {tr("спринт", "sprint")}</button>
                        <button type="button" onClick={() => choosePreset("classroom")} className="rounded-full border border-border/10 bg-white px-3 py-2 text-xs font-semibold text-text-muted transition hover:border-primary-strong/35 hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-surface dark:text-text-secondary dark:hover:bg-white/[.06]">{tr("Контест для класу", "Classroom contest")}</button>
                      </div>
                      <p className="mt-2 text-xs text-text-muted dark:text-text-muted">{tr("Шаблон задає доступ, оцінювання та дорішування — кожне поле можна змінити нижче.", "A preset sets access, scoring, and upsolving. You can change every field below.")}</p>
                    </div>
                    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <button type="button" onClick={() => update("visibility", "PUBLIC")} aria-pressed={draft.visibility === "PUBLIC"} className={`${cardClass} ${draft.visibility === "PUBLIC" ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><UsersRound aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Відкритий", "Public")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Знайдуть у каталозі й зможуть зареєструватися.", "Listed in the catalog and open for registration.")}</span></button>
                      <button type="button" onClick={() => update("visibility", "PRIVATE_CODE")} aria-pressed={draft.visibility === "PRIVATE_CODE"} className={`${cardClass} ${draft.visibility === "PRIVATE_CODE" ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><LockKeyhole aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("За кодом", "Invite code")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Доступ лише для тих, хто має код-запрошення.", "Only people with an invite code can access it.")}</span></button>
                      <button type="button" onClick={() => update("visibility", "CLASS")} aria-pressed={draft.visibility === "CLASS"} className={`${cardClass} ${draft.visibility === "CLASS" ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><CalendarClock aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Для класу", "For a class")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Контест доступний учням обраного класу.", "The contest is available to students in the selected class.")}</span></button>
                      <button type="button" onClick={() => update("visibility", "TEMPORARY_ACCOUNTS")} aria-pressed={draft.visibility === "TEMPORARY_ACCOUNTS"} className={`${cardClass} ${draft.visibility === "TEMPORARY_ACCOUNTS" ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><LockKeyhole aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Лише тимчасовий доступ", "Temporary accounts only")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Вхід за даними, які організатор видає учасникам зі списку.", "Participants sign in with accounts issued by the organizer.")}</span></button>
                    </div>

                    {draft.visibility === "PRIVATE_CODE" && <div className="mb-5 rounded-2xl border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.035]">
                      <label htmlFor="contest-setup-code" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Код-запрошення", "Invite code")}</label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input id="contest-setup-code" name="joinCode" autoComplete="off" spellCheck={false} maxLength={64} value={draft.joinCode} onChange={(event) => update("joinCode", event.target.value)} className={`${fieldClass} mt-0 font-mono uppercase tracking-wider`} placeholder={tr("Наприклад, SPRING-26", "For example, SPRING-26")} />
                        <button type="button" onClick={() => update("joinCode", newInviteCode())} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border/10 px-4 py-3 text-sm font-semibold text-text-primary transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.06]"><Sparkles aria-hidden="true" className="size-4" />{tr("Згенерувати", "Generate")}</button>
                        <button type="button" onClick={() => { void copyInviteCode(); }} disabled={!draft.joinCode} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border/10 px-4 py-3 text-sm font-semibold text-text-primary transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-45 dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.06]"><Copy aria-hidden="true" className="size-4" />{copiedCode ? tr("Скопійовано", "Copied") : tr("Копіювати", "Copy")}</button>
                      </div>
                      <p className="mt-2 text-xs text-text-muted dark:text-text-secondary">{tr("4–64 символи. Код не потрапляє в каталог і не зберігається в автозбереженій чернетці.", "4–64 characters. The code is not listed in the catalog or saved in the autosaved draft.")}</p>
                    </div>}

                    {draft.visibility === "CLASS" && <div className="mb-5 rounded-2xl border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.035]">
                      <label htmlFor="contest-setup-class" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Клас", "Class")}</label>
                      <select id="contest-setup-class" name="classId" value={draft.classId} onChange={(event) => update("classId", event.target.value)} className={fieldClass} disabled={classesLoading}>
                        <option value="">{classesLoading ? tr("Завантажую класи…", "Loading classes…") : tr("Оберіть клас", "Select a class")}</option>
                        {classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {tr(`${item.studentsCount} учнів`, `${item.studentsCount} students`)}</option>)}
                      </select>
                      {classesError && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-accent-error"><p role="alert">{classesError}</p><button type="button" onClick={() => { setClassesError(""); setClassesLoaded(false); setClassesRetry((current) => current + 1); }} className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Спробувати ще раз", "Try again")}</button></div>}
                      {!classesLoading && classesLoaded && !classesError && classes.length === 0 && <p className="mt-2 text-xs text-text-muted dark:text-text-secondary">{tr("У профілі немає доступних класів. Спочатку створи клас у модулі «Освіта».", "There are no available classes in your profile. Create a class in the Education module first.")}</p>}
                      <p className="mt-2 text-xs text-text-muted dark:text-text-secondary">{tr("Учні класу побачать контест у своєму списку після публікації.", "Students in the class will see the contest in their list after it is published.")}</p>
                    </div>}

                    <fieldset>
                      <legend className="text-sm font-bold text-text-primary dark:text-text-primary">{tr("Реєстрація учасників", "Participant registration")}</legend>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <button type="button" disabled={draft.visibility === "TEMPORARY_ACCOUNTS"} aria-pressed={draft.participantAccessMode === "SELF_REGISTRATION"} onClick={() => update("participantAccessMode", "SELF_REGISTRATION")} className={`${cardClass} ${draft.participantAccessMode === "SELF_REGISTRATION" ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""} disabled:cursor-not-allowed disabled:opacity-50`}><UsersRound aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Самостійна реєстрація", "Self-registration")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Учасники приєднуються через сторінку контесту.", "Participants join from the contest page.")}</span></button>
                        <button type="button" aria-pressed={draft.participantAccessMode === "ISSUED_ACCOUNTS"} onClick={() => update("participantAccessMode", "ISSUED_ACCOUNTS")} className={`${cardClass} ${draft.participantAccessMode === "ISSUED_ACCOUNTS" ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><LockKeyhole aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Доступи від організатора", "Organizer-issued accounts")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Організатор додає список людей і видає кожному дані для входу.", "The organizer adds a participant list and issues login details to each person.")}</span></button>
                      </div>
                      {draft.participantAccessMode === "ISSUED_ACCOUNTS" && <p className="mt-2 rounded-xl bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted dark:bg-white/[.04] dark:text-text-secondary">{draft.visibility === "TEMPORARY_ACCOUNTS" ? tr("Після створення контест буде доступний лише учасникам із виданими даними для входу. Додай список у розділі «Учасники» та згенеруй доступи.", "After creation, only participants with issued login details can access the contest. Add a list in Participants and generate accounts.") : tr("Після створення відкриється огляд контесту з окремим переходом до списку учасників. Завантаж XLSX, XLS, ODS, CSV чи TSV або встав список людей, перевір його й згенеруй доступи.", "After creation, the contest overview will include a link to participants. Upload an XLSX, XLS, ODS, CSV, or TSV file, or paste a list of names to review and generate accounts.")}</p>}
                    </fieldset>

                    <fieldset className="mt-5">
                      <legend className="text-sm font-bold text-text-primary dark:text-text-primary">{tr("Таблиця результатів", "Scoreboard visibility")}</legend>
                      <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        {([ ["LIVE", tr("Показувати одразу", "Show immediately"), tr("Учасники бачать поточний рейтинг.", "Participants can see the live standings.")], ["AFTER_END", tr("Після завершення", "After the contest"), tr("Відкривається після часу фінішу.", "The scoreboard opens after the contest ends.")], ["ORGANIZERS_ONLY", tr("Лише організаторам", "Organizers only"), tr("Прихована від учасників постійно.", "Always hidden from participants.")] ] as Array<[ContestScoreboardVisibility, string, string]>).map(([mode, label, description]) => <button key={mode} type="button" aria-pressed={draft.scoreboardVisibility === mode} onClick={() => update("scoreboardVisibility", mode)} className={`${cardClass} ${draft.scoreboardVisibility === mode ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><span className="block text-sm font-bold text-text-primary dark:text-text-primary">{label}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{description}</span></button>)}
                      </div>
                    </fieldset>

                    <fieldset className="mt-5">
                      <legend className="text-sm font-bold text-text-primary dark:text-text-primary">{tr("Модель оцінювання", "Scoring model")}</legend>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {([["IOI", tr("Часткові бали · IOI", "Partial scores · IOI"), tr("Кожна задача дає бали за пройдені тести. Підходить для тренувань і олімпіад.", "Each problem awards points for passed tests. Suitable for practice and olympiads.")], ["ICPC", tr("Розв’язання + штраф · ICPC", "Solved problems + penalty · ICPC"), tr("Рейтинг за кількістю повністю розв’язаних задач і штрафним часом.", "Ranked by the number of fully solved problems and penalty time.")]] as Array<[ContestScoringMode, string, string]>).map(([mode, label, description]) => <button key={mode} type="button" aria-pressed={draft.scoringMode === mode} onClick={() => update("scoringMode", mode)} className={`${cardClass} ${draft.scoringMode === mode ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><span className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-text-primary dark:text-text-primary">{label}</span>{draft.scoringMode === mode && <Check aria-hidden="true" className="size-4 shrink-0 text-primary-strong" />}</span><span className="mt-2 block text-xs leading-5 text-text-muted dark:text-text-secondary">{description}</span></button>)}
                      </div>
                    </fieldset>
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border/10 px-4 py-3.5 text-sm dark:border-white/10">
                      <input type="checkbox" name="allowUpsolve" checked={draft.allowUpsolve} onChange={(event) => update("allowUpsolve", event.target.checked)} className="mt-0.5 size-4 accent-[#00b869]" />
                      <span><span className="block font-bold text-text-primary dark:text-text-primary">{tr("Дозволити дорішування після фінішу", "Allow solving after the contest")}</span><span className="mt-1 block text-xs leading-5 font-normal text-text-muted dark:text-text-secondary">{tr("Після завершення можна надсилати розв’язки, але вони не змінюватимуть офіційний результат.", "Participants can submit solutions after the contest ends, but they won't affect the official results.")}</span></span>
                    </label>
                  </section>}

                  {step === "schedule" && <section aria-labelledby="contest-schedule-heading">
                    <div className="mb-5"><h3 id="contest-schedule-heading" className="text-xl font-bold tracking-tight text-text-primary dark:text-text-primary">{tr("Коли відбудеться контест?", "When will the contest take place?")}</h3><p className="mt-1 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Можна залишити без дат, запустити одразу або задати точний час.", "Leave it unscheduled, start soon, or set an exact time.")}</p></div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button type="button" aria-pressed={!draft.scheduleEnabled} onClick={() => { setDraft((current) => ({ ...current, scheduleEnabled: false })); setStepError(""); }} className={`${cardClass} ${!draft.scheduleEnabled ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><Clock3 aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Без розкладу", "No schedule")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Контент доступний за правилами доступу одразу після публікації.", "Content becomes available according to its access settings as soon as it is published.")}</span></button>
                      <button type="button" aria-pressed={Boolean(draft.scheduleEnabled && draft.startsAt && new Date(draft.startsAt).getTime() <= Date.now() + 10 * 60_000)} onClick={() => { const start = localDateTimeValue(new Date(Date.now() + 5 * 60_000)); setScheduleStart(start); }} className={`${cardClass} ${draft.scheduleEnabled && draft.startsAt && new Date(draft.startsAt).getTime() <= Date.now() + 10 * 60_000 ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><Sparkles aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Почати за 5 хв", "Start in 5 minutes")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Підготуй задачі та запроси учасників.", "Prepare problems and invite participants.")}</span></button>
                      <button type="button" aria-pressed={draft.scheduleEnabled && Boolean(draft.startsAt) && new Date(draft.startsAt).getTime() > Date.now() + 10 * 60_000} onClick={() => { const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(18, 0, 0, 0); setScheduleStart(localDateTimeValue(start)); }} className={`${cardClass} ${draft.scheduleEnabled && draft.startsAt && new Date(draft.startsAt).getTime() > Date.now() + 10 * 60_000 ? "border-primary-strong/55 bg-bg-hover ring-1 ring-primary-strong/25 dark:bg-primary/[.07]" : ""}`}><CalendarClock aria-hidden="true" className="size-5 text-primary-strong dark:text-primary-soft" /><span className="mt-3 block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Запланувати", "Schedule")}</span><span className="mt-1 block text-xs leading-5 text-text-muted dark:text-text-secondary">{tr("Обери дату, час і тривалість.", "Choose a date, time, and duration.")}</span></button>
                    </div>
                    {draft.scheduleEnabled && <div className="mt-5 rounded-2xl border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.035] sm:p-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label htmlFor="contest-setup-starts-at" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Старт", "Start")} <span className="text-accent-error">*</span><input id="contest-setup-starts-at" name="startsAt" type="datetime-local" value={draft.startsAt} onChange={(event) => setScheduleStart(event.target.value)} className={fieldClass} /></label>
                        <label htmlFor="contest-setup-ends-at" className="block text-sm font-bold text-text-primary dark:text-text-primary">{tr("Фініш", "End")} <span className="text-accent-error">*</span><input id="contest-setup-ends-at" name="endsAt" type="datetime-local" value={draft.endsAt} onChange={(event) => update("endsAt", event.target.value)} className={fieldClass} /></label>
                      </div>
                      <div className="mt-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-text-muted dark:text-text-secondary">{tr("Швидка тривалість", "Quick duration")}</div>
                        <div className="mt-2 flex flex-wrap gap-2">{([[60, tr("1 год", "1 hour")], [90, tr("1,5 год", "1.5 hours")], [120, tr("2 год", "2 hours")], [180, tr("3 год", "3 hours")], [240, tr("4 год", "4 hours")]] as Array<[number, string]>).map(([minutes, label]) => <button key={minutes} type="button" aria-pressed={scheduleDuration === minutes} onClick={() => setDuration(minutes)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${scheduleDuration === minutes ? "border-primary-strong/45 bg-bg-hover text-text-muted dark:bg-primary/10 dark:text-primary-strong" : "border-border/10 bg-white text-text-muted hover:border-primary-strong/35 hover:bg-bg-hover dark:border-white/10 dark:bg-bg-surface dark:text-text-secondary dark:hover:bg-white/[.06]"}`}>{label}</button>)}<span className="self-center text-xs text-text-muted">{tr("або задай час завершення вручну", "or set the end time manually")}</span></div>
                      </div>
                      <p className="mt-4 text-xs text-text-muted dark:text-text-secondary">{tr("Час показано у часовому поясі", "Times are shown in the")} <span className="font-semibold">{timeZone}</span>.</p>
                    </div>}
                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border/10 px-4 py-3.5 text-sm dark:border-white/10">
                      <input type="checkbox" name="safetyAlertsEnabled" checked={draft.safetyAlertsEnabled} onChange={(event) => update("safetyAlertsEnabled", event.target.checked)} className="mt-0.5 size-4 accent-[#00b869]" />
                      <span><span className="block font-bold text-text-primary dark:text-text-primary">{tr("Попереджати про повітряні тривоги", "Warn participants about air raid alerts")}</span><span className="mt-1 block text-xs leading-5 font-normal text-text-muted dark:text-text-secondary">{tr("Перед стартом учасники вкажуть населений пункт. Під час тривоги контест призупиниться для тих, кому потрібно перейти в безпечне місце; використаний час буде додано їм індивідуально.", "Before the contest, participants choose their location. During an alert, anyone who needs to move to safety can pause; their pause time is added to their own contest time.")}</span></span>
                    </label>
                    <div className="mt-5 rounded-2xl bg-bg-surface px-4 py-3 text-sm leading-6 text-text-muted dark:bg-white/[.04] dark:text-text-secondary"><span className="font-bold text-text-primary dark:text-text-primary">{tr("Після створення:", "After creation:")}</span> {tr("зможеш додати задачі, переглянути таблицю та опублікувати чернетку, коли все буде готово.", "you can add problems, review the scoreboard, and publish the draft when everything is ready.")}</div>
                  </section>}
                </div>

                <aside aria-label={tr("Підсумок налаштувань", "Settings summary")} className="h-fit rounded-[22px] border border-border/10 bg-bg-hover p-4 dark:border-white/10 dark:bg-white/[.035] xl:sticky xl:top-0">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft"><Sparkles aria-hidden="true" className="size-4" />{tr("Підсумок", "Summary")}</div>
                  <div className="contest-banner-surface mt-3 overflow-hidden rounded-2xl p-4 text-white" style={{ background: draft.bannerImageUrl ? `linear-gradient(90deg, rgba(8, 22, 13, .78), rgba(8, 22, 13, .18)), url("${draft.bannerImageUrl}") center / cover` : CONTEST_BANNER_THEMES[draft.bannerTheme].background }}>
                    {draft.iconImageUrl ? <img src={draft.iconImageUrl} alt="" className="size-11 rounded-xl border border-white/20 object-cover shadow" /> : <div className="text-3xl" aria-hidden="true">{draft.icon}</div>}
                    <h3 className="mt-2 break-words text-lg font-bold leading-snug">{draft.title.trim() || tr("Назва твого контесту", "Your contest title")}</h3>
                  </div>
                  <p className="mt-2 line-clamp-3 break-words text-sm leading-5 text-text-muted dark:text-text-secondary">{draft.description.trim() || tr("Короткий опис з’явиться тут.", "A short description will appear here.")}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">{draft.tags.length ? draft.tags.map((tag) => <span key={tag} className="max-w-full truncate rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-text-muted dark:bg-white/[.06] dark:text-text-secondary">{tag}</span>) : <span className="text-xs text-text-muted">{tr("Без тем", "No topics")}</span>}</div>
                  <dl className="mt-4 space-y-3 border-t border-border/10 pt-4 text-xs dark:border-white/10">
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-text-muted dark:text-text-muted">{tr("Доступ", "Access")}</dt><dd className="text-right font-semibold text-text-primary dark:text-text-primary">{draft.visibility === "PUBLIC" ? tr("Відкритий", "Public") : draft.visibility === "PRIVATE_CODE" ? tr("За кодом", "By code") : draft.visibility === "TEMPORARY_ACCOUNTS" ? tr("Лише тимчасовий доступ", "Temporary accounts only") : selectedClass?.name || (draft.classId ? tr(`Клас #${draft.classId}`, `Class #${draft.classId}`) : tr("Клас не обрано", "No class selected"))}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-text-muted dark:text-text-muted">{tr("Оцінювання", "Scoring")}</dt><dd className="text-right font-semibold text-text-primary dark:text-text-primary">{draft.scoringMode === "IOI" ? tr("Часткові бали · IOI", "Partial scores · IOI") : tr("Розв’язання · ICPC", "Solved problems · ICPC")}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-text-muted dark:text-text-muted">{tr("Реєстрація", "Registration")}</dt><dd className="text-right font-semibold text-text-primary dark:text-text-primary">{draft.participantAccessMode === "ISSUED_ACCOUNTS" ? tr("Доступи від організатора", "Organizer-issued accounts") : tr("Самостійна", "Self-registration")}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-text-muted dark:text-text-muted">{tr("Таблиця", "Scoreboard")}</dt><dd className="text-right font-semibold text-text-primary dark:text-text-primary">{draft.scoreboardVisibility === "LIVE" ? tr("Одразу", "Immediately") : draft.scoreboardVisibility === "AFTER_END" ? tr("Після фінішу", "After the contest") : tr("Лише організаторам", "Organizers only")}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-text-muted dark:text-text-muted">{tr("Старт", "Start")}</dt><dd className="text-right font-semibold text-text-primary dark:text-text-primary">{draft.scheduleEnabled ? displayDate(draft.startsAt) : tr("Без розкладу", "No schedule")}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-text-muted dark:text-text-muted">{tr("Фініш", "End")}</dt><dd className="text-right font-semibold text-text-primary dark:text-text-primary">{draft.scheduleEnabled ? displayDate(draft.endsAt) : tr("Без розкладу", "No schedule")}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-text-muted dark:text-text-muted">{tr("Дорішування", "Upsolving")}</dt><dd className="text-right font-semibold text-text-primary dark:text-text-primary">{draft.allowUpsolve ? tr("Дозволено", "Allowed") : tr("Вимкнено", "Disabled")}</dd></div>
                  </dl>
                </aside>
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border/10 bg-bg-surface px-4 py-3 dark:border-white/10 dark:bg-bg-code sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="flex items-center gap-2">
              {stepIndex > 0 ? <button type="button" onClick={() => { setStep(localizedSteps[stepIndex - 1].id); setStepError(""); setFieldError(""); }} disabled={creating || iconUploading || bannerUploading} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-text-muted transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-text-secondary dark:hover:bg-white/[.06]"><ArrowLeft aria-hidden="true" className="size-4" />{tr("Назад", "Back")}</button> : <button type="button" onClick={onClose} disabled={creating || iconUploading || bannerUploading} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-text-muted transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-text-secondary dark:hover:bg-white/[.06]">{tr("Скасувати", "Cancel")}</button>}
              <span className="hidden text-xs text-text-muted dark:text-text-muted sm:inline">{tr(`Крок ${stepIndex + 1} з ${localizedSteps.length}`, `Step ${stepIndex + 1} of ${localizedSteps.length}`)}</span>
            </div>
            <button type="submit" disabled={creating || iconUploading || bannerUploading || (step === "access" && draft.visibility === "CLASS" && (classesLoading || !classes.length))} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgba(20,67,40,.16)] transition hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary-hover">
              {creating ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />{tr("Створюю чернетку…", "Creating draft…")}</> : step === "schedule" ? <>{tr("Створити чернетку", "Create draft")}<ArrowRight aria-hidden="true" className="size-4" /></> : <>{tr("Далі", "Next")}<ArrowRight aria-hidden="true" className="size-4" /></>}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
