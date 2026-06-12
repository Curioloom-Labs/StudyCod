import React, { useMemo, useState } from "react";
import { CodeEditor } from "../../components/CodeEditor";
import { Button } from "../../components/ui/Button";
import { Terminal, RotateCcw, Keyboard } from "lucide-react";

const JAVA_SAMPLE_UNFORMATTED = `public class Main{public static void main(String[] args){int x=1; if(x>0){System.out.println(\"hi\");}}}`;
const PY_SAMPLE_UNFORMATTED = `def main():\n  x=1\n  if x>0:\n    print(\"hi\")\n\nmain()`;

const LANG_FILE: Record<"JAVA" | "PYTHON", string> = {
  JAVA: "Main.java",
  PYTHON: "main.py",
};

export const DevEditorPage: React.FC = () => {
  const [language, setLanguage] = useState<"JAVA" | "PYTHON">("JAVA");
  const defaultValue = useMemo(() => language === "JAVA" ? JAVA_SAMPLE_UNFORMATTED : PY_SAMPLE_UNFORMATTED, [language]);
  const [value, setValue] = useState<string>(defaultValue);

  const reset = () => setValue(defaultValue);

  const selectCls = "bg-bg-base border border-border rounded-lg px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-primary";

  // This page is mounted outside the main app layout in dev, so we must
  // size it against a *definite* viewport height. Otherwise percentage heights
  // can become "indefinite" and Monaco may collapse/paint nothing.
  return <div className="h-screen flex flex-col gap-4 p-4 md:p-6 bg-bg-base">
      {/* Hero */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <span className="font-mono text-xs text-primary/70">// dev editor</span>
          <div className="mt-2 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">Dev editor QA</h1>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-text-secondary">
            <Keyboard className="w-3.5 h-3.5 text-text-muted shrink-0" />
            Focus the editor, press <span className="font-mono text-text-primary">Ctrl+Alt+L</span> (or <span className="font-mono text-text-primary">Cmd+Alt+L</span> on macOS).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select className={selectCls} value={language} onChange={e => {
          const next = e.target.value === "PYTHON" ? "PYTHON" : "JAVA";
          setLanguage(next);
          // Reset sample when switching language.
          const nextValue = next === "JAVA" ? JAVA_SAMPLE_UNFORMATTED : PY_SAMPLE_UNFORMATTED;
          setValue(nextValue);
        }}>
            <option value="JAVA">JAVA</option>
            <option value="PYTHON">PYTHON</option>
          </select>

          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset sample
          </Button>
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

      {/* Expected behavior note */}
      <div className="rounded-xl border border-border bg-bg-surface p-4 text-text-secondary text-sm">
        <div className="text-xs font-mono uppercase tracking-[0.08em] text-text-muted mb-2">Expected behavior</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>If a formatter exists for the language, it will run.</li>
          <li>Otherwise it falls back to Monaco’s re-indent action (so you should still see indentation normalize).</li>
          <li>Note: on some keyboard layouts, <span className="font-mono text-text-primary">AltGr</span> can behave like <span className="font-mono text-text-primary">Ctrl+Alt</span>, which may trigger this shortcut while typing special characters.</li>
        </ul>
      </div>

      {/* Terminal-framed editor */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border bg-bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 bg-bg-hover/40">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
            <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
          </span>
          <span className="ml-2 text-xs font-mono text-text-secondary">{LANG_FILE[language]}</span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-[0.08em] text-text-muted">Editor</span>
        </div>
        <div className="flex-1 min-h-0 bg-bg-code">
          <CodeEditor language={language} value={value} onChange={setValue} />
        </div>
      </div>
    </div>;
};
