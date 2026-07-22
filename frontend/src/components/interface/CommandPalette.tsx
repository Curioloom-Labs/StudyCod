import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export type PaletteItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
};

export type PaletteAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  run: () => void;
};

type Entry =
  | ({ kind: "item" } & PaletteItem)
  | ({ kind: "action" } & PaletteAction);

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  onSelect: (id: string) => void;
  extraActions?: PaletteAction[];
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  items,
  onSelect,
  extraActions
}) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const isUk = (i18n.language || "").startsWith("uk");

  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  const searchLabel = t("searchOrJump", {
    defaultValue: isUk ? "Пошук або перехід…" : "Search or jump to…"
  });
  const actionsLabel = t("novaPaletteActions", {
    defaultValue: isUk ? "Дії" : "Actions"
  });
  const noResultsLabel = t("noResults", {
    defaultValue: isUk ? "Нічого не знайдено" : "No results"
  });

  const trimmedQuery = query.trim().toLowerCase();
  const showHeaders = trimmedQuery === "";

  const entries = React.useMemo<Entry[]>(() => {
    const matchedItems = items.filter(
      (it) => !trimmedQuery || it.label.toLowerCase().includes(trimmedQuery)
    );
    const matchedActions = (extraActions ?? []).filter(
      (a) => !trimmedQuery || a.label.toLowerCase().includes(trimmedQuery)
    );
    return [
      ...matchedItems.map((it) => ({ kind: "item" as const, ...it })),
      ...matchedActions.map((a) => ({ kind: "action" as const, ...a }))
    ];
  }, [items, extraActions, trimmedQuery]);

  // Reset state when the palette opens; store/restore the trigger's focus.
  React.useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setQuery("");
      setSelected(0);
    } else if (previouslyFocused.current) {
      previouslyFocused.current.focus();
      previouslyFocused.current = null;
    }
  }, [open]);

  // Keep selection within bounds as the filter changes.
  React.useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  // Keep the selected option visible.
  React.useEffect(() => {
    if (!open) return;
    document.getElementById(`cmd-opt-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [open, selected]);

  const activate = React.useCallback(
    (entry: Entry) => {
      onClose();
      if (entry.kind === "item") {
        onSelect(entry.id);
      } else {
        entry.run();
      }
    },
    [onClose, onSelect]
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, entries.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = entries[selected];
      if (entry) activate(entry);
    }
  };

  const rows: React.ReactNode[] = [];
  let lastGroup: string | null = null;
  entries.forEach((entry, index) => {
    const group = entry.kind === "item" ? entry.group : actionsLabel;
    if (showHeaders && group !== lastGroup) {
      rows.push(
        <div
          key={`header-${group}-${index}`}
          className="px-3 pt-3 pb-1 text-[10px] font-mono font-medium uppercase tracking-[0.08em] text-text-muted"
        >
          {group}
        </div>
      );
      lastGroup = group;
    }
    const Icon = entry.icon;
    const isSelected = index === selected;
    const danger = entry.kind === "action" && entry.danger;
    rows.push(
      <button
        key={`${entry.kind}-${entry.id}`}
        id={`cmd-opt-${index}`}
        type="button"
        role="option"
        aria-selected={isSelected}
        tabIndex={-1}
        onClick={() => activate(entry)}
        onMouseMove={() => setSelected(index)}
        className={
          "relative w-full min-h-11 px-3 flex items-center gap-3 text-left text-sm transition-colors duration-150 " +
          (danger
            ? "text-accent-error"
            : isSelected
              ? "text-text-primary"
              : "text-text-secondary")
        }
      >
        {isSelected ? (
          <motion.span
            layoutId="cmd-palette-highlight"
            aria-hidden="true"
            className="absolute inset-0 bg-bg-hover"
            transition={{ duration: reduceMotion ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : null}
        <Icon className="relative w-4 h-4 shrink-0" />
        <span className="relative truncate">{entry.label}</span>
      </button>
    );
  });

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end sm:block" onKeyDown={onKeyDown}>
          <motion.div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={searchLabel}
            className="relative mx-2 mb-2 w-[calc(100vw-1rem)] max-w-lg rounded-[24px] border border-border bg-bg-surface shadow-2xl overflow-hidden sm:mx-auto sm:mt-[15vh] sm:mb-0 sm:w-[calc(100vw-2rem)] sm:rounded-xl"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            <div className="flex items-center gap-2 px-3 border-b border-border">
              <Search className="w-4 h-4 shrink-0 text-text-muted" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={searchLabel}
                placeholder={searchLabel}
                role="combobox"
                aria-expanded="true"
                aria-controls="cmd-list"
                aria-activedescendant={entries.length ? `cmd-opt-${selected}` : undefined}
                className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-muted border-0 outline-none focus:outline-none focus-visible:outline-none"
                type="text"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div
              id="cmd-list"
              role="listbox"
              aria-label={searchLabel}
              className="max-h-[50vh] overflow-y-auto pb-2"
            >
              {entries.length ? (
                rows
              ) : (
                <div className="px-3 py-8 text-center text-sm text-text-muted">
                  {noResultsLabel}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
