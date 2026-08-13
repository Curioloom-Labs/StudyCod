import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Globe, LoaderCircle, Lock, Moon, Sparkles, Sun } from "lucide-react";
import type { User } from "../../types";
import { tr } from "../../i18n";
import { api } from "../../lib/api/client";
import { primeGetMeCache } from "../../lib/api/profile";
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
  const [setupToken, setSetupToken] = useState<string | null>(legacyToken);
  const [resolvingCode, setResolvingCode] = useState(!legacyToken && !!code);
  const [theme, setTheme] = useState<"dark" | "light">(() => getCurrentTheme());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
        if (!result.setupToken) {
          setError(tr("РљРѕРґ Р°РІС‚РѕСЂРёР·Р°С†С–С— РЅРµРґС–Р№СЃРЅРёР№ Р°Р±Рѕ РїСЂРѕСЃС‚СЂРѕС‡РµРЅРёР№.", "Authorization code is invalid or expired."));
          return;
        }
        setSetupToken(result.setupToken);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessageFromUnknown(err, tr("РљРѕРґ Р°РІС‚РѕСЂРёР·Р°С†С–С— РЅРµРґС–Р№СЃРЅРёР№ Р°Р±Рѕ РїСЂРѕСЃС‚СЂРѕС‡РµРЅРёР№.", "Authorization code is invalid or expired.")));
      })
      .finally(() => { if (!cancelled) setResolvingCode(false); });
    return () => { cancelled = true; };
  }, [legacyToken, code]);

  useEffect(() => {
    if (!setupToken && !resolvingCode) {
      setError(tr("РўРѕРєРµРЅ РІС–РґСЃСѓС‚РЅС–Р№. Р‘СѓРґСЊ Р»Р°СЃРєР°, СЃРїСЂРѕР±СѓР№С‚Рµ С‰Рµ СЂР°Р·.", "Token is missing. Please try again."));
      return;
    }
    if (!setupToken) return;
    try {
      const payload = readTokenPayload(setupToken);
      if (payload.firstName) setFirstName(payload.firstName);
      if (payload.lastName) setLastName(payload.lastName);
      if (payload.birthDay) setBirthDay(Number(payload.birthDay));
      if (payload.birthMonth) setBirthMonth(Number(payload.birthMonth));
      if (payload.email) setUsername(payload.email.split("@")[0]);
      if (payload.userMode) setUserMode(payload.userMode);
      setGoogleData(payload);
    } catch (err) {
      setGoogleData(null);
      setError(getErrorMessageFromUnknown(err, tr("РќРµ РІРґР°Р»РѕСЃСЏ РѕР±СЂРѕР±РёС‚Рё Google-РїСЂРѕС„С–Р»СЊ. РЎРїСЂРѕР±СѓР№С‚Рµ С‰Рµ СЂР°Р·.", "Failed to process the Google profile. Please try again.")));
    }
  }, [setupToken, resolvingCode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim()) return setError(tr("Р›РѕРіС–РЅ РѕР±РѕРІ'СЏР·РєРѕРІРёР№", "Username is required"));
    if (!password || password.length < 8) return setError(tr("РџР°СЂРѕР»СЊ РјР°С” РјС–СЃС‚РёС‚Рё С‰РѕРЅР°Р№РјРµРЅС€Рµ 8 СЃРёРјРІРѕР»С–РІ", "Password must be at least 8 characters"));
    if (password !== confirmPassword) return setError(tr("РџР°СЂРѕР»С– РЅРµ Р·Р±С–РіР°СЋС‚СЊСЃСЏ", "Passwords do not match"));
    if (!firstName.trim() || !lastName.trim()) return setError(tr("Р†Рј'СЏ С‚Р° РїСЂС–Р·РІРёС‰Рµ РѕР±РѕРІ'СЏР·РєРѕРІС–", "First name and last name are required"));
    if (!birthDay || !birthMonth || birthDay < 1 || birthDay > 31 || birthMonth < 1 || birthMonth > 12) return setError(tr("Р’РєР°Р¶С–С‚СЊ РєРѕСЂРµРєС‚РЅРёР№ РґРµРЅСЊ С– РјС–СЃСЏС†СЊ РЅР°СЂРѕРґР¶РµРЅРЅСЏ", "Enter a valid birth day and month"));
    if (!setupToken) return setError(tr("РЎРµСЃС–СЏ Google Р·Р°РІРµСЂС€РёР»Р°СЃСЏ. РЎРїСЂРѕР±СѓР№С‚Рµ СѓРІС–Р№С‚Рё С‰Рµ СЂР°Р·.", "The Google session has expired. Please sign in again."));

    setLoading(true);
    try {
      const response = await api.post("/auth/google/complete", {
        setupToken,
        username: username.trim(),
        password,
        userMode,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDay: Number(birthDay),
        birthMonth: Number(birthMonth)
      });
      const data = response.data as { user?: User };
      if (data.user) {
        primeGetMeCache(data.user);
        onAuth(data.user);
      } else {
        setError(tr("РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІРµСЂС€РёС‚Рё СЂРµС”СЃС‚СЂР°С†С–СЋ.", "Failed to complete registration."));
      }
    } catch (err: unknown) {
      setError(getErrorMessageFromUnknown(err, tr("РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІРµСЂС€РёС‚Рё СЂРµС”СЃС‚СЂР°С†С–СЋ.", "Failed to complete registration.")));
    } finally {
      setLoading(false);
    }
  };

  const hasGoogleName = Boolean(googleData?.firstName || googleData?.lastName);
  const hasGoogleBirthday = Boolean(googleData?.birthDay && googleData?.birthMonth);

  if (resolvingCode) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f8f5] text-[#111814] dark:bg-[#0c110e] dark:text-white"><div className="flex items-center gap-3 text-sm font-semibold"><LoaderCircle className="size-5 animate-spin text-[#00b963]" />{tr("РџРµСЂРµРІС–СЂСЏС”РјРѕ РІС…С–Рґ С‡РµСЂРµР· GoogleвЂ¦", "Verifying Google sign-inвЂ¦")}</div></div>;
  }

  if (!setupToken) {
    return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f8f5] px-5 text-[#111814] dark:bg-[#0c110e] dark:text-white"><div className="w-full max-w-[440px] space-y-5"><span className="grid size-12 place-items-center rounded-2xl bg-[#00ff88] text-[#07140d]"><AlertCircle className="size-5" /></span><h1 className="text-3xl font-bold tracking-[-.05em]">{tr("РќРµ РІРґР°Р»РѕСЃСЏ РїСЂРѕРґРѕРІР¶РёС‚Рё", "Unable to continue")}</h1><p className="text-sm leading-6 text-[#667169] dark:text-[#9faba3]">{error}</p><button onClick={() => navigate("/", { replace: true })} className={primaryButtonClass}>{tr("РџРѕРІРµСЂРЅСѓС‚РёСЃСЏ РЅР° РіРѕР»РѕРІРЅСѓ", "Back to home")}<ArrowRight className="size-4" /></button></div></div>;
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f8f5] font-sans text-[#111814] dark:bg-[#0c110e] dark:text-[#f4f7f4]">
      <div className="grid min-h-[100dvh] grid-cols-[minmax(380px,.92fr)_minmax(560px,1.08fr)] max-[980px]:grid-cols-1">
        <aside className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-[#101713] px-[clamp(32px,5vw,76px)] py-10 text-white max-[980px]:hidden">
          <div className="absolute -left-48 -top-52 -z-10 size-[520px] rounded-full bg-[#00ff88]/10 blur-[100px]" />
          <div className="absolute -bottom-52 -right-56 -z-10 size-[540px] rounded-full bg-[#ff8c00]/10 blur-[110px]" />
          <button onClick={() => navigate("/", { replace: true })} className="flex w-fit items-center gap-2.5 text-xl font-bold tracking-[-0.04em]"><span className="grid size-10 place-items-center rounded-[13px] border border-white/10 bg-white/[0.07]"><Logo size={27} /></span>StudyCod</button>
          <motion.div initial={prefersReducedMotion ? undefined : { opacity: 0, y: 22 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .65, ease: [0.16, 1, .3, 1] }} className="my-auto max-w-[500px] py-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-semibold text-[#b2bdb6]"><span className="size-1.5 rounded-full bg-[#00ff88]" />{tr("Р©Рµ РѕРґРёРЅ РєСЂРѕРє РґРѕ СЃС‚Р°СЂС‚Сѓ", "One step before you start")}</span>
            <h2 className="mt-7 text-balance text-[clamp(42px,4.6vw,68px)] font-bold leading-[1.02] tracking-[-0.055em]">{tr("РўРІС–Р№ РїСЂРѕС„С–Р»СЊ. РўРІС–Р№ С‚РµРјРї. РўРІРѕС— Р·Р°РґР°С‡С–.", "Your profile. Your pace. Your challenges.")}</h2>
            <p className="mt-6 max-w-[450px] text-[16px] leading-7 text-[#aab5ad]">{tr("Р—Р±РµСЂРµР¶Рё РєС–Р»СЊРєР° РґРµС‚Р°Р»РµР№ вЂ” С– StudyCod РїС–РґРіРѕС‚СѓС” РЅР°РІС‡Р°Р»СЊРЅРёР№ РїСЂРѕСЃС‚С–СЂ СЃР°РјРµ РґР»СЏ С‚РµР±Рµ.", "Save a few details and StudyCod will shape a learning space around you.")}</p>
            <div className="mt-12 space-y-3">
              {[tr("Р†РјвЂ™СЏ С‚Р° РїСЂС–Р·РІРёС‰Рµ Р· Google", "Name from Google"), tr("Р”Р°РЅС– Р·Р°С…РёС‰РµРЅС– С‚Р° РІРёРєРѕСЂРёСЃС‚РѕРІСѓСЋС‚СЊСЃСЏ Р»РёС€Рµ РґР»СЏ РїСЂРѕС„С–Р»СЋ", "Your data stays protected and is used for your profile"), tr("РњРѕР¶РЅР° Р·РјС–РЅРёС‚Рё РІСЃРµ РїС–Р·РЅС–С€Рµ", "You can change everything later")].map(item => <div key={item} className="flex items-center gap-3 text-[13px] text-[#d4dcd7]"><span className="grid size-7 place-items-center rounded-full bg-[#00ff88]/10 text-[#62efaa]"><Check className="size-4" /></span>{item}</div>)}
            </div>
          </motion.div>
          <p className="text-[13px] leading-5 text-[#7f8d84]">{tr("РќР°РІС‡Р°РЅРЅСЏ, СЏРєРµ РїС–РґР»Р°С€С‚РѕРІСѓС”С‚СЊСЃСЏ РїС–Рґ С‚РµР±Рµ.", "Learning that adapts to you.")}</p>
        </aside>

        <main className="relative flex min-h-[100dvh] items-center justify-center px-6 py-10 max-sm:px-4">
          <div className="absolute left-6 top-5 flex items-center gap-2 min-[981px]:hidden"><span className="grid size-9 place-items-center rounded-xl border border-[#122017]/10 bg-white dark:border-white/10 dark:bg-[#182019]"><Logo size={24} /></span><strong className="text-lg tracking-[-.04em]">StudyCod</strong></div>
          <div className="absolute right-6 top-5 flex items-center gap-2 max-sm:right-4">
            <button onClick={() => i18n.changeLanguage(i18n.language === "uk" ? "en" : "uk")} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] transition hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#171e19] dark:text-[#a7b2aa]" title={tr("РџРµСЂРµРјРєРЅСѓС‚Рё РЅР° Р°РЅРіР»С–Р№СЃСЊРєСѓ", "Switch to Ukrainian")}><Globe className="size-4" /></button>
            <button onClick={() => { const next = theme === "dark" ? "light" : "dark"; applyTheme(next); setTheme(next); }} className="grid size-10 place-items-center rounded-xl border border-[#122017]/10 bg-white text-[#667169] transition hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#171e19] dark:text-[#a7b2aa]" title={theme === "dark" ? tr("РЈРІС–РјРєРЅСѓС‚Рё СЃРІС–С‚Р»Сѓ С‚РµРјСѓ", "Use light theme") : tr("РЈРІС–РјРєРЅСѓС‚Рё С‚РµРјРЅСѓ С‚РµРјСѓ", "Use dark theme")}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
          </div>

          <motion.div initial={prefersReducedMotion ? undefined : { opacity: 0, y: 18 }} animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .55, ease: [0.16, 1, .3, 1] }} className="w-full max-w-[560px] py-16">
            <button onClick={() => navigate("/", { replace: true })} className="mb-9 inline-flex items-center gap-2 text-[13px] font-semibold text-[#667169] transition hover:text-[#111814] dark:text-[#94a198] dark:hover:text-white"><ArrowLeft className="size-4" />{tr("РќР° РіРѕР»РѕРІРЅСѓ", "Back to home")}</button>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#008c4c] dark:text-[#62efaa]"><Sparkles className="size-4" />{tr("РљСЂРѕРє 2 Р· 2 В· РїСЂРѕС„С–Р»СЊ", "Step 2 of 2 В· profile")}</div>
            <h1 className="mt-4 text-balance text-[clamp(34px,4vw,48px)] font-bold leading-[1.06] tracking-[-0.05em]">{tr("РќР°Р»Р°С€С‚СѓР№С‚Рµ СЃРІС–Р№ РїСЂРѕС„С–Р»СЊ", "Set up your profile")}</h1>
            <p className="mt-4 text-[15px] leading-7 text-[#667169] dark:text-[#9faba3]">{tr("Google РїС–РґС‚РІРµСЂРґРёРІ Р°РєР°СѓРЅС‚. Р”РѕРґР°Р№С‚Рµ РєС–Р»СЊРєР° РґРµС‚Р°Р»РµР№, С‰РѕР± Р·Р°РІРµСЂС€РёС‚Рё СЂРµС”СЃС‚СЂР°С†С–СЋ.", "Google verified your account. Add a few details to finish registration.")}</p>

            <div className="mt-7 flex items-center gap-3 rounded-[18px] border border-[#00b963]/20 bg-[#00ff88]/[0.06] p-4 dark:bg-[#00ff88]/[0.05]">
              <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[#00ff88] text-[#07140d]"><CheckCircle2 className="size-5" /></span>
              <div className="min-w-0"><strong className="block text-[13px]">{tr("Google-РїСЂРѕС„С–Р»СЊ РїС–РґРєР»СЋС‡РµРЅРѕ", "Google profile connected")}</strong><span className="mt-1 block truncate text-[12px] text-[#667169] dark:text-[#9eaaa2]">{googleData?.email || tr("Р”Р°РЅС– РѕС‚СЂРёРјР°РЅРѕ СѓСЃРїС–С€РЅРѕ", "Details received successfully")}</span></div>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div><label htmlFor={`${idPrefix}-username`} className={fieldLabelClass}>{tr("Р›РѕРіС–РЅ", "Username")}</label><input id={`${idPrefix}-username`} type="text" className={fieldInputClass} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />{googleData?.email && <p className="mt-2 text-[12px] text-[#7b877f] dark:text-[#87948b]">{tr("Р—Р°РїСЂРѕРїРѕРЅРѕРІР°РЅРѕ Р· email Google", "Suggested from your Google email")}</p>}</div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor={`${idPrefix}-first-name`} className={fieldLabelClass}>{tr("Р†РјвЂ™СЏ", "First name")}</label><input id={`${idPrefix}-first-name`} type="text" className={fieldInputClass} value={firstName} onChange={event => setFirstName(event.target.value)} autoComplete="given-name" required />{hasGoogleName && <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#008c4c] dark:text-[#62efaa]"><Check className="size-3.5" />{tr("Р— Google", "From Google")}</span>}</div>
                <div><label htmlFor={`${idPrefix}-last-name`} className={fieldLabelClass}>{tr("РџСЂС–Р·РІРёС‰Рµ", "Last name")}</label><input id={`${idPrefix}-last-name`} type="text" className={fieldInputClass} value={lastName} onChange={event => setLastName(event.target.value)} autoComplete="family-name" required /></div>
              </div>

              <div><div className="flex items-center justify-between gap-3"><label className={fieldLabelClass}>{tr("Р”РµРЅСЊ С– РјС–СЃСЏС†СЊ РЅР°СЂРѕРґР¶РµРЅРЅСЏ", "Birth day and month")}</label>{hasGoogleBirthday && <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#008c4c] dark:text-[#62efaa]"><Check className="size-3.5" />{tr("Р— Google", "From Google")}</span>}</div><div className="grid grid-cols-2 gap-3"><input id={`${idPrefix}-birth-day`} aria-label={tr("Р”РµРЅСЊ", "Day")} type="number" min="1" max="31" className={fieldInputClass} value={birthDay} onChange={event => setBirthDay(event.target.value ? Number(event.target.value) : "")} placeholder={tr("Р”РµРЅСЊ", "Day")} required /><input id={`${idPrefix}-birth-month`} aria-label={tr("РњС–СЃСЏС†СЊ", "Month")} type="number" min="1" max="12" className={fieldInputClass} value={birthMonth} onChange={event => setBirthMonth(event.target.value ? Number(event.target.value) : "")} placeholder={tr("РњС–СЃСЏС†СЊ", "Month")} required /></div></div>

              <div><label htmlFor={`${idPrefix}-password`} className={fieldLabelClass}>{tr("РЎС‚РІРѕСЂС–С‚СЊ РїР°СЂРѕР»СЊ", "Create a password")}</label><div className="relative"><Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#8a948d]" /><input id={`${idPrefix}-password`} type="password" className={`${fieldInputClass} pl-11`} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></div><p className="mt-2 text-[12px] text-[#7b877f] dark:text-[#87948b]">{tr("РќРµ РјРµРЅС€Рµ 8 СЃРёРјРІРѕР»С–РІ. Р¦Рµ Р±СѓРґРµ РїР°СЂРѕР»СЊ РґР»СЏ РІС…РѕРґСѓ РІ StudyCod.", "At least 8 characters. This will be your StudyCod sign-in password.")}</p></div>
              <div><label htmlFor={`${idPrefix}-confirm-password`} className={fieldLabelClass}>{tr("РџС–РґС‚РІРµСЂРґС–С‚СЊ РїР°СЂРѕР»СЊ", "Confirm password")}</label><input id={`${idPrefix}-confirm-password`} type="password" className={fieldInputClass} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></div>

              {error && <div className="flex items-start gap-2.5 rounded-[14px] border border-[#ff6b9d]/20 bg-[#ff6b9d]/10 p-3.5 text-[13px] leading-5 text-[#d33d70] dark:text-[#ff91b7]"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
              <button type="submit" className={primaryButtonClass} disabled={loading}>{loading ? <><LoaderCircle className="size-4 animate-spin" />{tr("РЎС‚РІРѕСЂСЋС”РјРѕ РїСЂРѕС„С–Р»СЊвЂ¦", "Creating profileвЂ¦")}</> : <>{tr("Р—Р°РІРµСЂС€РёС‚Рё СЂРµС”СЃС‚СЂР°С†С–СЋ", "Complete registration")}<ArrowRight className="size-4" /></>}</button>
              <p className="text-center text-[12px] leading-5 text-[#7b877f] dark:text-[#87948b]">{tr("РўРІРѕС— РґР°РЅС– Р·Р°Р»РёС€Р°СЋС‚СЊСЃСЏ РїСЂРёРІР°С‚РЅРёРјРё. Р‡С… РјРѕР¶РЅР° Р·РјС–РЅРёС‚Рё РІ РїСЂРѕС„С–Р»С–.", "Your data stays private. You can change it later in your profile.")}</p>
            </form>
          </motion.div>
        </main>
      </div>
    </div>
  );
};
