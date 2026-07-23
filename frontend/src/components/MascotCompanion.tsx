import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import Mascot, { type MascotVariant } from "./Mascot";
import "./MascotCompanion.css";

const DISMISSED_STORAGE_KEY = "studycod.mascot.dismissed";

type MascotMessage = {
  variant: MascotVariant;
  uk: string;
  en: string;
};

type MascotSignalDetail = {
  variant?: MascotVariant;
  uk?: string;
  en?: string;
  open?: boolean;
};

const defaultMessage: MascotMessage = {
  variant: "happy",
  uk: "Готовий до короткої практики? Одна задача — вже хороший наступний крок.",
  en: "Ready for a short practice session? One task is already a good next step.",
};

function messageForSurface(pathname: string, app: string | null): MascotMessage {
  if (app === "tasks" || pathname === "/tasks") {
    return {
      variant: "focus",
      uk: "Почни з однієї задачі. Результат перевірки підкаже, що робити далі.",
      en: "Start with one task. The check result will tell you what to do next.",
    };
  }

  if (/(?:\/library\/solve(?:\/|$)|\/edu\/tasks(?:\/|$)|\/edu\/lessons\/[^/]+(?:\/|$))/.test(pathname)) {
    return {
      variant: "encourage",
      uk: "Якщо тест не пройде — це не глухий кут. Подивись на першу невдачу й виправ одну річ за раз.",
      en: "A failed test is not a dead end. Inspect the first failure and change one thing at a time.",
    };
  }

  if (/\/playground(?:\/|$)/.test(pathname)) {
    return {
      variant: "eureka",
      uk: "Тут можна спокійно перевірити ідею. Експериментуй без тиску на результат.",
      en: "This is a safe place to test an idea. Experiment without pressure to be perfect.",
    };
  }

  if (app === "grades" || pathname === "/grades") {
    return {
      variant: "proud",
      uk: "Подивись, що вже вийшло, і вибери один посильний наступний крок.",
      en: "Look at what you have already achieved and choose one manageable next step.",
    };
  }

  return defaultMessage;
}

function isAuthenticatedSurface(pathname: string, app: string | null, search: string): boolean {
  const isDevPreview = import.meta.env.DEV && new URLSearchParams(search).get("preview") === "true";
  let hasSession = false;
  try {
    hasSession = Boolean(localStorage.getItem("token"));
  } catch {
    hasSession = false;
  }

  if (!hasSession && !isDevPreview) return false;
  if (/^\/contest(?:\/|$)/.test(pathname)) return false;
  if (/^\/(?:auth|verify-email|pricing|privacy|terms|cookies|refunds|certificate|u)(?:\/|$)/.test(pathname)) return false;
  if (/^\/edu\//.test(pathname) && /(?:type=CONTROL|control)/i.test(search)) return false;

  // Keep the mascot close to learning work. It should not become another piece
  // of permanent chrome on support, blog, admin, or documentation screens.
  return pathname === "/"
    || app === "tasks"
    || app === "grades"
    || /^\/(?:tasks|grades|library\/solve|playground)(?:\/|$)/.test(pathname)
    || /^\/edu\/(?:tasks|lessons\/[^/]+|library\/solve)(?:\/|$)/.test(pathname);
}

export function announceMascot(detail: MascotSignalDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MascotSignalDetail>("studycod:mascot", { detail }));
}

export const MascotCompanion: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [signal, setSignal] = useState<MascotMessage | null>(null);

  const app = searchParams.get("app");
  const visible = isAuthenticatedSurface(location.pathname, app, location.search);
  const routeMessage = useMemo(
    () => messageForSurface(location.pathname, app),
    [app, location.pathname],
  );
  const message = signal ?? routeMessage;
  const isEnglish = location.pathname.startsWith("/en")
    || (typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("en"));

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    setOpen(false);
    setSignal(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onMascotSignal = (event: Event) => {
      const detail = (event as CustomEvent<MascotSignalDetail>).detail;
      if (!detail || (!detail.uk && !detail.en)) return;
      setSignal({
        variant: detail.variant ?? "encourage",
        uk: detail.uk ?? defaultMessage.uk,
        en: detail.en ?? defaultMessage.en,
      });
      if (detail.open) setOpen(true);
    };

    window.addEventListener("studycod:mascot", onMascotSignal);
    return () => window.removeEventListener("studycod:mascot", onMascotSignal);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setOpen(false);
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, "1");
    } catch {
      // The control still works for the current session if storage is blocked.
    }
  }, []);

  if (!visible || dismissed) return null;

  return (
    <aside className="mascot-companion" aria-label={isEnglish ? "StudyCod companion" : "Напарник StudyCod"}>
      {open && (
        <div className="mascot-companion-popover" role="dialog" aria-modal="false" aria-label={isEnglish ? "Study tip" : "Порада для навчання"}>
          <div className="flex items-start gap-3">
            <Mascot variant={message.variant} size={54} className="mascot-companion-popover-image" alt="" />
            <div className="min-w-0 flex-1">
              <p className="mascot-companion-eyebrow">{isEnglish ? "A small nudge" : "Маленький поштовх"}</p>
              <p className="mascot-companion-copy">{isEnglish ? message.en : message.uk}</p>
            </div>
            <button type="button" className="mascot-companion-close" onClick={() => setOpen(false)} aria-label={isEnglish ? "Close" : "Закрити"}>
              <X size={14} />
            </button>
          </div>
          <button type="button" className="mascot-companion-dismiss" onClick={dismiss}>
            {isEnglish ? "Hide mascot" : "Сховати маскота"}
          </button>
        </div>
      )}

      <button
        type="button"
        className={`mascot-companion-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-label={open ? (isEnglish ? "Close StudyCod companion" : "Закрити напарника StudyCod") : (isEnglish ? "Open StudyCod companion" : "Відкрити напарника StudyCod")}
        title={isEnglish ? "StudyCod companion" : "Напарник StudyCod"}
      >
        <Mascot variant={open ? "wave" : message.variant} size={42} alt="" />
      </button>
    </aside>
  );
};

export default MascotCompanion;
