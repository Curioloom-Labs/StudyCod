import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldBan, Globe2 } from "lucide-react";
import { easeOutQuint, fadeUpItem, staggerContainer } from "../../lib/motion";

export type GeoBlockedPayload = {
  country: string | null;
};

const COUNTRY_NAMES: Record<string, { uk: string; en: string }> = {
  RU: { uk: "росії", en: "russia" },
  BY: { uk: "білорусі", en: "belarus" }
};

function countryLabel(code: string | null): { uk: string; en: string } | null {
  if (!code) return null;
  return COUNTRY_NAMES[code.toUpperCase()] ?? null;
}

export const GeoBlockedPage: React.FC<{ state: GeoBlockedPayload }> = ({ state }) => {
  const prefersReducedMotion = useReducedMotion();
  const label = countryLabel(state.country);

  return (
    <div className="min-h-[100dvh] bg-bg-base text-text-primary flex items-center justify-center p-3 sm:p-6 relative overflow-hidden">
      {/* Ambient grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "44px 44px"
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-72 w-[36rem] rounded-full bg-accent-error/10 blur-[120px]"
      />

      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 16 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
        className="w-full max-w-2xl relative"
      >
        <div className="rounded-xl border border-border bg-bg-surface overflow-hidden shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]">
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-border bg-bg-code/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-error opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-error" />
              </span>
              <span className="text-[10px] font-mono text-text-muted tracking-[0.08em]">
                451 Unavailable For Legal Reasons
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-text-muted">
              <Globe2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono tracking-[0.08em]">
                {state.country ? state.country.toUpperCase() : "—"}
              </span>
            </div>
          </div>

          <motion.div
            variants={prefersReducedMotion ? undefined : staggerContainer}
            initial={prefersReducedMotion ? undefined : "initial"}
            animate={prefersReducedMotion ? undefined : "animate"}
            className="p-6 md:p-8"
          >
            {/* Hero */}
            <motion.div
              variants={prefersReducedMotion ? undefined : fadeUpItem}
              className="flex items-start gap-4 mb-6"
            >
              <div className="w-12 h-12 rounded-full bg-accent-error/10 border border-accent-error/30 flex items-center justify-center shrink-0">
                <ShieldBan className="w-5 h-5 text-accent-error" />
              </div>
              <div>
                <span className="font-mono text-xs text-accent-error/70">// access denied</span>
                <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
                  Доступ обмежено
                </h1>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                  Вхід на StudyCod{label ? <> з&nbsp;<span className="text-text-primary font-medium">{label.uk}</span></> : " з вашого регіону"} заблоковано.
                </p>
              </div>
            </motion.div>

            <div className="h-px bg-gradient-to-r from-accent-error/40 via-border to-transparent mb-6" />

            {/* Reason — UA */}
            <motion.div
              variants={prefersReducedMotion ? undefined : fadeUpItem}
              className="rounded-xl border border-border bg-bg-code/60 p-4 mb-4"
            >
              <div className="text-xs font-mono uppercase tracking-[0.08em] text-text-muted mb-2">
                Чому я це бачу?
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                StudyCod — українська освітня платформа. Через збройну агресію
                росії проти України ми не надаємо доступ користувачам із росії та
                білорусі. Якщо ви вважаєте, що це помилка (наприклад, ви в Україні,
                але користуєтесь VPN), вимкніть VPN/проксі та оновіть сторінку.
              </p>
            </motion.div>

            {/* Reason — EN */}
            <motion.div
              variants={prefersReducedMotion ? undefined : fadeUpItem}
              className="rounded-xl border border-border bg-bg-surface p-4 mb-6"
            >
              <div className="text-xs font-mono uppercase tracking-[0.08em] text-text-muted mb-2">
                Why am I seeing this?
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                StudyCod is a Ukrainian educational platform. Due to russia&apos;s
                armed aggression against Ukraine, access is not available from
                Russia and Belarus. If you believe this is a mistake (e.g. you are
                in Ukraine but using a VPN), please turn off your VPN/proxy and
                reload the page.
              </p>
            </motion.div>

            {/* Slava Ukraini accent */}
            <motion.div
              variants={prefersReducedMotion ? undefined : fadeUpItem}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-bg-code/40 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-9 overflow-hidden rounded border border-border shrink-0" aria-hidden>
                  <span className="h-full w-full bg-[#0057B7]" />
                  <span className="h-full w-full bg-[#FFD700]" />
                </span>
                <span className="text-sm font-mono text-text-secondary">
                  Слава Україні! 🇺🇦
                </span>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="shrink-0 px-3 py-1.5 text-xs font-mono border border-border rounded-md text-text-secondary hover:border-primary/50 hover:text-text-primary transition-fast"
              >
                Оновити / Reload
              </button>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default GeoBlockedPage;
