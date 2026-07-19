import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const TheoryModalPortal = React.lazy(() => import("./TheoryModalPortal").then(mod => ({ default: mod.TheoryModalPortal })));
export type OpenTheoryParams = {
  title?: string;
  markdown: string;
  acknowledgeLabel?: string;
  onAcknowledge?: () => void;
};
type TheoryModalContextValue = {
  openTheory: (params: OpenTheoryParams) => void;
  closeTheory: () => void;
  isOpen: boolean;
};
const TheoryModalContext = createContext<TheoryModalContextValue | null>(null);
export function TheoryModalProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    markdown: string;
    acknowledgeLabel: string;
    onAcknowledge?: () => void;
  } | null>(null);
  const closeTheory = useCallback(() => {
    setState(prev => prev ? {
      ...prev,
      open: false
    } : prev);
  }, []);
  const openTheory = useCallback((params: OpenTheoryParams) => {
    setState({
      open: true,
      title: params.title ?? "Теорія",
      markdown: params.markdown,
      acknowledgeLabel: params.acknowledgeLabel ?? "Я прочитав(ла) теорію",
      onAcknowledge: params.onAcknowledge
    });
  }, []);
  const value = useMemo<TheoryModalContextValue>(() => ({
    openTheory,
    closeTheory,
    isOpen: !!state?.open
  }), [openTheory, closeTheory, state?.open]);
  return <TheoryModalContext.Provider value={value}>
      {children}
      {state?.open ? <React.Suspense fallback={null}>
        <TheoryModalPortal open title={state.title} markdown={state.markdown} acknowledgeLabel={state.acknowledgeLabel} onAcknowledge={() => {
          try {
            state.onAcknowledge?.();
          } finally {
            closeTheory();
          }
        }} />
      </React.Suspense> : null}
    </TheoryModalContext.Provider>;
}
export function useTheoryModal(): TheoryModalContextValue {
  const ctx = useContext(TheoryModalContext);
  if (!ctx) {
    throw new Error("useTheoryModal must be used within TheoryModalProvider");
  }
  return ctx;
}
