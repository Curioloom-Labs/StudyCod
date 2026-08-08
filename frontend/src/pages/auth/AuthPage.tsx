import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Logo } from "../../components/Logo";
import { register, login, resendVerificationEmail, requestPasswordReset } from "../../lib/api/auth";
import { registerTeacher, studentLogin } from "../../lib/api/edu";
import type { User, CourseLanguage } from "../../types";
import { applyTheme, getCurrentTheme } from "../../theme";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { AlertCircle, ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2, Code2, Globe, GraduationCap, LoaderCircle, Lock, Mail, Moon, School, ShieldCheck, Sun, UserRound } from "lucide-react";

type Mode = "login" | "register";
type UserMode = "PERSONAL" | "EDUCATIONAL" | "CONTEST";
interface Props {
  onAuth: (user: User) => void;
  initialMode?: Mode;
  initialUserMode?: UserMode;
  showBackToLanding?: boolean;
}

type ApiValidationError = {
  path?: unknown;
  message?: unknown;
};

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileWidgetId = string | number;

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId;
  reset: (widgetId?: TurnstileWidgetId) => void;
  remove?: (widgetId?: TurnstileWidgetId) => void;
};

function buildApiUrl(path: string): string {
  const base = String(import.meta.env.VITE_API_URL || window.location.origin || "")
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  return `${base}/api${path.startsWith("/") ? path : `/${path}`}`;
}

function buildGoogleAuthUrl(userMode: UserMode, forRegistration = false): string {
  const mode = userMode === "EDUCATIONAL" ? "edu" : userMode.toLowerCase();
  const signupParam = forRegistration ? "&signup=1" : "";
  return buildApiUrl(`/auth/google?mode=${encodeURIComponent(mode)}${signupParam}`);
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function parseBoolEnv(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const GoogleMark: React.FC = () => (
  <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const SecurityCheckPanel = React.forwardRef<HTMLDivElement, {
  enabled: boolean;
  failed: boolean;
  scriptReady: boolean;
  tr: (uk: string, en: string) => string;
}>(({ enabled, failed, scriptReady, tr }, ref) => (
  <div className="overflow-hidden rounded-[18px] border border-[#122017]/10 bg-white shadow-[0_10px_28px_rgba(18,32,23,.045)] dark:border-white/10 dark:bg-[#121814] dark:shadow-[0_10px_28px_rgba(0,0,0,.2)]">
    <div className="flex items-center justify-between border-b border-[#122017]/10 px-4 py-3 dark:border-white/10">
      <div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-[10px] bg-[#00ff88]/12 text-[#00884a]"><ShieldCheck className="size-4" /></span><div><strong className="block text-[12px]">{tr("Перевірка безпеки", "Security check")}</strong><span className="text-[10px] text-[#7b877f] dark:text-[#7f8c84]">{tr("Захист від автоматичних запитів", "Protection from automated requests")}</span></div></div>
      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#7b877f] dark:text-[#87948b]"><span className={`size-1.5 rounded-full ${failed ? "bg-[#ff6b9d]" : "bg-[#00b963]"}`} />Cloudflare</span>
    </div>
    {!enabled ? (
      <div className="px-4 py-4 text-[11px] leading-5 text-[#7b877f] dark:text-[#8f9c93]">
        {tr("Захист Cloudflare буде активним на робочому домені.", "Cloudflare protection is enabled on the production domain.")}
      </div>
    ) : failed ? (
      <div className="flex items-start gap-3 px-4 py-4"><AlertCircle className="mt-0.5 size-4 shrink-0 text-[#ff6b9d]" /><div><strong className="text-[12px]">{tr("Перевірка зараз недоступна", "Verification is currently unavailable")}</strong><p className="mt-1 text-[11px] leading-5 text-[#7b877f] dark:text-[#8f9c93]">{tr("На робочому домені модуль відкриється тут автоматично. Локальне середовище може блокувати з’єднання з Cloudflare.", "On the production domain the check will appear here automatically. Local environments may block Cloudflare connections.")}</p></div></div>
    ) : (
      <div className="relative min-h-[88px] px-3 py-3">
        {!scriptReady && <div className="absolute inset-0 flex items-center justify-center gap-2 text-[11px] text-[#7b877f]"><LoaderCircle className="size-4 animate-spin text-[#00a85c]" />{tr("Готуємо безпечний вхід…", "Preparing secure sign-in…")}</div>}
        <div ref={ref} className={`mx-auto min-h-[65px] w-fit transition-opacity ${scriptReady ? "opacity-100" : "opacity-0"}`} />
      </div>
    )}
  </div>
));
SecurityCheckPanel.displayName = "SecurityCheckPanel";

export const AuthPage: React.FC<Props> = ({
  onAuth,
  initialMode,
  initialUserMode,
  showBackToLanding
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;

  const fieldInputClass = "h-12 w-full rounded-[14px] border border-[#122017]/10 bg-[#f7f8f5] px-4 text-[14px] text-[#111814] outline-none transition placeholder:text-[#8a948d] focus:border-[#00b963]/60 focus:bg-white focus:ring-4 focus:ring-[#00ff88]/10 dark:border-white/10 dark:bg-[#111713] dark:text-[#f4f7f4] dark:placeholder:text-[#718078] dark:focus:border-[#00e97c]/50 dark:focus:bg-[#151d17]";
  const fieldLabelClass = "mb-2 block text-[12px] font-bold text-[#4e5a52] dark:text-[#b4beb7]";
  const primaryButtonClass = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#00ff88] px-5 text-sm font-bold text-[#07140d] shadow-[0_12px_28px_rgba(0,185,99,.18)] transition hover:-translate-y-0.5 hover:bg-[#24ff9a] disabled:pointer-events-none disabled:opacity-50";

  const authIdPrefix = React.useId();
  const fieldIds = React.useMemo(() => ({
    emailSentEmail: `${authIdPrefix}-email-sent`,
    username: `${authIdPrefix}-username`,
    registerEmail: `${authIdPrefix}-register-email`,
    firstName: `${authIdPrefix}-first-name`,
    lastName: `${authIdPrefix}-last-name`,
    birthDay: `${authIdPrefix}-birth-day`,
    birthMonth: `${authIdPrefix}-birth-month`,
    password: `${authIdPrefix}-password`,
    forgotPasswordEmail: `${authIdPrefix}-forgot-password-email`
  }), [authIdPrefix]);

  const [theme, setTheme] = useState<"dark" | "light">(() => getCurrentTheme());
  const [userMode, setUserMode] = useState<UserMode>(() => initialUserMode ?? "PERSONAL");
  const [mode, setMode] = useState<Mode>(() => initialMode ?? "login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [course, setCourse] = useState<CourseLanguage>("JAVA");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDay, setBirthDay] = useState<number | "">("");
  const [birthMonth, setBirthMonth] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const turnstileSiteKey = React.useMemo(() => String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim(), []);
  const authTurnstileEnabled = React.useMemo(() => {
    return parseBoolEnv(import.meta.env.VITE_ENABLE_AUTH_TURNSTILE) && turnstileSiteKey.length > 0;
  }, [turnstileSiteKey]);
  const shouldRenderAuthTurnstile = React.useMemo(() => {
    return mode === "login" || mode === "register";
  }, [mode]);
  const turnstileMountKey = `${userMode}:${mode}`;
  // The auth form is animated/remounted when switching Personal/EDU/Contest.
  // Keep the actual mounted node in state so Turnstile renders into the new
  // panel after AnimatePresence finishes the transition (an object ref can
  // otherwise point at the outgoing panel and leave the new one blank).
  const [turnstileContainer, setTurnstileContainer] = React.useState<HTMLDivElement | null>(null);
  const turnstileContainerRef = React.useCallback((node: HTMLDivElement | null) => {
    setTurnstileContainer(node);
  }, []);
  const turnstileWidgetIdRef = React.useRef<TurnstileWidgetId | null>(null);
  const [turnstileScriptReady, setTurnstileScriptReady] = React.useState(false);
  const [turnstileLoadFailed, setTurnstileLoadFailed] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!authTurnstileEnabled) return;
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (window.turnstile) {
      setTurnstileLoadFailed(false);
      setTurnstileScriptReady(true);
      return;
    }
    if (existing) {
      const onLoad = () => { setTurnstileLoadFailed(false); setTurnstileScriptReady(true); };
      const onError = () => setTurnstileLoadFailed(true);
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return () => { existing.removeEventListener("load", onLoad); existing.removeEventListener("error", onError); };
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => { setTurnstileLoadFailed(false); setTurnstileScriptReady(true); };
    script.onerror = () => { setTurnstileLoadFailed(true); };
    document.head.appendChild(script);
    return () => { /* keep shared script for other pages */ };
  }, [authTurnstileEnabled]);

  React.useEffect(() => {
    setTurnstileToken(null);
    setTurnstileLoadFailed(false);
  }, [turnstileMountKey]);

  React.useEffect(() => {
    if (!shouldRenderAuthTurnstile || !turnstileScriptReady) return;
    const container = turnstileContainer;
    if (!container || !window.turnstile) return;
    if (turnstileWidgetIdRef.current == null) {
      try {
        const widgetId = window.turnstile.render(container, {
          sitekey: turnstileSiteKey,
          theme: "auto",
          callback: value => setTurnstileToken(String(value ?? "") || null),
          "expired-callback": () => setTurnstileToken(null),
          "error-callback": () => { setTurnstileToken(null); setTurnstileLoadFailed(true); }
        });
        turnstileWidgetIdRef.current = widgetId;
      } catch { setTurnstileLoadFailed(true); }
    }
    return () => {
      if (!window.turnstile) return;
      if (turnstileWidgetIdRef.current != null && typeof window.turnstile.remove === "function") {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
      turnstileWidgetIdRef.current = null;
      setTurnstileToken(null);
    };
  }, [shouldRenderAuthTurnstile, turnstileScriptReady, turnstileSiteKey, turnstileContainer]);

  function formatApiError(err: unknown, fallback: string): string {
    const response = err && typeof err === "object" ? Reflect.get(err, "response") : null;
    const data = response && typeof response === "object" ? Reflect.get(response, "data") : null;
    const errors = data && typeof data === "object" ? Reflect.get(data, "errors") : null;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as ApiValidationError;
      const path = Array.isArray(first?.path) ? first.path.join(".") : "";
      const message = String(first?.message || "").trim();
      if (message) return path ? `${path}: ${message}` : message;
    }
    const msg = getErrorMessageFromUnknown(err, "");
    if (msg.trim()) return msg;
    return fallback;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const requiresTurnstile = authTurnstileEnabled && shouldRenderAuthTurnstile && !import.meta.env.DEV;
    const currentTurnstileToken = String(turnstileToken ?? "").trim();
    if (requiresTurnstile) {
      if (turnstileLoadFailed) {
        setError(tr("Не вдалося завантажити перевірку Cloudflare. Спробуйте оновити сторінку.", "Cloudflare verification failed to load. Please refresh the page."));
        return;
      }
      if (!currentTurnstileToken) {
        setError(tr("Підтвердіть, що ви не бот.", "Please complete the anti-bot verification."));
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        try {
          if (userMode === "EDUCATIONAL") {
            try {
              const user = await login(username.trim(), password, currentTurnstileToken || undefined);
              onAuth(user);
              return;
            } catch (teacherErr: unknown) {
              try {
                const studentResult = await studentLogin(username.trim(), password, currentTurnstileToken || undefined);
                const studentUser: User = {
                  id: studentResult.student.id,
                  username: studentResult.student.username,
                  course: studentResult.student.language,
                  difus: 0,
                  avatarUrl: null,
                  userMode: "EDUCATIONAL" as const,
                  studentId: studentResult.student.id,
                  classId: studentResult.student.classId,
                  className: studentResult.student.className,
                  firstName: studentResult.student.firstName,
                  lastName: studentResult.student.lastName,
                  middleName: studentResult.student.middleName,
                  email: studentResult.student.email
                };
                onAuth(studentUser);
                return;
              } catch (studentErr: unknown) {
                setError(formatApiError(studentErr, tr("Невірні облікові дані", "Invalid credentials")));
                return;
              }
            }
          } else if (userMode === "CONTEST") {
            const user = await login(username.trim(), password, currentTurnstileToken || undefined);
            onAuth(user);
          } else {
            const user = await login(username.trim(), password, currentTurnstileToken || undefined);
            onAuth(user);
          }
        } catch (loginErr: unknown) {
          const loginErrorMessage = formatApiError(loginErr, tr("Помилка авторизації", "Authorization error"));
          if (loginErrorMessage === "EMAIL_NOT_VERIFIED" && userMode === "EDUCATIONAL") {
            setError(tr("Email не підтверджено. Перевірте вашу пошту та підтвердіть email перед входом.", "Email is not verified. Check your inbox and verify your email before logging in."));
            setEmailSent(true);
            if (username.includes("@")) { setEmail(username); }
          } else {
            setError(loginErrorMessage);
          }
          return;
        }
      } else {
        if (userMode === "CONTEST") {
          setError(tr("Для contest-акаунтів реєстрація відключена. Отримайте логін/пароль у організатора.", "Contest account registration is disabled. Ask organizer for credentials."));
          return;
        }
        if (userMode === "EDUCATIONAL") {
          if (!email.trim()) {
            setError(tr("Email обов'язковий для реєстрації вчителя", "Email is required for teacher registration"));
            return;
          }
          const eduLang: "JAVA" | "PYTHON" | "CPP" = course === "PYTHON" ? "PYTHON" : course === "CPP" ? "CPP" : "JAVA";
          const result = await registerTeacher(username.trim(), email.trim(), password, eduLang, currentTurnstileToken || undefined);
          if (result.requiresEmailVerification) {
            setEmailSent(true);
            setSuccess(tr("Реєстрація вчителя успішна! Перевірте вашу пошту для підтвердження email. Після підтвердження ви зможете увійти.", "Teacher registration successful! Check your email to verify it. After verification you can log in."));
          } else if (result.user && result.token) {
            const registeredUser = result.user;
            setSuccess(tr("Реєстрація вчителя успішна!", "Teacher registration successful!"));
            setTimeout(() => { onAuth(registeredUser); }, 1500);
          }
        } else {
          if (!firstName.trim() || !lastName.trim() || !birthDay || !birthMonth) {
            setError(tr("Ім'я, прізвище та дата народження обов'язкові", "First name, last name, and birth date are required"));
            return;
          }
          if (!email.trim()) {
            setError(tr("Email обов'язковий", "Email is required"));
            return;
          }
          if (!password || password.length < 8) {
            setError(tr("Пароль має бути мінімум 8 символів", "Password must be at least 8 characters"));
            return;
          }
          const result = await register(username.trim(), email.trim(), password, course, firstName.trim(), lastName.trim(), Number(birthDay), Number(birthMonth), currentTurnstileToken || undefined);
          if (result.requiresEmailVerification) {
            setEmailSent(true);
            setSuccess(tr("Реєстрація успішна! Перевірте вашу пошту для підтвердження.", "Registration successful! Check your email to verify."));
          } else if (result.user && result.token) {
            onAuth(result.user);
          }
        }
      }
    } catch (err: unknown) {
      const errorMessage = formatApiError(err, tr("Помилка авторизації", "Authorization error"));
      setError(errorMessage);
      if (errorMessage === "EMAIL_NOT_VERIFIED") { setEmailSent(true); }
    } finally {
      if (requiresTurnstile && window.turnstile && turnstileWidgetIdRef.current != null) {
        try { window.turnstile.reset(turnstileWidgetIdRef.current); } catch { /* ignore */ }
        setTurnstileToken(null);
      }
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!email.trim()) {
      setError(tr("Введіть email для повторної відправки", "Enter an email to resend"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resendVerificationEmail(email.trim());
      setSuccess(tr("Лист підтвердження відправлено повторно!", "Verification email resent!"));
    } catch (err: unknown) {
      setError(formatApiError(err, tr("Помилка відправки листа", "Failed to send email")));
    } finally {
      setLoading(false);
    }
  };

  const experienceHeading = showForgotPassword
    ? tr("Відновіть доступ", "Restore access")
    : mode === "register"
      ? userMode === "EDUCATIONAL"
        ? tr("Створіть простір для свого класу", "Create a space for your class")
        : tr("Почніть навчатися системно", "Start learning with structure")
      : userMode === "EDUCATIONAL"
        ? tr("Поверніться до навчального простору", "Return to your learning space")
        : userMode === "CONTEST"
          ? tr("Увійдіть до змагання", "Enter the competition")
          : tr("Раді бачити вас знову", "Welcome back") ;

  const experienceSubtitle = showForgotPassword
    ? tr("Вкажіть email — ми надішлемо безпечне посилання для відновлення пароля.", "Enter your email and we’ll send a secure password reset link.")
    : mode === "register"
      ? tr("Один акаунт для курсів, практики, перевірки коду та видимого прогресу.", "One account for courses, practice, code feedback, and visible progress.")
      : tr("Продовжуйте з того місця, де зупинилися.", "Continue right where you left off.");

  return (
    <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0c110e] dark:text-[#f4f7f4]">
      <div className="grid min-h-[100dvh] grid-cols-[minmax(380px,.92fr)_minmax(560px,1.08fr)] max-[980px]:grid-cols-1">
        <aside className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#101713] px-[clamp(32px,5vw,76px)] py-10 text-white max-[980px]:hidden">
          <div className="absolute -left-48 -top-52 -z-10 size-[520px] rounded-full bg-[#00ff88]/10 blur-[100px]" />
          <div className="absolute -bottom-52 -right-56 -z-10 size-[540px] rounded-full bg-[#ff8c00]/10 blur-[110px]" />
          <button onClick={() => navigate("/", { replace: true })} className="flex w-fit items-center gap-2.5 text-xl font-bold tracking-[-0.04em]"><span className="grid size-10 place-items-center rounded-[13px] border border-white/10 bg-white/[0.07]"><Logo size={27} /></span>StudyCod</button>

          <motion.div initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .7, ease: [0.16, 1, .3, 1] }} className="my-auto max-w-[560px] py-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-semibold text-[#b2bdb6]"><span className="size-1.5 rounded-full bg-[#00ff88]" />{tr("Навчання у власному темпі", "Learning at your own pace")}</span>
            <h2 className="mt-7 text-balance text-[clamp(42px,4.6vw,68px)] font-bold leading-[1.02] tracking-[-0.055em]">{tr("Місце, де знання стають кодом.", "Where knowledge becomes code.")}</h2>
            <p className="mt-6 max-w-[500px] text-[16px] leading-7 text-[#aab5ad]">{tr("Короткий шлях від нової теми до рішення, яке справді написали ви.", "A focused path from a new concept to a solution you genuinely wrote yourself.")}</p>

            <div className="mt-12 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_32px_70px_rgba(0,0,0,.24)] backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-4"><div><span className="text-[11px] font-bold uppercase tracking-[.12em] text-[#77f4b7]">Python · {tr("Прогрес", "Progress")}</span><h3 className="mt-1.5 text-lg font-bold">{tr("Функції та модулі", "Functions and modules")}</h3></div><span className="grid size-10 place-items-center rounded-xl bg-[#00ff88] text-[#07140d]"><Code2 className="size-5" /></span></div>
              <div className="grid grid-cols-[1fr_auto] items-center gap-7 py-6"><div><div className="mb-2 flex justify-between text-xs text-[#aab5ad]"><span>{tr("Завершено уроків", "Lessons completed")}</span><strong className="text-white">8 / 12</strong></div><div className="h-2 rounded-full bg-white/10"><span className="block h-full w-2/3 rounded-full bg-[#00ff88]" /></div></div><strong className="text-3xl tracking-[-.04em]">68%</strong></div>
              <div className="grid grid-cols-3 gap-2.5">{[[CheckCircle2, tr("24 задачі", "24 tasks")],[BarChart3,tr("8.6 середній", "8.6 average")],[GraduationCap,tr("12 днів", "12 days")]].map(([Icon,label]) => { const MetricIcon = Icon as typeof CheckCircle2; return <div key={String(label)} className="rounded-[14px] border border-white/[0.07] bg-black/10 p-3"><MetricIcon className="mb-2 size-4 text-[#62efaa]" /><span className="text-[11px] font-semibold text-[#d4dcd7]">{String(label)}</span></div>; })}</div>
            </div>
          </motion.div>

          <p className="text-[13px] leading-5 text-[#7f8d84]">{tr("Створено для учнів, викладачів і тих, хто вчиться самостійно.", "Built for students, teachers, and independent learners.")}</p>
        </aside>

        <main className="relative flex min-h-[100dvh] items-center justify-center px-6 py-10 max-sm:px-4">
          <div className="absolute left-6 top-5 flex items-center gap-2 min-[981px]:hidden"><span className="grid size-9 place-items-center rounded-xl border border-[#122017]/10 bg-white dark:border-white/10 dark:bg-[#182019]"><Logo size={24} /></span><strong className="text-lg tracking-[-.04em]">StudyCod</strong></div>
          <div className="absolute right-6 top-5 flex items-center gap-2 max-sm:right-4">
            <button onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] transition hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#171e19] dark:text-[#a7b2aa]" title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}><Globe className="size-4" /></button>
            <button onClick={() => { const next = theme === "dark" ? "light" : "dark"; applyTheme(next); setTheme(next); }} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] transition hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#171e19] dark:text-[#a7b2aa]" title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
          </div>

          <motion.div initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .65, ease: [0.16, 1, .3, 1] }} className="w-full max-w-[520px] py-16">
            {showBackToLanding && <button onClick={() => navigate("/", { replace: true })} className="mb-9 inline-flex items-center gap-2 text-[13px] font-semibold text-[#667169] transition hover:text-[#111814] dark:text-[#94a198] dark:hover:text-white"><ArrowLeft className="size-4" />{tr("На головну", "Back to home")}</button>}
            <h1 className="text-balance text-[clamp(34px,4vw,47px)] font-bold leading-[1.06] tracking-[-0.05em]">{experienceHeading}</h1>
            <p className="mt-4 text-[15px] leading-7 text-[#667169] dark:text-[#9faba3]">{experienceSubtitle}</p>

            {!showForgotPassword && <div className="mt-8 grid grid-cols-3 gap-2 rounded-[17px] border border-[#122017]/10 bg-[#edf0eb] p-1.5 dark:border-white/10 dark:bg-[#131a15]">
              {([
                ["PERSONAL", UserRound, tr("Особисто", "Personal")],
                ["EDUCATIONAL", School, "EDU"],
                ["CONTEST", GraduationCap, tr("Контест", "Contest")],
              ] as const).map(([value, Icon, label]) => <button key={value} type="button" onClick={() => { setUserMode(value); setMode("login"); setError(null); setSuccess(null); }} className={`flex h-11 items-center justify-center gap-2 rounded-xl text-[12px] font-bold transition ${userMode === value ? "bg-white text-[#111814] shadow-sm dark:bg-[#222b24] dark:text-white" : "text-[#667169] hover:text-[#111814] dark:text-[#859289] dark:hover:text-white"}`}><Icon className="size-4" />{label}</button>)}
            </div>}

            {!showForgotPassword && userMode !== "CONTEST" && !emailSent && <div className="mt-6 flex items-center gap-6 border-b border-[#122017]/10 dark:border-white/10"><button onClick={() => { setMode("login"); setError(null); setSuccess(null); }} className={`relative pb-3 text-sm font-bold ${mode === "login" ? "text-[#111814] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#00b963] dark:text-white" : "text-[#7c8880]"}`}>{t("login")}</button><button onClick={() => { setMode("register"); setError(null); setSuccess(null); }} className={`relative pb-3 text-sm font-bold ${mode === "register" ? "text-[#111814] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#00b963] dark:text-white" : "text-[#7c8880]"}`}>{t("register")}</button></div>}

            {userMode === "EDUCATIONAL" && !showForgotPassword && !emailSent && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#00b963]/15 bg-[#00ff88]/[0.055] p-4"><GraduationCap className="mt-0.5 size-5 shrink-0 text-[#008c4c]" /><div><strong className="text-[13px]">{t("authEduForTeachersTitle")}</strong><p className="mt-1 text-[12px] leading-5 text-[#667169] dark:text-[#9eaaa2]">{t("authEduForTeachersBody")}</p></div></div>}

            <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${userMode}-${mode}-${showForgotPassword ? "reset" : emailSent ? "email" : "form"}`}
              initial={prefersReducedMotion ? undefined : { opacity: 0, x: mode === "register" ? 18 : -18, filter: "blur(5px)" }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, x: mode === "register" ? -14 : 14, filter: "blur(4px)" }}
              transition={{ duration: .28, ease: [0.16, 1, .3, 1] }}
              className="mt-6"
            >
              {showForgotPassword ? (
                <div className="space-y-5">
                  <div><label htmlFor={fieldIds.forgotPasswordEmail} className={fieldLabelClass}>Email</label><input id={fieldIds.forgotPasswordEmail} type="email" className={fieldInputClass} value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="your@email.com" /></div>
                  {error && <div className="flex items-start gap-2.5 rounded-[14px] border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-3.5 text-[13px] leading-5 text-[#d33d70] dark:text-[#ff91b7]"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
                  {success && <div className="flex items-start gap-2.5 rounded-[14px] border border-[#00b963]/20 bg-[#00ff88]/10 p-3.5 text-[13px] leading-5 text-[#007f48] dark:text-[#72f2b4]"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{success}</div>}
                  <button className={primaryButtonClass} disabled={loading} onClick={async () => { if (!resetEmail.trim()) { setError(tr("Введіть email", "Enter an email")); return; } setLoading(true); setError(null); setSuccess(null); try { await requestPasswordReset(resetEmail.trim()); setSuccess(tr("Лист з інструкціями відправлено на вашу пошту!", "Instructions were sent to your email!")); } catch (err: unknown) { setError(formatApiError(err, tr("Помилка відправки листа", "Failed to send email"))); } finally { setLoading(false); } }}>{loading ? tr("Відправляємо…", "Sending…") : tr("Надіслати посилання", "Send reset link")}<ArrowRight className="size-4" /></button>
                  <button onClick={() => { setShowForgotPassword(false); setResetEmail(""); setError(null); setSuccess(null); }} className="w-full text-center text-[13px] font-semibold text-[#667169] hover:text-[#111814] dark:hover:text-white">{tr("Повернутися до входу", "Back to sign in")}</button>
                </div>
              ) : emailSent ? (
                <div className="space-y-5">
                  <div className="rounded-[18px] border border-[#00b963]/20 bg-[#00ff88]/[0.06] p-5"><span className="mb-4 grid size-11 place-items-center rounded-[14px] bg-[#00ff88] text-[#072016]"><Mail className="size-5" /></span><h3 className="text-lg font-bold">{tr("Перевірте вашу пошту", "Check your inbox")}</h3><p className="mt-2 text-[13px] leading-6 text-[#667169] dark:text-[#9eaaa2]">{success || tr("Ми надіслали лист для підтвердження email. Після підтвердження ви зможете увійти.", "We sent an email verification link. Once verified, you can sign in.")}</p></div>
                  <div><label htmlFor={fieldIds.emailSentEmail} className={fieldLabelClass}>Email</label><input id={fieldIds.emailSentEmail} type="email" className={fieldInputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" /></div>
                  <button className={primaryButtonClass} onClick={handleResendEmail} disabled={loading}>{loading ? tr("Відправляємо…", "Sending…") : tr("Надіслати лист повторно", "Resend email")}</button>
                  <button onClick={() => { setEmailSent(false); setSuccess(null); setError(null); }} className="w-full text-center text-[13px] font-semibold text-[#667169] dark:text-[#9eaaa2]">{tr("Повернутися до реєстрації", "Back to registration")}</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === "register" && userMode !== "CONTEST" && <div className="space-y-3"><button type="button" onClick={() => { window.location.href = buildGoogleAuthUrl(userMode, true); }} className="flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-[#4285F4]/25 bg-white text-[13px] font-bold text-[#17201a] transition hover:border-[#4285F4]/50 hover:bg-[#fbfcfa] dark:border-white/10 dark:bg-[#151d17] dark:text-white dark:hover:border-[#4285F4]/50"><GoogleMark />{tr("Зареєструватися через Google", "Sign up with Google")}<ArrowRight className="size-4 text-[#6f7b72]" /></button><div className="relative py-1 text-center before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:bg-[#122017]/10 dark:before:bg-white/10"><span className="relative bg-[#f7f8f5] px-3 text-[11px] text-[#7c8880] dark:bg-[#0c110e]">{tr("або заповніть вручну", "or fill it manually")}</span></div></div>}
                  <div><label htmlFor={fieldIds.username} className={fieldLabelClass}>{t("username")}</label><input id={fieldIds.username} className={fieldInputClass} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></div>
                  {mode === "register" && <><div><label htmlFor={fieldIds.registerEmail} className={fieldLabelClass}>Email</label><input id={fieldIds.registerEmail} type="email" className={fieldInputClass} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></div>{userMode === "PERSONAL" && <><div className="grid grid-cols-2 gap-3"><div><label htmlFor={fieldIds.firstName} className={fieldLabelClass}>{t("firstName")}</label><input id={fieldIds.firstName} className={fieldInputClass} value={firstName} onChange={e => setFirstName(e.target.value)} required /></div><div><label htmlFor={fieldIds.lastName} className={fieldLabelClass}>{t("lastName")}</label><input id={fieldIds.lastName} className={fieldInputClass} value={lastName} onChange={e => setLastName(e.target.value)} required /></div></div><div><label className={fieldLabelClass}>{tr("Дата народження — без року", "Birth date — no year")}</label><div className="grid grid-cols-2 gap-3"><input id={fieldIds.birthDay} type="number" min="1" max="31" className={fieldInputClass} value={birthDay} onChange={e => setBirthDay(e.target.value ? Number(e.target.value) : "")} placeholder={tr("День", "Day")} required /><input id={fieldIds.birthMonth} type="number" min="1" max="12" className={fieldInputClass} value={birthMonth} onChange={e => setBirthMonth(e.target.value ? Number(e.target.value) : "")} placeholder={tr("Місяць", "Month")} required /></div></div></>}</>}
                  <div><div className="flex items-center justify-between"><label htmlFor={fieldIds.password} className={fieldLabelClass}>{t("password")}</label>{mode === "login" && userMode !== "CONTEST" && <button type="button" onClick={() => { setShowForgotPassword(true); setError(null); setSuccess(null); }} className="mb-2 text-[12px] font-semibold text-[#007f48] dark:text-[#5ceca7]">{tr("Забули пароль?", "Forgot password?")}</button>}</div><div className="relative"><Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8a948d]" /><input id={fieldIds.password} type="password" className={`${fieldInputClass} pl-11`} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></div></div>
                  {mode === "register" && userMode === "PERSONAL" && <div><label className={fieldLabelClass}>{t("programmingLanguage")}</label><div className="grid grid-cols-3 gap-2">{(["JAVA", "PYTHON", "CPP"] as CourseLanguage[]).map(lang => <button key={lang} type="button" onClick={() => setCourse(lang)} className={`h-11 rounded-xl border text-[12px] font-bold transition ${course === lang ? "border-[#00b963]/35 bg-[#00ff88]/10 text-[#007f48] dark:text-[#64eead]" : "border-[#122017]/10 bg-white text-[#667169] dark:border-white/10 dark:bg-[#151d17] dark:text-[#9eaaa2]"}`}>{lang === "CPP" ? "C++" : lang === "JAVA" ? "Java" : "Python"}</button>)}</div></div>}
                  {error && <div className="flex items-start gap-2.5 rounded-[14px] border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-3.5 text-[13px] leading-5 text-[#d33d70] dark:text-[#ff91b7]"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
                  {success && <div className="flex items-start gap-2.5 rounded-[14px] border border-[#00b963]/20 bg-[#00ff88]/10 p-3.5 text-[13px] leading-5 text-[#007f48] dark:text-[#72f2b4]"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{success}</div>}
                  {shouldRenderAuthTurnstile && <SecurityCheckPanel ref={turnstileContainerRef} enabled={authTurnstileEnabled} failed={turnstileLoadFailed} scriptReady={authTurnstileEnabled ? turnstileScriptReady : true} tr={tr} />}
                  <button type="submit" className={primaryButtonClass} disabled={loading}>{loading ? tr("Обробка…", "Processing…") : mode === "login" ? t("login") : t("register")}<ArrowRight className="size-4" /></button>
                  {mode === "login" && userMode !== "CONTEST" && <><div className="relative py-1 text-center before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:bg-[#122017]/10 dark:before:bg-white/10"><span className="relative bg-[#f7f8f5] px-3 text-[12px] text-[#7c8880] dark:bg-[#0c110e]">{tr("або", "or")}</span></div><button type="button" onClick={() => { window.location.href = buildGoogleAuthUrl(userMode); }} className="flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-[#122017]/10 bg-white text-[13px] font-bold transition hover:border-[#00b963]/25 hover:bg-[#fbfcfa] dark:border-white/10 dark:bg-[#171e19] dark:hover:bg-[#1b241d]"><svg className="size-[18px]" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>{tr("Продовжити через Google", "Continue with Google")}</button></>}
                </form>
              )}
            </motion.div>
            </AnimatePresence>
            <p className="mt-8 flex items-center justify-center gap-2 text-center text-[12px] leading-5 text-[#7c8880] dark:text-[#7f8c84]"><Check className="size-3.5 text-[#00a85c]" />{tr("Безпечний вхід · Дані залишаються приватними", "Secure sign-in · Your data stays private")}</p>
          </motion.div>
        </main>
      </div>
    </div>
  );

};
