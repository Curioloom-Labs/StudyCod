import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { FileCode2, Plus, X } from "lucide-react";
import { tr } from "../i18n";

export type CodeFile = { path: string; content: string };

function normalizeSafeCodeFilePath(name: string): string | null {
  const p = name.trim().replace(/\\/g, "/");
  if (!p) return null;
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  if (p.length > 180) return null;
  const parts = p.split("/");
  if (parts.length > 8) return null;
  for (const part of parts) {
    if (!part || part === "." || part === "..") return null;
    if (part.startsWith(".")) return null;
    if (part.length > 80) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(part)) return null;
  }
  return p;
}

function normalizeFiles(input: CodeFile[]): CodeFile[] {
  const byPath = new Map<string, CodeFile>();
  for (const f of input) {
    const path = normalizeSafeCodeFilePath(String(f?.path ?? ""));
    const content = typeof f?.content === "string" ? f.content : "";
    if (!path) continue;
    byPath.set(path, { path, content });
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export interface MultiFileEditorProps {
  language: React.ComponentProps<typeof CodeEditor>["language"];
  entryFile: string;
  files: CodeFile[];
  onChange: (next: CodeFile[]) => void;
  readOnly?: boolean;
  height?: string;
  fontSize?: number;
  wordWrap?: boolean;
  enableSemanticLsp?: boolean;
  activePath?: string;
  onActivePathChange?: (path: string) => void;
  hideTabsOnDesktop?: boolean;
  /**
   * Increment this number to request opening the “Add file” modal.
   * Useful when the parent triggers file creation from outside the editor.
   */
  requestAddToken?: number;
}

export const MultiFileEditor: React.FC<MultiFileEditorProps> = ({
  language,
  entryFile,
  files,
  onChange,
  readOnly,
  height,
  fontSize,
  wordWrap,
  enableSemanticLsp = true,
  activePath: controlledActivePath,
  onActivePathChange,
  hideTabsOnDesktop = false,
  requestAddToken,
}) => {
  const normalized = useMemo(() => {
    const n = normalizeFiles(files);
    if (!n.some(f => f.path === entryFile)) {
      return normalizeFiles([{ path: entryFile, content: "" }, ...n]);
    }
    return n;
  }, [files, entryFile]);

  // Keep local active path, but reconcile with external changes.
  const [internalActivePath, setInternalActivePath] = useState<string>(entryFile);
  const activePath = controlledActivePath ?? internalActivePath;
  const setActivePath = useCallback((path: string) => {
    setInternalActivePath(path);
    onActivePathChange?.(path);
  }, [onActivePathChange]);
  useEffect(() => {
    if (normalized.some(f => f.path === activePath)) return;
    setActivePath(entryFile);
  }, [normalized, activePath, entryFile]);

  const active = normalized.find(f => f.path === activePath) ?? normalized.find(f => f.path === entryFile) ?? normalized[0];
  const panelAriaId = useId();

  const tabIdForPath = useCallback((path: string) => {
    const safePath = String(path || "").replace(/[^a-zA-Z0-9_-]/g, "-");
    return `${panelAriaId}-tab-${safePath}`;
  }, [panelAriaId]);

  const setActiveContent = (content: string) => {
    if (!active) return;
    const next = normalized.map(f => (f.path === active.path ? { ...f, content } : f));
    onChange(next);
  };

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const lastRequestToken = useRef<number | undefined>(undefined);

  const openAdd = () => {
    setNameError(null);
    setNewName("");
    setAddOpen(true);
  };

  useEffect(() => {
    if (readOnly) return;
    if (typeof requestAddToken !== "number") return;
    if (lastRequestToken.current === undefined) {
      lastRequestToken.current = requestAddToken;
      // A non-zero token can be supplied by the parent while enabling the
      // multi-file mode. Open the dialog after the editor mounts so the
      // first "Add file" click is not lost.
      if (requestAddToken > 0) openAdd();
      return;
    }
    if (requestAddToken === lastRequestToken.current) return;
    lastRequestToken.current = requestAddToken;
    openAdd();
  }, [requestAddToken, readOnly]);

  const doAdd = () => {
    const p = newName.trim();
    const safePath = normalizeSafeCodeFilePath(p);
    if (!safePath) {
      setNameError(tr("Некоректна назва файлу", "Invalid filename"));
      return;
    }
    if (normalized.some(f => f.path === safePath)) {
      setNameError(tr("Файл вже існує", "File already exists"));
      return;
    }
    const next = normalizeFiles([...normalized, { path: safePath, content: "" }]);
    onChange(next);
    setActivePath(safePath);
    setAddOpen(false);
  };

  const doRemove = (path: string) => {
    if (path === entryFile) return;
    const next = normalized.filter(f => f.path !== path);
    onChange(next);
    if (activePath === path) setActivePath(entryFile);
  };

  return (
    <div className={`studycod-multi-file-editor flex h-full min-h-0 flex-col ${hideTabsOnDesktop ? "studycod-hide-tabs-desktop" : ""}`}>
      {hideTabsOnDesktop ? <style>{`@media (min-width: 1024px) { .studycod-hide-tabs-desktop > [role="tablist"] { display: none; } }`}</style> : null}
      <div className="flex min-h-12 flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#151d17] px-3 py-1.5" role="tablist" aria-label={tr("Файли редактора", "Editor files")}>
        {normalized
          .slice()
          .sort((a, b) => (a.path === entryFile ? -1 : b.path === entryFile ? 1 : a.path.localeCompare(b.path)))
          .map(f => {
            const isActive = f.path === activePath;
            const isEntry = f.path === entryFile;
            const tabId = tabIdForPath(f.path);
            return (
              <div key={f.path} className="group relative flex items-center">
                <button
                  type="button"
                  onClick={() => setActivePath(f.path)}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${panelAriaId}-panel`}
                  id={tabId}
                  className={
                    "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition " +
                    (isActive
                      ? "bg-white/[.09] text-white shadow-sm"
                      : "text-[#91a198] hover:bg-white/[.05] hover:text-[#dce7df]")
                  }
                  title={isEntry ? `${f.path} (entry)` : f.path}
                >
                  <FileCode2 className={`size-3.5 ${isActive ? "text-[#72edb0]" : "text-[#718078]"}`} />
                  {f.path}
                </button>
                {!readOnly && !isEntry ? (
                  <button
                    type="button"
                    onClick={() => doRemove(f.path)}
                    className="ml-0.5 grid size-7 place-items-center rounded-lg text-[#718078] opacity-0 transition hover:bg-white/[.07] hover:text-white group-hover:opacity-100 focus:opacity-100"
                    title="Remove file"
                    aria-label={tr(`Видалити файл ${f.path}`, `Remove file ${f.path}`)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : null}
              </div>
            );
          })}

        {!readOnly ? (
          <button type="button" onClick={openAdd} className="ml-auto grid size-9 shrink-0 place-items-center rounded-lg text-[#91a198] transition hover:bg-white/[.07] hover:text-white" title={tr("Додати файл", "Add file")} aria-label={tr("Додати файл", "Add file")}><Plus className="size-4" /></button>
        ) : null}
      </div>

      <div className="flex h-full min-h-0 flex-1" id={`${panelAriaId}-panel`} role="tabpanel" aria-labelledby={active ? tabIdForPath(active.path) : undefined}>
        <div className="h-full min-h-0 w-full" style={height ? { height } : undefined}>
          <CodeEditor key={active?.path || entryFile} language={language} value={active?.content ?? ""} onChange={readOnly ? undefined : setActiveContent} readOnly={readOnly} fontSize={fontSize} wordWrap={wordWrap} enableSemanticLsp={enableSemanticLsp} filePath={active?.path || entryFile} />
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={tr("Додати файл", "Add file")} showCloseButton={false}>
        <div className="space-y-3">
          <div className="text-xs text-text-secondary font-mono">
            {tr(
              "Назва має бути відносним шляхом: без .. і без прихованих (dot) файлів. Папки дозволені (наприклад: utils/Solver.swift).",
              "Filename must be a relative path: no .. and no dotfiles. Folders are allowed (e.g. utils/Solver.swift)."
            )}
          </div>
          <input
            value={newName}
            onChange={e => {
              setNewName(e.target.value);
              setNameError(null);
            }}
            placeholder={tr("наприклад: data.txt або input.json", "e.g. data.txt or input.json")}
            className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
          />
          {nameError ? <div className="text-xs text-accent-error font-mono">{nameError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              {tr("Скасувати", "Cancel")}
            </Button>
            <Button onClick={doAdd}>{tr("Додати", "Add")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
