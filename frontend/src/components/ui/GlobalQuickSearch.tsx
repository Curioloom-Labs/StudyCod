import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpen, CircleHelp, Code2, GraduationCap, LayoutDashboard, Search, UserRound } from "lucide-react";
import { Modal } from "./Modal";

type SearchItem = {
  label: string;
  description: string;
  path: string;
  keywords: string;
  Icon: React.ComponentType<{ className?: string }>;
};

export const GlobalQuickSearch: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const en = i18n.language?.toLowerCase().startsWith("en");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const items = React.useMemo<SearchItem[]>(() => en ? [
    { label: "Overview", description: "Your personal learning space", path: "/", keywords: "home dashboard start", Icon: LayoutDashboard },
    { label: "Task library", description: "Search and solve practice tasks", path: "/lab/library", keywords: "tasks practice problems coding", Icon: Code2 },
    { label: "Courses", description: "Browse learning courses", path: "/learning/catalog", keywords: "course learn catalog", Icon: GraduationCap },
    { label: "Playground", description: "Experiment with code", path: "/lab/playground", keywords: "playground run code editor", Icon: BookOpen },
    { label: "Profile", description: "Account and learning settings", path: "/?app=profile", keywords: "profile account settings", Icon: UserRound },
    { label: "Support", description: "Ask a question or report an issue", path: "/support", keywords: "help support issue", Icon: CircleHelp },
  ] : [
    { label: "Огляд", description: "Твій особистий навчальний простір", path: "/", keywords: "головна дашборд старт", Icon: LayoutDashboard },
    { label: "Бібліотека задач", description: "Пошук і розв’язання практичних задач", path: "/lab/library", keywords: "задачі практика програмування", Icon: Code2 },
    { label: "Курси", description: "Перегляд навчальних курсів", path: "/learning/catalog", keywords: "курс навчання каталог", Icon: GraduationCap },
    { label: "Пісочниця", description: "Експерименти з кодом", path: "/lab/playground", keywords: "пісочниця код редактор запуск", Icon: BookOpen },
    { label: "Профіль", description: "Акаунт і налаштування навчання", path: "/?app=profile", keywords: "профіль акаунт налаштування", Icon: UserRound },
    { label: "Підтримка", description: "Поставити питання або повідомити про проблему", path: "/support", keywords: "допомога підтримка проблема", Icon: CircleHelp },
  ], [en]);

  const filteredItems = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter((item) => [item.label, item.description, item.keywords].join(" ").toLocaleLowerCase().includes(needle));
  }, [items, query]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const openItem = React.useCallback((path: string) => {
    close();
    navigate(path);
  }, [close, navigate]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        return;
      }
      if (!open || !filteredItems.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % filteredItems.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + filteredItems.length) % filteredItems.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        openItem(filteredItems[activeIndex]?.path ?? filteredItems[0].path);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filteredItems, open, openItem]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <Modal
      open={open}
      onClose={close}
      title={en ? "Quick search" : "Швидкий пошук"}
      description={en ? "Jump to a platform area with the keyboard or mouse." : "Переходь до розділу платформи клавіатурою або мишкою."}
      panelClassName="sm:max-w-xl"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
        <label htmlFor="global-quick-search" className="sr-only">{en ? "Search platform" : "Пошук по платформі"}</label>
        <input
          id="global-quick-search"
          name="globalSearch"
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={en ? "Search courses, tasks, support…" : "Знайти курси, задачі, підтримку…"}
          className="h-12 w-full rounded-xl border border-border bg-bg-base pl-10 pr-3 text-sm text-text-primary outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
        />
      </div>
      <div className="mt-3 space-y-1" role="listbox" aria-label={en ? "Search results" : "Результати пошуку"}>
        {filteredItems.length ? filteredItems.map((item, index) => {
          const active = index === activeIndex;
          const Icon = item.Icon;
          return (
            <button
              key={item.path}
              type="button"
              role="option"
              aria-selected={active}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openItem(item.path)}
              className={"flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition " + (active ? "bg-secondary/10 text-text-primary" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary")}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-bg-base"><Icon className="size-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-xs text-text-secondary">{item.description}</span></span>
              <ArrowRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          );
        }) : <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary" role="status">{en ? "No matching sections." : "Відповідних розділів не знайдено."}</div>}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-text-secondary" aria-label={en ? "Keyboard shortcuts" : "Комбінації клавіш"}>
        <span><kbd className="rounded border border-border bg-bg-base px-1.5 py-0.5 font-mono">Ctrl/Cmd K</kbd> {en ? "search" : "пошук"}</span>
        <span><kbd className="rounded border border-border bg-bg-base px-1.5 py-0.5 font-mono">↑ ↓</kbd> {en ? "navigate" : "навігація"}</span>
        <span><kbd className="rounded border border-border bg-bg-base px-1.5 py-0.5 font-mono">Enter</kbd> {en ? "open" : "відкрити"}</span>
      </div>
    </Modal>
  );
};
