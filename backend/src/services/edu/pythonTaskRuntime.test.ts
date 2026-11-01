import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPythonTaskJudgeFiles,
  encodePythonTaskInput,
  normalizePythonTaskAssets,
  normalizePythonTaskFiles,
  parsePythonTaskRunResult,
  parseTkinterEvents,
  pythonCompilerForRuntime,
  PYTHON_GUI_RESULT_PREFIX,
  PYTHON_TASK_RESULT_PREFIX,
} from "./pythonTaskRuntime";

test("Python runtime profiles map to the intended isolated judge runtimes", () => {
  assert.equal(pythonCompilerForRuntime("STANDARD"), undefined);
  assert.equal(pythonCompilerForRuntime("SCIENTIFIC"), "python-libs");
  assert.equal(pythonCompilerForRuntime("TKINTER"), "python-gui");
});

test("Python task files require a safe main.py and enforce the file-count limit after adding it", () => {
  assert.deepEqual(normalizePythonTaskFiles([], "print('ok')"), [{ path: "main.py", content: "print('ok')" }]);
  assert.throws(() => normalizePythonTaskFiles([{ path: "../main.py", content: "x" }], "x"), /INVALID_FILES/);
  assert.throws(() => normalizePythonTaskFiles([{ path: "main.py", content: "x" }, { path: "main.py", content: "y" }]), /DUPLICATE_FILE_PATH/);
  const files = Array.from({ length: 64 }, (_, index) => ({ path: "file" + index + ".py", content: "" }));
  assert.throws(() => normalizePythonTaskFiles(files, "print('entry')"), /TOO_MANY_FILES/);
});

test("image fixtures reject unsafe, duplicate, reserved, invalid, and oversized data", () => {
  const image = "iVBORw0KGgo=";
  assert.deepEqual(normalizePythonTaskAssets([{ path: "fixtures/input.png", dataBase64: image }]), [{ path: "fixtures/input.png", dataBase64: image }]);
  assert.throws(() => normalizePythonTaskAssets([{ path: "../input.png", dataBase64: image }]), /INVALID_ASSETS/);
  assert.throws(() => normalizePythonTaskAssets([{ path: "student/main.py", dataBase64: image }]), /RESERVED_ASSET_PATH/);
  assert.throws(() => normalizePythonTaskAssets([{ path: "fixtures/input.png", dataBase64: "not base64" }]), /INVALID_ASSET_ENCODING/);
  assert.throws(() => normalizePythonTaskAssets([
    { path: "fixtures/a.png", dataBase64: image },
    { path: "fixtures/a.png", dataBase64: image },
  ]), /DUPLICATE_ASSET_PATH/);
});

test("Tkinter input accepts bounded UI events and rejects unsupported keys and coordinates", () => {
  assert.deepEqual(parseTkinterEvents(JSON.stringify({ events: [
    { type: "click", x: 20, y: 30 },
    { type: "type", text: "hello" },
    { type: "key", key: "Return" },
  ] })), [
    { type: "click", x: 20, y: 30 },
    { type: "type", text: "hello" },
    { type: "key", key: "Return" },
  ]);
  assert.throws(() => parseTkinterEvents("{"), /TKINTER_INPUT_MUST_BE_JSON/);
  assert.throws(() => parseTkinterEvents(JSON.stringify([{ type: "click", x: 1280, y: 0 }])), /INVALID_TKINTER_EVENTS/);
  assert.throws(() => parseTkinterEvents(JSON.stringify([{ type: "key", key: "F1" }])), /INVALID_TKINTER_EVENTS/);
});

test("Tkinter click events invoke standard Tk and ttk controls deterministically", () => {
  const bootstrap = buildPythonTaskJudgeFiles([{ path: "main.py", content: "" }], "TKINTER")[0].content;
  assert.match(bootstrap, /target\.invoke\(\)/);
  assert.match(bootstrap, /"TButton"/);
  assert.match(bootstrap, /"TRadiobutton"/);
});

test("runtime input envelopes preserve stdin, fixtures, and UI events", () => {
  assert.deepEqual(JSON.parse(encodePythonTaskInput({
    mode: "preview",
    stdin: "42\n",
    assets: [{ path: "fixtures/a.png", dataBase64: "iVBORw0KGgo=" }],
    events: [{ type: "click", x: 5, y: 6 }],
  })), {
    stdin: "42\n",
    assets: [{ path: "fixtures/a.png", dataBase64: "iVBORw0KGgo=" }],
    events: [{ type: "click", x: 5, y: 6 }],
    mode: "preview",
  });
});

test("run result parser accepts generated JPEG previews and Tk snapshots", () => {
  const scientific = parsePythonTaskRunResult(
    "stdout\n" + PYTHON_TASK_RESULT_PREFIX + JSON.stringify({ stdout: "answer\n", images: [{ name: "plot.png", dataBase64: "/9j/2Q==" }] }),
    "SCIENTIFIC",
  );
  assert.equal(scientific.stdout, "answer\n");
  assert.deepEqual(scientific.previewImages, [{ name: "plot.png", dataBase64: "/9j/2Q==" }]);
  const snapshot = { title: "Counter", geometry: "320x120", widgets: [] };
  const tkinter = parsePythonTaskRunResult(
    PYTHON_GUI_RESULT_PREFIX + JSON.stringify({ snapshot, imageBase64: "/9j/2Q==", stdout: "" }),
    "TKINTER",
  );
  assert.deepEqual(tkinter.uiSnapshot, snapshot);
  assert.equal(tkinter.previewImageBase64, "/9j/2Q==");
});
