import React, { useState } from "react";

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
      <div className={labelClass}>{"// перевір себе"}</div>
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
          {choice === spec.answer ? "Правильно! " : "Не зовсім. "}
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
      <div className={labelClass}>{"// знайди помилку"}</div>
      <p className="mb-3 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-sm font-semibold">
        {spec.question || "Натисни на рядок, у якому помилка:"}
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
                  ← помилка
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {revealed && spec.explanation ? (
        <p className="mt-3 border-t border-current/10 pt-3 text-sm opacity-90">
          {choice === spec.buggyLine ? "Правильно! " : "Помилка не тут. "}
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
      <div className={labelClass}>{"// покроковий прогін"}</div>
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
          <div className={labelClass + " mb-2"}>{"// змінні"}</div>
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
          <div className={labelClass + " mb-1"}>{"// консоль"}</div>
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
          ← крок назад
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={() => setCursor((c) => Math.min(total - 1, c + 1))}
          disabled={cursor === total - 1}
        >
          крок вперед →
        </button>
        <span className="ml-auto font-mono text-[12px] text-text-secondary">
          крок {cursor + 1} / {total}
        </span>
      </div>
    </div>
  );
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
    <div className={labelClass}>{"// пам’ять"}</div>
    {spec.caption ? <p className="mb-3 text-sm font-semibold">{spec.caption}</p> : null}
    <div className="flex gap-4">
      <MemoryColumn title="стек" boxes={spec.stack ?? []} />
      <MemoryColumn title="купа (heap)" boxes={spec.heap ?? []} />
    </div>
    {spec.note ? <p className="mt-3 text-sm opacity-90">{spec.note}</p> : null}
  </div>
);

const DispatchBlock: React.FC<{ spec: DispatchSpec }> = ({ spec }) => {
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked !== null ? spec.cases[picked] : null;

  return (
    <div className={shellClass}>
      <div className={labelClass}>{"// який метод виконається?"}</div>
      <p className="mb-3 font-mono text-sm">
        {"Виклик: "}
        <span className="text-text-primary">{spec.call}</span>
      </p>
      <p className="mb-2 text-sm text-text-secondary">Обери реальний тип об’єкта:</p>
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
        <div className={labelClass}>{"// результат квізу"}</div>
        <p className="text-sm font-semibold">
          Правильних відповідей: {score} / {total}
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-code">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm opacity-90">
          {score === total
            ? "Бездоганно! 🎯"
            : score * 2 >= total
              ? "Непогано — повтори те, що не вийшло."
              : "Варто ще раз перечитати урок."}
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
          ⟲ пройти ще раз
        </button>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={labelClass + " mb-0"}>{"// міні-квіз"}</span>
        <span className="font-mono text-[12px] text-text-secondary">
          питання {index + 1} / {total}
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
          {chosen === q.answer ? "Правильно! " : "Не зовсім. "}
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
            {index < total - 1 ? "далі →" : "завершити"}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const InteractiveBlock: React.FC<{ spec: InteractiveSpec }> = ({ spec }) => {
  if (isPrediction(spec)) return <PredictionBlock spec={spec} />;
  if (isSpotTheBug(spec)) return <SpotTheBugBlock spec={spec} />;
  if (isTrace(spec)) return <TraceBlock spec={spec} />;
  if (isMemory(spec)) return <MemoryBlock spec={spec} />;
  if (isDispatch(spec)) return <DispatchBlock spec={spec} />;
  if (isQuiz(spec)) return <QuizBlock spec={spec} />;
  return null;
};

InteractiveBlock.displayName = "InteractiveBlock";
