import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { overlayVariants, modalVariants, reducedMotionTransition } from "../../lib/motion";
interface Props {
  open?: boolean;
  isOpen?: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: React.ReactNode;
  closable?: boolean;
  showCloseButton?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
}
const DEFAULT_CLOSABLE = true;
const DEFAULT_SHOW_CLOSE_BUTTON = true;
export const Modal: React.FC<Props> = ({
  open,
  isOpen,
  title,
  description,
  onClose,
  children,
  closable,
  showCloseButton,
  overlayClassName,
  panelClassName,
  bodyClassName
}) => {
  const {
    t
  } = useTranslation();
  const resolvedOpen = open ?? isOpen ?? false;
  const isClosable = closable ?? DEFAULT_CLOSABLE;
  const shouldShowCloseButton = showCloseButton ?? DEFAULT_SHOW_CLOSE_BUTTON;
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const shouldReduceMotion = useReducedMotion();
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!resolvedOpen) return;

    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    const firstFocusable = focusable[0] ?? panel;
    firstFocusable.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isClosable) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const currentFocusable = panel.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (currentFocusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (lastFocusedRef.current) {
        lastFocusedRef.current.focus();
      }
    };
  }, [resolvedOpen, isClosable]);

  React.useEffect(() => {
    if (!resolvedOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [resolvedOpen]);

  const content = <AnimatePresence>
      {resolvedOpen && <motion.div data-material="modal-scrim" data-motion-surface className={"fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-bg-base/80 p-2 sm:p-4" + (overlayClassName ? ` ${overlayClassName}` : "")} onClick={isClosable ? () => onCloseRef.current() : undefined} variants={overlayVariants} initial={shouldReduceMotion ? { opacity: 0, backdropFilter: "blur(0px)" } : "initial"} animate="animate" exit={shouldReduceMotion ? { opacity: 0, backdropFilter: "blur(0px)" } : "exit"} transition={shouldReduceMotion ? reducedMotionTransition : undefined}>
          <motion.div data-material="modal-surface" ref={panelRef} className={"bg-bg-surface border border-border rounded-[var(--ui-modal-radius)] shadow-[var(--ui-modal-shadow)] max-w-[900px] w-full sm:w-[95vw] max-h-[calc(100dvh-1rem)] sm:max-h-[95vh] max-[767px]:max-h-[calc(100dvh-0.5rem)] max-[767px]:rounded-t-[28px] max-[767px]:rounded-b-none flex flex-col overflow-hidden" + (panelClassName ? ` ${panelClassName}` : "")} onClick={e => e.stopPropagation()} variants={modalVariants} initial={shouldReduceMotion ? { opacity: 0 } : "initial"} animate="animate" exit={shouldReduceMotion ? { opacity: 0 } : "exit"} transition={shouldReduceMotion ? reducedMotionTransition : undefined} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
            {title && <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex-shrink-0">
                <h2 id={titleId} className="text-lg font-mono text-text-primary">{title}</h2>
                {description && <p id={descriptionId} className="text-sm text-text-secondary mt-2 whitespace-pre-line">{description}</p>}
              </div>}
            <div className={"flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4" + (bodyClassName ? ` ${bodyClassName}` : "")}>
              {children}
            </div>
            {shouldShowCloseButton && <div className="px-4 sm:px-6 py-3 sm:py-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-border flex justify-end flex-shrink-0">
                <Button variant="ghost" onClick={() => onCloseRef.current()}>
                  {t('close')}
                </Button>
              </div>}
          </motion.div>
        </motion.div>}
    </AnimatePresence>;
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
};
