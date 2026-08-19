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

type MenuPosition = { top: number; left: number; width: number };

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
  const [position, setPosition] = React.useState<MenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, menuMinWidth);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    setPosition({ top: rect.bottom + 8, left, width });
  }, [menuMinWidth]);

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
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const menu = open && position && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label={ariaLabel}
        className="fixed z-[120] max-h-[min(20rem,calc(100vh-1rem))] overflow-y-auto rounded-2xl border border-[#152219]/12 bg-white p-1.5 text-[#17231b] shadow-[0_24px_70px_-28px_rgba(15,35,21,.32)] dark:border-white/15 dark:bg-[#101a14] dark:text-[#eaf5ed]"
        style={{ top: position.top, left: position.left, width: position.width }}
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          return <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={isSelected}
            disabled={option.disabled}
            onClick={() => {
              if (option.disabled) return;
              onChange(option.value);
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${isSelected ? "bg-[#e7f6ec] text-[#147b47] dark:bg-[#00d978]/15 dark:text-[#72edb0]" : "text-[#314037] hover:bg-[#f1f5f1] hover:text-[#17231b] dark:text-[#c5d4c9] dark:hover:bg-white/[.07] dark:hover:text-white"} disabled:cursor-not-allowed disabled:opacity-40`}
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
      onClick={() => { if (!disabled) setOpen((current) => !current); }}
      onKeyDown={handleTriggerKeyDown}
      className={`inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-xl border border-[#152219]/15 bg-[#f7faf7] px-3 text-left text-sm font-semibold text-[#17231b] outline-none transition hover:border-[#00d978]/55 hover:bg-[#edf7ef] focus-visible:ring-2 focus-visible:ring-[#00d978]/35 disabled:cursor-not-allowed disabled:opacity-55 dark:border-[#294333] dark:bg-[#101b14] dark:text-[#e6f2e9] dark:hover:bg-[#14251a] ${className}`}
    >
      <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
      <ChevronDown className={`size-4 shrink-0 text-[#82968a] transition-transform ${open ? "rotate-180 text-[#72edb0]" : ""}`} />
    </button>
    {menu}
  </>;
};
