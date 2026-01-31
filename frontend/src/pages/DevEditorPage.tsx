import React, { useMemo, useState } from "react";
import { CodeEditor } from "../components/CodeEditor";
import { Button } from "../components/ui/Button";

const JAVA_SAMPLE_UNFORMATTED = `public class Main{public static void main(String[] args){int x=1; if(x>0){System.out.println(\"hi\");}}}`;
const PY_SAMPLE_UNFORMATTED = `def main():\n  x=1\n  if x>0:\n    print(\"hi\")\n\nmain()`;

export const DevEditorPage: React.FC = () => {
  const [language, setLanguage] = useState<"JAVA" | "PYTHON">("JAVA");
  const defaultValue = useMemo(() => language === "JAVA" ? JAVA_SAMPLE_UNFORMATTED : PY_SAMPLE_UNFORMATTED, [language]);
  const [value, setValue] = useState<string>(defaultValue);

  const reset = () => setValue(defaultValue);

  // This page is mounted outside the main app layout in dev, so we must
  // size it against a *definite* viewport height. Otherwise percentage heights
  // can become "indefinite" and Monaco may collapse/paint nothing.
  return <div className="h-screen flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-text-primary font-mono text-sm">Dev editor QA</div>
          <div className="text-text-secondary text-sm">
            Focus the editor, press <span className="font-mono">Ctrl+Alt+L</span> (or <span className="font-mono">Cmd+Alt+L</span> on macOS).
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select className="bg-bg-base border border-border rounded px-2 py-1 text-sm text-text-primary" value={language} onChange={e => {
          const next = e.target.value === "PYTHON" ? "PYTHON" : "JAVA";
          setLanguage(next);
          // Reset sample when switching language.
          const nextValue = next === "JAVA" ? JAVA_SAMPLE_UNFORMATTED : PY_SAMPLE_UNFORMATTED;
          setValue(nextValue);
        }}>
            <option value="JAVA">JAVA</option>
            <option value="PYTHON">PYTHON</option>
          </select>

          <Button variant="secondary" onClick={reset}>Reset sample</Button>
        </div>
      </div>

      <div className="text-text-secondary text-sm">
        Expected behavior:
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>If a formatter exists for the language, it will run.</li>
          <li>Otherwise it falls back to Monaco’s re-indent action (so you should still see indentation normalize).</li>
          <li>Note: on some keyboard layouts, <span className="font-mono">AltGr</span> can behave like <span className="font-mono">Ctrl+Alt</span>, which may trigger this shortcut while typing special characters.</li>
        </ul>
      </div>

      <div className="flex-1 min-h-0 border border-border rounded overflow-hidden bg-bg-code">
        <CodeEditor language={language} value={value} onChange={setValue} />
      </div>
    </div>;
};
