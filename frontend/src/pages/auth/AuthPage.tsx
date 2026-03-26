import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Logo } from "../../components/Logo";
import { register, login, contestLogin, resendVerificationEmail, requestPasswordReset, resetPassword } from "../../lib/api/auth";
import { registerTeacher, studentLogin } from "../../lib/api/edu";
import type { User, CourseLanguage } from "../../types";
import { applyTheme, getCurrentTheme } from "../../theme";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
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

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function parseBoolEnv(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export const AuthPage: React.FC<Props> = ({
  onAuth,
  initialMode,
  initialUserMode,
  showBackToLanding
}) => {
  const {
    t,
    i18n
  } = useTranslation();
  const navigate = useNavigate();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const topMenuButtonClass = "inline-flex h-8 items-center justify-center rounded-md border border-border/80 bg-bg-code/70 px-3 text-[11px] font-mono uppercase tracking-[0.08em] text-text-secondary transition-fast hover:-translate-y-[1px] hover:border-primary/50 hover:bg-bg-hover/80 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-primary/60";
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
    return authTurnstileEnabled && (mode === "login" || mode === "register" && userMode === "PERSONAL");
  }, [authTurnstileEnabled, mode, userMode]);
  const turnstileContainerRef = React.useRef<HTMLDivElement | null>(null);
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
      const onLoad = () => {
        setTurnstileLoadFailed(false);
        setTurnstileScriptReady(true);
      };
      const onError = () => setTurnstileLoadFailed(true);
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
      };
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setTurnstileLoadFailed(false);
      setTurnstileScriptReady(true);
    };
    script.onerror = () => {
      setTurnstileLoadFailed(true);
    };
    document.head.appendChild(script);

    return () => {
      // keep shared script for other pages
    };
  }, [authTurnstileEnabled]);

  React.useEffect(() => {
    if (!shouldRenderAuthTurnstile || !turnstileScriptReady) return;
    const container = turnstileContainerRef.current;
    if (!container || !window.turnstile) return;

    if (turnstileWidgetIdRef.current == null) {
      try {
        const widgetId = window.turnstile.render(container, {
          sitekey: turnstileSiteKey,
          theme: "auto",
          callback: value => setTurnstileToken(String(value ?? "") || null),
          "expired-callback": () => setTurnstileToken(null),
          "error-callback": () => setTurnstileToken(null)
        });
        turnstileWidgetIdRef.current = widgetId;
      } catch {
        setTurnstileLoadFailed(true);
      }
    }

    return () => {
      if (!window.turnstile) return;
      if (turnstileWidgetIdRef.current != null && typeof window.turnstile.remove === "function") {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
      turnstileWidgetIdRef.current = null;
      setTurnstileToken(null);
    };
  }, [shouldRenderAuthTurnstile, turnstileScriptReady, turnstileSiteKey]);

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

    const requiresTurnstile = shouldRenderAuthTurnstile;
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
              if (user.userMode !== "EDUCATIONAL") {
                setError(tr("Цей акаунт не призначений для освітнього режиму", "This account is not intended for EDU mode"));
                return;
              }
              onAuth(user);
              return;
            } catch (teacherErr: unknown) {
              try {
                const studentResult = await studentLogin(username.trim(), password);
                const studentUser: User = {
                  id: studentResult.student.id,
                  username: studentResult.student.username,
                  course: studentResult.student.language,
                  iad: 0,
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
            const user = await contestLogin(username.trim(), password, currentTurnstileToken || undefined);
            if (user.userMode !== "CONTEST") {
              setError(tr("Цей акаунт не призначений для контест-режиму", "This account is not intended for contest mode"));
              return;
            }
            onAuth(user);
          } else {
            const user = await login(username.trim(), password, currentTurnstileToken || undefined);
            if (userMode === "PERSONAL" && user.userMode === "EDUCATIONAL") {
              setError(tr("Цей акаунт призначений для EDU режиму. Оберіть вкладку 'EDU'.", "This account is for EDU mode. Please select the 'EDU' tab."));
              return;
            }
            onAuth(user);
          }
        } catch (loginErr: unknown) {
          const loginErrorMessage = formatApiError(loginErr, tr("Помилка авторизації", "Authorization error"));
          if (loginErrorMessage === "EMAIL_NOT_VERIFIED" && userMode === "EDUCATIONAL") {
            setError(tr("Email не підтверджено. Перевірте вашу пошту та підтвердіть email перед входом.", "Email is not verified. Check your inbox and verify your email before logging in."));
            setEmailSent(true);
            if (username.includes("@")) {
              setEmail(username);
            }
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
          const result = await registerTeacher(username.trim(), email.trim(), password, eduLang);
          if (result.requiresEmailVerification) {
            setEmailSent(true);
            setSuccess(tr("Реєстрація вчителя успішна! Перевірте вашу пошту для підтвердження email. Після підтвердження ви зможете увійти.", "Teacher registration successful! Check your email to verify it. After verification you can log in."));
          } else if (result.user && result.token) {
            setSuccess(tr("Реєстрація вчителя успішна!", "Teacher registration successful!"));
            setTimeout(() => {
              onAuth(result.user);
            }, 1500);
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
      if (errorMessage === "EMAIL_NOT_VERIFIED") {
        setEmailSent(true);
      }
    } finally {
      if (requiresTurnstile && window.turnstile && turnstileWidgetIdRef.current != null) {
        try {
          window.turnstile.reset(turnstileWidgetIdRef.current);
        } catch {
          // ignore turnstile reset failures
        }
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
  return <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <div className="w-full max-w-md bg-bg-surface border border-border p-8">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-border/60 bg-bg-code/35 p-1.5">
          {showBackToLanding ? <button type="button" onClick={() => navigate("/", {
          replace: true
        })} className={topMenuButtonClass} title={t("toHome")}>
              {t("toHome")}
            </button> : null}
          <button type="button" onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className={topMenuButtonClass} title={i18n.language === "uk" ? t("switchToEnglish") : t("switchToUkrainian")}>
            {i18n.language === "uk" ? "EN" : "UA"}
          </button>
          <button type="button" onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          applyTheme(next);
          setTheme(next);
        }} className={topMenuButtonClass} title={theme === "dark" ? t("switchToLightTheme") : t("switchToDarkTheme")}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
        <div className="flex flex-col items-center mb-6">
          <Logo size={48} />
          <h1 className="mt-4 text-xl font-mono text-text-primary">
            {mode === "login"
              ? userMode === "EDUCATIONAL"
                ? tr("Вхід EDU", "EDU login")
                : userMode === "CONTEST"
                  ? tr("Вхід Contest", "Contest login")
                  : tr("Вхід Personal", "Personal login")
              : userMode === "EDUCATIONAL"
                ? tr("Реєстрація вчителя (EDU)", "Teacher registration (EDU)")
                : tr("Реєстрація (Personal)", "Registration (Personal)")}
          </h1>
        </div>
        <div className="flex mb-4 border border-border bg-bg-code p-1">
          <button onClick={() => {
          setUserMode("PERSONAL");
          setMode("login");
          setError(null);
          setSuccess(null);
        }} className={`flex-1 py-2 text-xs font-mono transition-fast ${userMode === "PERSONAL" ? "bg-bg-hover text-text-primary border border-border" : "text-text-secondary hover:text-text-primary"}`}>
            Personal
          </button>
          <button onClick={() => {
          setUserMode("EDUCATIONAL");
          setMode("login");
          setError(null);
          setSuccess(null);
        }} className={`flex-1 py-2 text-xs font-mono transition-fast ${userMode === "EDUCATIONAL" ? "bg-bg-hover text-text-primary border border-border" : "text-text-secondary hover:text-text-primary"}`}>
            EDU ({t("teacher")})
          </button>
          <button onClick={() => {
          setUserMode("CONTEST");
          setMode("login");
          setError(null);
          setSuccess(null);
        }} className={`flex-1 py-2 text-xs font-mono transition-fast ${userMode === "CONTEST" ? "bg-bg-hover text-text-primary border border-border" : "text-text-secondary hover:text-text-primary"}`}>
            Contest
          </button>
        </div>
        <div className="mb-4 border border-border bg-bg-code px-3 py-2">
          <div className="text-xs font-mono text-text-primary">
            {t("authEduForTeachersTitle")}
          </div>
          <div className="mt-1 text-[11px] font-mono text-text-muted leading-relaxed">
            {t("authEduForTeachersBody")}
          </div>
        </div>
        {emailSent ? <div className="space-y-4">
            <div className="text-xs font-mono text-text-primary border border-primary bg-bg-code px-3 py-2">
              {success || tr("Перевірте вашу пошту для підтвердження email. Після підтвердження ви зможете увійти.", "Check your inbox to verify your email. After verification you can log in.")}
            </div>
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">Email</label>
              <input type="email" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" />
            </div>
            <Button type="button" onClick={handleResendEmail} className="w-full" disabled={loading}>
              {loading ? tr("Відправка...", "Sending...") : tr("Відправити лист повторно", "Resend email")}
            </Button>
            <button type="button" onClick={() => {
          setEmailSent(false);
          setSuccess(null);
          setError(null);
        }} className="w-full text-xs font-mono text-text-secondary hover:text-text-primary transition-fast">
              {tr("Повернутись до реєстрації", "Back to registration")}
            </button>
          </div> : <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">{t("username")}</label>
              <input className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            {mode === "register" && <>
                <div>
                  <label className="text-xs font-mono text-text-secondary mb-1 block">Email</label>
                  <input type="email" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-mono text-text-secondary mb-1 block">{t("firstName")}</label>
                    <input type="text" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-text-secondary mb-1 block">{t("lastName")}</label>
                    <input type="text" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={lastName} onChange={e => setLastName(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("День народження (без року)", "Birth day (no year)")}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("День", "Day")}</label>
                      <input type="number" min="1" max="31" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={birthDay} onChange={e => setBirthDay(e.target.value ? Number(e.target.value) : "")} placeholder="1-31" required />
                    </div>
                    <div>
                      <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("Місяць", "Month")}</label>
                      <input type="number" min="1" max="12" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={birthMonth} onChange={e => setBirthMonth(e.target.value ? Number(e.target.value) : "")} placeholder="1-12" required />
                    </div>
                  </div>
                </div>
              </>}
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">{t("password")}</label>
              <input type="password" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
          {mode === "register" && <div>
              <label className="text-xs font-mono text-text-secondary mb-2 block">{t("programmingLanguage")}</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCourse("JAVA")} className={`flex-1 py-2 px-4 border text-xs font-mono transition-fast ${course === "JAVA" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"}`}>
                  Java
                </button>
                <button type="button" onClick={() => setCourse("PYTHON")} className={`flex-1 py-2 px-4 border text-xs font-mono transition-fast ${course === "PYTHON" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"}`}>
                  Python
                </button>
                <button type="button" onClick={() => setCourse("CPP")} className={`flex-1 py-2 px-4 border text-xs font-mono transition-fast ${course === "CPP" ? "border-primary bg-bg-hover text-primary" : "border-border text-text-secondary hover:border-primary/50"}`}>
                  C++
                </button>
              </div>
            </div>}
          {mode === "login" && userMode !== "CONTEST" && <div className="text-center space-y-2 mt-4">
              <button type="button" onClick={() => {
            setMode("register");
            setError(null);
            setSuccess(null);
          }} className="text-xs font-mono text-text-secondary hover:text-primary transition-fast block w-full">
                {tr("Немає аккаунту?", "No account?")} <span className="text-primary">{t("register")}</span>
              </button>
              <button type="button" onClick={() => {
            setShowForgotPassword(true);
            setError(null);
            setSuccess(null);
          }} className="text-xs font-mono text-text-secondary hover:text-primary transition-fast block w-full">
                {tr("Забули пароль?", "Forgot password?")} <span className="text-primary">{t("resetPassword")}</span>
              </button>
            </div>}
          {mode === "register" && userMode !== "CONTEST" && <div className="text-center mt-4">
              <button type="button" onClick={() => {
            setMode("login");
            setError(null);
            setSuccess(null);
          }} className="text-xs font-mono text-text-secondary hover:text-primary transition-fast">
                {tr("Вже є аккаунт?", "Already have an account?")} <span className="text-primary">{t("login")}</span>
              </button>
            </div>}
            {error && <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
                {error}
              </div>}
            {success && <div className="text-xs font-mono text-primary border border-primary bg-bg-code px-3 py-2">
                {success}
              </div>}
            {shouldRenderAuthTurnstile && <div className="rounded-md border border-border bg-bg-code px-3 py-3">
                <div ref={turnstileContainerRef} className="min-h-[65px]" />
                {turnstileLoadFailed && <div className="mt-2 text-[11px] font-mono text-accent-error">
                    {tr("Не вдалося завантажити Cloudflare перевірку.", "Failed to load Cloudflare verification.")}
                  </div>}
              </div>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? tr("Обробка...", "Processing...") : mode === "login" ? t("login") : t("register")}
            </Button>
            {mode === "login" && userMode !== "CONTEST" && <div className="mt-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-bg-surface text-text-secondary font-mono">{tr("або", "or")}</span>
                  </div>
                </div>
                <button type="button" onClick={() => {
            const base = import.meta.env.VITE_API_URL || window.location.origin;
            window.location.href = `${base}/auth/google`;
          }} className="mt-4 w-full flex items-center justify-center gap-2 border border-border bg-bg-code hover:bg-bg-hover px-4 py-2 text-sm font-mono text-text-primary transition-fast">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {tr("Увійти через Google", "Continue with Google")}
                </button>
              </div>}
          </form>}

        {}
        {showForgotPassword && <div className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">Email</label>
              <input type="email" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="your@email.com" />
            </div>
            {error && <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
                {error}
              </div>}
            {success && <div className="text-xs font-mono text-primary border border-primary bg-bg-code px-3 py-2">
                {success}
              </div>}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => {
            setShowForgotPassword(false);
            setResetEmail("");
            setError(null);
            setSuccess(null);
          }} className="flex-1">
                {t("cancel")}
              </Button>
              <Button onClick={async () => {
            if (!resetEmail.trim()) {
              setError(tr("Введіть email", "Enter an email"));
              return;
            }
            setLoading(true);
            setError(null);
            setSuccess(null);
            try {
              await requestPasswordReset(resetEmail.trim());
              setSuccess(tr("Лист з інструкціями відправлено на вашу пошту!", "Instructions were sent to your email!"));
              setTimeout(() => {
                setShowForgotPassword(false);
                setResetEmail("");
              }, 2000);
            } catch (err: unknown) {
              setError(formatApiError(err, tr("Помилка відправки листа", "Failed to send email")));
            } finally {
              setLoading(false);
            }
          }} disabled={loading} className="flex-1">
                {loading ? tr("Відправка...", "Sending...") : tr("Відправити", "Send")}
              </Button>
            </div>
          </div>}
      </div>
    </div>;
};