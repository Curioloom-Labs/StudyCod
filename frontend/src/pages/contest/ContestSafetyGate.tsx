import React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Clock3, LoaderCircle, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import {
  endContestSafetyPause,
  getContestSafetyState,
  respondToContestSafetyAlert,
  setContestSafetyLocation,
  type ContestSafetyLocation,
  type ContestSafetyState,
} from "../../lib/api/contests";

type Props = {
  contestId: number | null;
  onLockChange?: (locked: boolean) => void;
  onUnlocked?: () => void;
};

function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function locationTypeLabel(type: string, english: boolean): string {
  if (type === "Місто") return english ? "city" : "місто";
  if (type === "Область") return english ? "region" : "область";
  if (type === "Район") return english ? "district" : "район";
  if (type === "Місто з спеціальним статусом") return english ? "city" : "місто";
  return english ? "community" : "громада";
}

function normalizedSearch(value: string): string {
  return value.trim().toLocaleLowerCase("uk-UA").replace(/[.,]/g, " ").replace(/\s+/g, " ");
}

export const ContestSafetyGate: React.FC<Props> = ({ contestId, onLockChange, onUnlocked }) => {
  const [state, setState] = React.useState<ContestSafetyState | null>(null);
  const [providerError, setProviderError] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const wasLocked = React.useRef<boolean | null>(null);
  const dialogRef = React.useRef<HTMLElement | null>(null);

  const refresh = React.useCallback(async () => {
    if (!contestId) return;
    try {
      const result = await getContestSafetyState(contestId);
      setState(result);
      setProviderError(false);
    } catch {
      setProviderError(true);
    }
  }, [contestId]);

  React.useEffect(() => {
    setState(null);
    setProviderError(false);
    setQuery("");
    void refresh();
    const interval = window.setInterval(() => void refresh(), 8_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clock);
    };
  }, [contestId, refresh]);

  const pausedSeconds = state?.pausedUntil
    ? Math.max(0, Math.ceil((new Date(state.pausedUntil).getTime() - now) / 1000))
    : 0;
  const locked = providerError || state === null || Boolean(state.enabled && (state.needsLocation || state.paused || state.alertPending));

  React.useEffect(() => {
    onLockChange?.(locked);
    if (wasLocked.current === true && !locked) onUnlocked?.();
    wasLocked.current = locked;
  }, [locked, onLockChange, onUnlocked]);

  React.useEffect(() => {
    if (!locked) return;
    const backgrounds = Array.from(document.querySelectorAll<HTMLElement>("[data-contest-safety-background]"));
    const originallyInert = new Map(backgrounds.map((background) => [background, background.hasAttribute("inert")]));
    const previousOverflow = document.body.style.overflow;
    backgrounds.forEach((background) => background.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";

    const focusDialog = () => {
      const target = dialogRef.current?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled)")
        ?? dialogRef.current;
      target?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
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
    const focusTimer = window.setTimeout(focusDialog, 0);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      backgrounds.forEach((background) => {
        if (!originallyInert.get(background)) background.removeAttribute("inert");
      });
      document.body.style.overflow = previousOverflow;
    };
  }, [locked, providerError, state?.alertPending, state?.needsLocation, state?.paused]);

  const english = document.documentElement.lang.toLowerCase().startsWith("en");
  const queryNorm = normalizedSearch(query);
  const filteredLocations = React.useMemo(() => (state?.availableLocations ?? [])
    .filter((location) => {
      const searchable = normalizedSearch(`${location.name} ${location.type}`);
      const name = normalizedSearch(location.name.replace(/^м\.\s*/i, ""));
      return searchable.includes(queryNorm) || name.includes(queryNorm);
    })
    .sort((a, b) => {
      const priority = (location: ContestSafetyLocation) => location.type === "Місто" || location.type === "Місто з спеціальним статусом" ? 0 : location.type === "Область" ? 1 : location.type === "Район" ? 2 : 3;
      return priority(a) - priority(b) || a.name.localeCompare(b.name, "uk-UA");
    })
    .slice(0, 12), [queryNorm, state?.availableLocations]);

  const saveLocation = async (location: ContestSafetyLocation) => {
    if (!contestId || busy) return;
    setBusy(true);
    try {
      await setContestSafetyLocation(contestId, location.uid);
      setQuery("");
      await refresh();
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const respond = async (safe: boolean) => {
    if (!contestId || busy) return;
    setBusy(true);
    try {
      await respondToContestSafetyAlert(contestId, safe);
      await refresh();
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!contestId || busy) return;
    setBusy(true);
    try {
      await endContestSafetyPause(contestId);
      await refresh();
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!locked) return null;

  return createPortal((
    <div className="fixed inset-0 z-[120] grid min-h-dvh place-items-center overflow-y-auto bg-[#121817]/95 px-4 py-6 text-white backdrop-blur-md" role="presentation">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="contest-safety-title" tabIndex={-1} className="my-auto w-full max-w-xl rounded-[28px] border border-white/10 bg-[#1a2421] p-6 shadow-[0_30px_100px_rgba(0,0,0,.48)] sm:p-9">
        {providerError ? (
          <>
            <div className="grid size-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><AlertTriangle aria-hidden="true" className="size-7" /></div>
            <h2 id="contest-safety-title" className="mt-5 text-2xl font-bold tracking-tight">{english ? "Alert status is unavailable" : "Не вдається перевірити повітряну тривогу"}</h2>
            <p className="mt-3 max-w-prose text-sm leading-6 text-white/70">{english ? "The contest stays locked until the alert service responds. Follow official local alerts and try again." : "Контент і редактор залишаються заблокованими, доки сервіс тривог не відповість. Орієнтуйтеся на офіційні сповіщення та спробуйте ще раз."}</p>
            <button type="button" onClick={() => void refresh()} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-[#15201a] transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"><RefreshCw aria-hidden="true" className="size-4" />{english ? "Try again" : "Спробувати ще раз"}</button>
          </>
        ) : state === null ? (
          <div role="status" className="flex min-h-52 flex-col items-center justify-center text-center">
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-emerald-300" />
            <h2 id="contest-safety-title" className="mt-4 text-xl font-bold">{english ? "Checking safety status" : "Перевіряємо налаштування безпеки"}</h2>
          </div>
        ) : state.paused ? (
          <>
            <div className="grid size-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><Clock3 aria-hidden="true" className="size-7" /></div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-amber-200/80">{english ? "Safety pause" : "Пауза для переходу в укриття"}</p>
            <h2 id="contest-safety-title" className="mt-2 text-2xl font-bold tracking-tight">{english ? "Take the time you need" : "Перейдіть у безпечне місце"}</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">{english ? "The task and editor are hidden during the pause. When you resume, the elapsed pause time is added to your personal contest time." : "Умова й редактор приховані. Після відновлення фактичний час паузи буде додано до вашого особистого часу контесту."}</p>
            <div className="mt-7 rounded-2xl bg-black/20 px-5 py-5 text-center">
              <span className="block text-xs font-semibold uppercase tracking-[.15em] text-white/45">{english ? "Time remaining" : "Залишок паузи"}</span>
              <span className="mt-1 block font-mono text-5xl font-bold tabular-nums tracking-tight" aria-live="off">{formatCountdown(pausedSeconds)}</span>
            </div>
            <button type="button" onClick={() => void resume()} disabled={busy} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 text-sm font-bold text-[#14251d] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-wait disabled:opacity-60"><Check aria-hidden="true" className="size-4" />{busy ? (english ? "Resuming…" : "Відновлюємо…") : (english ? "I am safe — resume contest" : "Я вже в безпечному місці — відновити контест")}</button>
          </>
        ) : state.alertPending ? (
          <>
            <div className="grid size-14 place-items-center rounded-2xl bg-red-400/10 text-red-300"><AlertTriangle aria-hidden="true" className="size-7" /></div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-red-200/80">{english ? "Air threat warning" : "Повітряна загроза"}</p>
            <h2 id="contest-safety-title" className="mt-2 text-2xl font-bold tracking-tight">{english ? "Move to a safe place" : "Перейдіть у безпечне місце"}</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">{english ? `An alert is active for ${state.alertLocationName ?? state.location?.name ?? "your area"}. Are you already somewhere safe?` : `Тривога оголошена для локації «${state.alertLocationName ?? state.location?.name ?? "вашого району"}». Ви вже перебуваєте в безпечному місці?`}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void respond(false)} disabled={busy} className="min-h-14 rounded-xl border border-white/15 px-4 text-left text-sm font-semibold text-white/85 transition hover:bg-white/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-wait disabled:opacity-60"><span className="block font-bold">{english ? "I need to move" : "Потрібно перейти"}</span><span className="mt-1 block text-xs font-normal text-white/55">{english ? "Pause for up to 10 minutes" : "Пауза до 10 хвилин"}</span></button>
              <button type="button" onClick={() => void respond(true)} disabled={busy} className="min-h-14 rounded-xl bg-emerald-300 px-4 text-left text-sm font-bold text-[#14251d] transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-wait disabled:opacity-60"><span className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4" />{english ? "I am already safe" : "Я вже в безпеці"}</span><span className="mt-1 block text-xs font-medium text-[#14251d]/70">{english ? "Continue contest" : "Продовжити контест"}</span></button>
            </div>
          </>
        ) : state.needsLocation ? (
          <>
            <div className="grid size-14 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-200"><MapPin aria-hidden="true" className="size-7" /></div>
            <h2 id="contest-safety-title" className="mt-5 text-2xl font-bold tracking-tight">{english ? "Where are you taking the contest from?" : "Де ви зараз перебуваєте?"}</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">{english ? "Choose a city, district, or region to check its alert status. We do not collect GPS coordinates." : "Оберіть місто, район або область, щоб перевіряти тривоги саме там. GPS-координати не збираються."}</p>
            <label className="mt-6 block text-xs font-semibold text-white/65" htmlFor="contest-safety-location-search">{english ? "Location" : "Місто, район або область"}</label>
            <input id="contest-safety-location-search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder={english ? "For example, Kyiv or Vyshhorod district" : "Наприклад, Київ, Харків, Вишгородський район"} className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-emerald-200" />
            <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/15" role="listbox" aria-label={english ? "Matching locations" : "Знайдені локації"}>
              {filteredLocations.length ? filteredLocations.map((location) => (
                <button key={location.uid} type="button" role="option" aria-selected="false" onClick={() => void saveLocation(location)} disabled={busy} className="flex min-h-12 w-full items-center justify-between gap-4 border-b border-white/[.06] px-4 py-2.5 text-left last:border-0 hover:bg-white/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-200 disabled:opacity-50">
                  <span className="flex min-w-0 items-center gap-3"><MapPin aria-hidden="true" className="size-4 shrink-0 text-emerald-200/75" /><span className="truncate text-sm font-medium">{location.name}</span></span>
                  <span className="shrink-0 text-[11px] text-white/45">{locationTypeLabel(location.type, english)}</span>
                </button>
              )) : <p className="px-4 py-5 text-sm text-white/50">{english ? "No matching areas. Try another spelling." : "Нічого не знайдено. Спробуйте інший варіант назви."}</p>}
            </div>
            {busy && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-white/55"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />{english ? "Saving location…" : "Зберігаємо локацію…"}</p>}
          </>
        ) : (
          <div role="status" className="flex min-h-52 flex-col items-center justify-center text-center">
            <LoaderCircle aria-hidden="true" className="size-8 animate-spin text-emerald-300" />
            <h2 id="contest-safety-title" className="mt-4 text-xl font-bold">{english ? "Updating contest access" : "Оновлюємо доступ до контесту"}</h2>
          </div>
        )}
        <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-white/45">
          {english ? "Alert data: " : "Дані про загрози: "}
          <a href="https://tryvoha.online" target="_blank" rel="noopener noreferrer" className="text-white/70 underline underline-offset-2 hover:text-white">Tryvoha.online</a>
          {english
            ? ". Informational feed may be delayed or inaccurate; follow official local alerts."
            : ". Інформаційні дані можуть запізнюватися або бути неточними; орієнтуйтеся на офіційні сповіщення."}
        </p>
      </section>
    </div>
  ), document.body);
};
