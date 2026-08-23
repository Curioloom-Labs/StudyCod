import React from "react";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
const CLOSE_LABEL = /close|закрити|скасувати|закрыть|cancel/i;

type Props = {
  rootRef: React.RefObject<HTMLElement | null>;
};

type ManagedDialog = {
  overlay: HTMLElement;
  panel: HTMLElement;
  previousOverflow: string;
  previousPanelRole: string | null;
  previousPanelAriaModal: string | null;
  previousPanelTabIndex: string | null;
  previousPanelLabel: string | null;
  lastFocused: HTMLElement | null;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
};

const isVisible = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
};

const isDialogCandidate = (element: HTMLElement) => {
  if (element.getAttribute("data-dialog-a11y") === "direct") return false;
  const roleDialog = element.getAttribute("role") === "dialog" && element.getAttribute("aria-modal") !== "false";
  const classes = typeof element.className === "string" ? element.className : "";
  const fullscreenOverlay = classes.includes("fixed") && classes.includes("inset-0");
  return (roleDialog || fullscreenOverlay) && isVisible(element);
};

const getPanel = (candidate: HTMLElement) => {
  if (candidate.getAttribute("role") === "dialog") return candidate;
  return candidate.querySelector<HTMLElement>("[role='dialog'], form, section, [data-dialog-panel]") ?? candidate;
};

const getLabel = (panel: HTMLElement) => {
  const heading = panel.querySelector<HTMLElement>("h1, h2, h3");
  return heading?.textContent?.trim() || "Dialog";
};

export const DialogA11yObserver: React.FC<Props> = ({ rootRef }) => {
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let managed: ManagedDialog | null = null;
    let frame = 0;

    const cleanup = (restoreFocus: boolean) => {
      if (!managed) return;
      document.removeEventListener("keydown", managed.onKeyDown);
      managed.overlay.removeEventListener("pointerdown", managed.onPointerDown);
      document.body.style.overflow = managed.previousOverflow;
      if (restoreFocus) managed.lastFocused?.focus();
      managed = null;
    };

    const refresh = () => {
      const candidates = Array.from(root.querySelectorAll<HTMLElement>("[role='dialog'], [class*='fixed'][class*='inset-0']"))
        .filter(isDialogCandidate);
      const overlay = candidates[candidates.length - 1] ?? null;
      if (!overlay) {
        cleanup(true);
        return;
      }

      const panel = getPanel(overlay);
      if (managed?.overlay === overlay && managed.panel === panel) return;
      cleanup(false);

      const previousPanelRole = panel.getAttribute("role");
      const previousPanelAriaModal = panel.getAttribute("aria-modal");
      const previousPanelTabIndex = panel.getAttribute("tabindex");
      const previousPanelLabel = panel.getAttribute("aria-label");
      const lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("tabindex", "-1");
      if (!panel.getAttribute("aria-labelledby") && !panel.getAttribute("aria-label")) {
        panel.setAttribute("aria-label", getLabel(panel));
      }
      overlay.setAttribute("data-dialog-a11y", "managed");
      overlay.setAttribute("data-material", "premium-dialog-scrim");
      overlay.setAttribute("data-motion-surface", "true");
      panel.setAttribute("data-material", "premium-dialog");
      panel.setAttribute("data-motion-surface", "true");

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          const closeButton = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
            const label = `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`.trim();
            return CLOSE_LABEL.test(label) || label === "×";
          });
          closeButton?.click();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.hasAttribute("disabled"));
        if (!focusable.length) {
          event.preventDefault();
          panel.focus();
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

      const onPointerDown = (event: PointerEvent) => {
        if (event.target !== overlay) return;
        const closeButton = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
          const label = `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`.trim();
          return CLOSE_LABEL.test(label) || label === "×";
        });
        closeButton?.click();
      };

      managed = {
        overlay,
        panel,
        previousOverflow: document.body.style.overflow,
        previousPanelRole,
        previousPanelAriaModal,
        previousPanelTabIndex,
        previousPanelLabel,
        lastFocused,
        onKeyDown,
        onPointerDown,
      };
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", onKeyDown);
      overlay.addEventListener("pointerdown", onPointerDown);
      frame = window.requestAnimationFrame(() => {
        const autofocus = panel.querySelector<HTMLElement>("[autofocus]");
        const first = autofocus || panel.querySelector<HTMLElement>(FOCUSABLE) || panel;
        first.focus();
      });
    };

    refresh();
    const observer = new MutationObserver(() => refresh());
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      if (managed) {
        const { panel, previousPanelRole, previousPanelAriaModal, previousPanelTabIndex, previousPanelLabel } = managed;
        if (previousPanelRole === null) panel.removeAttribute("role"); else panel.setAttribute("role", previousPanelRole);
        if (previousPanelAriaModal === null) panel.removeAttribute("aria-modal"); else panel.setAttribute("aria-modal", previousPanelAriaModal);
        if (previousPanelTabIndex === null) panel.removeAttribute("tabindex"); else panel.setAttribute("tabindex", previousPanelTabIndex);
        if (previousPanelLabel === null) panel.removeAttribute("aria-label"); else panel.setAttribute("aria-label", previousPanelLabel);
      }
      cleanup(true);
    };
  }, [rootRef]);

  return null;
};
