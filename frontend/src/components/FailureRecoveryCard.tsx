import React from "react";
import { tr } from "../i18n";
import "./FailureRecoveryCard.css";

export type FailureRecoveryData = {
  testPublicIndex: number;
  inputPreview: string;
  expectedPreview: string;
  actualPreview: string;
  errorKind: string;
  diff?: {
    expectedLines?: string[];
    actualLines?: string[];
  };
};

type Props = {
  verdict?: string | null;
  firstFailure?: FailureRecoveryData | null;
};

type DiffRow = {
  expected: string;
  actual: string;
  changed: boolean;
};

function explainErrorKind(kind?: string | null): string {
  switch (String(kind ?? "").toLowerCase()) {
    case "off_by_one":
      return tr("Ймовірна помилка на межі діапазону (на 1).", "Likely boundary off-by-one error.");
    case "format":
      return tr("Невірний формат виводу: перевір пробіли, переноси рядків та порядок друку.", "Output formatting mismatch: check spaces, newlines, and print order.");
    case "logic":
      return tr("Логічна невідповідність: формула/умова працює не для всіх випадків.", "Logic mismatch: formula/condition fails for some cases.");
    case "runtime":
      return tr("Код виконується з помилкою в рантаймі на цьому тесті.", "Runtime error occurred on this test.");
    case "timeout":
      return tr("Перевищено ліміт часу: потрібна ефективніша реалізація.", "Time limit exceeded: implementation needs optimization.");
    case "oom":
      return tr("Перевищено ліміт пам’яті: зменш обсяг структур даних.", "Memory limit exceeded: reduce memory usage.");
    case "compile":
      return tr("Помилка компіляції: виправ синтаксис/типи/імпорти.", "Compilation error: fix syntax/types/imports.");
    default:
      return tr("Результат не збігся з очікуваним. Перевір проміжні обчислення на цьому тесті.", "Output did not match expected value. Re-check intermediate computations on this test.");
  }
}

function buildLineDiff(expectedText: string, actualText: string): DiffRow[] {
  const expected = String(expectedText ?? "").replace(/\r\n?/g, "\n").split("\n");
  const actual = String(actualText ?? "").replace(/\r\n?/g, "\n").split("\n");
  const max = Math.max(expected.length, actual.length);
  const rows: DiffRow[] = [];
  for (let i = 0; i < max; i++) {
    const e = expected[i] ?? "";
    const a = actual[i] ?? "";
    rows.push({ expected: e, actual: a, changed: e !== a });
  }
  return rows.slice(0, 40);
}

export const FailureRecoveryCard: React.FC<Props> = ({ verdict, firstFailure }) => {
  const upperVerdict = String(verdict ?? "").toUpperCase();
  const allowed = upperVerdict === "WA" || upperVerdict === "PRESENTATION_ERROR" || upperVerdict === "PARTIAL";
  if (!allowed || !firstFailure) return null;

  const expectedText = firstFailure.expectedPreview || "";
  const actualText = firstFailure.actualPreview || "";
  const diffRows = buildLineDiff(expectedText, actualText);

  return (
    <div className="failure-recovery-card mt-3">
      <div className="text-[10px] font-mono text-primary mb-2">
        {tr("Розбір помилки (WA)", "Wrong Answer recovery")}
      </div>

      <div className="text-xs font-mono text-text-secondary mb-2">
        {tr("Перший проблемний публічний тест", "First failing public test")}: <span className="text-text-primary">#{firstFailure.testPublicIndex}</span>
      </div>

      <div className="text-xs font-mono text-text-secondary mb-2">
        <span className="text-text-primary">{tr("Причина", "Reason")}:</span> {explainErrorKind(firstFailure.errorKind)}
      </div>

      <div className="failure-recovery-grid mb-3">
        <div>
          <div className="text-[10px] font-mono text-text-secondary mb-1">{tr("Вхідні дані", "Input")}</div>
          <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-words">{firstFailure.inputPreview || "(empty)"}</pre>
        </div>
        <div>
          <div className="text-[10px] font-mono text-text-secondary mb-1">{tr("Тип помилки", "Error kind")}</div>
          <div className="text-xs font-mono text-text-primary">{firstFailure.errorKind || "unknown"}</div>
        </div>
      </div>

      <div className="failure-recovery-grid">
        <div>
          <div className="text-[10px] font-mono text-text-secondary mb-1">{tr("Очікуваний вивід", "Expected output")}</div>
          <div>
            {diffRows.map((row, idx) => (
              <div key={`exp-${idx}`} className={`failure-diff-line ${row.changed ? "changed" : "same"}`}>{row.expected || " "}</div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-text-secondary mb-1">{tr("Ваш вивід", "Your output")}</div>
          <div>
            {diffRows.map((row, idx) => (
              <div key={`act-${idx}`} className={`failure-diff-line ${row.changed ? "changed" : "same"}`}>{row.actual || " "}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FailureRecoveryCard;
