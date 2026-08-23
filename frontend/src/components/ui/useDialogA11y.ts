import React from "react";

type DialogA11yOptions = {
  open: boolean;
  onClose: () => void;
};

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export const useDialogA11y = ({ open, onClose }: DialogA11yOptions) => {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [];
    const first = focusable()[0] ?? panel;
    const frame = window.requestAnimationFrame(() => first?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      lastFocusedRef.current?.focus();
    };
  }, [open]);

  return panelRef;
};
