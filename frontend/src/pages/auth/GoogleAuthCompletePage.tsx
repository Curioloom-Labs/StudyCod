import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import type { CourseLanguage, User } from "../../types";
import { tr } from "../../i18n";
import { api } from "../../lib/api/client";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { exchangeGoogleCode, exchangeGoogleCookie } from "../../lib/api/auth";

type GoogleTokenPayload = {
  firstName?: string;
  lastName?: string;
  birthDay?: number | string;
  birthMonth?: number | string;
  email?: string;
};

interface Props {
  onAuth: (user: User) => void;
}
export const GoogleAuthCompletePage: React.FC<Props> = ({
  onAuth
}) => {
  useTranslation();
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
      .finally(() => {
        if (!cancelled) setResolvingCode(false);
      });
    return () => {
      cancelled = true;
    };
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
      if (payload.email) {
        const suggestedUsername = payload.email.split("@")[0];
        setUsername(suggestedUsername);
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
    if (!username.trim()) {
      setError(tr("Логін обов'язковий", "Username is required"));
      return;
    }
    if (!password) {
      setError(tr("Пароль обов'язковий", "Password is required"));
      return;
    }
    if (password !== confirmPassword) {
      setError(tr("Паролі не співпадають", "Passwords do not match"));
      return;
    }
    if (password.length < 6) {
      setError(tr("Пароль має бути мінімум 6 символів", "Password must be at least 6 characters"));
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError(tr("Ім'я та прізвище обов'язкові", "First name and last name are required"));
      return;
    }
    if (!birthDay || !birthMonth) {
      setError(tr("День та місяць народження обов'язкові", "Birth day and month are required"));
      return;
    }
    if (birthDay < 1 || birthDay > 31 || birthMonth < 1 || birthMonth > 12) {
      setError(tr("Невірна дата народження", "Invalid date of birth"));
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/google/complete", {
        token,
        username: username.trim(),
        password,
        course,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDay: Number(birthDay),
        birthMonth: Number(birthMonth)
      });
      const data = res.data;
      if (data.token) {
        localStorage.setItem("token", data.token);
        onAuth(data.user);
      }
    } catch (err: unknown) {
      setError(getErrorMessageFromUnknown(err, tr("Помилка завершення реєстрації", "Failed to complete registration")));
    } finally {
      setLoading(false);
    }
  };
  if (resolvingCode) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="w-full max-w-md bg-bg-surface border border-border p-8">
          <div className="text-xs font-mono text-text-secondary border border-border bg-bg-code px-3 py-2">
            {tr("Перевіряємо вхід через Google...", "Verifying Google sign-in...")}
          </div>
        </div>
      </div>;
  }
  if (!token) {
    return <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="w-full max-w-md bg-bg-surface border border-border p-8">
          <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
            {error || tr("Токен відсутній. Будь ласка, спробуйте знову.", "Token is missing. Please try again.")}
          </div>
          <Button onClick={() => navigate("/")} className="w-full mt-4">
            {tr("Повернутись на головну", "Back to home")}
          </Button>
        </div>
      </div>;
  }
  return <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 py-6">
      <div className="w-full max-w-md bg-bg-surface border border-border p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 border border-primary flex items-center justify-center font-mono text-xl text-primary">
            &lt;/&gt;
          </div>
          <h1 className="mt-4 text-xl font-mono text-text-primary">
            {tr("Завершення реєстрації", "Complete registration")}
          </h1>
          <p className="mt-2 text-xs font-mono text-text-secondary text-center">
            {tr("Заповніть додаткову інформацію для завершення реєстрації через Google", "Fill in the additional information to finish registration via Google")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("Логін", "Username")}</label>
            <input type="text" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={username} onChange={e => setUsername(e.target.value)} required />
            {googleData?.email && <p className="mt-1 text-xs font-mono text-text-secondary">
                {tr("Запропоновано з email:", "Suggested from email:")} {googleData.email.split("@")[0]}
              </p>}
          </div>

          <div>
            <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("Пароль", "Password")}</label>
            <input type="password" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>

          <div>
            <label className="text-xs font-mono text-text-secondary mb-1 block">
              {tr("Підтвердити пароль", "Confirm password")}
            </label>
            <input type="password" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("Ім'я", "First name")}</label>
              <input type="text" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-mono text-text-secondary mb-1 block">{tr("Прізвище", "Last name")}</label>
              <input type="text" className="w-full border border-border bg-bg-code px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-primary transition-fast" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-text-secondary mb-1 block">
              {tr("День народження (без року)", "Birthday (day and month)")}
            </label>
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

          <div>
            <label className="text-xs font-mono text-text-secondary mb-2 block">{tr("Мова курсу", "Course language")}</label>
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
          </div>

          {error && <div className="text-xs font-mono text-accent-error border border-accent-error bg-bg-code px-3 py-2">
              {error}
            </div>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? tr("Обробка...", "Processing...") : tr("Завершити реєстрацію", "Complete registration")}
          </Button>
        </form>
      </div>
    </div>;
};
