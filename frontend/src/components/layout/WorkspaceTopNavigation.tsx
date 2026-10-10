import React from "react";
import { Menu, X } from "lucide-react";

export type WorkspaceTopNavigationItem = {
  label: string;
  Icon: React.ElementType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
};

type Props = {
  items: WorkspaceTopNavigationItem[];
  label: string;
  closeLabel: string;
};

/** Shared, responsive global navigation for authenticated workspaces. */
export const WorkspaceTopNavigation: React.FC<Props> = ({ items, label, closeLabel }) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const focusFirstItem = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("#workspace-mobile-navigation button")?.focus();
    });
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFirstItem);
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const renderItems = (mobile = false) => items.map(({ label: itemLabel, Icon, active, onSelect }) => (
    <button
      key={itemLabel}
      type="button"
      onClick={() => { setOpen(false); onSelect(); }}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
        mobile ? "w-full justify-start" : "justify-center",
        active
          ? "bg-primary/10 text-primary-strong dark:bg-primary/12 dark:text-primary-soft"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
      ].join(" ")}
    >
      {mobile ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      <span>{itemLabel}</span>
      {!mobile && active ? <span className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-primary" aria-hidden="true" /> : null}
    </button>
  ));

  return <>
    <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 min-[1080px]:flex" aria-label={label}>
      {renderItems()}
    </nav>
    <div ref={menuRef} className="relative min-[1080px]:hidden">
      <button
        ref={triggerRef}
        type="button"
        className="grid size-11 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover"
        aria-label={open ? closeLabel : label}
        aria-expanded={open}
        aria-controls="workspace-mobile-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>
      {open ? <nav
        id="workspace-mobile-navigation"
        aria-label={label}
        className="fixed right-3 top-16 z-[60] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-bg-surface p-2 shadow-[var(--ui-modal-shadow)] sm:top-[72px]"
      >
        <div className="grid gap-1">{renderItems(true)}</div>
      </nav> : null}
    </div>
  </>;
};
