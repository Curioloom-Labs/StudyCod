import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { tr } from "../../i18n";
import type { CourseTestInput } from "../../lib/api/edu";
import { TestImageAttachments } from "../../components/TestImageAttachments";
const field = "mt-2 min-h-11 w-full rounded-xl border border-border bg-bg-base px-3 py-3 text-sm text-text-primary";
export const emptyCourseTest = (): CourseTestInput => ({ input: "", expectedOutput: "", points: 1, isHidden: false });
export const validCourseTests = (tests: CourseTestInput[]) => tests.length <= 50 && tests.every(test =>
  Boolean(test.input.trim() || test.expectedOutput.trim()) && test.input.length <= 65536 && test.expectedOutput.length <= 65536 && Number.isSafeInteger(test.points) && test.points >= 1 && test.points <= 1000);
export const CourseTaskTestFields: React.FC<{ tests: CourseTestInput[]; onChange: (tests: CourseTestInput[]) => void; disabled?: boolean }> = ({ tests, onChange, disabled }) => {
  const id = React.useId();
  const update = (index: number, value: Partial<CourseTestInput>) => onChange(tests.map((test, position) => position === index ? { ...test, ...value } : test));
  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <legend className="text-base font-semibold">{tr("Тести перевірки", "Grading tests")}</legend>
    <p className="text-sm leading-6 text-text-secondary">{tr("Вхідні дані передаються через stdin, очікувана відповідь — вивід програми. Кількість пробілів і переносів між значеннями не впливає на перевірку. Бали визначають вагу кожного тесту.", "Input is supplied through stdin; expected output is the program output. Spaces and line breaks between values do not affect checking. Points set each test's weight.")}</p>
    <p className="text-sm font-semibold tabular-nums">{tr("Тестів", "Tests")}: {tests.length} · {tr("Загальна вага", "Total weight")}: {tests.reduce((sum, test) => sum + (Number.isFinite(test.points) ? test.points : 0), 0)} · {tr("Прихованих", "Hidden")}: {tests.filter(test => test.isHidden).length}</p>
    {tests.map((test, index) => <fieldset key={index} className="min-w-0 rounded-2xl border border-border p-4">
      <legend className="px-2 text-sm font-semibold">{tr("Тест", "Test")} {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${id}-input-${index}`} className="text-sm">{tr("Вхідні дані", "Input")}</label><textarea id={`${id}-input-${index}`} className={`${field} resize-y font-mono`} rows={3} maxLength={65536} value={test.input} onChange={event => update(index, { input: event.target.value })} /></div>
        <div><label htmlFor={`${id}-output-${index}`} className="text-sm">{tr("Очікуваний вивід", "Expected output")}</label><textarea id={`${id}-output-${index}`} className={`${field} resize-y font-mono`} rows={3} maxLength={65536} value={test.expectedOutput} onChange={event => update(index, { expectedOutput: event.target.value })} /></div>
      </div>
      <TestImageAttachments value={test.imageUrls ?? []} onChange={imageUrls => update(index, { imageUrls })} disabled={disabled} />
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label htmlFor={`${id}-points-${index}`} className="w-24 text-sm">{tr("Бали", "Points")}<input id={`${id}-points-${index}`} className={field} type="number" min={1} max={1000} step={1} value={test.points} onChange={event => update(index, { points: Number(event.target.value) })} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input className="size-4 accent-primary" type="checkbox" checked={test.isHidden} onChange={event => update(index, { isHidden: event.target.checked })} />{tr("Прихований від учнів", "Hidden from students")}</label>
        <button type="button" onClick={() => onChange(tests.filter((_, position) => position !== index))} aria-label={tr(`Видалити тест ${index + 1}`, `Delete test ${index + 1}`)} className="ml-auto grid min-h-11 min-w-11 place-items-center rounded-xl text-accent-error"><Trash2 className="size-4" /></button>
      </div>
      {test.subtask && <p className="mt-3 text-xs text-text-secondary">{tr("Група", "Group")}: {test.subtask}. {tr("Бали групи зараховуються після проходження всіх її тестів.", "Group points are awarded only when all its tests pass.")}</p>}
    </fieldset>)}
    {!tests.length && <p className="rounded-xl bg-bg-hover p-4 text-sm text-text-secondary">{tr("Поки тестів немає, автоматична здача недоступна. Додайте хоча б один тест для відкриття перевірки.", "Automatic submission is unavailable until tests are configured. Add at least one test to enable grading.")}</p>}
    {!validCourseTests(tests) && <p role="status" className="text-sm text-accent-error">{tr("Заповніть вхідні дані або очікуваний вивід кожного тесту. Бали — цілі числа від 1 до 1000.", "Enter input or expected output for every test. Points must be whole numbers from 1 to 1,000.")}</p>}
    <button type="button" disabled={tests.length >= 50} onClick={() => onChange([...tests, emptyCourseTest()])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><Plus className="size-4" />{tr("Додати тест", "Add test")}</button>
  </fieldset>;
};
