import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { easeOutExpo } from "../../lib/motion";
import { BrandedPageLoader } from "./BrandedPageLoader";

type RegisterLoader = (id: symbol, active: boolean) => void;

const PageLoadingContext = createContext<RegisterLoader | null>(null);
const LOADER_SHOW_DELAY_MS = 180;

export const PageLoadingProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [activeLoaders, setActiveLoaders] = useState<Set<symbol>>(() => new Set());
  const [showLoader, setShowLoader] = useState(false);
  const reduceMotion = useReducedMotion();

  const registerLoader = useCallback<RegisterLoader>((id, active) => {
    setActiveLoaders((current) => {
      if (current.has(id) === active) return current;
      const next = new Set(current);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const isLoading = activeLoaders.size > 0;
  const enterDuration = reduceMotion ? 0.12 : 0.16;
  const exitDuration = reduceMotion ? 0.12 : 0.14;

  useEffect(() => {
    if (!isLoading) {
      setShowLoader(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowLoader(true), LOADER_SHOW_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  return (
    <PageLoadingContext.Provider value={registerLoader}>
      {children}
      <AnimatePresence initial={false}>
        {showLoader && (
          <motion.div
            key="page-loading-overlay"
            className="fixed inset-0 z-[10000]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: enterDuration, ease: easeOutExpo } }}
            exit={{ opacity: 0, transition: { duration: exitDuration, ease: easeOutExpo } }}
          >
            <BrandedPageLoader />
          </motion.div>
        )}
      </AnimatePresence>
    </PageLoadingContext.Provider>
  );
};

export const PageLoader: React.FC = () => {
  const registerLoader = useContext(PageLoadingContext);
  const loaderId = useRef(Symbol("page-loader"));

  useLayoutEffect(() => {
    if (!registerLoader) return;
    registerLoader(loaderId.current, true);
    return () => registerLoader(loaderId.current, false);
  }, [registerLoader]);

  return registerLoader ? null : <BrandedPageLoader />;
};
