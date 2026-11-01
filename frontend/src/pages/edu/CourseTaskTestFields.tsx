import React from "react";
import { Plus, Trash2, X } from "lucide-react";
import { tr } from "../../i18n";
import type { CourseTestInput } from "../../lib/api/edu";
import { TestImageAttachments } from "../../components/TestImageAttachments";
const field = "mt-2 min-h-11 w-full rounded-xl border border-border bg-bg-base px-3 py-3 text-sm text-text-primary";
export const emptyCourseTest = (): CourseTestInput => ({ input: "", expectedOutput: "", points: 1, isHidden: false, subtask: null, subtaskScoringMode: "ABSOLUTE" });
export const validCourseTests = (tests: CourseTestInput[], runtimeProfile?: "STANDARD" | "SCIENTIFIC" | "TKINTER") => tests.length <= 50 && tests.reduce((sum, test) => sum + (test.assets ?? []).reduce((assetSum, asset) => assetSum + asset.dataBase64.length, 0), 0) <= 12_000_000 && tests.every(test =>
  (test.assets ?? []).reduce((sum, asset) => sum + asset.dataBase64.length, 0) <= 5_333_336 &&
  Boolean(test.input.trim() || test.expectedOutput.trim() || test.assets?.length) && test.input.length <= 65536 && test.expectedOutput.length <= 65536 && Number.isSafeInteger(test.points) && test.points >= 1 && test.points <= 1000 && (test.assets?.length ?? 0) <= 8 && !(runtimeProfile === "STANDARD" && test.assets?.length) && (test.assets ?? []).every(asset => /^[A-Za-z0-9_-][A-Za-z0-9._/-]{0,179}$/.test(asset.path) && !asset.path.startsWith("student/") && !asset.path.split("/").some(part => !part || part === "." || part === ".." || part.startsWith(".")) && /\.(png|jpe?g|bmp|webp|tiff?)$/i.test(asset.path) && asset.dataBase64.length <= 1_400_000));
const imageDataBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
const safeImagePath = (name: string, index: number) => {
  const ext = name.toLowerCase().match(/\.(png|jpe?g|bmp|webp|tiff?)$/)?.[0] || "";
  const base = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  return `${base || `image_${index + 1}`}${ext}`;
};
export const CourseTaskTestFields: React.FC<{ tests: CourseTestInput[]; onChange: (tests: CourseTestInput[]) => void; disabled?: boolean; runtimeProfile?: "STANDARD" | "SCIENTIFIC" | "TKINTER" }> = ({ tests, onChange, disabled, runtimeProfile = "STANDARD" }) => {
  const id = React.useId();
  const [assetError, setAssetError] = React.useState("");
  const update = (index: number, value: Partial<CourseTestInput>) => {
    const current = tests[index];
    const group = value.subtaskScoringMode !== undefined ? String(value.subtask ?? current?.subtask ?? "").trim() : "";
    onChange(tests.map((test, position) => position === index
      ? { ...test, ...value }
      : group && String(test.subtask ?? "").trim() === group ? { ...test, subtaskScoringMode: value.subtaskScoringMode } : test));
  };
  const addAssets = async (index: number, files: FileList | null) => {
    setAssetError("");
    if (!files?.length) return;
    const current = tests[index].assets ?? [];
    if (current.length + files.length > 8) { setAssetError(tr("У тесті може бути до 8 зображень.", "A test can include up to 8 images.")); return; }
    const currentBytes = current.reduce((sum, asset) => sum + Math.floor(asset.dataBase64.length * 3 / 4), 0);
    if (currentBytes + Array.from(files).reduce((sum, file) => sum + file.size, 0) > 4_000_000) { setAssetError(tr("Загальний розмір зображень одного тесту — до 4 МБ.", "Images in one test must total no more than 4 MB.")); return; }
    try {
      const next = [...current];
      for (const file of Array.from(files)) {
        if (file.size <= 0 || file.size > 1_000_000 || !/\.(png|jpe?g|bmp|webp|tiff?)$/i.test(file.name)) throw new Error(tr("Дозволені PNG, JPEG, BMP, WebP або TIFF до 1 МБ кожне.", "Use PNG, JPEG, BMP, WebP, or TIFF images up to 1 MB each."));
        const dataBase64 = await imageDataBase64(file);
        let path = safeImagePath(file.name, next.length);
        const stem = path.slice(0, path.lastIndexOf("."));
        const ext = path.slice(path.lastIndexOf("."));
        let suffix = 2;
        while (next.some(asset => asset.path === path)) path = `${stem}_${suffix++}${ext}`;
        next.push({ path, dataBase64 });
      }
      update(index, { assets: next });
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : tr("Не вдалося додати зображення.", "Could not add image."));
    }
  };
  return <fieldset disabled={disabled} className="min-w-0 space-y-4">
    <legend className="text-base font-semibold">{tr("Тести перевірки", "Grading tests")}</legend>
    <p className="text-sm leading-6 text-text-secondary">{runtimeProfile === "TKINTER" ? tr("Вхід тесту — JSON зі списком подій інтерфейсу. Очікуваний вивід — знімок структури вікна після цих подій.", "A test input is JSON describing UI events. Expected output is the window widget snapshot after those events.") : tr("Вхідні дані передаються через stdin, очікувана відповідь — вивід програми. Для OpenCV можна додати зображення-фікстури. Бали визначають вагу тесту; назва підзадачі й тип оцінювання визначають правила нарахування балів.", "Input is supplied through stdin; expected output is the program output. OpenCV tests can include image fixtures. Points set test weight; subtask name and scoring mode define how points are awarded.")}</p>
    <p className="text-sm font-semibold tabular-nums">{tr("Тестів", "Tests")}: {tests.length} · {tr("Загальна вага", "Total weight")}: {tests.reduce((sum, test) => sum + (Number.isFinite(test.points) ? test.points : 0), 0)} · {tr("Прихованих", "Hidden")}: {tests.filter(test => test.isHidden).length}</p>
    {tests.map((test, index) => <fieldset key={index} className="min-w-0 rounded-2xl border border-border p-4">
      <legend className="px-2 text-sm font-semibold">{tr("Тест", "Test")} {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor={`${id}-input-${index}`} className="text-sm">{runtimeProfile === "TKINTER" ? tr("Події інтерфейсу (JSON)", "UI events (JSON)") : tr("Вхідні дані", "Input")}</label><textarea id={`${id}-input-${index}`} className={`${field} resize-y font-mono`} rows={3} maxLength={65536} value={test.input} onChange={event => update(index, { input: event.target.value })} placeholder={runtimeProfile === "TKINTER" ? '{"events":[{"type":"click","x":120,"y":80}]}' : undefined} /></div>
        <div><label htmlFor={`${id}-output-${index}`} className="text-sm">{tr("Очікуваний вивід", "Expected output")}</label><textarea id={`${id}-output-${index}`} className={`${field} resize-y font-mono`} rows={3} maxLength={65536} value={test.expectedOutput} onChange={event => update(index, { expectedOutput: event.target.value })} /></div>
      </div>
      <TestImageAttachments value={test.imageUrls ?? []} onChange={imageUrls => update(index, { imageUrls })} disabled={disabled} />
      {runtimeProfile !== "STANDARD" && <div className="mt-3 rounded-xl border border-border p-3">
        <label htmlFor={`${id}-assets-${index}`} className="text-sm font-semibold">{tr("Зображення-фікстури", "Image fixtures")}</label>
        <input id={`${id}-assets-${index}`} type="file" multiple accept=".png,.jpg,.jpeg,.bmp,.webp,.tif,.tiff,image/*" onChange={event => { void addAssets(index, event.currentTarget.files); event.currentTarget.value = ""; }} className="mt-2 block w-full text-sm" />
        {(test.assets ?? []).length > 0 && <ul className="mt-3 space-y-2">{test.assets!.map((asset, assetIndex) => <li key={`${asset.path}-${assetIndex}`} className="flex items-center gap-2 text-xs">
          <input aria-label={tr("Шлях зображення в програмі", "Image path in the program")} value={asset.path} maxLength={180} onChange={event => update(index, { assets: test.assets!.map((item, itemIndex) => itemIndex === assetIndex ? { ...item, path: event.target.value } : item) })} className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg-base px-2 font-mono" />
          <span className="shrink-0 text-text-secondary">{(asset.dataBase64.length * 0.75 / 1024).toFixed(0)} KB</span>
          <button type="button" onClick={() => update(index, { assets: test.assets!.filter((_, itemIndex) => itemIndex !== assetIndex) })} aria-label={tr("Видалити зображення", "Remove image")} className="grid size-9 shrink-0 place-items-center rounded-lg text-accent-error"><X className="size-4" /></button>
        </li>)}</ul>}
      </div>}
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label htmlFor={`${id}-points-${index}`} className="w-24 text-sm">{tr("Бали", "Points")}<input id={`${id}-points-${index}`} className={field} type="number" min={1} max={1000} step={1} value={test.points} onChange={event => update(index, { points: Number(event.target.value) })} /></label>
        <label htmlFor={`${id}-subtask-${index}`} className="min-w-40 flex-1 text-sm">{tr("Підзадача", "Subtask")}<input id={`${id}-subtask-${index}`} className={field} maxLength={64} value={test.subtask ?? ""} placeholder={tr("Однакова назва для групи", "Same name for the group")} onChange={event => update(index, { subtask: event.target.value || null })} /></label>
        <label htmlFor={`${id}-scoring-${index}`} className="min-w-44 flex-1 text-sm">{tr("Оцінювання підзадачі", "Subtask scoring")}<select id={`${id}-scoring-${index}`} className={field} value={test.subtaskScoringMode ?? "ABSOLUTE"} onChange={event => update(index, { subtaskScoringMode: event.target.value as "ABSOLUTE" | "PARTIAL" })}><option value="ABSOLUTE">{tr("Абсолютне · усі тести", "Absolute · all tests")}</option><option value="PARTIAL">{tr("Часткове · за кожен тест", "Partial · per test")}</option></select></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input className="size-4 accent-primary" type="checkbox" checked={test.isHidden} onChange={event => update(index, { isHidden: event.target.checked })} />{tr("Прихований від учнів", "Hidden from students")}</label>
        <button type="button" onClick={() => onChange(tests.filter((_, position) => position !== index))} aria-label={tr(`Видалити тест ${index + 1}`, `Delete test ${index + 1}`)} className="ml-auto grid min-h-11 min-w-11 place-items-center rounded-xl text-accent-error"><Trash2 className="size-4" /></button>
      </div>
      {test.subtask && <p className="mt-3 text-xs text-text-secondary">{tr("Підзадача", "Subtask")}: {test.subtask}. {test.subtaskScoringMode === "PARTIAL" ? tr("Бали нараховуються за кожен пройдений тест.", "Points are awarded for each passed test.") : tr("Бали нараховуються лише після проходження всіх тестів підзадачі.", "Points are awarded only after every subtask test passes.")}</p>}
    </fieldset>)}
    {!tests.length && <p className="rounded-xl bg-bg-hover p-4 text-sm text-text-secondary">{tr("Поки тестів немає, автоматична здача недоступна. Додайте хоча б один тест для відкриття перевірки.", "Automatic submission is unavailable until tests are configured. Add at least one test to enable grading.")}</p>}
    {assetError && <p role="alert" className="text-sm text-accent-error">{assetError}</p>}
    {!validCourseTests(tests, runtimeProfile) && <p role="status" className="text-sm text-accent-error">{tr("Заповніть вхідні дані, очікуваний вивід або додайте файл до кожного тесту. Файли-зображення потребують наукового профілю чи Tkinter. Перевірте шляхи й бали (цілі числа 1–1000).", "Enter test input, expected output, or add a fixture. Image fixtures need the scientific or Tkinter profile. Check paths and points (whole numbers 1–1,000).")}</p>}
    <button type="button" disabled={tests.length >= 50} onClick={() => onChange([...tests, emptyCourseTest()])} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><Plus className="size-4" />{tr("Додати тест", "Add test")}</button>
  </fieldset>;
};
