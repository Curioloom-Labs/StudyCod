import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import type { CourseLanguage, User } from "../../types";
import { tr } from "../../i18n";
import { api } from "../../lib/api/client";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { exchangeGoogleCode, exchangeGoogleCookie } from "../../lib/api/auth";
import { AlertCircle, Loader2 } from "lucide-react";
import { staggerContainer, fadeUpItem } from "../../lib/motion";

type GoogleTokenPayload = {
  firstName?: string;
  lastName?: string;
  birthDay?: number | string;
  birthMonth?: number | string;
  email?: string;
  userMode?: "PERSONAL" | "EDUCATIONAL" | "CONTEST";
};

interface Props {
  onAuth: (user: User) => void;
}

export const GoogleAuthCompletePage: React.FC<Props> = ({ onAuth }) => {
  useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const legacyToken = searchParams.get("token");
  const code = searchParams.get("code");
  const [token, setToken] = useState<string | null>(legacyToken);
  const [resolvingCode, setResolvingCode] = useState<boolean>(!legacyToken && !!code);
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

  useEffect(() => {
    if (legacyToken) return;
    const attemptKey = code ? `code:${code}` : "cookie:complete";
    if (exchangeAttemptKeyRef.current === attemptKey) return;
    exchangeAttemptKeyRef.current = attemptKey;
    let cancelled = false;
    setResolvingCode(true);
    setError(null);
    const resolvePromise = code
      ? exchangeGoogleCode(code, "complete")
      : exchangeGoogleCookie("complete");
    resolvePromise
      .then((result) => {
        if (cancelled) return;
        if (!result.token) {
          setError(tr("Код авторизації недійсний або прострочений.", "Authorization code is invalid or expired."));
          return;
        }
        setToken(result.token);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(getErrorMessageFromUnknown(err, tr("Код авторизації недійсний або прострочений.", "Authorization code is invalid or expired.")));
      })
      .finally(() => { if (!cancelled) setResolvingCode(false); });
    return () => { cancelled = true; };
  }, [legacyToken, code]);

  useEffect(() => {
    if (!token && !resolvingCode) {
      setError(tr("Токен відсутній. Будь ласка, спробуйте знову.", "Token is missing. Please try again."));
      return;
    }
    if (!token) return;
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
      const payload = JSON.parse(jsonPayload) as GoogleTokenPayload;
      if (payload.firstName) setFirstName(payload.firstName);
      if (payload.lastName) setLastName(payload.lastName);
      if (payload.birthDay) setBirthDay(Number(payload.birthDay));
      if (payload.birthMonth) setBirthMonth(Number(payload.birthMonth));
      if (payload.email) { setUsername(payload.email.split("@")[0]); }
      if (payload.userMode === "EDUCATIONAL" || payload.userMode === "CONTEST" || payload.userMode === "PERSONAL") {
        setUserMode(payload.userMode);
      }
      setGoogleData(payload);
    } catch (err) {
      setGoogleData(null);
      setError(getErrorMessageFromUnknown(err, tr("Не вдалося обробити Google-токен. Спробуйте ще раз.", "Failed to process Google token. Please try again.")));
    }
  }, [token, resolvingCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) { setError(tr("Логін обов'язковий", "Username is required")); return; }
    if (!password) { setError(tr("Пароль обов'язковий", "Password is required")); return; }
    if (password !== confirmPassword) { setError(tr("Паролі не співпадають", "Passwords do not match")); return; }
    if (password.length < 6) { setError(tr("Пароль має бути мінімум 6 символів", "Password must be at least 6 characters")); return; }
    if (!firstName.trim() || !lastName.trim()) { setError(tr("Ім'я та прізвище обов'язкові", "First name and last name are required")); return; }
    if (!birthDay || !birthMonth) { setError(tr("День та місяць народження обов'язкові", "Birth day and month are required")); return; }
    if (birthDay < 1 || birthDay > 31 || birthMonth < 1 || birthMonth > 12) { setError(tr("Невірна дата народження", "Invalid date of birth")); return; }
    setLoading(true);
    try {
      const res = await api.post("/auth/google/complete", {
        token, username: username.trim(), password, course, userMode,
        firstName: firstName.trim(), lastName: lastName.trim(),
        birthDay: Number(birthDay), birthMonth: Number(birthMonth)
      });
      const data = res.data;
      if (data.token) { localStorage.setItem("token", data.token); onAuth(data.user); }
    } catch (err: unknown) {
      setError(getErrorMessageFromUnknown(err, tr("Помилка завершення реєстрації", "Failed to complete registration")));
    } finally {
      setLoading(false);
    }
  };

  const fieldInputClass = "w-full bg-bg-code border border-border text-text-primary rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-fast placeholder:text-text-muted";
  const fieldLabelClass = "text-[0.7rem] font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 block";

  if (resolvingCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="rounded-xl border border-border bg-bg-surface p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm font-mono text-text-secondary">{tr("Перевіряємо вхід через Google...", "Verifying Google sign-in...")}</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
        <div className="w-full max-w-[400px] rounded-xl border border-border bg-bg-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-bg-code/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
            </div>
            <span className="text-[10px] font-mono text-text-muted">google-auth</span>
            <div className="w-16" />
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-accent-error/50 bg-accent-error/10 px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-accent-error shrink-0 mt-0.5" />
              <span className="text-xs font-mono text-accent-error">
                {error || tr("Токен відсутній. Будь ласка, спробуйте знову.", "Token is missing. Please try again.")}
              </span>
            </div>
            <Button onClick={() => navigate("/")} className="w-full">
              {tr("Повернутись на головну", "Back to home")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-8">
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial={prefersReducedMotion ? undefined : "initial"}
        animate={prefersReducedMotion ? undefined : "animate"}
        className="w-full max-w-[420px]"
      >
        <motion.div
          variants={prefersReducedMotion ? undefined : fadeUpItem}
          className="rounded-xl border border-border bg-bg-surface overflow-hidden shadow-[0_24px_48px_-16px_rgba(0,0,0,0.5)]"
        >
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-border bg-bg-code/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
            </div>
            <span className="text-[10px] font-mono text-text-muted tracking-[0.08em]">google-complete</span>
            <div className="w-16" />
          </div>

          <div className="p-6">
            <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="mb-4">
              <span className="block font-mono text-xs text-primary/70 mb-0.5">// complete registration</span>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">
                {tr("Завершення реєстрації", "Complete Registration")}
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                {tr("Заповніть додаткову інформацію для завершення реєстрації через Google", "Fill in additional info to finish Google registration")}
              </p>
            </motion.div>

            <div className="mb-5 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

            <form onSubmit={handleSubmit} className="space-y-3">
              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
                <label className={fieldLabelClass}>{tr("Логін", "Username")}</label>
                <input type="text" className={fieldInputClass} value={username} onChange={e => setUsername(e.target.value)} required />
                {googleData?.email && (
                  <p className="mt-1 text-[11px] font-mono text-text-muted">
                    {tr("Запропоновано:", "Suggested:")} {googleData.email.split("@")[0]}
                  </p>
                )}
              </motion.div>

              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
                <label className={fieldLabelClass}>{tr("Пароль", "Password")}</label>
                <input type="password" className={fieldInputClass} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </motion.div>

              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
                <label className={fieldLabelClass}>{tr("Підтвердити пароль", "Confirm password")}</label>
                <input type="password" className={fieldInputClass} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
              </motion.div>

              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem} className="grid grid-cols-2 gap-2">
                <div>
                  <label className={fieldLabelClass}>{tr("Ім'я", "First name")}</label>
                  <input type="text" className={fieldInputClass} value={firstName} onChange={e => setFirstName(e.target.value)} required />
                </div>
                <div>
                  <label className={fieldLabelClass}>{tr("Прізвище", "Last name")}</label>
                  <input type="text" className={fieldInputClass} value={lastName} onChange={e => setLastName(e.target.value)} required />
                </div>
              </motion.div>

              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
                <label className={fieldLabelClass}>{tr("День народження (без року)", "Birthday (day and month)")}</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="1" max="31" className={fieldInputClass} value={birthDay} onChange={e => setBirthDay(e.target.value ? Number(e.target.value) : "")} placeholder={tr("День 1–31", "Day 1–31")} required />
                  <input type="number" min="1" max="12" className={fieldInputClass} value={birthMonth} onChange={e => setBirthMonth(e.target.value ? Number(e.target.value) : "")} placeholder={tr("Місяць 1–12", "Month 1–12")} required />
                </div>
              </motion.div>

              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
                <label className={fieldLabelClass}>{tr("Мова курсу", "Course language")}</label>
                <div className="flex gap-2">
                  {(["JAVA", "PYTHON", "CPP"] as CourseLanguage[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setCourse(lang)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-mono transition-fast ${
                        course === lang
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-text-secondary hover:border-primary/40 hover:text-text-primary"
                      }`}
                    >
                      {lang === "CPP" ? "C++" : lang === "JAVA" ? "Java" : "Python"}
                    </button>
                  ))}
                </div>
              </motion.div>

              {error && (
                <motion.div
                  variants={prefersReducedMotion ? undefined : fadeUpItem}
                  className="flex items-start gap-2 rounded-lg border border-accent-error/50 bg-accent-error/10 px-3 py-2.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-accent-error shrink-0 mt-0.5" />
                  <span className="text-xs font-mono text-accent-error">{error}</span>
                </motion.div>
              )}

              <motion.div variants={prefersReducedMotion ? undefined : fadeUpItem}>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? tr("Обробка...", "Processing...") : tr("Завершити реєстрацію", "Complete registration")}
                </Button>
              </motion.div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
