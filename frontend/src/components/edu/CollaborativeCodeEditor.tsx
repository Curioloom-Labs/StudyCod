import React, { Suspense, useEffect, useRef } from "react";
import type * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import type { Awareness } from "y-protocols/awareness";
import type * as Monaco from "monaco-editor";
import { ensureStudyCodMonacoThemes, loadStudyCodMonaco } from "../CodeEditor";

/**
 * Collaborative code editor (Live-coding P1). Monaco bound to a Yjs text via
 * y-monaco, so the document is owned by the CRDT (NOT a controlled `value`
 * prop). Transport-agnostic: the parent wires how the Y.Doc syncs (in-memory
 * for the demo; LiveKit data channel in P2).
 */
const Editor = React.lazy(async () => {
  await loadStudyCodMonaco();
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});

interface Props {
  yText: Y.Text;
  awareness?: Awareness | null;
  language?: string;
  height?: string | number;
  readOnly?: boolean;
  theme?: "dark" | "light";
}

export const CollaborativeCodeEditor: React.FC<Props> = ({
  yText,
  awareness = null,
  language = "java",
  height = "300px",
  readOnly = false,
  theme = "dark"
}) => {
  const bindingRef = useRef<MonacoBinding | null>(null);

  useEffect(() => {
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, []);

  return (
    <div style={{ height }} className="min-h-0 w-full border border-border">
      <Suspense fallback={<div className="h-full w-full flex items-center justify-center bg-bg-code text-text-secondary font-mono text-sm">Loading…</div>}>
        <Editor
          height="100%"
          width="100%"
          defaultLanguage={language}
          theme={theme === "light" ? "studycod-light" : "studycod-dark"}
          defaultValue=""
          options={{ readOnly, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
          beforeMount={(monaco: any) => ensureStudyCodMonacoThemes(monaco)}
          onMount={(editor: Monaco.editor.IStandaloneCodeEditor) => {
            const model = editor.getModel();
            if (!model) return;
            bindingRef.current?.destroy();
            bindingRef.current = new MonacoBinding(yText, model, new Set([editor]), awareness ?? undefined);
          }}
        />
      </Suspense>
    </div>
  );
};
