import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, normalize, resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { pathToFileURL } from "node:url";

type Language = "java" | "cpp" | "c" | "python";
type JsonObject = Record<string, unknown>;

const PORT = Number(process.env.LSP_PORT || 4010);
const SECRET = String(process.env.LSP_SECRET || "").trim();
const ROOT = resolve(process.env.LSP_DATA_DIR || "/var/lib/studycod-lsp");
const SESSION_TTL_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

if (!SECRET) {
  throw new Error("LSP_SECRET must be configured");
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface LspSession {
  id: string;
  language: Language;
  root: string;
  workspace: string;
  process: ChildProcessWithoutNullStreams;
  buffer: Buffer;
  nextRequestId: number;
  pending: Map<number, PendingRequest>;
  diagnostics: Map<string, unknown[]>;
  lastUsedAt: number;
}

const sessions = new Map<string, LspSession>();

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", Buffer.byteLength(body));
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON object expected");
  return parsed as JsonObject;
}

function languageOf(value: unknown): Language {
  const language = String(value || "").toLowerCase();
  if (language === "java" || language === "cpp" || language === "c" || language === "python") return language;
  throw new Error("Unsupported language");
}

function safeRelativePath(value: unknown, language: Language): string {
  const raw = String(value || (language === "python" ? "main.py" : language === "java" ? "Main.java" : "main.cpp"));
  const cleaned = raw.replaceAll("\\", "/").replace(/^\/+/, "");
  const normalized = normalize(cleaned).replaceAll("\\", "/");
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Invalid workspace path");
  }
  return normalized;
}

function commandFor(language: Language, session: string): { command: string; args: string[] } {
  if (language === "cpp" || language === "c") {
    const clangd = process.env.CLANGD_PATH || "/opt/swift/usr/bin/clangd";
    return { command: clangd, args: ["--background-index=false", "--clang-tidy=false", "--header-insertion=never", "--limit-results=200"] };
  }
  if (language === "python") {
    const pyright = process.env.PYRIGHT_LANGSERVER || "/opt/studycod-lsp/node_modules/.bin/pyright-langserver";
    return { command: pyright, args: ["--stdio"] };
  }

  const jdtls = process.env.JDTLS_HOME || "/opt/jdtls";
  const launcher = process.env.JDTLS_LAUNCHER || join(jdtls, "plugins", "org.eclipse.equinox.launcher.jar");
  const configuration = process.env.JDTLS_CONFIGURATION || join(jdtls, "config_linux");
  const data = join(ROOT, "jdtls", session);
  return {
    command: process.env.JAVA_PATH || "java",
    args: [
      "-Declipse.application=org.eclipse.jdt.ls.core.id1",
      "-Dosgi.bundles.defaultStartLevel=4",
      "-Declipse.product=org.eclipse.jdt.ls.core.product",
      "-Dlog.protocol=false",
      "-Dlog.level=WARNING",
      "-Xms256m",
      "--add-modules=ALL-SYSTEM",
      "--add-opens", "java.base/java.util=ALL-UNNAMED",
      "--add-opens", "java.base/java.lang=ALL-UNNAMED",
      "-jar", launcher,
      "-configuration", configuration,
      "-data", data
    ]
  };
}

function sendMessage(session: LspSession, message: JsonObject): void {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  session.process.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  session.process.stdin.write(body);
}

function rejectPending(session: LspSession, error: Error): void {
  for (const pending of session.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(error);
  }
  session.pending.clear();
}

function consumeMessages(session: LspSession): void {
  while (true) {
    const marker = session.buffer.indexOf("\r\n\r\n");
    if (marker < 0) return;
    const header = session.buffer.subarray(0, marker).toString("ascii");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      session.buffer = session.buffer.subarray(marker + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = marker + 4;
    if (session.buffer.length < start + length) return;
    const raw = session.buffer.subarray(start, start + length).toString("utf8");
    session.buffer = session.buffer.subarray(start + length);
    let message: JsonObject;
    try { message = JSON.parse(raw) as JsonObject; } catch { continue; }

    if (message.method === "textDocument/publishDiagnostics") {
      const params = (message.params || {}) as JsonObject;
      const uri = String(params.uri || "");
      const diagnostics = Array.isArray(params.diagnostics) ? params.diagnostics : [];
      session.diagnostics.set(uri, diagnostics);
      continue;
    }

    const id = typeof message.id === "number" ? message.id : null;
    if (id === null) continue;
    const pending = session.pending.get(id);
    if (!pending) continue;
    session.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error && typeof message.error === "object") {
      const error = message.error as JsonObject;
      pending.reject(new Error(String(error.message || "LSP request failed")));
    } else {
      pending.resolve(message.result);
    }
  }
}

function request(session: LspSession, method: string, params: unknown): Promise<unknown> {
  const id = session.nextRequestId++;
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error(`LSP timeout: ${method}`));
    }, REQUEST_TIMEOUT_MS);
    session.pending.set(id, { resolve: resolvePromise, reject, timer });
    sendMessage(session, { jsonrpc: "2.0", id, method, params });
  });
}

function notify(session: LspSession, method: string, params: unknown): void {
  sendMessage(session, { jsonrpc: "2.0", method, params });
}

async function startSession(language: Language): Promise<LspSession> {
  const id = randomUUID();
  const root = join(ROOT, "sessions", id);
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const spec = commandFor(language, id);
  const child = spawn(spec.command, spec.args, { cwd: workspace, stdio: "pipe", env: { ...process.env, HOME: process.env.LSP_HOME || "/tmp" } });
  const session: LspSession = { id, language, root, workspace, process: child, buffer: Buffer.alloc(0), nextRequestId: 1, pending: new Map(), diagnostics: new Map(), lastUsedAt: Date.now() };
  child.stdout.on("data", (chunk: Buffer) => { session.buffer = Buffer.concat([session.buffer, chunk]); consumeMessages(session); });
  child.stderr.on("data", (chunk: Buffer) => { if (process.env.LSP_DEBUG === "1") process.stderr.write(`[lsp:${id}] ${chunk}`); });
  child.on("error", error => rejectPending(session, error));
  child.on("exit", (code, signal) => rejectPending(session, new Error(`LSP exited (${code ?? "?"}/${signal ?? "?"})`)));
  sessions.set(id, session);

  try {
    await request(session, "initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).toString(),
      workspaceFolders: [{ uri: pathToFileURL(workspace).toString(), name: "studycod" }],
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, willSave: false, didSave: false, willSaveWaitUntil: false },
          completion: { completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"] } },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          references: {},
          rename: { prepareSupport: true }
        },
        workspace: { workspaceFolders: true, configuration: true }
      },
      clientInfo: { name: "StudyCod IDE", version: "1.0" }
    });
    notify(session, "initialized", {});
    return session;
  } catch (error) {
    await stopSession(session);
    throw error;
  }
}

async function stopSession(session: LspSession): Promise<void> {
  sessions.delete(session.id);
  rejectPending(session, new Error("LSP session closed"));
  try { notify(session, "shutdown", null); } catch {}
  try { session.process.kill(); } catch {}
  await rm(session.root, { recursive: true, force: true }).catch(() => undefined);
}

async function openDocument(session: LspSession, body: JsonObject): Promise<string> {
  const path = safeRelativePath(body.path, session.language);
  const filePath = join(session.workspace, path);
  const text = String(body.text || "");
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
  const uri = pathToFileURL(filePath).toString();
  notify(session, "textDocument/didOpen", { textDocument: { uri, languageId: String(body.languageId || session.language), version: Number(body.version || 1), text } });
  session.lastUsedAt = Date.now();
  return uri;
}

async function changeDocument(session: LspSession, body: JsonObject): Promise<string> {
  const path = safeRelativePath(body.path, session.language);
  const filePath = join(session.workspace, path);
  const text = String(body.text || "");
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf8");
  const uri = pathToFileURL(filePath).toString();
  notify(session, "textDocument/didChange", { textDocument: { uri, version: Number(body.version || Date.now()) }, contentChanges: [{ text }] });
  session.lastUsedAt = Date.now();
  return uri;
}

function diagnosticsFor(session: LspSession, uri: string): unknown[] {
  return session.diagnostics.get(uri) || [];
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.headers["x-studycod-lsp-secret"] !== SECRET) return json(res, 401, { message: "Unauthorized" });
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, sessions: sessions.size });

  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (req.method === "POST" && parts.length === 1 && parts[0] === "session") {
      const body = await readBody(req);
      const session = await startSession(languageOf(body.language));
      return json(res, 201, { sessionId: session.id, language: session.language });
    }
    if (parts[0] !== "session" || !parts[1]) return json(res, 404, { message: "Not found" });
    const session = sessions.get(parts[1]);
    if (!session) return json(res, 404, { message: "LSP session not found" });
    session.lastUsedAt = Date.now();
    if (req.method === "DELETE" && parts.length === 2) {
      await stopSession(session);
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && parts[2] === "open") {
      const uri = await openDocument(session, await readBody(req));
      return json(res, 200, { uri, diagnostics: diagnosticsFor(session, uri) });
    }
    if (req.method === "POST" && parts[2] === "change") {
      const uri = await changeDocument(session, await readBody(req));
      return json(res, 200, { uri, diagnostics: diagnosticsFor(session, uri) });
    }
    if (req.method === "GET" && parts[2] === "diagnostics") {
      const uri = String(url.searchParams.get("uri") || "");
      return json(res, 200, { diagnostics: diagnosticsFor(session, uri) });
    }
    if (req.method === "POST" && parts[2] === "request") {
      const body = await readBody(req);
      const result = await request(session, String(body.method || ""), body.params ?? {});
      const uri = typeof body.uri === "string" ? body.uri : "";
      return json(res, 200, { result, diagnostics: uri ? diagnosticsFor(session, uri) : [] });
    }
    return json(res, 404, { message: "Not found" });
  } catch (error) {
    return json(res, 502, { message: error instanceof Error ? error.message : "LSP bridge error" });
  }
}

const server = createServer((req, res) => { void route(req, res); });
server.listen(PORT, "127.0.0.1", () => console.log(`[studycod-lsp] listening on 127.0.0.1:${PORT}`));

const cleanup = async () => {
  for (const session of [...sessions.values()]) await stopSession(session);
  server.close(() => process.exit(0));
};
process.on("SIGTERM", () => { void cleanup(); });
process.on("SIGINT", () => { void cleanup(); });
setInterval(() => {
  const now = Date.now();
  for (const session of [...sessions.values()]) if (now - session.lastUsedAt > SESSION_TTL_MS) void stopSession(session);
}, 60_000).unref();
