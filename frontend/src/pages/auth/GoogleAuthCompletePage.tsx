import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Globe, LoaderCircle, Lock, Moon, Sparkles, Sun } from "lucide-react";
import type { CourseLanguage, User } from "../../types";
import { tr } from "../../i18n";
import { api } from "../../lib/api/client";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { exchangeGoogleCode, exchangeGoogleCookie } from "../../lib/api/auth";
import { Logo } from "../../components/Logo";
import { applyTheme, getCurrentTheme } from "../../theme";

type GoogleTokenPayload = {
  firstName?: string | null;
  lastName?: string | null;
  birthDay?: number | string | null;
  birthMonth?: number | string | null;
  email?: string | null;
  userMode?: "PERSONAL" | "EDUCATIONAL" | "CONTEST";
};

interface Props {
  onAuth: (user: User) => void;
}

const fieldInputClass = "h-12 w-full rounded-[14px] border border-[#122017]/10 bg-[#f7f8f5] px-4 text-[14px] text-[#111814] outline-none transition placeholder:text-[#8a948d] focus:border-[#00b963]/60 focus:bg-white focus:ring-4 focus:ring-[#00ff88]/10 dark:border-white/10 dark:bg-[#111713] dark:text-[#f4f7f4] dark:placeholder:text-[#718078] dark:focus:border-[#00e97c]/50 dark:focus:bg-[#151d17]";
const fieldLabelClass = "mb-2 block text-[12px] font-bold text-[#4e5a52] dark:text-[#b4beb7]";
const primaryButtonClass = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#00ff88] px-5 text-sm font-bold text-[#07140d] shadow-[0_12px_28px_rgba(0,185,99,.18)] transition hover:-translate-y-0.5 hover:bg-[#24ff9a] disabled:pointer-events-none disabled:opacity-50";

function readTokenPayload(token: string): GoogleTokenPayload {
  const base64Url = token.split(".")[1];
  if (!base64Url) throw new Error("Invalid Google token");
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(atob(base64).split("").map(char => `%${("00" + char.charCodeAt(0).toString(16)).slice(-2)}`).join(""));
  return JSON.parse(jsonPayload) as GoogleTokenPayload;
}

export const GoogleAuthCompletePage: React.FC<Props> = ({ onAuth }) => {
  const { i18n } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const legacyToken = searchParams.get("token");
  const code = searchParams.get("code");
  const [token, setToken] = useState<string | null>(legacyToken);
  const [resolvingCode, setResolvingCode] = useState(!legacyToken && !!code);
  const [theme, setTheme] = useState<"dark" | "light">(() => getCurrentTheme());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [course, setCourse] = useState<CourseLanguage>("JAVA");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDay, setBirthDay] = useState<number | "">("");
  const [birthMonth, setBirthMonth] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleData, setGoogleData] = useState<GoogleTokenPayload | null>(null);
  const [userMode, setUserMode] = useState<"PERSONAL" | "EDUCATIONAL" | "CONTEST">("PERSONAL");
  const exchangeAttemptKeyRef = useRef<string | null>(null);
  const idPrefix = React.useId();

  useEffect(() => {
    if (legacyToken) return;
    const attemptKey = code ? `code:${code}` : "cookie:complete";
    if (exchangeAttemptKeyRef.current === attemptKey) return;
    exchangeAttemptKeyRef.current = attemptKey;
    let cancelled = false;
    setResolvingCode(true);
    setError(null);
    const resolvePromise = code ? exchangeGoogleCode(code, "complete") : exchangeGoogleCookie("complete");
    resolvePromise
      .then(result => {
        if (cancelled) return;
        if (!result.token) {
          setError(tr("Код авторизації недійсний або прострочений.", "Authorization code is invalid or expired."));
          return;
        }
        setToken(result.token);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessageFromUnknown(err, tr("Код авторизації недійсний або прострочений.", "Authorization code is invalid or expired.")));
      })
      .finally(() => { if (!cancelled) setResolvingCode(false); });
    return () => { cancelled = true; };
  }, [legacyToken, code]);

  useEffect(() => {
    if (!token && !resolvingCode) {
      setError(tr("Токен відсутній. Будь ласка, спробуйте ще раз.", "Token is missing. Please try again."));
      return;
    }
    if (!token) return;
    try {
      const payload = readTokenPayload(token);
      if (payload.firstName) setFirstName(payload.firstName);
      if (payload.lastName) setLastName(payload.lastName);
      if (payload.birthDay) setBirthDay(Number(payload.birthDay));
      if (payload.birthMonth) setBirthMonth(Number(payload.birthMonth));
      if (payload.email) setUsername(payload.email.split("@")[0]);
      if (payload.userMode) setUserMode(payload.userMode);
      setGoogleData(payload);
    } catch (err) {
      setGoogleData(null);
      setError(getErrorMessageFromUnknown(err, tr("Не вдалося обробити Google-профіль. Спробуйте ще раз.", "Failed to process the Google profile. Please try again.")));
    }
  }, [token, resolvingCode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim()) return setError(tr("Логін обов'язковий", "Username is required"));
    if (!password || password.length < 8) return setError(tr("Пароль має містити щонайменше 8 символів", "Password must be at least 8 characters"));
    if (password !== confirmPassword) return setError(tr("Паролі не збігаються", "Passwords do not match"));
    if (!firstName.trim() || !lastName.trim()) return setError(tr("Ім'я та прізвище обов'язкові", "First name and last name are required"));
    if (!birthDay || !birthMonth || birthDay < 1 || birthDay > 31 || birthMonth < 1 || birthMonth > 12) return setError(tr("Вкажіть коректний день і місяць народження", "Enter a valid birth day and month"));
    if (!token) return setError(tr("Сесія Google завершилася. Спробуйте увійти ще раз.", "The Google session has expired. Please sign in again."));

    setLoading(true);
    try {
      const response = await api.post("/auth/google/complete", {
        token,
        username: username.trim(),
        password,
        course,
        userMode,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDay: Number(birthDay),
        birthMonth: Number(birthMonth)
      });
      const data = response.data as { token?: string; user?: User };
      if (data.token && data.user) {
        localStorage.setItem("token", data.token);
        api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
        onAuth(data.user);
      } else {
        setError(tr("Не вдалося завершити реєстрацію.", "Failed to complete registration."));
      }
    } catch (err: unknown) {
      setError(getErrorMessageFromUnknown(err, tr("Не вдалося завершити реєстрацію.", "Failed to complete registration.")));
    } finally {
      setLoading(false);
    }
  };

  const hasGoogleName = Boolean(googleData?.firstName || googleData?.lastName);
  const hasGoogleBirthday = Boolean(googleData?.birthDay && googleData?.birthMonth);

  if (resolvingCode) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f8f5] text-[#111814] dark:bg-[#0c110e] dark:text-white"><div className="flex items-center gap-3 text-sm font-semibold"><LoaderCircle className="size-5 animate-spin text-[#00b963]" />{tr("Перевіряємо вхід через Google…", "Verifying Google sign-in…")}</div></div>;
  }

  if (!token) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f8f5] px-5 text-[#111814] dark:bg-[#0c110e] dark:text-white"><div className="w-full max-w-[440px] space-y-5"><span className="grid size-12 place-items-center rounded-2xl bg-[#00ff88] text-[#07140d]"><AlertCircle className="size-5" /></span><h1 className="text-3xl font-bold tracking-[-.05em]">{tr("Не вдалося продовжити", "Unable to continue")}</h1><p className="text-sm leading-6 text-[#667169] dark:text-[#9faba3]">{error}</p><button onClick={() => navigate("/", { replace: true })} className={primaryButtonClass}>{tr("Повернутися на головну", "Back to home")}<ArrowRight className="size-4" /></button></div></div>;
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0c110e] dark:text-[#f4f7f4]">
      <div className="grid min-h-[100dvh] grid-cols-[minmax(380px,.92fr)_minmax(560px,1.08fr)] max-[980px]:grid-cols-1">
        <aside className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#101713] px-[clamp(32px,5vw,76px)] py-10 text-white max-[980px]:hidden">
          <div className="absolute -left-48 -top-52 -z-10 size-[520px] rounded-full bg-[#00ff88]/10 blur-[100px]" />
          <div className="absolute -bottom-52 -right-56 -z-10 size-[540px] rounded-full bg-[#ff8c00]/10 blur-[110px]" />
          <button onClick={() => navigate("/", { replace: true })} className="flex w-fit items-center gap-2.5 text-xl font-bold tracking-[-0.04em]"><span className="grid size-10 place-items-center rounded-[13px] border border-white/10 bg-white/[0.07]"><Logo size={27} /></span>StudyCod</button>
          <motion.div initial={prefersReducedMotion ? undefined : { opacity: 0, y: 22 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .65, ease: [0.16, 1, .3, 1] }} className="my-auto max-w-[500px] py-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-semibold text-[#b2bdb6]"><span className="size-1.5 rounded-full bg-[#00ff88]" />{tr("Ще один крок до старту", "One step before you start")}</span>
            <h2 className="mt-7 text-balance text-[clamp(42px,4.6vw,68px)] font-bold leading-[1.02] tracking-[-0.055em]">{tr("Твій профіль. Твій темп. Твої задачі.", "Your profile. Your pace. Your challenges.")}</h2>
            <p className="mt-6 max-w-[450px] text-[16px] leading-7 text-[#aab5ad]">{tr("Збережи кілька деталей — і StudyCod підготує навчальний простір саме для тебе.", "Save a few details and StudyCod will shape a learning space around you.")}</p>
            <div className="mt-12 space-y-3">
              {[tr("Ім’я та прізвище з Google", "Name from Google"), tr("Дані захищені та використовуються лише для профілю", "Your data stays protected and is used for your profile"), tr("Можна змінити все пізніше", "You can change everything later")].map(item => <div key={item} className="flex items-center gap-3 text-[13px] text-[#d4dcd7]"><span className="grid size-7 place-items-center rounded-full bg-[#00ff88]/10 text-[#62efaa]"><Check className="size-4" /></span>{item}</div>)}
            </div>
          </motion.div>
          <p className="text-[13px] leading-5 text-[#7f8d84]">{tr("Навчання, яке підлаштовується під тебе.", "Learning that adapts to you.")}</p>
        </aside>

        <main className="relative flex min-h-[100dvh] items-center justify-center px-6 py-10 max-sm:px-4">
          <div className="absolute left-6 top-5 flex items-center gap-2 min-[981px]:hidden"><span className="grid size-9 place-items-center rounded-xl border border-[#122017]/10 bg-white dark:border-white/10 dark:bg-[#182019]"><Logo size={24} /></span><strong className="text-lg tracking-[-.04em]">StudyCod</strong></div>
          <div className="absolute right-6 top-5 flex items-center gap-2 max-sm:right-4">
            <button onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] transition hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#171e19] dark:text-[#a7b2aa]" title={tr("Перемкнути на англійську", "Switch to Ukrainian")}><Globe className="size-4" /></button>
            <button onClick={() => { const next = theme === "dark" ? "light" : "dark"; applyTheme(next); setTheme(next); }} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] transition hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#171e19] dark:text-[#a7b2aa]" title={theme === "dark" ? tr("Увімкнути світлу тему", "Use light theme") : tr("Увімкнути темну тему", "Use dark theme")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
          </div>

          <motion.div initial={prefersReducedMotion ? undefined : { opacity: 0, y: 18 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .55, ease: [0.16, 1, .3, 1] }} className="w-full max-w-[560px] py-16">
            <button onClick={() => navigate("/", { replace: true })} className="mb-9 inline-flex items-center gap-2 text-[13px] font-semibold text-[#667169] transition hover:text-[#111814] dark:text-[#94a198] dark:hover:text-white"><ArrowLeft className="size-4" />{tr("На головну", "Back to home")}</button>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#008c4c] dark:text-[#62efaa]"><Sparkles className="size-4" />{tr("Крок 2 з 2 · профіль", "Step 2 of 2 · profile")}</div>
            <h1 className="mt-4 text-balance text-[clamp(34px,4vw,48px)] font-bold leading-[1.06] tracking-[-0.05em]">{tr("Налаштуйте свій профіль", "Set up your profile")}</h1>
            <p className="mt-4 text-[15px] leading-7 text-[#667169] dark:text-[#9faba3]">{tr("Google підтвердив акаунт. Додайте кілька деталей, щоб завершити реєстрацію.", "Google verified your account. Add a few details to finish registration.")}</p>

            <div className="mt-7 flex items-center gap-3 rounded-[18px] border border-[#00b963]/20 bg-[#00ff88]/[0.06] p-4 dark:bg-[#00ff88]/[0.05]">
              <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#00ff88] text-[#07140d]"><CheckCircle2 className="size-5" /></span>
              <div className="min-w-0"><strong className="block text-[13px]">{tr("Google-профіль підключено", "Google profile connected")}</strong><span className="mt-1 block truncate text-[12px] text-[#667169] dark:text-[#9eaaa2]">{googleData?.email || tr("Дані отримано успішно", "Details received successfully")}</span></div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div><label htmlFor={`${idPrefix}-username`} className={fieldLabelClass}>{tr("Логін", "Username")}</label><input id={`${idPrefix}-username`} type="text" className={fieldInputClass} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />{googleData?.email && <p className="mt-2 text-[12px] text-[#7b877f] dark:text-[#87948b]">{tr("Запропоновано з email Google", "Suggested from your Google email")}</p>}</div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor={`${idPrefix}-first-name`} className={fieldLabelClass}>{tr("Ім’я", "First name")}</label><input id={`${idPrefix}-first-name`} type="text" className={fieldInputClass} value={firstName} onChange={event => setFirstName(event.target.value)} autoComplete="given-name" required />{hasGoogleName && <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#008c4c] dark:text-[#62efaa]"><Check className="size-3.5" />{tr("З Google", "From Google")}</span>}</div>
                <div><label htmlFor={`${idPrefix}-last-name`} className={fieldLabelClass}>{tr("Прізвище", "Last name")}</label><input id={`${idPrefix}-last-name`} type="text" className={fieldInputClass} value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" required /></div>
              </div>

              <div><div className="flex items-center justify-between gap-3"><label className={fieldLabelClass}>{tr("День і місяць народження", "Birth day and month")}</label>{hasGoogleBirthday && <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#008c4c] dark:text-[#62efaa]"><Check className="size-3.5" />{tr("З Google", "From Google")}</span>}</div><div className="grid grid-cols-2 gap-3"><input id={`${idPrefix}-birth-day`} aria-label={tr("День", "Day")} type="number" min="1" max="31" className={fieldInputClass} value={birthDay} onChange={event => setBirthDay(event.target.value ? Number(event.target.value) : "")} placeholder={tr("День", "Day")} required /><input id={`${idPrefix}-birth-month`} aria-label={tr("Місяць", "Month")} type="number" min="1" max="12" className={fieldInputClass} value={birthMonth} onChange={event => setBirthMonth(event.target.value ? Number(event.target.value) : "")} placeholder={tr("Місяць", "Month")} required /></div></div>

              <div><label htmlFor={`${idPrefix}-password`} className={fieldLabelClass}>{tr("Створіть пароль", "Create a password")}</label><div className="relative"><Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8a948d]" /><input id={`${idPrefix}-password`} type="password" className={`${fieldInputClass} pl-11`} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></div><p className="mt-2 text-[12px] text-[#7b877f] dark:text-[#87948b]">{tr("Не менше 8 символів. Це буде пароль для входу в StudyCod.", "At least 8 characters. This will be your StudyCod sign-in password.")}</p></div>
              <div><label htmlFor={`${idPrefix}-confirm-password`} className={fieldLabelClass}>{tr("Підтвердіть пароль", "Confirm password")}</label><input id={`${idPrefix}-confirm-password`} type="password" className={fieldInputClass} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></div>

              <div><label className={fieldLabelClass}>{tr("Мова навчання", "Learning language")}</label><div className="grid grid-cols-3 gap-2">{(["JAVA", "PYTHON", "CPP"] as CourseLanguage[]).map(language => <button key={language} type="button" onClick={() => setCourse(language)} className={`h-12 rounded-[14px] border text-[12px] font-bold transition ${course === language ? "border-[#00b963]/35 bg-[#00ff88]/10 text-[#007f48] dark:text-[#64eead]" : "border-[#122017]/10 bg-white text-[#667169] hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#151d17] dark:text-[#9eaaa2]"}`}>{language === "CPP" ? "C++" : language === "JAVA" ? "Java" : "Python"}</button>)}</div></div>

              {error && <div className="flex items-start gap-2.5 rounded-[14px] border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-3.5 text-[13px] leading-5 text-[#d33d70] dark:text-[#ff91b7]"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
              <button type="submit" className={primaryButtonClass} disabled={loading}>{loading ? <><LoaderCircle className="size-4 animate-spin" />{tr("Створюємо профіль…", "Creating profile…")}</> : <>{tr("Завершити реєстрацію", "Complete registration")}<ArrowRight className="size-4" /></>}</button>
              <p className="text-center text-[12px] leading-5 text-[#7b877f] dark:text-[#87948b]">{tr("Твої дані залишаються приватними. Їх можна змінити в профілі.", "Your data stays private. You can change it later in your profile.")}</p>
            </form>
          </motion.div>
        </main>
      </div>
    </div>
  );
};
