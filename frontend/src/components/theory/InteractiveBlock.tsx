import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { tr } from "../../i18n";

/**
 * Interactive theory blocks.
 *
 * Authored inside lesson markdown as a fenced code block tagged `interactive`
 * whose body is a JSON object with a `type` discriminator, e.g.:
 *
 * ```interactive
 * {"type":"prediction","question":"...","options":["A","B"],"answer":1,"explanation":"..."}
 * ```
 *
 * ```interactive
 * {"type":"spot-the-bug","lang":"python","lines":["a","b"],"buggyLine":2,"explanation":"..."}
 * ```
 *
 * Rendering is intercepted in MarkdownView's `code` override. If the JSON is
 * malformed or the type is unknown, the caller falls back to a plain code block,
 * so lessons never break.
 */

type PredictionSpec = {
  type: "prediction";
  question: string;
  code?: string;
  lang?: string;
  options: string[];
  answer: number;
  explanation?: string;
};

type SpotTheBugSpec = {
  type: "spot-the-bug";
  question?: string;
  lang?: string;
  lines: string[];
  buggyLine: number; // 1-based
  explanation?: string;
};

type TraceStep = {
  line: number; // 1-based line to highlight
  vars?: Record<string, string>;
  out?: string; // console output produced at this step
  note?: string;
};

type TraceSpec = {
  type: "trace";
  lang?: string;
  code: string[];
  steps: TraceStep[];
  caption?: string;
};

type AlgorithmExample = {
  title: string;
  values: number[];
  queries?: Array<[number, number]>;
  target?: number;
  threshold?: number;
  size?: number;
};

type AlgorithmSpec = {
  type: "algorithm";
  algorithm:
    | "prefix-sums"
    | "enumerate-subarrays"
    | "kadane"
    | "insertion-sort"
    | "binary-search"
    | "two-pointers"
    | "sliding-window"
    | "sieve"
    | "dp-counting";
  caption?: string;
  examples: AlgorithmExample[];
};

type MemoryBox = {
  name?: string;
  id?: string;
  value?: string;
  ref?: string; // name/id this box points to
};

type MemorySpec = {
  type: "memory";
  caption?: string;
  stack?: MemoryBox[];
  heap?: MemoryBox[];
  note?: string;
};

type DispatchCase = { type: string; result: string };

type DispatchSpec = {
  type: "dispatch";
  call: string;
  cases: DispatchCase[];
  note?: string;
};

type QuizQuestion = {
  question: string;
  code?: string;
  options: string[];
  answer: number;
  explanation?: string;
};

type QuizSpec = {
  type: "quiz";
  caption?: string;
  questions: QuizQuestion[];
};

export type InteractiveSpec =
  | PredictionSpec
  | SpotTheBugSpec
  | TraceSpec
  | AlgorithmSpec
  | MemorySpec
  | DispatchSpec
  | QuizSpec;

function isPrediction(spec: InteractiveSpec): spec is PredictionSpec {
  return spec.type === "prediction"
    && typeof (spec as PredictionSpec).question === "string"
    && Array.isArray((spec as PredictionSpec).options)
    && typeof (spec as PredictionSpec).answer === "number";
}

function isSpotTheBug(spec: InteractiveSpec): spec is SpotTheBugSpec {
  return spec.type === "spot-the-bug"
    && Array.isArray((spec as SpotTheBugSpec).lines)
    && typeof (spec as SpotTheBugSpec).buggyLine === "number";
}

function isTrace(spec: InteractiveSpec): spec is TraceSpec {
  return spec.type === "trace"
    && Array.isArray((spec as TraceSpec).code)
    && Array.isArray((spec as TraceSpec).steps)
    && (spec as TraceSpec).steps.length > 0;
}

const algorithmTypes: AlgorithmSpec["algorithm"][] = [
  "prefix-sums",
  "enumerate-subarrays",
  "kadane",
  "insertion-sort",
  "binary-search",
  "two-pointers",
  "sliding-window",
  "sieve",
  "dp-counting",
];

function isNonDecreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

function isAlgorithmExample(algorithm: AlgorithmSpec["algorithm"], candidate: unknown): candidate is AlgorithmExample {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  const example = candidate as Partial<AlgorithmExample>;
  if (typeof example.title !== "string" || !example.title.trim()) return false;
  if (!Array.isArray(example.values) || example.values.length === 0 || !example.values.every((value) => typeof value === "number" && Number.isFinite(value))) return false;

  const maxValues = algorithm === "enumerate-subarrays" ? 20 : algorithm === "insertion-sort" ? 30 : 40;
  if (example.values.length > maxValues) return false;
  if (example.target !== undefined && (typeof example.target !== "number" || !Number.isFinite(example.target))) return false;
  if (example.threshold !== undefined && (typeof example.threshold !== "number" || !Number.isFinite(example.threshold))) return false;
  if (example.size !== undefined && (typeof example.size !== "number" || !Number.isInteger(example.size))) return false;

  if ((algorithm === "binary-search" || algorithm === "two-pointers")
    && (example.values.length < 2 || !isNonDecreasing(example.values))) return false;
  if (algorithm === "sliding-window" && example.values.some((value) => value < 0)) return false;

  if (algorithm === "prefix-sums") {
    if (!Array.isArray(example.queries) || example.queries.length === 0 || example.queries.length > 20) return false;
    if (!example.queries.every((query) => Array.isArray(query)
      && query.length === 2
      && Number.isInteger(query[0])
      && Number.isInteger(query[1])
      && query[0] >= 0
      && query[0] <= query[1]
      && query[1] < example.values!.length)) return false;
  }

  if (algorithm === "sieve") {
    const limit = example.size ?? Math.max(...example.values);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return false;
  }
  if (algorithm === "dp-counting") {
    const limit = example.size ?? example.values[0];
    if (!Number.isInteger(limit) || limit < 0 || limit > 20) return false;
  }
  return true;
}

function isAlgorithm(spec: InteractiveSpec): spec is AlgorithmSpec {
  const value = spec as AlgorithmSpec;
  return value.type === "algorithm"
    && algorithmTypes.includes(value.algorithm)
    && Array.isArray(value.examples)
    && value.examples.length > 0
    && value.examples.length <= 8
    && value.examples.every((example) => isAlgorithmExample(value.algorithm, example));
}

function isMemory(spec: InteractiveSpec): spec is MemorySpec {
  return spec.type === "memory"
    && (Array.isArray((spec as MemorySpec).stack) || Array.isArray((spec as MemorySpec).heap));
}

function isDispatch(spec: InteractiveSpec): spec is DispatchSpec {
  return spec.type === "dispatch"
    && typeof (spec as DispatchSpec).call === "string"
    && Array.isArray((spec as DispatchSpec).cases);
}

function isQuiz(spec: InteractiveSpec): spec is QuizSpec {
  return spec.type === "quiz"
    && Array.isArray((spec as QuizSpec).questions)
    && (spec as QuizSpec).questions.length > 0;
}

export function parseInteractiveSpec(raw: string): InteractiveSpec | null {
  try {
    const spec = JSON.parse(raw) as InteractiveSpec;
    if (!spec || typeof spec !== "object") return null;
    if (
      isPrediction(spec)
      || isSpotTheBug(spec)
      || isTrace(spec)
      || isAlgorithm(spec)
      || isMemory(spec)
      || isDispatch(spec)
      || isQuiz(spec)
    ) return spec;
    return null;
  } catch {
    return null;
  }
}

const shellClass =
  "my-5 min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-bg-surface p-4 not-prose text-text-primary";
const labelClass =
  "mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary";
const codeClass =
  "mb-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg-code p-3 font-mono text-[13px] leading-relaxed text-text-primary";

const PredictionBlock: React.FC<{ spec: PredictionSpec }> = ({ spec }) => {
  const [choice, setChoice] = useState<number | null>(null);
  const revealed = choice !== null;

  return (
    <div className={shellClass}>
      <div className={labelClass}>{tr("// перевір себе", "// check yourself")}</div>
      <p className="mb-3 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-sm font-semibold">{spec.question}</p>
      {spec.code ? (
        <pre className={codeClass}>
          <code>{spec.code}</code>
        </pre>
      ) : null}
      <div className="flex flex-col gap-2">
        {spec.options.map((option, i) => {
          const isAnswer = i === spec.answer;
          const isChosen = i === choice;
          let state = "border-border hover:border-text-secondary";
          if (revealed && isAnswer) state = "border-emerald-500 bg-emerald-500/15";
          else if (revealed && isChosen) state = "border-rose-500 bg-rose-500/15";
          else if (revealed) state = "border-border opacity-60";
          return (
            <button
              key={i}
              type="button"
              disabled={revealed}
              onClick={() => setChoice(i)}
              className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${state}`}
            >
              <span aria-hidden className="w-4 shrink-0 text-center">
                {revealed && isAnswer ? "✓" : revealed && isChosen ? "✗" : "•"}
              </span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap font-mono">{option}</span>
            </button>
          );
        })}
      </div>
      {revealed && spec.explanation ? (
        <p className="mt-3 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap border-t border-current/10 pt-3 text-sm opacity-90">
          {choice === spec.answer ? tr("Правильно! ", "Correct! ") : tr("Не зовсім. ", "Not quite. ")}
          {spec.explanation}
        </p>
      ) : null}
    </div>
  );
};

const SpotTheBugBlock: React.FC<{ spec: SpotTheBugSpec }> = ({ spec }) => {
  const [choice, setChoice] = useState<number | null>(null);
  const revealed = choice !== null;

  return (
    <div className={shellClass}>
      <div className={labelClass}>{tr("// знайди помилку", "// find the bug")}</div>
      <p className="mb-3 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-sm font-semibold">
        {spec.question || tr("Натисни на рядок, у якому помилка:", "Click the line that contains the bug:")}
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-bg-code font-mono text-[13px] leading-relaxed">
        {spec.lines.map((line, i) => {
          const lineNo = i + 1;
          const isBug = lineNo === spec.buggyLine;
          const isChosen = lineNo === choice;
          let state = "hover:bg-bg-surface";
          if (revealed && isBug) state = "bg-emerald-500/15";
          else if (revealed && isChosen) state = "bg-rose-500/15";
          return (
            <button
              key={i}
              type="button"
              disabled={revealed}
              onClick={() => setChoice(lineNo)}
              className={`flex min-w-0 w-full items-start gap-3 px-3 py-1 text-left transition-colors ${state}`}
            >
              <span aria-hidden className="w-5 shrink-0 select-none text-right opacity-40">
                {lineNo}
              </span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap">{line || " "}</span>
              {revealed && isBug ? (
                <span aria-hidden className="ml-auto pl-2 text-emerald-500">
                  ← {tr("помилка", "bug")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {revealed && spec.explanation ? (
        <p className="mt-3 border-t border-current/10 pt-3 text-sm opacity-90">
          {choice === spec.buggyLine ? tr("Правильно! ", "Correct! ") : tr("Помилка не тут. ", "The bug is elsewhere. ")}
          {spec.explanation}
        </p>
      ) : null}
    </div>
  );
};

const btnClass =
  "rounded-lg border border-border px-3 py-1 text-sm transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:opacity-40";

const TraceBlock: React.FC<{ spec: TraceSpec }> = ({ spec }) => {
  const [cursor, setCursor] = useState(0);
  const total = spec.steps.length;
  const step = spec.steps[cursor];
  const output = spec.steps
    .slice(0, cursor + 1)
    .map((s) => s.out)
    .filter((o): o is string => Boolean(o))
    .join("");
  const vars = Object.entries(step.vars || {});

  return (
    <div className={shellClass}>
      <div className={labelClass}>{tr("// покроковий прогін", "// step-by-step trace")}</div>
      {spec.caption ? <p className="mb-3 text-sm font-semibold">{spec.caption}</p> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="overflow-hidden rounded-lg border border-border bg-bg-code font-mono text-[13px] leading-relaxed">
          {spec.code.map((line, i) => {
            const active = i + 1 === step.line;
            return (
              <div
                key={i}
                className={`flex items-start gap-3 px-3 py-0.5 ${active ? "bg-emerald-500/15" : ""}`}
              >
                <span aria-hidden className="w-5 shrink-0 select-none text-right opacity-40">
                  {i + 1}
                </span>
                <span className="whitespace-pre">{line || " "}</span>
              </div>
            );
          })}
        </div>
        <div className="min-w-[8rem] rounded-lg border border-border p-2">
          <div className={labelClass + " mb-2"}>{tr("// змінні", "// variables")}</div>
          {vars.length ? (
            <table className="w-full font-mono text-[13px]">
              <tbody>
                {vars.map(([k, v]) => (
                  <tr key={k}>
                    <td className="pr-3 text-text-secondary">{k}</td>
                    <td className="text-right">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="font-mono text-[13px] text-text-secondary">—</p>
          )}
        </div>
      </div>

      {output ? (
        <div className="mt-3">
          <div className={labelClass + " mb-1"}>{tr("// консоль", "// console")}</div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-bg-code p-2 font-mono text-[13px] text-text-primary">
            <code>{output}</code>
          </pre>
        </div>
      ) : null}

      {step.note ? <p className="mt-3 text-sm opacity-90">{step.note}</p> : null}

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <button type="button" className={btnClass} onClick={() => setCursor(0)} disabled={cursor === 0}>
          ⟲
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={() => setCursor((c) => Math.max(0, c - 1))}
          disabled={cursor === 0}
        >
          ← {tr("крок назад", "step back")}
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={() => setCursor((c) => Math.min(total - 1, c + 1))}
          disabled={cursor === total - 1}
        >
          {tr("крок вперед", "step forward")} →
        </button>
        <span className="ml-auto font-mono text-[12px] text-text-secondary">
          {tr("крок", "step")} {cursor + 1} / {total}
        </span>
      </div>
    </div>
  );
};

type AlgorithmFrame = {
  line: string;
  activeIndex?: number;
  left?: number;
  right?: number;
  bestLeft?: number;
  bestRight?: number;
  prefix?: number[];
  current?: number;
  best?: number;
  query?: [number, number];
  queryAnswer?: number;
  secondActiveIndex?: number;
  auxiliary?: Array<{ label: string; value: string; tone?: "active" | "done" | "muted" | "error" }>;
  variables: Array<[string, string]>;
};

export function algorithmFrames(spec: AlgorithmSpec, example: AlgorithmExample): AlgorithmFrame[] {
  const values = example.values;
  if (spec.algorithm === "binary-search") {
    const target = example.target ?? values[Math.floor(values.length / 2)];
    let low = 0;
    let high = values.length - 1;
    const frames: AlgorithmFrame[] = [{
      line: tr(`Шукаємо ${target} у відсортованому масиві.`, `Search for ${target} in the sorted array.`),
      left: low,
      right: high,
      variables: [["low", String(low)], ["high", String(high)], ["target", String(target)]],
    }];
    let found = false;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const value = values[mid];
      const frame: AlgorithmFrame = {
        line: tr(`mid=${mid}: порівнюємо ${value} з ${target}.`, `mid=${mid}: compare ${value} with ${target}.`),
        activeIndex: mid,
        left: low,
        right: high,
        variables: [["low", String(low)], ["mid", String(mid)], ["high", String(high)], ["a[mid]", String(value)], ["target", String(target)]],
      };
      if (value === target) {
        frame.line += tr(" Знайшли.", " Found it.");
        frames.push(frame);
        found = true;
        break;
      }
      if (value < target) low = mid + 1;
      else high = mid - 1;
      frames.push(frame, {
        line: value < target
          ? tr(`Усі позиції до ${mid} включно відкидаємо.`, `Discard every position through ${mid}.`)
          : tr(`Усі позиції від ${mid} включно відкидаємо.`, `Discard every position from ${mid} onward.`),
        left: low <= high ? low : undefined,
        right: low <= high ? high : undefined,
        variables: [["low", String(low)], ["high", String(high)], ["target", String(target)]],
      });
    }
    if (!found) frames.push({ line: tr("Пошуковий відрізок спорожнів: значення немає.", "The search interval is empty: the value is absent."), variables: [["low", String(low)], ["high", String(high)], ["found", tr("ні", "no")]] });
    return frames;
  }

  if (spec.algorithm === "insertion-sort") {
    const rows: AlgorithmFrame[] = [{ line: tr("Ліва частина вже відсортована; вставляємо наступне значення на його місце.", "The left part is sorted; insert the next value into its correct position."), variables: [["sorted", tr("поки порожньо", "empty so far")]] }];
    const a = [...values];
    for (let index = 1; index < a.length; index += 1) {
      const value = a[index];
      let cursor = index - 1;
      rows.push({ line: tr(`Беремо ${value} і шукаємо місце в лівій частині.`, `Take ${value} and find its place in the left part.`), activeIndex: index, bestLeft: 0, bestRight: index - 1, variables: [["i", String(index)], ["key", String(value)], ["j", String(cursor)]] });
      while (cursor >= 0 && a[cursor] > value) {
        const moved = a[cursor];
        a[cursor + 1] = moved;
        a[cursor] = value;
        rows.push({ line: tr(`${moved} > ${value}: зсуваємо ${moved} праворуч.`, `${moved} > ${value}: shift ${moved} one position to the right.`), activeIndex: cursor, secondActiveIndex: cursor + 1, bestLeft: 0, bestRight: index, variables: [["key", String(value)], ["j", String(cursor)], ["a[j]", String(moved)]] });
        cursor -= 1;
      }
      rows.push({ line: tr(`Вставляємо ${value} на позицію ${cursor + 1}.`, `Insert ${value} at position ${cursor + 1}.`), activeIndex: cursor + 1, bestLeft: 0, bestRight: index, variables: [["key", String(value)], ["position", String(cursor + 1)], [tr("відсортований префікс", "sorted prefix"), a.slice(0, index + 1).join(", ")]] });
    }
    rows.push({ line: tr("Усі елементи вставлено: масив відсортований за неспаданням.", "Every value is inserted: the array is sorted in nondecreasing order."), bestLeft: 0, bestRight: a.length - 1, variables: [["result", a.join(", ")]] });
    return rows;
  }

  if (spec.algorithm === "two-pointers") {
    const target = example.target ?? values[0] + values[values.length - 1];
    let left = 0;
    let right = values.length - 1;
    const frames: AlgorithmFrame[] = [];
    while (left < right) {
      const sum = values[left] + values[right];
      const relation = sum === target ? tr("дорівнює", "equals") : sum < target ? tr("менша за", "is less than") : tr("більша за", "is greater than");
      frames.push({ line: tr(`${values[left]} + ${values[right]} = ${sum}, сума ${relation} ${target}.`, `${values[left]} + ${values[right]} = ${sum}; the sum ${relation} ${target}.`), activeIndex: left, secondActiveIndex: right, left, right, current: sum, variables: [["left", String(left)], ["right", String(right)], ["sum", String(sum)], ["target", String(target)]] });
      if (sum === target) {
        frames.push({ line: tr("Знайшли пару на різних позиціях.", "Found a pair at two distinct positions."), activeIndex: left, secondActiveIndex: right, left, right, variables: [["a[left]", String(values[left])], ["a[right]", String(values[right])], ["sum", String(sum)]] });
        return frames;
      }
      if (sum < target) left += 1;
      else right -= 1;
    }
    frames.push({ line: tr("Вказівники зустрілися: пари з потрібною сумою немає.", "The pointers met: no pair has the required sum."), activeIndex: left, variables: [["left", String(left)], ["right", String(right)], ["target", String(target)]] });
    return frames;
  }

  if (spec.algorithm === "sliding-window") {
    const threshold = example.threshold ?? Math.floor(values.reduce((sum, value) => sum + value, 0) / 2);
    let left = 0;
    let sum = 0;
    let count = 0;
    const frames: AlgorithmFrame[] = [{ line: tr(`Рахуємо підмасиви з невід’ємних чисел і сумою не більшою за ${threshold}.`, `Count subarrays of nonnegative values whose sum is at most ${threshold}.`), variables: [["left", "0"], ["count", "0"], ["limit", String(threshold)]] }];
    values.forEach((value, right) => {
      sum += value;
      frames.push({ line: tr(`Додаємо a[${right}]=${value}; сума вікна стала ${sum}.`, `Add a[${right}]=${value}; the window sum is now ${sum}.`), activeIndex: right, left, right, current: sum, variables: [["left", String(left)], ["right", String(right)], ["sum", String(sum)], ["count", String(count)]] });
      while (sum > threshold && left <= right) {
        frames.push({ line: tr(`${sum} > ${threshold}: прибираємо a[${left}]=${values[left]} зліва.`, `${sum} > ${threshold}: remove a[${left}]=${values[left]} from the left.`), activeIndex: right, left, right, current: sum, variables: [["left", String(left)], ["right", String(right)], ["sum before", String(sum)], ["limit", String(threshold)]] });
        sum -= values[left];
        left += 1;
      }
      count += right - left + 1;
      frames.push({ line: tr(`Додаємо ${right - left + 1} допустимих відрізків, що закінчуються тут.`, `Add ${right - left + 1} valid subarrays ending here.`), activeIndex: right, left: left <= right ? left : undefined, right, current: sum, best: count, variables: [["left", String(left)], ["right", String(right)], ["sum", String(sum)], [tr("нові підмасиви", "new subarrays"), String(right - left + 1)], ["count", String(count)]] });
    });
    return frames;
  }

  if (spec.algorithm === "sieve") {
    const limit = Math.max(1, Math.min(50, Math.floor(example.size ?? Math.max(...values))));
    const composite = Array(limit + 1).fill(false) as boolean[];
    const makeCells = (active: number | null, finished = false) => Array.from({ length: limit + 1 }, (_, value) => ({
      label: String(value),
      value: value < 2 ? "—" : composite[value] ? "×" : finished ? "P" : "·",
      tone: value === active ? "active" as const : composite[value] || value < 2 ? "muted" as const : finished ? "done" as const : undefined,
    }));
    const frames: AlgorithmFrame[] = [{ line: tr(`Починаємо з чисел від 2 до ${limit}; 0 та 1 не є простими.`, `Start with the numbers from 2 to ${limit}; 0 and 1 are not prime.`), auxiliary: makeCells(null), variables: [["limit", String(limit)], ["p", "—"]] }];
    for (let prime = 2; prime * prime <= limit; prime += 1) {
      if (composite[prime]) continue;
      frames.push({ line: tr(`${prime} ще не викреслено — це просте число. Починаємо з ${prime}².`, `${prime} has not been crossed out, so it is prime. Start at ${prime}².`), auxiliary: makeCells(prime), activeIndex: prime, variables: [["p", String(prime)], ["multiple", String(prime * prime)]] });
      for (let multiple = prime * prime; multiple <= limit; multiple += prime) {
        composite[multiple] = true;
        frames.push({ line: tr(`Викреслюємо ${multiple} як кратне ${prime}.`, `Cross out ${multiple} as a multiple of ${prime}.`), auxiliary: makeCells(multiple), activeIndex: multiple, variables: [["p", String(prime)], ["multiple", String(multiple)]] });
      }
    }
    const primes = Array.from({ length: Math.max(0, limit - 1) }, (_, index) => index + 2).filter((value) => !composite[value]);
    frames.push({ line: tr(`Залишилися прості числа: ${primes.join(", ")}.`, `The remaining prime numbers are: ${primes.join(", ")}.`), auxiliary: makeCells(null, true), variables: [[tr("прості числа", "primes"), primes.join(", ")], [tr("кількість", "count"), String(primes.length)]] });
    return frames;
  }

  if (spec.algorithm === "dp-counting") {
    const n = Math.max(0, Math.min(20, Math.floor(example.size ?? values[0])));
    const ways = Array(n + 1).fill(0) as number[];
    ways[0] = 1;
    if (n >= 1) ways[1] = 1;
    const makeCells = (active: number | null) => ways.map((value, index) => ({
      label: String(index),
      value: String(value),
      tone: index === active ? "active" as const : index <= 1 ? "done" as const : "muted" as const,
    }));
    const frames: AlgorithmFrame[] = [{ line: tr("dp[0]=1: є один спосіб залишитися на землі.", "dp[0]=1: there is one way to stay on the ground."), auxiliary: makeCells(0), variables: [["dp[0]", "1"], ["n", String(n)]] }];
    if (n >= 1) frames.push({ line: tr("dp[1]=1: на першу сходинку веде один крок.", "dp[1]=1: there is one way to reach the first stair."), auxiliary: makeCells(1), variables: [["dp[1]", "1"], ["n", String(n)]] });
    for (let stair = 2; stair <= n; stair += 1) {
      ways[stair] = ways[stair - 1] + ways[stair - 2];
      frames.push({ line: tr(`На сходинку ${stair} приходимо з ${stair - 1} або ${stair - 2}: dp[${stair}]=${ways[stair - 1]}+${ways[stair - 2]}=${ways[stair]}.`, `Reach stair ${stair} from stair ${stair - 1} or ${stair - 2}: dp[${stair}]=${ways[stair - 1]}+${ways[stair - 2]}=${ways[stair]}.`), activeIndex: stair, auxiliary: makeCells(stair), variables: [["i", String(stair)], [`dp[${stair - 1}]`, String(ways[stair - 1])], [`dp[${stair - 2}]`, String(ways[stair - 2])], [`dp[${stair}]`, String(ways[stair])]] });
    }
    return frames;
  }

  if (spec.algorithm === "prefix-sums") {
    const prefix = [0];
    const frames: AlgorithmFrame[] = [{
      line: "P[0] = 0",
      prefix: [...prefix],
      variables: [["i", "—"], ["P", "[0]"]],
    }];
    values.forEach((value, index) => {
      prefix.push(prefix[index] + value);
      frames.push({
        line: `P[${index + 1}] = P[${index}] + a[${index}] = ${prefix[index]} + ${value} = ${prefix[index + 1]}`,
        activeIndex: index,
        prefix: [...prefix],
        variables: [["i", String(index)], ["a[i]", String(value)], ["P[i + 1]", String(prefix[index + 1])]],
      });
    });
    for (const [left, right] of example.queries ?? []) {
      const answer = prefix[right + 1] - prefix[left];
      frames.push({
        line: `sum(${left}..${right}) = P[${right + 1}] − P[${left}] = ${prefix[right + 1]} − ${prefix[left]} = ${answer}`,
        left,
        right,
        prefix: [...prefix],
        query: [left, right],
        queryAnswer: answer,
        variables: [["l", String(left)], ["r", String(right)], ["P[r + 1]", String(prefix[right + 1])], ["P[l]", String(prefix[left])], ["sum", String(answer)]],
      });
    }
    return frames;
  }

  if (spec.algorithm === "enumerate-subarrays") {
    const frames: AlgorithmFrame[] = [{ line: tr("best = −∞; перевіряємо всі пари l ≤ r", "best = −∞; check every pair l ≤ r"), variables: [["best", "−∞"]] }];
    let best = Number.NEGATIVE_INFINITY;
    let bestLeft = 0;
    let bestRight = 0;
    for (let left = 0; left < values.length; left += 1) {
      let sum = 0;
      for (let right = left; right < values.length; right += 1) {
        sum += values[right];
        const improved = sum > best;
        if (improved) {
          best = sum;
          bestLeft = left;
          bestRight = right;
        }
        frames.push({
          line: tr(`l=${left}, r=${right}: додаємо ${values[right]}, сума=${sum}${improved ? " — новий максимум" : ""}`, `l=${left}, r=${right}: add ${values[right]}, sum=${sum}${improved ? " — new maximum" : ""}`),
          activeIndex: right,
          left,
          right,
          bestLeft,
          bestRight,
          current: sum,
          best,
          variables: [["l", String(left)], ["r", String(right)], ["sum", String(sum)], ["best", String(best)], ["bestL", String(bestLeft)], ["bestR", String(bestRight)]],
        });
      }
    }
    return frames;
  }

  const frames: AlgorithmFrame[] = [{ line: tr("current = best = a[0] — порожній підмасив не дозволений", "current = best = a[0] — the subarray must be nonempty"), activeIndex: 0, left: 0, right: 0, bestLeft: 0, bestRight: 0, current: values[0], best: values[0], variables: [["current", String(values[0])], ["best", String(values[0])], ["start", "0"], ["bestL", "0"], ["bestR", "0"]] }];
  let current = values[0];
  let currentLeft = 0;
  let best = values[0];
  let bestLeft = 0;
  let bestRight = 0;
  for (let index = 1; index < values.length; index += 1) {
    const extended = current + values[index];
    const restarted = values[index] > extended;
    current = Math.max(values[index], extended);
    if (restarted) currentLeft = index;
    if (current > best) {
      best = current;
      bestLeft = currentLeft;
      bestRight = index;
    }
    frames.push({
      line: tr(`i=${index}: max(${values[index]}, ${extended}) = ${current}${restarted ? " — починаємо новий відрізок" : " — продовжуємо"}`, `i=${index}: max(${values[index]}, ${extended}) = ${current}${restarted ? " — start a new subarray" : " — extend the current subarray"}`),
      activeIndex: index,
      left: currentLeft,
      right: index,
      bestLeft,
      bestRight,
      current,
      best,
      variables: [["i", String(index)], ["current", String(current)], ["start", String(currentLeft)], ["best", String(best)], ["bestL", String(bestLeft)], ["bestR", String(bestRight)]],
    });
  }
  return frames;
}

const AlgorithmBlock: React.FC<{ spec: AlgorithmSpec }> = ({ spec }) => {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const example = spec.examples[Math.min(exampleIndex, spec.examples.length - 1)];
  const frames = algorithmFrames(spec, example);
  const frame = frames[Math.min(cursor, frames.length - 1)];
  const variables = frame.variables;
  const prefixLabel = spec.algorithm === "prefix-sums";
  const bestLabel = spec.algorithm !== "prefix-sums";
  const showInputArray = spec.algorithm !== "sieve" && spec.algorithm !== "dp-counting";

  return <section className={shellClass} aria-label={tr("Покрокова візуалізація алгоритму", "Step-by-step algorithm visualization")}>
    <div className={labelClass}>{tr("// алгоритм у русі", "// algorithm in motion")}</div>
    {spec.caption ? <p className="mb-3 text-sm font-semibold">{spec.caption}</p> : null}
    {spec.examples.length > 1 ? <label className="mb-3 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
      <span>{tr("Приклад", "Example")}</span>
      <select aria-label={tr("Обрати приклад", "Choose an example")} value={exampleIndex} onChange={(event) => { setExampleIndex(Number(event.target.value)); setCursor(0); }} className="min-h-10 rounded-lg border border-border bg-bg-surface px-3 font-semibold text-text-primary">
        {spec.examples.map((option, index) => <option key={`${option.title}-${index}`} value={index}>{option.title}</option>)}
      </select>
    </label> : <p className="mb-3 text-xs font-semibold text-text-secondary">{example.title}</p>}
    {showInputArray ? <div className="overflow-x-auto rounded-lg border border-border bg-bg-code p-3" aria-label={tr("Елементи масиву", "Array elements")}>
      <div className="flex min-w-max gap-2">
        {example.values.map((value, index) => {
          const active = frame.activeIndex === index || frame.secondActiveIndex === index;
          const inRange = frame.left !== undefined && frame.right !== undefined && index >= frame.left && index <= frame.right;
          const bestRange = frame.bestLeft !== undefined && frame.bestRight !== undefined && index >= frame.bestLeft && index <= frame.bestRight;
          const tone = active ? "border-primary bg-primary/15" : inRange ? "border-accent-warn/60 bg-accent-warn/10" : bestLabel && bestRange ? "border-emerald-500/60 bg-emerald-500/10" : "border-border bg-bg-surface";
          return <div key={index} className={`min-w-12 rounded-lg border px-2 py-1.5 text-center font-mono ${tone}`}>
            <div className="text-[10px] text-text-secondary">{index}</div>
            <div className="font-semibold">{value}</div>
          </div>;
        })}
      </div>
    </div> : null}
    {prefixLabel && frame.prefix ? <div className="mt-3 overflow-x-auto rounded-lg border border-border p-3">
      <p className={labelClass + " mb-2"}>{tr("P — префіксні суми", "P — prefix sums")}</p>
      <div className="flex min-w-max gap-2">{frame.prefix.map((value, index) => <div key={index} className={`min-w-12 rounded-lg border px-2 py-1.5 text-center font-mono ${index === frame.prefix!.length - 1 && cursor > 0 ? "border-primary bg-primary/10" : "border-border bg-bg-code"}`}><div className="text-[10px] text-text-secondary">P[{index}]</div><div className="font-semibold">{value}</div></div>)}</div>
    </div> : null}
    {frame.auxiliary ? <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg-code p-3" aria-label={tr("Стан таблиці алгоритму", "Algorithm state table")}>
      <div className="flex min-w-max gap-1.5">{frame.auxiliary.map((cell, index) => {
        const tone = cell.tone === "active" ? "border-primary bg-primary/15" : cell.tone === "done" ? "border-emerald-500/50 bg-emerald-500/10" : cell.tone === "error" ? "border-rose-500/50 bg-rose-500/10" : "border-border bg-bg-surface";
        return <div key={`${cell.label}-${index}`} className={`min-w-10 rounded-lg border px-2 py-1.5 text-center font-mono ${tone}`}><div className="text-[10px] text-text-secondary">{cell.label}</div><div className="font-semibold">{cell.value}</div></div>;
      })}</div>
    </div> : null}
    {frame.query ? <p className="mt-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 font-mono text-sm">sum({frame.query[0]}..{frame.query[1]}) = {frame.queryAnswer}</p> : null}
    <div className="mt-3 rounded-lg border border-border px-3 py-2" aria-live="polite">
      <p className="text-sm font-semibold">{frame.line}</p>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">{variables.map(([name, value]) => <div key={name} className="flex justify-between gap-2 font-mono text-xs"><span className="text-text-secondary">{name}</span><span>{value}</span></div>)}</div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <button type="button" className={btnClass} onClick={() => setCursor(0)} disabled={cursor === 0} aria-label={tr("На початок", "Go to start")}>⟲</button>
      <button type="button" className={btnClass} onClick={() => setCursor((value) => Math.max(0, value - 1))} disabled={cursor === 0}>{tr("Крок назад", "Step back")}</button>
      <button type="button" className={btnClass} onClick={() => setCursor((value) => Math.min(frames.length - 1, value + 1))} disabled={cursor === frames.length - 1}>{tr("Крок уперед", "Step forward")}</button>
      <span className="ml-auto font-mono text-xs text-text-secondary">{tr("Крок", "Step")} {cursor + 1} / {frames.length}</span>
    </div>
  </section>;
};

const MemoryColumn: React.FC<{ title: string; boxes: MemoryBox[] }> = ({ title, boxes }) => (
  <div className="flex-1">
    <div className={labelClass + " mb-2"}>{"// " + title}</div>
    <div className="flex flex-col gap-2">
      {boxes.length ? (
        boxes.map((box, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-bg-code px-3 py-2 font-mono text-[13px]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-text-secondary">{box.name ?? box.id ?? ""}</span>
              {box.ref ? (
                <span className="text-emerald-500">{"──▶ " + box.ref}</span>
              ) : (
                <span className="text-text-primary">{box.value ?? ""}</span>
              )}
            </div>
            {box.id && box.name ? (
              <div className="mt-0.5 text-[11px] text-text-secondary opacity-70">{box.id}</div>
            ) : null}
          </div>
        ))
      ) : (
        <p className="font-mono text-[13px] text-text-secondary">—</p>
      )}
    </div>
  </div>
);

const MemoryBlock: React.FC<{ spec: MemorySpec }> = ({ spec }) => (
  <div className={shellClass}>
    <div className={labelClass}>{tr("// пам’ять", "// memory")}</div>
    {spec.caption ? <p className="mb-3 text-sm font-semibold">{spec.caption}</p> : null}
    <div className="flex gap-4">
      <MemoryColumn title={tr("стек", "stack")} boxes={spec.stack ?? []} />
      <MemoryColumn title={tr("купа (heap)", "heap")} boxes={spec.heap ?? []} />
    </div>
    {spec.note ? <p className="mt-3 text-sm opacity-90">{spec.note}</p> : null}
  </div>
);

const DispatchBlock: React.FC<{ spec: DispatchSpec }> = ({ spec }) => {
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked !== null ? spec.cases[picked] : null;

  return (
    <div className={shellClass}>
      <div className={labelClass}>{tr("// який метод виконається?", "// which method will run?")}</div>
      <p className="mb-3 font-mono text-sm">
        {tr("Виклик: ", "Call: ")}
        <span className="text-text-primary">{spec.call}</span>
      </p>
      <p className="mb-2 text-sm text-text-secondary">{tr("Обери реальний тип об’єкта:", "Choose the object's actual type:")}</p>
      <div className="flex flex-wrap gap-2">
        {spec.cases.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPicked(i)}
            className={`rounded-lg border px-3 py-1.5 font-mono text-sm transition-colors ${
              picked === i ? "border-emerald-500 bg-emerald-500/15" : "border-border hover:border-text-secondary"
            }`}
          >
            {c.type}
          </button>
        ))}
      </div>
      {chosen ? (
        <div className="mt-3 border-t border-border pt-3 font-mono text-sm">
          {spec.call} <span className="text-text-secondary">→</span> {chosen.type}{" "}
          <span className="text-text-secondary">→</span>{" "}
          <span className="text-emerald-500">{chosen.result}</span>
        </div>
      ) : null}
      {chosen && spec.note ? <p className="mt-2 text-sm opacity-90">{spec.note}</p> : null}
    </div>
  );
};

const QuizBlock: React.FC<{ spec: QuizSpec }> = ({ spec }) => {
  const total = spec.questions.length;
  const [index, setIndex] = useState(0);
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);

  const q = spec.questions[index];
  const chosen = choices[index];
  const answered = chosen !== undefined;
  const score = spec.questions.reduce(
    (acc, qq, i) => acc + (choices[i] === qq.answer ? 1 : 0),
    0
  );

  if (finished) {
    const pct = Math.round((score / total) * 100);
    return (
      <div className={shellClass}>
        <div className={labelClass}>{tr("// результат квізу", "// quiz results")}</div>
        <p className="text-sm font-semibold">
          {tr("Правильних відповідей:", "Correct answers:")} {score} / {total}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-code">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm opacity-90">
          {score === total
            ? tr("Бездоганно! 🎯", "Perfect! 🎯")
            : score * 2 >= total
              ? tr("Непогано — повтори те, що не вийшло.", "Not bad — review the parts you missed.")
              : tr("Варто ще раз перечитати урок.", "Consider reviewing the lesson again.")}
        </p>
        <button
          type="button"
          className={btnClass + " mt-3"}
          onClick={() => {
            setChoices({});
            setIndex(0);
            setFinished(false);
          }}
        >
          ⟲ {tr("пройти ще раз", "try again")}
        </button>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={labelClass + " mb-0"}>{tr("// міні-квіз", "// quick quiz")}</span>
        <span className="font-mono text-[12px] text-text-secondary">
          {tr("питання", "question")} {index + 1} / {total}
        </span>
      </div>
      {spec.caption && index === 0 ? (
        <p className="mb-3 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-sm text-text-secondary">{spec.caption}</p>
      ) : null}
      <p className="mb-3 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-sm font-semibold">{q.question}</p>
      {q.code ? (
        <pre className={codeClass}>
          <code>{q.code}</code>
        </pre>
      ) : null}
      <div className="flex flex-col gap-2">
        {q.options.map((option, i) => {
          const isAnswer = i === q.answer;
          const isChosen = i === chosen;
          let state = "border-border hover:border-text-secondary";
          if (answered && isAnswer) state = "border-emerald-500 bg-emerald-500/15";
          else if (answered && isChosen) state = "border-rose-500 bg-rose-500/15";
          else if (answered) state = "border-border opacity-60";
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => setChoices((c) => ({ ...c, [index]: i }))}
              className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${state}`}
            >
              <span aria-hidden className="w-4 shrink-0 text-center">
                {answered && isAnswer ? "✓" : answered && isChosen ? "✗" : "•"}
              </span>
              <span className="min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap font-mono">{option}</span>
            </button>
          );
        })}
      </div>
      {answered && q.explanation ? (
        <p className="mt-3 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap border-t border-border pt-3 text-sm opacity-90">
          {chosen === q.answer ? tr("Правильно! ", "Correct! ") : tr("Не зовсім. ", "Not quite. ")}
          {q.explanation}
        </p>
      ) : null}
      {answered ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className={btnClass}
            onClick={() => (index < total - 1 ? setIndex(index + 1) : setFinished(true))}
          >
            {index < total - 1 ? tr("далі →", "Next →") : tr("завершити", "Finish")}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const InteractiveBlock: React.FC<{ spec: InteractiveSpec }> = ({ spec }) => {
  useTranslation();
  if (isPrediction(spec)) return <PredictionBlock spec={spec} />;
  if (isSpotTheBug(spec)) return <SpotTheBugBlock spec={spec} />;
  if (isTrace(spec)) return <TraceBlock spec={spec} />;
  if (isAlgorithm(spec)) return <AlgorithmBlock spec={spec} />;
  if (isMemory(spec)) return <MemoryBlock spec={spec} />;
  if (isDispatch(spec)) return <DispatchBlock spec={spec} />;
  if (isQuiz(spec)) return <QuizBlock spec={spec} />;
  return null;
};

InteractiveBlock.displayName = "InteractiveBlock";
