import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import loader from "@monaco-editor/loader";
import { useTranslation } from "react-i18next";
import { getCurrentTheme, type AppTheme } from "../theme";
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
  minimap: {
    enabled: false
  },
  readOnly,
  automaticLayout: true,
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  padding: {
    top: 16,
    bottom: 16
  },
  wordWrap: "off" as const,
  tabSize: 2,
  insertSpaces: true,
  quickSuggestions: false,
  parameterHints: {
    enabled: false
  },
  suggestOnTriggerCharacters: false,
  acceptSuggestionOnEnter: "off" as const,
  tabCompletion: "off" as const,
  wordBasedSuggestions: "off" as const,
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
  const monacoTheme = appTheme === "light" ? "light" : "vs-dark";
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
  return <div ref={containerRef} className="h-full min-h-0 w-full">
      <Suspense fallback={<div className="h-full w-full flex items-center justify-center bg-bg-code border border-border">
            <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора...", "Loading editor...")}</div>
          </div>}>
        <Editor height="100%" language={monacoLang} theme={monacoTheme} value={value} options={editorOptions} onChange={handleChange} onMount={editor => {
        editorRef.current = editor;
        try {
          editor.layout();
        } catch {}
      }} loading={<div className="h-full w-full flex items-center justify-center bg-bg-code border border-border">
              <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора...", "Loading editor...")}</div>
            </div>} />
      </Suspense>
    </div>;
});
CodeEditor.displayName = "CodeEditor";