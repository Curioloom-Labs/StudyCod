import React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectMenuOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

type SelectMenuProps = {
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  menuMinWidth?: number;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  placement: "top" | "bottom";
};

const firstEnabledIndex = (options: SelectMenuOption[], preferred: number) => {
  if (options[preferred] && !options[preferred].disabled) return preferred;
  return options.findIndex((option) => !option.disabled);
};

export const SelectMenu: React.FC<SelectMenuProps> = ({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Select…",
  disabled = false,
  className = "",
  menuMinWidth = 180,
}) => {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(() =>
    firstEnabledIndex(options, Math.max(0, options.findIndex((option) => option.value === value))),
  );
  const [position, setPosition] = React.useState<MenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = React.useRef("");
  const typeaheadTimerRef = React.useRef<number | null>(null);
  const selected = options.find((option) => option.value === value);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, menuMinWidth);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const shouldFlip = rect.bottom + 328 > window.innerHeight - 12 && rect.top > 340;
    setPosition({
      top: shouldFlip ? Math.max(12, rect.top - 8) : rect.bottom + 8,
      left,
      width,
      placement: shouldFlip ? "top" : "bottom",
    });
  }, [menuMinWidth]);

  const openMenu = React.useCallback(() => {
    if (disabled) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(firstEnabledIndex(options, Math.max(0, selectedIndex)));
    setOpen(true);
  }, [disabled, options, value]);

  const closeMenu = React.useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handleViewportChange = () => updatePosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updatePosition]);

  React.useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  React.useEffect(() => () => {
    if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, open]);

  const moveActive = (direction: 1 | -1) => {
    if (!options.length) return;
    let next = activeIndex;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const selectActive = () => {
    const option = options[activeIndex];
    if (!option || option.disabled) return;
    onChange(option.value);
    closeMenu();
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex(options, 0));
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex(options, options.length - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectActive();
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      typeaheadRef.current = `${typeaheadRef.current}${event.key.toLowerCase()}`;
      const match = options.findIndex((option) =>
        !option.disabled && String(option.label).toLowerCase().startsWith(typeaheadRef.current),
      );
      if (match >= 0) setActiveIndex(match);
      if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current = window.setTimeout(() => {
        typeaheadRef.current = "";
      }, 500);
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu();
      if (event.key === "ArrowUp") setActiveIndex(firstEnabledIndex(options, options.length - 1));
    } else if (event.key === "Escape") {
      closeMenu(false);
    }
  };

  const menu = open && position && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label={ariaLabel}
        data-material="select-menu"
        data-motion-surface
        className="material-popover fixed z-[120] max-h-[min(20rem,calc(100vh-1rem))] overflow-y-auto rounded-2xl border border-[#152219]/12 bg-white p-1.5 text-[#17231b] shadow-[0_24px_70px_-28px_rgba(15,35,21,.32)] dark:border-white/15 dark:bg-[#101a14] dark:text-[#eaf5ed]"
        style={{
          top: position.placement === "top" ? undefined : position.top,
          bottom: position.placement === "top" ? `${Math.max(12, window.innerHeight - position.top)}px` : undefined,
          left: position.left,
          width: position.width,
          transformOrigin: position.placement === "top" ? "bottom center" : "top center",
        }}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          const isActive = index === activeIndex;
          return <button
            key={option.value}
            ref={(element) => { optionRefs.current[index] = element; }}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={isActive ? 0 : -1}
            disabled={option.disabled}
            onKeyDown={handleOptionKeyDown}
            onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
            onClick={() => {
              if (option.disabled) return;
              onChange(option.value);
              closeMenu();
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${isActive ? "bg-[#f1f5f1] text-[#17231b] dark:bg-white/[.08] dark:text-white" : ""} ${isSelected ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00d978]/15 dark:text-[#72edb0]" : "text-[#314037] hover:bg-[#f1f5f1] hover:text-[#17231b] dark:text-[#c5d4c9] dark:hover:bg-white/[.07] dark:hover:text-white"} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {isSelected ? <Check className="size-4 shrink-0 text-[#00d978]" /> : null}
          </button>;
        })}
      </div>,
      document.body,
    )
    : null;

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => { if (!disabled) (open ? closeMenu() : openMenu()); }}
      onKeyDown={handleTriggerKeyDown}
      className={`inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-xl border border-[#152219]/15 bg-[#f7faf7] px-3 text-left text-sm font-semibold text-[#17231b] outline-none transition hover:border-[#00d978]/55 hover:bg-[#edf7ef] focus-visible:ring-2 focus-visible:ring-[#00d978]/35 disabled:cursor-not-allowed disabled:opacity-55 motion-safe:active:scale-[.97] ${className}`}
    >
      <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
      <ChevronDown className={`size-4 shrink-0 text-[#82968a] transition-transform ${open ? "rotate-180 text-[#72edb0]" : ""}`} />
    </button>
    {menu}
  </>;
};
