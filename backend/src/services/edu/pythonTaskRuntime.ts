import { Buffer } from "node:buffer";
import { normalizeSafeCodeFilePath } from "../../utils/multiFileSubmission";

export type EduPythonRuntimeProfile = "STANDARD" | "SCIENTIFIC" | "TKINTER";
export type PythonTaskAsset = { path: string; dataBase64: string };
export type PythonTaskFile = { path: string; content: string };
export type TkinterEvent =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string };
export const PYTHON_TASK_RESULT_PREFIX = "__STUDYCOD_PYTHON_RESULT__";
export const PYTHON_GUI_RESULT_PREFIX = "__STUDYCOD_TK_RESULT__";

const MAX_FILES = 64;
const MAX_SOURCE_BYTES = 1_000_000;
const MAX_ASSET_BYTES = 1_000_000;
const MAX_ASSETS_BYTES = 4_000_000;
const MAX_ASSETS = 8;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"]);
const TK_KEYS = new Set(["Return", "Escape", "Tab", "BackSpace", "Delete", "space", "Left", "Right", "Up", "Down"]);

export function pythonCompilerForRuntime(profile: EduPythonRuntimeProfile | null | undefined): string | undefined {
  if (profile === "SCIENTIFIC") return "python-libs";
  if (profile === "TKINTER") return "python-gui";
  return undefined;
}

export function normalizePythonTaskFiles(raw: unknown, source?: string): PythonTaskFile[] {
  const incoming = Array.isArray(raw) ? raw : [];
  if (incoming.length > MAX_FILES) throw Object.assign(new Error("TOO_MANY_FILES"), { statusCode: 400 });
  const files: PythonTaskFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;
  for (const value of incoming) {
    if (!value || typeof value !== "object") throw Object.assign(new Error("INVALID_FILES"), { statusCode: 400 });
    const path = normalizeSafeCodeFilePath(Reflect.get(value, "path"));
    const content = Reflect.get(value, "content");
    if (!path || typeof content !== "string") throw Object.assign(new Error("INVALID_FILES"), { statusCode: 400 });
    if (seen.has(path)) throw Object.assign(new Error("DUPLICATE_FILE_PATH"), { statusCode: 400 });
    seen.add(path);
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > MAX_SOURCE_BYTES) throw Object.assign(new Error("FILES_TOO_LARGE"), { statusCode: 413 });
    files.push({ path, content });
  }
  const sourceText = typeof source === "string" ? source : "";
  if (!files.length && sourceText.trim()) files.push({ path: "main.py", content: sourceText });
  if (sourceText.trim() && !files.some(file => file.path === "main.py")) {
    if (files.length >= MAX_FILES) throw Object.assign(new Error("TOO_MANY_FILES"), { statusCode: 400 });
    files.push({ path: "main.py", content: sourceText });
  }
  if (!files.some(file => file.path === "main.py")) throw Object.assign(new Error("MAIN_PY_REQUIRED"), { statusCode: 400 });
  totalBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, "utf8"), 0);
  if (totalBytes > MAX_SOURCE_BYTES) throw Object.assign(new Error("FILES_TOO_LARGE"), { statusCode: 413 });
  return files;
}

export function normalizePythonTaskAssets(raw: unknown): PythonTaskAsset[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ASSETS) throw Object.assign(new Error("INVALID_ASSETS"), { statusCode: 400 });
  const paths = new Set<string>();
  let totalBytes = 0;
  const assets = raw.map(value => {
    if (!value || typeof value !== "object") throw Object.assign(new Error("INVALID_ASSETS"), { statusCode: 400 });
    const path = normalizeSafeCodeFilePath(Reflect.get(value, "path"));
    const dataBase64 = Reflect.get(value, "dataBase64");
    if (!path || typeof dataBase64 !== "string" || !dataBase64.length || dataBase64.length > Math.ceil(MAX_ASSET_BYTES * 4 / 3) + 4) {
      throw Object.assign(new Error("INVALID_ASSETS"), { statusCode: 400 });
    }
    if (path === "main.py" || path.startsWith("student/")) {
      throw Object.assign(new Error("RESERVED_ASSET_PATH"), { statusCode: 400 });
    }
    const ext = path.slice(path.lastIndexOf("/") + 1).toLowerCase().match(/\.[^.]+$/)?.[0] || "";
    if (!IMAGE_EXTENSIONS.has(ext)) throw Object.assign(new Error("UNSUPPORTED_ASSET_TYPE"), { statusCode: 400 });
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64)) {
      throw Object.assign(new Error("INVALID_ASSET_ENCODING"), { statusCode: 400 });
    }
    const bytes = Buffer.from(dataBase64, "base64");
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES || bytes.toString("base64") !== dataBase64) {
      throw Object.assign(new Error("ASSET_TOO_LARGE_OR_INVALID"), { statusCode: 400 });
    }
    if (paths.has(path)) throw Object.assign(new Error("DUPLICATE_ASSET_PATH"), { statusCode: 400 });
    paths.add(path);
    totalBytes += bytes.length;
    if (totalBytes > MAX_ASSETS_BYTES) throw Object.assign(new Error("ASSETS_TOO_LARGE"), { statusCode: 413 });
    return { path, dataBase64 };
  });
  return assets;
}

export function parseTkinterEvents(raw: string): TkinterEvent[] {
  if (!raw.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw Object.assign(new Error("TKINTER_INPUT_MUST_BE_JSON"), { statusCode: 400 }); }
  const events = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? Reflect.get(parsed, "events") : null;
  if (!Array.isArray(events) || events.length > 32) throw Object.assign(new Error("INVALID_TKINTER_EVENTS"), { statusCode: 400 });
  return events.map(value => {
    if (!value || typeof value !== "object") throw Object.assign(new Error("INVALID_TKINTER_EVENTS"), { statusCode: 400 });
    const type = Reflect.get(value, "type");
    if (type === "click") {
      const x = Number(Reflect.get(value, "x"));
      const y = Number(Reflect.get(value, "y"));
      if (!Number.isInteger(x) || x < 0 || x > 1279 || !Number.isInteger(y) || y < 0 || y > 799) throw Object.assign(new Error("INVALID_TKINTER_EVENTS"), { statusCode: 400 });
      return { type, x, y };
    }
    if (type === "type") {
      const text = Reflect.get(value, "text");
      if (typeof text !== "string" || text.length > 120 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw Object.assign(new Error("INVALID_TKINTER_EVENTS"), { statusCode: 400 });
      return { type, text };
    }
    if (type === "key") {
      const key = Reflect.get(value, "key");
      if (typeof key !== "string" || !TK_KEYS.has(key)) throw Object.assign(new Error("INVALID_TKINTER_EVENTS"), { statusCode: 400 });
      return { type, key };
    }
    throw Object.assign(new Error("INVALID_TKINTER_EVENTS"), { statusCode: 400 });
  });
}

export function encodePythonTaskInput(input: {
  stdin?: string;
  assets?: PythonTaskAsset[];
  events?: TkinterEvent[];
  mode: "check" | "preview";
}): string {
  return JSON.stringify({
    stdin: String(input.stdin ?? ""),
    assets: input.assets ?? [],
    events: input.events ?? [],
    mode: input.mode,
  });
}

/** Wrap the student's ordinary CODE solution so binary fixtures and Tk runs stay in Judge. */
export function buildPythonTaskJudgeFiles(studentFiles: PythonTaskFile[], profile: "SCIENTIFIC" | "TKINTER"): PythonTaskFile[] {
  const student = studentFiles.map(file => ({ path: `student/${file.path}`, content: file.content }));
  return [{ path: "main.py", content: profile === "TKINTER" ? tkinterBootstrap : scientificBootstrap }, ...student];
}

const scientificBootstrap = String.raw`import base64, contextlib, io, json, os, runpy, sys
from pathlib import Path

payload = json.loads(sys.stdin.read() or "{}")
assets = payload.get("assets") or []
for asset in assets:
    relative = Path(asset["path"])
    if relative.is_absolute() or ".." in relative.parts or not relative.name.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff")):
        raise ValueError("Invalid image asset path")
    target = Path.cwd() / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    data = base64.b64decode(asset["dataBase64"], validate=True)
    if not data or len(data) > 1000000:
        raise ValueError("Image asset is too large")
    target.write_bytes(data)

os.environ.setdefault("MPLBACKEND", "Agg")
try:
    import cv2
    _cv_preview_count = [0]
    def _studycod_cv2_imshow(name, image):
        if _cv_preview_count[0] >= 4:
            return
        target = Path("studycod_preview")
        target.mkdir(exist_ok=True)
        cv2.imwrite(str(target / ("opencv_" + str(_cv_preview_count[0]) + ".png")), image)
        _cv_preview_count[0] += 1
    cv2.imshow = _studycod_cv2_imshow
    cv2.waitKey = lambda delay=0: ord("q")
    cv2.destroyWindow = lambda *args, **kwargs: None
    cv2.destroyAllWindows = lambda *args, **kwargs: None
except Exception:
    pass
solution = Path("student/main.py").resolve()
sys.path.insert(0, str(solution.parent))
sys.argv = [str(solution)]
mode = payload.get("mode", "check")
if mode != "preview":
    sys.stdin = io.StringIO(str(payload.get("stdin", "")))
    runpy.run_path(str(solution), run_name="__main__")
    raise SystemExit(0)

captured = io.StringIO()
with contextlib.redirect_stdout(captured):
    sys.stdin = io.StringIO(str(payload.get("stdin", "")))
    runpy.run_path(str(solution), run_name="__main__")

images = []
try:
    import matplotlib.pyplot as plt
    preview_dir = Path("studycod_preview")
    preview_dir.mkdir(exist_ok=True)
    for index, figure_id in enumerate(plt.get_fignums()[:4]):
        plt.figure(figure_id).savefig(preview_dir / ("matplotlib_" + str(index) + ".png"), bbox_inches="tight")
except Exception:
    pass
try:
    from PIL import Image
    excluded = {str(Path(asset["path"]).as_posix()) for asset in assets}
    for visited, image_path in enumerate(Path.cwd().rglob("*")):
        if visited >= 4096 or len(images) >= 4:
            break
        if image_path.is_relative_to(Path("student")) or not image_path.is_file() or image_path.is_symlink():
            continue
        if str(image_path.as_posix()) in excluded:
            continue
        if image_path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"):
            continue
        if image_path.stat().st_size > 5000000:
            continue
        try:
            image = Image.open(image_path).convert("RGB")
            image.thumbnail((960, 600))
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=70, optimize=True)
            encoded = base64.b64encode(output.getvalue()).decode("ascii")
            if len(encoded) <= 700000:
                images.append({"name": image_path.name, "dataBase64": encoded})
        except Exception:
            continue
except Exception:
    pass

result = {"stdout": captured.getvalue(), "images": images}
sys.__stdout__.write("__STUDYCOD_PYTHON_RESULT__" + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
`;

const tkinterBootstrap = String.raw`import base64, contextlib, io, json, os, runpy, sys, time
from pathlib import Path

payload = json.loads(sys.stdin.read() or "{}")
assets = payload.get("assets") or []
for asset in assets:
    relative = Path(asset["path"])
    if relative.is_absolute() or ".." in relative.parts or not relative.name.lower().endswith((".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff")):
        raise ValueError("Invalid image asset path")
    target = Path.cwd() / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    data = base64.b64decode(asset["dataBase64"], validate=True)
    if not data or len(data) > 1000000:
        raise ValueError("Image asset is too large")
    target.write_bytes(data)

import tkinter as tk
# A headless Xvfb display has no window manager to activate a top-level. Honor
# the application's normal focus_set() request as a forced focus request so
# keyboard events reach the widget that the program deliberately focused.
tk.Misc.focus_set = tk.Misc.focus_force
solution = Path("student/main.py").resolve()
sys.path.insert(0, str(solution.parent))
sys.argv = [str(solution)]
events = payload.get("events") or []
mode = payload.get("mode", "check")
captured = io.StringIO()
state = {"root": None, "finished": False, "looped": False, "snapshot": None, "image": None}

def _widget(widget):
    item = {"type": widget.winfo_class(), "children": []}
    try:
        text = widget.cget("text")
        if text:
            item["text"] = str(text)
    except Exception:
        pass
    try:
        if widget.winfo_class() in ("Entry", "TEntry", "Spinbox", "TCombobox"):
            item["value"] = str(widget.get())
        elif widget.winfo_class() == "Text":
            item["value"] = str(widget.get("1.0", "end-1c"))
    except Exception:
        pass
    try:
        item["state"] = str(widget.cget("state"))
    except Exception:
        pass
    try:
        item["children"] = [_widget(child) for child in widget.winfo_children()]
    except Exception:
        pass
    return item

def _apply(root, event):
    kind = event.get("type")
    if kind == "click":
        x = root.winfo_rootx() + int(event["x"])
        y = root.winfo_rooty() + int(event["y"])
        target = root.winfo_containing(x, y)
        if target is not None:
            try:
                if target.winfo_class() in ("Button", "TButton", "Checkbutton", "TCheckbutton", "Radiobutton", "TRadiobutton"):
                    target.invoke()
                    return
            except Exception:
                pass
            local_x = x - target.winfo_rootx()
            local_y = y - target.winfo_rooty()
            target.event_generate("<ButtonPress-1>", x=local_x, y=local_y, button=1)
            target.event_generate("<ButtonRelease-1>", x=local_x, y=local_y, button=1)
    elif kind == "type":
        target = root.focus_get()
        if target is not None and hasattr(target, "insert"):
            try:
                target.insert("insert", str(event.get("text", "")))
            except Exception:
                pass
    elif kind == "key":
        target = root.focus_get()
        if target is not None:
            key = str(event.get("key", ""))
            if key in ("Return", "Escape", "Tab", "BackSpace", "Delete", "space", "Left", "Right", "Up", "Down"):
                target.event_generate("<KeyPress-" + key + ">")
                target.event_generate("<KeyRelease-" + key + ">")

def _finish(root):
    if state["finished"]:
        return
    root.update_idletasks()
    snapshot = {"title": str(root.title()), "geometry": str(root.winfo_width()) + "x" + str(root.winfo_height()), "widgets": [_widget(child) for child in root.winfo_children()]}
    state["snapshot"] = snapshot
    if mode == "preview":
        from PIL import ImageGrab
        x, y = root.winfo_rootx(), root.winfo_rooty()
        width, height = root.winfo_width(), root.winfo_height()
        screenshot = ImageGrab.grab(bbox=(x, y, x + width, y + height)).convert("RGB")
        screenshot.thumbnail((960, 600))
        output = io.BytesIO()
        screenshot.save(output, format="JPEG", quality=68, optimize=True)
        state["image"] = base64.b64encode(output.getvalue()).decode("ascii")
    state["finished"] = True
    try:
        root.quit()
    except Exception:
        pass

def _bounded_mainloop(root, n=0):
    state["root"] = root
    state["looped"] = True
    for index, event in enumerate(events):
        root.after(250 + index * 120, lambda event=event: _apply(root, event))
    root.after(650 + len(events) * 120, lambda: _finish(root))
    return _original_mainloop(root, n)

_original_mainloop = tk.Misc.mainloop
tk.Misc.mainloop = _bounded_mainloop
with contextlib.redirect_stdout(captured):
    runpy.run_path(str(solution), run_name="__main__")

root = state["root"] or tk._default_root
if root is None:
    raise RuntimeError("Tkinter program did not create a Tk window")
if not state["finished"]:
    root.update_idletasks()
    for event in events:
        _apply(root, event)
        root.update()
    root.update_idletasks()
    _finish(root)

if mode == "preview":
    result = {"snapshot": state["snapshot"], "imageBase64": state["image"], "stdout": captured.getvalue()}
    sys.__stdout__.write("__STUDYCOD_TK_RESULT__" + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
else:
    sys.__stdout__.write(json.dumps(state["snapshot"], ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
try:
    root.destroy()
except Exception:
    pass
`;

export type PythonTaskRunResult = {
  stdout: string;
  previewImages: Array<{ name: string; dataBase64: string }>;
  uiSnapshot?: unknown;
  previewImageBase64?: string;
};

export function parsePythonTaskRunResult(stdout: string, profile: EduPythonRuntimeProfile): PythonTaskRunResult {
  if (profile === "SCIENTIFIC") {
    const index = stdout.lastIndexOf(PYTHON_TASK_RESULT_PREFIX);
    if (index < 0) return { stdout, previewImages: [] };
    const raw = stdout.slice(index + PYTHON_TASK_RESULT_PREFIX.length).trim().split(/\r?\n/, 1)[0];
    try {
      const result = JSON.parse(raw) as { stdout?: unknown; images?: unknown };
      const previewImages = Array.isArray(result.images) ? result.images.filter((image): image is { name: string; dataBase64: string } =>
        !!image && typeof image === "object" && typeof Reflect.get(image, "name") === "string" &&
        typeof Reflect.get(image, "dataBase64") === "string" && isBase64Jpeg(Reflect.get(image, "dataBase64")),
      ).slice(0, 4) : [];
      return { stdout: typeof result.stdout === "string" ? result.stdout : "", previewImages };
    } catch { return { stdout, previewImages: [] }; }
  }
  if (profile === "TKINTER") {
    const index = stdout.lastIndexOf(PYTHON_GUI_RESULT_PREFIX);
    if (index < 0) return { stdout, previewImages: [] };
    const raw = stdout.slice(index + PYTHON_GUI_RESULT_PREFIX.length).trim().split(/\r?\n/, 1)[0];
    try {
      const result = JSON.parse(raw) as { snapshot?: unknown; imageBase64?: unknown; stdout?: unknown };
      const previewImageBase64 = typeof result.imageBase64 === "string" && isBase64Jpeg(result.imageBase64) ? result.imageBase64 : undefined;
      return { stdout: typeof result.stdout === "string" ? result.stdout : "", previewImages: [], uiSnapshot: result.snapshot, previewImageBase64 };
    } catch { return { stdout, previewImages: [] }; }
  }
  return { stdout, previewImages: [] };
}

function isBase64Jpeg(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw.length || raw.length > 700_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) return false;
  const bytes = Buffer.from(raw, "base64");
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
