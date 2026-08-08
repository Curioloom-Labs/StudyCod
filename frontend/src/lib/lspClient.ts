import type * as Monaco from "monaco-editor";
import { api } from "./api/client";

type LspLanguage = "java" | "cpp" | "c" | "python";
type JsonObject = Record<string, any>;

const connections = new Map<string, SemanticLspConnection>();
const providerRegistrations = new Set<string>();

function lspLanguage(language: string): LspLanguage | null {
  const normalized = language.toLowerCase();
  if (normalized === "java" || normalized === "python" || normalized === "cpp" || normalized === "c") return normalized;
  return null;
}

function requestConfig() {
  return { headers: { "X-Skip-Auth-Redirect": "1" } };
}

function toPosition(value: any): Monaco.IPosition {
  return { lineNumber: Number(value?.line ?? 0) + 1, column: Number(value?.character ?? 0) + 1 };
}

function toRange(value: any): Monaco.IRange {
  const start = toPosition(value?.start);
  const end = toPosition(value?.end);
  return { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
}

function formatMarkup(contents: any): string {
  if (typeof contents === "string") return contents;
  if (contents?.value) return String(contents.value);
  if (Array.isArray(contents)) return contents.map(formatMarkup).filter(Boolean).join("\n\n");
  return String(contents ?? "");
}

function applyDiagnostics(monaco: typeof Monaco, model: Monaco.editor.ITextModel, diagnostics: any[]): void {
  const markers = diagnostics.map(diagnostic => ({
    severity: Number(diagnostic?.severity) === 1 ? monaco.MarkerSeverity.Error : Number(diagnostic?.severity) === 2 ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
    message: String(diagnostic?.message || "Language server diagnostic"),
    startLineNumber: Math.max(1, Number(diagnostic?.range?.start?.line ?? 0) + 1),
    startColumn: Math.max(1, Number(diagnostic?.range?.start?.character ?? 0) + 1),
    endLineNumber: Math.max(1, Number(diagnostic?.range?.end?.line ?? diagnostic?.range?.start?.line ?? 0) + 1),
    endColumn: Math.max(1, Number(diagnostic?.range?.end?.character ?? diagnostic?.range?.start?.character ?? 0) + 1),
    source: String(diagnostic?.source || "LSP")
  }));
  monaco.editor.setModelMarkers(model, "studycod-lsp", markers);
}

function registerProviders(monaco: typeof Monaco, language: LspLanguage): void {
  if (providerRegistrations.has(language)) return;
  providerRegistrations.add(language);

  monaco.languages.registerHoverProvider(language, {
    provideHover: async (model, position) => {
      const connection = connections.get(model.uri.toString());
      if (!connection) return undefined;
      const response = await connection.request("textDocument/hover", {
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 }
      });
      if (!response?.result) return undefined;
      const contents = formatMarkup(response.result.contents);
      if (!contents) return undefined;
      return { range: response.result.range ? toRange(response.result.range) : undefined, contents: [{ value: contents }] };
    }
  });

  monaco.languages.registerDefinitionProvider(language, {
    provideDefinition: async (model, position) => {
      const connection = connections.get(model.uri.toString());
      if (!connection) return undefined;
      const response = await connection.request("textDocument/definition", {
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 }
      });
      const locations = Array.isArray(response?.result) ? response.result : response?.result ? [response.result] : [];
      return locations.map((location: any) => {
        const uri = String(location.uri || location.targetUri || model.uri.toString());
        const range = location.range || location.targetSelectionRange;
        return { uri: monaco.Uri.parse(uri), range: toRange(range) };
      });
    }
  });

  monaco.languages.registerReferenceProvider(language, {
    provideReferences: async (model, position, context) => {
      const connection = connections.get(model.uri.toString());
      if (!connection) return [];
      const response = await connection.request("textDocument/references", {
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 },
        context
      });
      return (Array.isArray(response?.result) ? response.result : []).map((location: any) => ({
        uri: monaco.Uri.parse(String(location.uri || model.uri.toString())),
        range: toRange(location.range)
      }));
    }
  });

  monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: [".", ":", "<", "("],
    provideCompletionItems: async (model, position) => {
      const connection = connections.get(model.uri.toString());
      if (!connection) return { suggestions: [] };
      const response = await connection.request("textDocument/completion", {
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 },
        context: { triggerKind: 1 }
      });
      const items = Array.isArray(response?.result) ? response.result : Array.isArray(response?.result?.items) ? response.result.items : [];
      return {
        suggestions: items.map((item: any) => ({
          label: item.label,
          kind: Number(item.kind || 1),
          detail: item.detail,
          documentation: typeof item.documentation === "string" ? item.documentation : formatMarkup(item.documentation),
          insertText: item.insertText || item.label,
          insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range: item.textEdit?.range ? toRange(item.textEdit.range) : undefined
        }))
      };
    }
  });

  monaco.languages.registerRenameProvider(language, {
    provideRenameEdits: async (model, position, newName) => {
      const connection = connections.get(model.uri.toString());
      if (!connection) return { edits: [] };
      const response = await connection.request("textDocument/rename", {
        textDocument: { uri: model.uri.toString() },
        position: { line: position.lineNumber - 1, character: position.column - 1 },
        newName
      });
      const changes = response?.result?.changes || {};
      const edits: Monaco.languages.IWorkspaceTextEdit[] = [];
      for (const [uri, uriEdits] of Object.entries(changes)) {
        for (const edit of (Array.isArray(uriEdits) ? uriEdits : [])) {
          edits.push({ resource: monaco.Uri.parse(uri), versionId: 0, textEdit: { range: toRange((edit as any).range), text: String((edit as any).newText || "") } });
        }
      }
      return { edits };
    }
  });
}

class SemanticLspConnection {
  private sessionId: string | null = null;
  private serverUri = "";
  private readonly ready: Promise<void>;
  private disposed = false;
  private version = 1;
  private diagnosticsTimer: number | null = null;

  constructor(
    private readonly monaco: typeof Monaco,
    private readonly model: Monaco.editor.ITextModel,
    private readonly language: LspLanguage,
    private readonly filePath: string,
    private readonly readOnly: boolean
  ) {
    registerProviders(monaco, language);
    this.ready = this.start();
  }

  private async start(): Promise<void> {
    const created = await api.post<{ sessionId: string }>("/lsp/session", { language: this.language }, requestConfig());
    if (this.disposed) return;
    this.sessionId = created.data.sessionId;
    const opened = await api.post<{ uri: string }>(`/lsp/session/${this.sessionId}/open`, {
      path: this.filePath,
      languageId: this.language,
      version: this.version,
      text: this.model.getValue()
    }, requestConfig());
    this.serverUri = opened.data.uri;
    this.refreshDiagnostics();
  }

  async request(method: string, params: JsonObject): Promise<JsonObject | null> {
    try {
      await this.ready;
      if (this.disposed || !this.sessionId) return null;
      const response = await api.post(`/lsp/session/${this.sessionId}/request`, { method, params: { ...params, textDocument: params.textDocument ? { ...params.textDocument, uri: this.serverUri } : params.textDocument }, uri: this.serverUri }, requestConfig());
      applyDiagnostics(this.monaco, this.model, response.data?.diagnostics || []);
      return response.data || null;
    } catch {
      return null;
    }
  }

  changed(): void {
    if (this.readOnly || this.disposed) return;
    this.version += 1;
    void this.ready.then(async () => {
      if (this.disposed || !this.sessionId) return;
      try {
        const response = await api.post(`/lsp/session/${this.sessionId}/change`, { path: this.filePath, version: this.version, text: this.model.getValue() }, requestConfig());
        applyDiagnostics(this.monaco, this.model, response.data?.diagnostics || []);
        this.refreshDiagnostics();
      } catch {}
    });
  }

  private refreshDiagnostics(): void {
    if (this.diagnosticsTimer !== null || !this.sessionId || this.disposed) return;
    this.diagnosticsTimer = window.setTimeout(async () => {
      this.diagnosticsTimer = null;
      try {
        if (!this.sessionId || this.disposed) return;
        const uri = encodeURIComponent(this.serverUri);
        const response = await api.get(`/lsp/session/${this.sessionId}/diagnostics?uri=${uri}`, requestConfig());
        applyDiagnostics(this.monaco, this.model, response.data?.diagnostics || []);
      } catch {}
    }, 450);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.diagnosticsTimer !== null) window.clearTimeout(this.diagnosticsTimer);
    try {
      await this.ready;
      if (this.sessionId) await api.delete(`/lsp/session/${this.sessionId}`, requestConfig());
    } catch {}
    connections.delete(this.model.uri.toString());
  }
}

export function connectStudyCodLsp(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  language: string,
  filePath: string,
  readOnly: boolean
): () => void {
  const resolved = lspLanguage(language);
  if (!resolved || typeof window === "undefined") return () => undefined;
  const key = model.uri.toString();
  const previous = connections.get(key);
  if (previous) void previous.dispose();
  const connection = new SemanticLspConnection(monaco, model, resolved, filePath || "Main.java", readOnly);
  connections.set(key, connection);
  const contentSubscription = model.onDidChangeContent(() => connection.changed());
  return () => {
    contentSubscription.dispose();
    void connection.dispose();
  };
}
