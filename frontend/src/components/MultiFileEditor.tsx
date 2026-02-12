import React, { useEffect, useMemo, useState } from "react";
import { CodeEditor } from "./CodeEditor";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { Plus, X } from "lucide-react";

export type CodeFile = { path: string; content: string };

function isSafeSimpleFilename(name: string): boolean {
  const p = name.trim();
  if (!p) return false;
  if (p.includes("/") || p.includes("\\")) return false;
  if (p.includes("..")) return false;
  if (p.startsWith(".")) return false;
  if (p.length > 120) return false;
  return true;
}

function normalizeFiles(input: CodeFile[]): CodeFile[] {
  const byPath = new Map<string, CodeFile>();
  for (const f of input) {
    const path = String(f?.path ?? "").trim();
    const content = typeof f?.content === "string" ? f.content : "";
    if (!isSafeSimpleFilename(path)) continue;
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
}

export const MultiFileEditor: React.FC<MultiFileEditorProps> = ({
  language,
  entryFile,
  files,
  onChange,
  readOnly,
  height,
}) => {
  const normalized = useMemo(() => {
    const n = normalizeFiles(files);
    if (!n.some(f => f.path === entryFile)) {
      return normalizeFiles([{ path: entryFile, content: "" }, ...n]);
    }
    return n;
  }, [files, entryFile]);

  // Keep local active path, but reconcile with external changes.
  const [activePath, setActivePath] = useState<string>(entryFile);
  useEffect(() => {
    if (normalized.some(f => f.path === activePath)) return;
    setActivePath(entryFile);
  }, [normalized, activePath, entryFile]);

  const active = normalized.find(f => f.path === activePath) ?? normalized.find(f => f.path === entryFile) ?? normalized[0];

  const setActiveContent = (content: string) => {
    if (!active) return;
    const next = normalized.map(f => (f.path === active.path ? { ...f, content } : f));
    onChange(next);
  };

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const openAdd = () => {
    setNameError(null);
    setNewName("");
    setAddOpen(true);
  };

  const doAdd = () => {
    const p = newName.trim();
    if (!isSafeSimpleFilename(p)) {
      setNameError("Invalid filename");
      return;
    }
    if (normalized.some(f => f.path === p)) {
      setNameError("File already exists");
      return;
    }
    const next = normalizeFiles([...normalized, { path: p, content: "" }]);
    onChange(next);
    setActivePath(p);
    setAddOpen(false);
  };

  const doRemove = (path: string) => {
    if (path === entryFile) return;
    const next = normalized.filter(f => f.path !== path);
    onChange(next);
    if (activePath === path) setActivePath(entryFile);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 border-b border-border bg-bg-surface px-2 py-2 flex-shrink-0 overflow-x-auto">
        {normalized
          .slice()
          .sort((a, b) => (a.path === entryFile ? -1 : b.path === entryFile ? 1 : a.path.localeCompare(b.path)))
          .map(f => {
            const isActive = f.path === activePath;
            const isEntry = f.path === entryFile;
            return (
              <div key={f.path} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setActivePath(f.path)}
                  className={
                    "px-3 py-1.5 text-xs font-mono border transition-fast whitespace-nowrap " +
                    (isActive
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary")
                  }
                  title={isEntry ? `${f.path} (entry)` : f.path}
                >
                  {f.path}
                  {isEntry ? <span className="ml-2 text-[10px] text-text-muted">entry</span> : null}
                </button>
                {!readOnly && !isEntry ? (
                  <button
                    type="button"
                    onClick={() => doRemove(f.path)}
                    className="ml-1 p-1 border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                    title="Remove file"
                  >
                    <X className="w-3 h-3" />
                  </button>
                ) : null}
              </div>
            );
          })}

        {!readOnly ? (
          <Button variant="ghost" size="sm" onClick={openAdd} className="ml-auto">
            <Plus className="w-4 h-4 mr-1" />
            Add file
          </Button>
        ) : null}
      </div>

      <div className="flex-1 min-h-0">
        <div className={height ? "h-full" : "h-full"} style={height ? { height } : undefined}>
          <CodeEditor language={language} value={active?.content ?? ""} onChange={readOnly ? undefined : setActiveContent} readOnly={readOnly} />
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add file" showCloseButton={false}>
        <div className="space-y-3">
          <div className="text-xs text-text-secondary font-mono">
            Filenames must be simple (no folders, no <span className="font-mono">..</span>, no dotfiles).
          </div>
          <input
            value={newName}
            onChange={e => {
              setNewName(e.target.value);
              setNameError(null);
            }}
            placeholder="e.g. Utils.java"
            className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none focus:border-primary"
          />
          {nameError ? <div className="text-xs text-accent-error font-mono">{nameError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
