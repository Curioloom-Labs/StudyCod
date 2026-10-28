import React from "react";
import { compareAssessFiles, type AssessFile } from "./assessWorkspace";

export function AssessEvidenceFiles({ files }: { files: Array<{ path: string; content: string }> }) {
  const [path, setPath] = React.useState(files[0]?.path ?? "");
  const active = files.find(file => file.path === path) ?? files[0];
  if (!active) return null;
  return <div className="assess-code-view"><div className="assess-code-files" role="group" aria-label="Files">{files.map(file => <button type="button" key={file.path} aria-pressed={active.path === file.path} onClick={() => setPath(file.path)}>{file.path}</button>)}</div><pre tabIndex={0} aria-label={active.path}><code>{active.content}</code></pre></div>;
}

export function AssessEvidenceComparison({ before, after, en }: { before: AssessFile[]; after: AssessFile[]; en: boolean }) {
  const files = React.useMemo(() => compareAssessFiles(before, after), [before, after]);
  const changed = files.filter(file => file.status !== "UNCHANGED");
  const [path, setPath] = React.useState("");
  const [includeUnchanged, setIncludeUnchanged] = React.useState(false);
  const visible = includeUnchanged ? files : changed;
  const active = visible.find(file => file.path === path) ?? visible[0];
  const labels: Record<string, string> = { ADDED: en ? "Added" : "Додано", REMOVED: en ? "Removed" : "Видалено", MODIFIED: en ? "Changed" : "Змінено", UNCHANGED: en ? "Unchanged" : "Без змін" };
  return <article className="assess-panel">
    <div className="assess-section-heading"><div><span className="assess-eyebrow">{en ? "Original → submitted" : "Вихідна версія → подана робота"}</span><h2>{en ? "What the candidate changed" : "Що змінив кандидат"}</h2></div><span className="assess-count">{changed.length} / {files.length} {en ? "files changed" : "файлів змінено"}</span></div>
    <p className="assess-scope-note">{en ? "Compare the frozen project version with the explicitly submitted working copy. Use the change and test results to guide the conversation." : "Порівняй зафіксовану версію проєкту з явно поданою робочою копією. Обговорюй конкретну зміну разом із результатом її перевірки."}</p>
    <label className="assess-compare-toggle"><input type="checkbox" checked={includeUnchanged} onChange={event => setIncludeUnchanged(event.target.checked)}/>{en ? "Include unchanged files" : "Показувати також файли без змін"}</label>
    {visible.length ? <><div className="assess-code-files" role="group" aria-label={en ? "Compared files" : "Порівнювані файли"}>{visible.map(file => <button key={file.path} type="button" aria-pressed={active?.path === file.path} onClick={() => setPath(file.path)}>{file.path} · {labels[file.status]}</button>)}</div>{active && <div className="assess-comparison"><section><header><span>{en ? "Original version" : "Вихідна версія"}</span><small>{active.original?.path ?? (en ? "File did not exist" : "Файла ще не було")}</small></header><pre tabIndex={0} aria-label={en ? "Original code" : "Вихідний код"}><code>{active.original?.content ?? (en ? "File not present in the original version." : "Файл відсутній у вихідній версії.")}</code></pre></section><section><header><span>{en ? "Submitted by candidate" : "Подано кандидатом"}</span><small>{labels[active.status]}</small></header><pre tabIndex={0} aria-label={en ? "Submitted code" : "Поданий код"}><code>{active.submitted?.content ?? (en ? "File removed from the submitted version." : "Файл видалено з поданої версії.")}</code></pre></section></div>}</> : <div className="assess-empty assess-empty--compact"><h3>{en ? "The files match the original version" : "Файли збігаються з вихідною версією"}</h3><p>{en ? "No file content changed in the submitted copy. You can include all files for reading." : "У поданій копії вміст файлів не змінився. Увімкни показ усіх файлів для перегляду."}</p></div>}
  </article>;
}

export function AssessJourney({ assessment, en }: { assessment: Record<string, any>; en: boolean }) {
  const closed = ["WITHDRAWN", "DECLINED", "CLOSED"].includes(assessment.status);
  const submitted = ["TASK_SUBMITTED", "REVIEWED"].includes(assessment.status);
  const steps = [
    { label: en ? "Project version" : "Версія проєкту", detail: assessment.portfolio ? `${assessment.portfolio.runtime} · ${assessment.portfolio.stage} #${assessment.portfolio.sequence}` : assessment.versionId ? (en ? "Chosen by candidate" : "Обрано кандидатом") : (en ? "Chosen by candidate after consent" : "Кандидат обере після згоди"), complete: Boolean(assessment.versionId) },
    { label: en ? "Requirement change" : "Зміна вимог", detail: assessment.taskTitle || (en ? "Prepared by an engineer" : "Готує інженер"), complete: Boolean(assessment.technicalAssessmentId) },
    { label: en ? "Submitted result" : "Поданий результат", detail: submitted ? (en ? "Code and checks saved" : "Код і перевірку збережено") : (en ? "A separate working copy" : "Окрема робоча копія"), complete: submitted },
    { label: en ? "Human feedback" : "Відгук людини", detail: assessment.technicalReview ? (en ? "Engineering review saved" : "Інженерний відгук збережено") : (en ? "HR and engineering separately" : "HR та інженер окремо"), complete: Boolean(assessment.technicalReview) },
  ];
  if (closed) return null;
  return <div className="assess-dossier-journey" aria-label={en ? "Evidence journey" : "Шлях доказів роботи"}>{steps.map((step, index) => <div key={step.label} data-complete={step.complete}><small>0{index + 1} / {step.label}</small><strong>{step.detail}</strong></div>)}</div>;
}
