import React from "react";
import {
  clearUIModeOverride,
  dismissSwitchSuggestion,
  endOfLocalDayEpochMs,
  getEffectiveUIMode,
  getOverrideUIMode,
  getPreferredUIMode,
  isFocusIntroSeen,
  isSwitchSuggestionDismissed,
  markFocusIntroSeen,
  setPreferredUIMode,
  setUIModeOverride,
  type UIMode
} from "../../lib/uiMode";

type UIModeContextValue = {
  mode: UIMode;
  modeSource: "override" | "preference" | "default";
  preference: UIMode | null;
  override: { mode: UIMode; expiresAt: number } | null;

  setMode: (mode: UIMode) => void;
  setClassicForToday: () => void;
  clearOverride: () => void;

  focusIntroSeen: boolean;
  markFocusIntroSeen: () => void;

  switchSuggestionDismissed: boolean;
  dismissSwitchSuggestion: () => void;
};

const UIModeContext = React.createContext<UIModeContextValue | null>(null);

export function useUIMode(): UIModeContextValue {
  const v = React.useContext(UIModeContext);
  if (!v) {
    throw new Error("useUIMode must be used within UIModeProvider");
  }
  return v;
}

export const UIModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tick, setTick] = React.useState(0);

  const computeState = React.useCallback(() => {
    const eff = getEffectiveUIMode();
    const pref = getPreferredUIMode();
    const override = getOverrideUIMode();
    return {
      mode: eff.mode,
      modeSource: eff.source,
      preference: pref,
      override,
      focusIntroSeen: isFocusIntroSeen(),
      switchSuggestionDismissed: isSwitchSuggestionDismissed()
    };
  }, []);

  const [state, setState] = React.useState(() => computeState());

  const refresh = React.useCallback(() => {
    setState(computeState());
  }, [computeState]);

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (!e.key.startsWith("studycod.uiMode") && !e.key.startsWith("studycod.studySessions")) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  React.useEffect(() => {
    // Ensure overrides expire without requiring reload.
    const id = window.setInterval(() => {
      setTick(t => t + 1);
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  React.useEffect(() => {
    // Recompute when tick changes.
    refresh();
  }, [tick, refresh]);

  React.useEffect(() => {
    // Expose the mode globally so theme tokens apply outside shell wrappers
    // (standalone routes, portals, toasts).
    document.documentElement.setAttribute("data-ui-mode", state.mode);
  }, [state.mode]);

  const value = React.useMemo<UIModeContextValue>(() => {
    return {
      mode: state.mode,
      modeSource: state.modeSource,
      preference: state.preference,
      override: state.override,

      setMode: (mode: UIMode) => {
        clearUIModeOverride();
        setPreferredUIMode(mode);
        refresh();
      },
      setClassicForToday: () => {
        setUIModeOverride("classic", endOfLocalDayEpochMs());
        refresh();
      },
      clearOverride: () => {
        clearUIModeOverride();
        refresh();
      },

      focusIntroSeen: state.focusIntroSeen,
      markFocusIntroSeen: () => {
        markFocusIntroSeen();
        refresh();
      },

      switchSuggestionDismissed: state.switchSuggestionDismissed,
      dismissSwitchSuggestion: () => {
        dismissSwitchSuggestion();
        refresh();
      }
    };
  }, [state, refresh]);

  return <UIModeContext.Provider value={value}>{children}</UIModeContext.Provider>;
};
