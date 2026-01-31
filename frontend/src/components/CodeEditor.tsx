import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import loader from "@monaco-editor/loader";
import { useTranslation } from "react-i18next";
import { getCurrentTheme, type AppTheme } from "../theme";

let javaStdlibCompletionRegistered = false;
let studycodMonacoThemesRegistered = false;

const ensureStudyCodMonacoThemes = (monaco: any) => {
  if (!monaco || studycodMonacoThemesRegistered) return;
  studycodMonacoThemesRegistered = true;

  try {
    monaco.editor.defineTheme("studycod-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0f0f15",
        "editor.foreground": "#e8e8f0",
        "editorLineNumber.foreground": "#6a6a7f",
        "editorLineNumber.activeForeground": "#e8e8f0",
        "editorCursor.foreground": "#00ff88",
        "editor.selectionBackground": "#00ff8833",
        "editor.inactiveSelectionBackground": "#00ff881f",
        "editor.lineHighlightBackground": "#111118",
        "editorIndentGuide.background": "#2a2a3a",
        "editorIndentGuide.activeBackground": "#3a3a4d",
        "editorBracketMatch.background": "#00ff881a",
        "editorBracketMatch.border": "#00ff8866"
      }
    });

    monaco.editor.defineTheme("studycod-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#f1f4f9",
        "editor.foreground": "#0b1220",
        "editorLineNumber.foreground": "#6b778c",
        "editorLineNumber.activeForeground": "#0b1220",
        "editorCursor.foreground": "#00b35f",
        "editor.selectionBackground": "#00b35f33",
        "editor.inactiveSelectionBackground": "#00b35f1f",
        "editor.lineHighlightBackground": "#eef2f7",
        "editorIndentGuide.background": "#d6deea",
        "editorIndentGuide.activeBackground": "#b7c3d6",
        "editorBracketMatch.background": "#00b35f1a",
        "editorBracketMatch.border": "#00b35f66"
      }
    });
  } catch {
    // ignore
  }
};

const JAVA_UTIL_COMMON = [
  "Scanner",
  "ArrayList",
  "LinkedList",
  "List",
  "Map",
  "HashMap",
  "Set",
  "HashSet",
  "Queue",
  "Deque",
  "ArrayDeque",
  "Collections",
  "Arrays",
  "Random",
  "StringTokenizer"
];

const JAVA_LANG_COMMON = [
  "String",
  "StringBuilder",
  "Math",
  "Integer",
  "Long",
  "Double",
  "Boolean",
  "Character"
];

const registerJavaStdlibCompletions = (monaco: any) => {
  if (!monaco || javaStdlibCompletionRegistered) return;
  javaStdlibCompletionRegistered = true;

  try {
    monaco.languages.registerCompletionItemProvider("java", {
      triggerCharacters: [".", "_"],
      provideCompletionItems: (model: any, position: any) => {
        try {
          const fullText = String(model?.getValue?.() ?? "");

          // Only offer these completions when the user is likely writing a typical EDU-style solution.
          // Without a Java LSP, Monaco can't know JDK symbols; this is a pragmatic UX layer.
          const hasJavaUtilImport = /\bimport\s+java\.util\.(\*|[A-Za-z0-9_]+)\s*;/.test(fullText);
          const hasJavaLangUsage = /\bclass\b|\bpublic\s+static\s+void\s+main\b/.test(fullText);
          if (!hasJavaUtilImport && !hasJavaLangUsage) return { suggestions: [] };

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };
          const prefix = String(word?.word ?? "");

          const mk = (label: string, detail: string) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: label,
            detail,
            range
          });

          const suggestions: any[] = [];

          // java.util.* common classes
          if (hasJavaUtilImport) {
            for (const name of JAVA_UTIL_COMMON) {
              if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                suggestions.push(mk(name, "java.util"));
              }
            }
          }

          // java.lang common classes (always available in Java)
          for (const name of JAVA_LANG_COMMON) {
            if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
              suggestions.push(mk(name, "java.lang"));
            }
          }

          return { suggestions };
        } catch {
          return { suggestions: [] };
        }
      }
    });
  } catch {
    // ignore
  }
};
if (typeof window !== "undefined") {
  loader.config({
    paths: {
      vs: "/monaco-editor/min/vs"
    }
  });
}
const Editor = React.lazy(() => import("@monaco-editor/react").then(mod => ({
  default: mod.default
})));
interface Props {
  language: "JAVA" | "PYTHON";
  value: string;
  onChange?: (code: string) => void;
  readOnly?: boolean;
}
const createEditorOptions = (readOnly: boolean) => ({
  fontSize: 14,
  fontFamily: "JetBrains Mono, Fira Code, Consolas, Monaco, 'Courier New', monospace",
  fontLigatures: true,
  minimap: {
    enabled: false
  },
  readOnly,
  automaticLayout: true,
  lineNumbers: "on" as const,
  renderLineHighlight: "all" as const,
  renderLineHighlightOnlyWhenFocus: true,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on" as const,
  padding: {
    top: 16,
    bottom: 16
  },
  wordWrap: "off" as const,
  tabSize: 2,
  insertSpaces: true,
  bracketPairColorization: {
    enabled: true
  },
  guides: {
    indentation: true
  },
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false
  },
  parameterHints: {
    enabled: false
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "off" as const,
  tabCompletion: "off" as const,
  // Enable word-based suggestions so we can autocomplete identifiers that exist
  // in the current file (e.g. `Scan` -> `Scanner` when `Scanner` is imported).
  // This does NOT provide full Java stdlib / type-aware completions (needs LSP),
  // but it covers the common "continue the word" UX.
  wordBasedSuggestions: "currentDocument" as const,
  wordBasedSuggestionsOnlySameLanguage: true,
  autoClosingBrackets: "always" as const,
  autoClosingQuotes: "always" as const,
  autoIndent: "advanced" as const,
  formatOnPaste: true,
  formatOnType: true,
  validate: false,
  workers: 1
});
export const CodeEditor: React.FC<Props> = React.memo(({
  language,
  value,
  onChange,
  readOnly = false
}) => {
  const {
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const monacoLang = useMemo(() => language === "JAVA" ? "java" : "python", [language]);
  const editorOptions = useMemo(() => createEditorOptions(readOnly), [readOnly]);
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [didMount, setDidMount] = useState(false);
  const [mountTimedOut, setMountTimedOut] = useState(false);
  const [loaderReady, setLoaderReady] = useState(false);
  const [loaderError, setLoaderError] = useState<string | null>(null);
  const [debugSize, setDebugSize] = useState<{ w: number; h: number } | null>(null);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getCurrentTheme());
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const readTheme = () => {
      const t = getCurrentTheme();
      setAppTheme(t);
    };
    readTheme();
    const observer = new MutationObserver(() => readTheme());
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === "studycod_theme") readTheme();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const monacoTheme = appTheme === "light" ? "studycod-light" : "studycod-dark";

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    loader
      .init()
      .then(monaco => {
        if (cancelled) return;
        setLoaderReady(true);
        setLoaderError(null);

        // Ensure our customizations exist as soon as Monaco is available.
        ensureStudyCodMonacoThemes(monaco);
        if (monacoLang === "java") registerJavaStdlibCompletions(monaco);
      })
      .catch(err => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoaderReady(false);
        setLoaderError(msg);
      });

    return () => {
      cancelled = true;
    };
  }, [monacoLang]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setDebugSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    setDidMount(false);
    setMountTimedOut(false);
    const t = window.setTimeout(() => setMountTimedOut(true), 5000);
    return () => window.clearTimeout(t);
  }, [monacoLang, monacoTheme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const current = editor.getValue?.();
      if (typeof current === "string" && current !== value) {
        editor.setValue(value);
      }
    } catch {
      // ignore
    }
  }, [value]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const tick = () => {
      try {
        editor.layout();
      } catch {}
    };
    const raf1 = requestAnimationFrame(tick);
    const raf2 = requestAnimationFrame(tick);
    const t = window.setTimeout(tick, 100);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t);
    };
  }, [monacoTheme]);
  useEffect(() => {
    const editor = editorRef.current;
    const el = containerRef.current;
    if (!editor || !el) return;
    if (typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          editor.layout();
        } catch {}
      });
    };
    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    schedule();
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [monacoTheme, readOnly, monacoLang]);
  const handleChange = useMemo(() => (v: string | undefined) => {
    onChange?.(v ?? "");
  }, [onChange]);
  return <div ref={containerRef} className="h-full min-h-0 w-full relative">
      {import.meta.env.DEV && mountTimedOut && !didMount && <div className="absolute inset-0 z-10 flex items-start justify-end p-2 pointer-events-none">
          <div className="pointer-events-none rounded border border-accent-warn/50 bg-bg-surface/80 px-3 py-2 text-xs font-mono text-text-secondary">
            Monaco did not mount (5s). Check console/network for <span className="text-text-primary">/monaco-editor/min/vs/</span>
          </div>
        </div>}
      {import.meta.env.DEV && <div className="absolute z-10 left-2 bottom-2 pointer-events-none">
          <div className="rounded border border-border bg-bg-surface/80 px-3 py-2 text-[11px] leading-4 font-mono text-text-secondary">
            <div>
              <span className="text-text-primary">Monaco debug</span>
            </div>
            <div>loader: {loaderError ? <span className="text-accent-error">error</span> : loaderReady ? <span className="text-accent-success">ready</span> : "loading"}</div>
            {loaderError && <div className="max-w-[520px] whitespace-pre-wrap break-words">{loaderError}</div>}
            <div>mount: {didMount ? <span className="text-accent-success">ok</span> : mountTimedOut ? <span className="text-accent-warn">timeout</span> : "pending"}</div>
            <div>lang: {monacoLang}</div>
            <div>theme: {monacoTheme}</div>
            <div>value: {value.length} chars</div>
            <div>container: {debugSize ? `${debugSize.w}×${debugSize.h}` : "?"}</div>
          </div>
        </div>}
      <Suspense fallback={<div className="h-full w-full flex items-center justify-center bg-bg-code border border-border">
            <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора...", "Loading editor...")}</div>
          </div>}>
        <Editor height="100%" width="100%" language={monacoLang} theme={monacoTheme} value={value} options={editorOptions} onChange={handleChange} beforeMount={monaco => {
        // Theme must be defined before the editor instance is created.
        // Otherwise setting an unknown theme name can lead to a blank editor.
        ensureStudyCodMonacoThemes(monaco);

        // Register completions early as well.
        if (monacoLang === "java") {
          registerJavaStdlibCompletions(monaco);
        }
      }} onMount={(editor, monaco) => {
        editorRef.current = editor;
        setDidMount(true);

        if (import.meta.env.DEV) {
          try {
            (window as any).__monacoDebug = { editor, monaco };
          } catch {
            // ignore
          }
        }

        // (Safety) ensure theme/completions exist even if editor mounts before beforeMount fires.
        ensureStudyCodMonacoThemes(monaco);
        if (monacoLang === "java") registerJavaStdlibCompletions(monaco);

        try {
          editor.addAction({
            id: "studycod.formatDocument",
            label: "Format Document",
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL],
            run: async ed => {
              try {
                const action = ed.getAction("editor.action.formatDocument");
                if (action) await action.run();
                return;
              } catch {}

              // Fallback that works even without a registered formatter.
              // Useful for Java/Python where formatters are typically not bundled.
              try {
                const reindent = ed.getAction("editor.action.reindentlines");
                if (reindent) await reindent.run();
              } catch {
                // ignore
              }
            }
          });
        } catch {
          // ignore
        }
        try {
          // Ensure the model contains the current value (extra safety for controlled usage).
          if (typeof value === "string") {
            const cur = editor.getValue?.();
            if (typeof cur === "string" && cur !== value) editor.setValue(value);
          }
          editor.layout();
        } catch {}
      }} loading={<div className="h-full w-full flex items-center justify-center bg-bg-code border border-border">
              <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора...", "Loading editor...")}</div>
            </div>} />
      </Suspense>
    </div>;
});
CodeEditor.displayName = "CodeEditor";