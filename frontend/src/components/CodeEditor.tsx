import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import loader from "@monaco-editor/loader";
import { useTranslation } from "react-i18next";
import type * as Monaco from "monaco-editor";
import { getCurrentTheme, type AppTheme } from "../theme";
import { connectStudyCodLsp } from "../lib/lspClient";

// Monaco's base CSS is required to correctly position/hide internal elements
// like the hidden input <textarea>. Without it, the editor can render with a
// big, resizable textarea overlay (browser default styles).
import "monaco-editor/min/vs/editor/editor.main.css";

let javaStdlibCompletionRegistered = false;
let studycodMonacoThemesRegistered = false;
let kotlinLanguageRegistered = false;
const snippetLanguagesRegistered = new Set<string>();
const languageServicesRegistered = new Set<string>();

type MonacoApi = typeof Monaco;
type MonacoDebugWindow = Window & {
  __monacoDebug?: {
    editor: Monaco.editor.IStandaloneCodeEditor;
    monaco: MonacoApi;
  };
};

export const ensureStudyCodMonacoThemes = (monaco: MonacoApi) => {
  if (!monaco || studycodMonacoThemesRegistered) return;
  studycodMonacoThemesRegistered = true;

  try {
    monaco.editor.defineTheme("studycod-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0f0f15",
        "editor.foreground": "#e8e8f0",
        "editorLineNumber.foreground": "#6a6a7f",
        "editorLineNumber.activeForeground": "#e8e8f0",
        "editorCursor.foreground": "#00ff88",
        "editor.selectionBackground": "#00ff8833",
        "editor.inactiveSelectionBackground": "#00ff881f",
        "editor.lineHighlightBackground": "#111118",
        "editorIndentGuide.background": "#2a2a3a",
        "editorIndentGuide.activeBackground": "#3a3a4d",
        "editorBracketMatch.background": "#00ff881a",
        "editorBracketMatch.border": "#00ff8866"
      }
    });

    monaco.editor.defineTheme("studycod-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#f1f4f9",
        "editor.foreground": "#0b1220",
        "editorLineNumber.foreground": "#6b778c",
        "editorLineNumber.activeForeground": "#0b1220",
        "editorCursor.foreground": "#00b35f",
        "editor.selectionBackground": "#00b35f33",
        "editor.inactiveSelectionBackground": "#00b35f1f",
        "editor.lineHighlightBackground": "#eef2f7",
        "editorIndentGuide.background": "#d6deea",
        "editorIndentGuide.activeBackground": "#b7c3d6",
        "editorBracketMatch.background": "#00b35f1a",
        "editorBracketMatch.border": "#00b35f66"
      }
    });
  } catch {
    // ignore
  }
};

const JAVA_UTIL_COMMON = [
  "Scanner",
  "ArrayList",
  "LinkedList",
  "List",
  "Map",
  "HashMap",
  "Set",
  "HashSet",
  "Queue",
  "Deque",
  "ArrayDeque",
  "Collections",
  "Arrays",
  "Random",
  "StringTokenizer"
];

const JAVA_LANG_COMMON = [
  "String",
  "StringBuilder",
  "Math",
  "Integer",
  "Long",
  "Double",
  "Boolean",
  "Character"
];

const registerJavaStdlibCompletions = (monaco: MonacoApi) => {
  if (!monaco || javaStdlibCompletionRegistered) return;
  javaStdlibCompletionRegistered = true;

  try {
    monaco.languages.registerCompletionItemProvider("java", {
      triggerCharacters: [".", "_"],
      provideCompletionItems: (model: Monaco.editor.ITextModel, position: Monaco.Position) => {
        try {
          const fullText = String(model?.getValue?.() ?? "");

          // Only offer these completions when the user is likely writing a typical EDU-style solution.
          // Without a Java LSP, Monaco can't know JDK symbols; this is a pragmatic UX layer.
          const hasJavaUtilImport = /\bimport\s+java\.util\.(\*|[A-Za-z0-9_]+)\s*;/.test(fullText);
          const hasJavaLangUsage = /\bclass\b|\bpublic\s+static\s+void\s+main\b/.test(fullText);
          if (!hasJavaUtilImport && !hasJavaLangUsage) return { suggestions: [] };

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };
          const prefix = String(word?.word ?? "");

          const mk = (label: string, detail: string): Monaco.languages.CompletionItem => ({
            label,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: label,
            detail,
            range
          });

          const suggestions: Monaco.languages.CompletionItem[] = [];

          // java.util.* common classes
          if (hasJavaUtilImport) {
            for (const name of JAVA_UTIL_COMMON) {
              if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                suggestions.push(mk(name, "java.util"));
              }
            }
          }

          // java.lang common classes (always available in Java)
          for (const name of JAVA_LANG_COMMON) {
            if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
              suggestions.push(mk(name, "java.lang"));
            }
          }

          return { suggestions };
        } catch {
          return { suggestions: [] };
        }
      }
    });
  } catch {
    // ignore
  }
};

const registerStudyCodSnippets = (monaco: MonacoApi, language: string) => {
  if (!monaco || snippetLanguagesRegistered.has(language)) return;
  snippetLanguagesRegistered.add(language);
  try {
    const snippetsByLanguage: Record<string, Array<Omit<Monaco.languages.CompletionItem, "range">>> = {
      java: [
        { label: "main", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "public static void main(String[] args) {\n\t$0\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "StudyCod main method" },
        { label: "fori", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for (int ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t$0\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Indexed for loop" },
        { label: "sout", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "System.out.println(${1:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Print a value" },
      ],
      python: [
        { label: "main", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "if __name__ == \"__main__\":\n\t$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Python entry point" },
        { label: "fori", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for ${1:item} in ${2:items}:\n\t$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Python for loop" },
      ],
      cpp: [
        { label: "main", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "int main() {\n\t$0\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "C++ main function" },
        { label: "fori", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Indexed for loop" },
      ],
    };
    const snippets = snippetsByLanguage[language];
    if (!snippets?.length) return;
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        return { suggestions: snippets.map((snippet) => ({ ...snippet, range })) };
      },
    });
  } catch {
    // Monaco may already have a provider for this language.
  }
};

type StudyCodSymbol = {
  name: string;
  kind: "class" | "function" | "variable";
  line: number;
  startColumn: number;
  endColumn: number;
  signature: string;
};

function collectStudyCodSymbols(text: string, language: string): StudyCodSymbol[] {
  const symbols: StudyCodSymbol[] = [];
  const patterns: Array<{ regex: RegExp; kind: StudyCodSymbol["kind"] }> = language === "python"
    ? [
        { regex: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\([^\n]*\)/gm, kind: "function" },
        { regex: /^\s*class\s+([A-Za-z_]\w*)/gm, kind: "class" },
        { regex: /^\s*([A-Za-z_]\w*)\s*=\s*[^=]/gm, kind: "variable" },
      ]
    : [
        { regex: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)*(?:class|interface|enum|struct)\s+([A-Za-z_]\w*)/gm, kind: "class" },
        { regex: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|inline\s+|virtual\s+|const\s+)*[\w:<>,\[\]]+\s+([A-Za-z_]\w*)\s*\([^\n]*\)\s*(?:\{|=>)/gm, kind: "function" },
        { regex: /^\s*(?:const\s+|static\s+|final\s+|unsigned\s+|mutable\s+)*(?:[A-Za-z_]\w*(?:<[^\n>]+>)?|auto|var|let|val)\s+([A-Za-z_]\w*)\s*(?:=|;)/gm, kind: "variable" },
      ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const name = String(match[1] ?? "");
      if (!name) continue;
      const before = text.slice(0, match.index ?? 0);
      const line = before.split("\n").length;
      const lineStart = before.lastIndexOf("\n") + 1;
      const nameStart = (match.index ?? 0) + String(match[0]).indexOf(name);
      const startColumn = nameStart - lineStart + 1;
      symbols.push({
        name,
        kind: pattern.kind,
        line,
        startColumn,
        endColumn: startColumn + name.length,
        signature: String(match[0]).trim(),
      });
    }
  }

  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.name}:${symbol.line}:${symbol.startColumn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function studyCodWordAt(model: Monaco.editor.ITextModel, position: Monaco.Position): string | null {
  return model.getWordAtPosition(position)?.word || null;
}

function studyCodWordRanges(monaco: MonacoApi, model: Monaco.editor.ITextModel, word: string) {
  const ranges: Monaco.IRange[] = [];
  const expression = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "g");
  const lines = model.getLinesContent();
  lines.forEach((line, lineIndex) => {
    for (const match of line.matchAll(expression)) {
      const start = Number(match.index ?? 0) + 1;
      ranges.push({ startLineNumber: lineIndex + 1, endLineNumber: lineIndex + 1, startColumn: start, endColumn: start + word.length });
    }
  });
  return ranges;
}

function maskStudyCodStringsAndComments(text: string): string {
  return text
    .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, (value) => value.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\n]/g, " "));
}

function refreshStudyCodMarkers(monaco: MonacoApi, model: Monaco.editor.ITextModel, language: string) {
  const source = model.getValue();
  const masked = maskStudyCodStringsAndComments(source);
  const markers: Monaco.editor.IMarkerData[] = [];
  const stack: Array<{ char: string; line: number; column: number }> = [];
  const opening: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closing = new Set(Object.values(opening));
  let line = 1;
  let column = 1;
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if (opening[char]) stack.push({ char, line, column });
    else if (closing.has(char)) {
      const expected = opening[stack[stack.length - 1]?.char || ""];
      if (!stack.length || expected !== char) {
        markers.push({ severity: monaco.MarkerSeverity.Error, message: `Unexpected '${char}'.`, startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column + 1 });
      } else stack.pop();
    }
    if (char === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  for (const item of stack.slice(-8)) {
    markers.push({ severity: monaco.MarkerSeverity.Error, message: `Unclosed '${item.char}'.`, startLineNumber: item.line, startColumn: item.column, endLineNumber: item.line, endColumn: item.column + 1 });
  }

  if (language === "python") {
    const lines = masked.split("\n");
    lines.forEach((line, index) => {
      if (/^\s*(?:if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(line) && !/:\s*$/.test(line)) {
        markers.push({ severity: monaco.MarkerSeverity.Warning, message: "This Python statement usually needs a trailing ':'.", startLineNumber: index + 1, startColumn: Math.max(1, line.trimEnd().length), endLineNumber: index + 1, endColumn: Math.max(2, line.trimEnd().length + 1) });
      }
    });
  }
  monaco.editor.setModelMarkers(model, "studycod-language-service", markers);
}

const registerStudyCodLanguageService = (monaco: MonacoApi, language: string) => {
  if (!monaco || languageServicesRegistered.has(language) || ["plaintext", "html", "css", "scheme"].includes(language)) return;
  languageServicesRegistered.add(language);
  try {
    monaco.languages.registerHoverProvider(language, {
      provideHover: (model, position) => {
        const word = studyCodWordAt(model, position);
        if (!word) return null;
        const symbol = collectStudyCodSymbols(model.getValue(), language).find((item) => item.name === word);
        if (!symbol) return null;
        return { range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: position.column - word.length, endColumn: position.column }, contents: [{ value: `**${symbol.kind}** \`${word}\`` }, { value: `\`${symbol.signature}\` · line ${symbol.line}` }] };
      },
    });
    monaco.languages.registerDefinitionProvider(language, {
      provideDefinition: (model, position) => {
        const word = studyCodWordAt(model, position);
        if (!word) return null;
        const symbol = collectStudyCodSymbols(model.getValue(), language).find((item) => item.name === word);
        if (!symbol) return null;
        return { uri: model.uri, range: { startLineNumber: symbol.line, endLineNumber: symbol.line, startColumn: symbol.startColumn, endColumn: symbol.endColumn } };
      },
    });
    monaco.languages.registerReferenceProvider(language, {
      provideReferences: (model, position) => {
        const word = studyCodWordAt(model, position);
        return word ? studyCodWordRanges(monaco, model, word).map((range) => ({ uri: model.uri, range })) : [];
      },
    });
    monaco.languages.registerRenameProvider(language, {
      provideRenameEdits: (model, position, newName) => {
        const word = studyCodWordAt(model, position);
        if (!word || !/^[A-Za-z_$][\w$]*$/.test(newName)) return { edits: [] };
        return { edits: studyCodWordRanges(monaco, model, word).map((range) => ({ resource: model.uri, versionId: model.getVersionId(), textEdit: { range, text: newName } })) };
      },
    });
  } catch {
    // Providers are best-effort and must not prevent Monaco from mounting.
  }
};

const registerKotlinHighlighting = (monaco: MonacoApi) => {
  if (!monaco || kotlinLanguageRegistered) return;
  kotlinLanguageRegistered = true;

  try {
    const existing = (monaco.languages?.getLanguages?.() ?? []).some((l: Monaco.languages.ILanguageExtensionPoint) => l?.id === "kotlin");
    if (!existing) {
      monaco.languages.register({ id: "kotlin", extensions: [".kt", ".kts"], aliases: ["Kotlin", "kotlin"] });
    }

    // A pragmatic Monarch tokenizer: good-enough highlighting without a full Kotlin LSP.
    const keywords = [
      "as",
      "break",
      "class",
      "continue",
      "do",
      "else",
      "false",
      "for",
      "fun",
      "if",
      "in",
      "interface",
      "is",
      "null",
      "object",
      "package",
      "return",
      "super",
      "this",
      "throw",
      "true",
      "try",
      "typealias",
      "val",
      "var",
      "when",
      "while",
      "catch",
      "finally",
      "import",
      "constructor",
      "init",
      "where",
      "by",
      "get",
      "set"
    ];

    const modifiers = [
      "public",
      "private",
      "protected",
      "internal",
      "open",
      "final",
      "abstract",
      "override",
      "lateinit",
      "data",
      "sealed",
      "inline",
      "noinline",
      "crossinline",
      "reified",
      "suspend",
      "tailrec",
      "operator",
      "infix",
      "const",
      "companion",
      "annotation",
      "enum"
    ];

    const kotlinAnyType = "An" + "y";
    const types = ["Int", "Long", "Short", "Byte", "Float", "Double", "Boolean", "Char", "String", "Unit", kotlinAnyType, "Nothing"];

    monaco.languages.setMonarchTokensProvider("kotlin", {
      defaultToken: "",
      tokenPostfix: ".kt",
      keywords,
      modifiers,
      types,
      tokenizer: {
        root: [
          [/\b\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?(?:[eE][+-]?\d+)?[fFdD]?\b/, "number"],
          [/0[xX][0-9a-fA-F_]+/, "number.hex"],
          [/0[bB][01_]+/, "number.binary"],

          [/\b(?:@)[A-Za-z_][\w$]*\b/, "annotation"],

          [/"""/, { token: "string.quote", next: "@rawString" }],
          [/"([^"\\]|\\.)*$/, "string.invalid"],
          [/"/, { token: "string.quote", next: "@string" }],
          [/'([^'\\]|\\.)*$/, "string.invalid"],
          [/'/, { token: "string.quote", next: "@char" }],

          [/\/\*.*\*\//, "comment"],
          [/\/\*/, { token: "comment", next: "@comment" }],
          [/\/\/.*$/, "comment"],

          [/`[^`]+`/, "identifier"],

          [/\b[A-Z][\w$]*\b/, "type.identifier"],
          [/\b([a-zA-Z_][\w$]*)\b/, {
            cases: {
              "@keywords": "keyword",
              "@modifiers": "keyword.modifier",
              "@types": "type",
              "@default": "identifier"
            }
          }],

          [/\{\{|\}\}|\{|\}|\(|\)|\[|\]/, "delimiter.bracket"],
          [/[,.;]/, "delimiter"],
          [/\+|\-|\*|\/|%|=|!|<|>|\?|:|\.|\|\||&&|\+\+|--|\+=|-=|\*=|\/=|%=/, "operator"],
          [/\s+/, "white"]
        ],
        comment: [
          [/[^/*]+/, "comment"],
          [/\*\//, { token: "comment", next: "@pop" }],
          [/[/\*]/, "comment"]
        ],
        string: [
          [/[^\\"$]+/, "string"],
          [/\\./, "string.escape"],
          [/\$\{[^}]*\}/, "string.interpolate"],
          [/\$[A-Za-z_][\w$]*/, "string.interpolate"],
          [/"/, { token: "string.quote", next: "@pop" }]
        ],
        rawString: [
          [/[^$]+/, "string"],
          [/\$\{[^}]*\}/, "string.interpolate"],
          [/\$[A-Za-z_][\w$]*/, "string.interpolate"],
          [/"""/, { token: "string.quote", next: "@pop" }]
        ],
        char: [
          [/[^\\']+/, "string"],
          [/\\./, "string.escape"],
          [/'/, { token: "string.quote", next: "@pop" }]
        ]
      }
    });

    monaco.languages.setLanguageConfiguration("kotlin", {
      comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"]
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "\"", close: "\"" },
        { open: "'", close: "'" },
        { open: "`", close: "`" }
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "\"", close: "\"" },
        { open: "'", close: "'" },
        { open: "`", close: "`" }
      ]
    });
  } catch {
    // ignore
  }
};
if (typeof window !== "undefined") {
  loader.config({
    paths: {
      vs: "/monaco-editor/min/vs"
    }
  });
}
const Editor = React.lazy(() => import("@monaco-editor/react").then(mod => ({
  default: mod.default
})));
interface Props {
  language: "JAVA" | "PYTHON" | "CPP" | "java" | "python" | "cpp" | "c" | "csharp" | "kotlin" | "js" | "go" | "rust" | "pascal" | "d" | "dart" | "haskell" | "lisp" | "lua" | "perl" | "php" | "ruby" | "swift" | "html" | "css" | "javascript";
  value: string;
  onChange?: (code: string) => void;
  readOnly?: boolean;
  height?: string | number;
  fontSize?: number;
  wordWrap?: boolean;
  /** Connect this model to the server-side semantic language server. */
  enableSemanticLsp?: boolean;
  /** Workspace-relative file name used by the language server. */
  filePath?: string;
  /** Shows a touch-friendly symbol row on phones. */
  showMobileToolbar?: boolean;
  /**
   * Exposes the underlying Monaco editor + api once mounted, so callers can
   * attach cursor listeners or decorations (e.g. the live code board's shared
   * teacher pointer). Optional; most usages don't need it.
   */
  onEditorMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: MonacoApi) => void;
}

const toMonacoLanguage = (language: Props["language"]) => {
  switch (language) {
    case "JAVA":
    case "java":
      return "java";
    case "PYTHON":
    case "python":
      return "python";
    case "CPP":
    case "cpp":
      return "cpp";
    case "c":
      // Monaco usually highlights C well under the shared C/C++ grammar.
      return "cpp";
    case "csharp":
      return "csharp";
    case "kotlin":
      return "kotlin";
    case "js":
      return "javascript";
    case "go":
      return "go";
    case "rust":
      return "rust";
    case "pascal":
      return "pascal";
    case "dart":
      return "dart";
    case "lua":
      return "lua";
    case "perl":
      return "perl";
    case "php":
      return "php";
    case "ruby":
      return "ruby";
    case "swift":
      return "swift";
    case "lisp":
      // Monaco has no Common Lisp grammar; Scheme is the closest s-expression highlighter.
      return "scheme";
    case "d":
      // No D grammar in Monaco; C++ highlighting is a close approximation.
      return "cpp";
    case "haskell":
      // No Haskell grammar shipped with Monaco.
      return "plaintext";
    case "html":
      return "html";
    case "css":
      return "css";
    case "javascript":
      return "javascript";
    default:
      return "plaintext";
  }
};
const createEditorOptions = (readOnly: boolean, fontSize = 14, wordWrap = false) => ({
  fontSize,
  fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', 'Fira Code', Consolas, Monaco, 'Courier New', monospace",
  fontLigatures: true,
  minimap: {
    enabled: true,
    renderCharacters: false,
    maxColumn: 120,
    showSlider: "mouseover" as const
  },
  readOnly,
  automaticLayout: true,
  lineNumbers: "on" as const,
  renderLineHighlight: "all" as const,
  renderLineHighlightOnlyWhenFocus: true,
  renderWhitespace: "selection" as const,
  cursorBlinking: "smooth" as const,
  folding: true,
  foldingHighlight: true,
  showFoldingControls: "mouseover" as const,
  stickyScroll: {
    enabled: true,
    maxLineCount: 3
  },
  hover: {
    enabled: true,
    delay: 250,
    above: false
  },
  parameterHints: {
    enabled: true,
    cycle: true
  },
  suggest: {
    showMethods: true,
    showFunctions: true,
    showClasses: true,
    showVariables: true,
    showSnippets: true,
    preview: true
  },
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false
  },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on" as const,
  padding: {
    top: 16,
    bottom: 16
  },
  wordWrap: (wordWrap ? "on" : "off") as "on" | "off",
  tabSize: 2,
  insertSpaces: true,
  bracketPairColorization: {
    enabled: true
  },
  guides: {
    indentation: true
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "off" as const,
  tabCompletion: "off" as const,
  // Enable word-based suggestions so we can autocomplete identifiers that exist
  // in the current file (e.g. `Scan` -> `Scanner` when `Scanner` is imported).
  // This does NOT provide full Java stdlib / type-aware completions (needs LSP),
  // but it covers the common "continue the word" UX.
  wordBasedSuggestions: "currentDocument" as const,
  wordBasedSuggestionsOnlySameLanguage: true,
  autoClosingBrackets: "always" as const,
  autoClosingQuotes: "always" as const,
  autoIndent: "advanced" as const,
  formatOnPaste: true,
  formatOnType: true,
  // Let Monaco surface built-in syntax diagnostics. Type-aware diagnostics
  // still require an LSP; the judge remains the source of truth for those.
  validate: true,
  workers: 1
});
export const CodeEditor: React.FC<Props> = React.memo(({
  language,
  value,
  onChange,
  readOnly = false,
  height,
  fontSize,
  wordWrap,
  enableSemanticLsp = true,
  filePath,
  onEditorMount,
  showMobileToolbar = true
}) => {
  const {
    i18n
  } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const monacoLang = useMemo(() => toMonacoLanguage(language), [language]);
  const editorOptions = useMemo(() => createEditorOptions(readOnly, fontSize, wordWrap), [readOnly, fontSize, wordWrap]);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [didMount, setDidMount] = useState(false);
  const [mountTimedOut, setMountTimedOut] = useState(false);
  const [loaderReady, setLoaderReady] = useState(false);
  const [loaderError, setLoaderError] = useState<string | null>(null);
  const [debugSize, setDebugSize] = useState<{ w: number; h: number } | null>(null);
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getCurrentTheme());
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const readTheme = () => {
      const t = getCurrentTheme();
      setAppTheme(t);
    };
    readTheme();
    const observer = new MutationObserver(() => readTheme());
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === "studycod_theme") readTheme();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const monacoTheme = appTheme === "light" ? "studycod-light" : "studycod-dark";

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    loader
      .init()
      .then(monaco => {
        if (cancelled) return;
        setLoaderReady(true);
        setLoaderError(null);

        // Ensure our customizations exist as soon as Monaco is available.
        ensureStudyCodMonacoThemes(monaco);
        registerKotlinHighlighting(monaco);
        if (monacoLang === "java") registerJavaStdlibCompletions(monaco);
        registerStudyCodSnippets(monaco, monacoLang);
      })
      .catch(err => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setLoaderReady(false);
        setLoaderError(msg);
      });

    return () => {
      cancelled = true;
    };
  }, [monacoLang]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setDebugSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    setDidMount(false);
    setMountTimedOut(false);
    const t = window.setTimeout(() => setMountTimedOut(true), 5000);
    return () => window.clearTimeout(t);
  }, [monacoLang, monacoTheme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const current = editor.getValue?.();
      if (typeof current === "string" && current !== value) {
        editor.setValue(value);
      }
    } catch {
      // ignore
    }
  }, [value]);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const tick = () => {
      try {
        editor.layout();
      } catch {}
    };
    const raf1 = requestAnimationFrame(tick);
    const raf2 = requestAnimationFrame(tick);
    const t = window.setTimeout(tick, 100);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t);
    };
  }, [monacoTheme]);
  useEffect(() => {
    const editor = editorRef.current;
    const el = containerRef.current;
    if (!editor || !el) return;
    if (typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try {
          editor.layout();
        } catch {}
      });
    };
    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    schedule();
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [monacoTheme, readOnly, monacoLang]);
  const handleChange = useMemo(() => (v: string | undefined) => {
    onChange?.(v ?? "");
  }, [onChange]);
  const insertFromMobileToolbar = (text: string, cursorInside = false) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (!editor || !model || !selection) return;

    const startOffset = model.getOffsetAt(selection.getStartPosition());
    editor.executeEdits("studycod.mobile-toolbar", [{
      range: selection,
      text,
      forceMoveMarkers: true,
    }]);

    const cursorOffset = cursorInside ? Math.max(0, text.length - 1) : text.length;
    editor.setPosition(model.getPositionAt(startOffset + cursorOffset));
    editor.focus();
  };

  return <div className="relative flex h-full min-h-0 w-full flex-col" style={height != null ? {
    height
  } : undefined}>
      {showMobileToolbar && !readOnly && <div className="md:hidden shrink-0 flex items-center gap-1 overflow-x-auto border-b border-border/70 bg-bg-hover/60 px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={tr("Швидкі символи", "Quick coding symbols")}>
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{tr("Код", "Code")}</span>
          {[
            { label: "{ }", value: "{}", inside: true },
            { label: "( )", value: "()", inside: true },
            { label: "[ ]", value: "[]", inside: true },
            { label: "\" \"", value: "\"\"", inside: true },
            { label: "=", value: "=" },
            { label: "=>", value: " => " },
            { label: ":", value: ":" },
            { label: ";", value: ";" },
            { label: "#", value: "#" },
            { label: "Tab", value: "\t" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="h-9 min-w-9 shrink-0 rounded-lg border border-border bg-bg-base px-2 font-mono text-sm text-text-primary active:bg-primary/15"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertFromMobileToolbar(item.value, item.inside)}
              aria-label={`${tr("Вставити", "Insert")} ${item.label}`}
            >
              {item.label}
            </button>
          ))}
        </div>}
      <div ref={containerRef} className="relative min-h-0 flex-1">
      {import.meta.env.DEV && mountTimedOut && !didMount && <div className="absolute inset-0 z-10 flex items-start justify-end p-2 pointer-events-none">
          <div className="pointer-events-none rounded border border-accent-warn/50 bg-bg-surface/80 px-3 py-2 text-xs font-mono text-text-secondary">
            Monaco did not mount (5s). Check console/network for <span className="text-text-primary">/monaco-editor/min/vs/</span>
          </div>
        </div>}
      {import.meta.env.DEV && <div className="absolute z-10 left-2 bottom-2 pointer-events-none">
          <div className="rounded border border-border bg-bg-surface/80 px-3 py-2 text-[11px] leading-4 font-mono text-text-secondary">
            <div>
              <span className="text-text-primary">Monaco debug</span>
            </div>
            <div>loader: {loaderError ? <span className="text-accent-error">error</span> : loaderReady ? <span className="text-accent-success">ready</span> : "loading"}</div>
            {loaderError && <div className="max-w-[520px] whitespace-pre-wrap break-words">{loaderError}</div>}
            <div>mount: {didMount ? <span className="text-accent-success">ok</span> : mountTimedOut ? <span className="text-accent-warn">timeout</span> : "pending"}</div>
            <div>lang: {monacoLang}</div>
            <div>theme: {monacoTheme}</div>
            <div>value: {value.length} chars</div>
            <div>container: {debugSize ? `${debugSize.w}×${debugSize.h}` : "?"}</div>
          </div>
        </div>}
      <Suspense fallback={<div className="h-full w-full flex items-center justify-center bg-bg-code border border-border">
            <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора...", "Loading editor...")}</div>
          </div>}>
        <Editor height="100%" width="100%" language={monacoLang} theme={monacoTheme} value={value} options={editorOptions} onChange={handleChange} beforeMount={(monaco: MonacoApi) => {
        // Theme must be defined before the editor instance is created.
        // Otherwise setting an unknown theme name can lead to a blank editor.
        ensureStudyCodMonacoThemes(monaco);

        // Register completions early as well.
        if (monacoLang === "java") {
          registerJavaStdlibCompletions(monaco);
        }
        registerStudyCodSnippets(monaco, monacoLang);
        registerStudyCodLanguageService(monaco, monacoLang);
      }} onMount={(editor: Monaco.editor.IStandaloneCodeEditor, monaco: MonacoApi) => {
        editorRef.current = editor;
        setDidMount(true);
        try {
          onEditorMount?.(editor, monaco);
        } catch {
          // a consumer error must never break editor mount
        }

        if (import.meta.env.DEV) {
          try {
            (window as MonacoDebugWindow).__monacoDebug = { editor, monaco };
          } catch {
            // ignore
          }
        }

        // (Safety) ensure theme/completions exist even if editor mounts before beforeMount fires.
        ensureStudyCodMonacoThemes(monaco);
        registerKotlinHighlighting(monaco);
        if (monacoLang === "java") registerJavaStdlibCompletions(monaco);
        registerStudyCodSnippets(monaco, monacoLang);
        registerStudyCodLanguageService(monaco, monacoLang);

        try {
          const model = editor.getModel();
          if (model) {
            refreshStudyCodMarkers(monaco, model, monacoLang);
            const markerSubscription = model.onDidChangeContent(() => refreshStudyCodMarkers(monaco, model, monacoLang));
            const lspDispose = enableSemanticLsp ? connectStudyCodLsp(monaco, model, monacoLang, filePath || (monacoLang === "python" ? "main.py" : monacoLang === "java" ? "Main.java" : "main.cpp"), readOnly) : () => undefined;
            editor.onDidDispose(() => {
              markerSubscription.dispose();
              lspDispose();
            });
          }
        } catch {
          // Diagnostics are optional; the editor remains usable without them.
        }

        try {
          editor.addAction({
            id: "studycod.formatDocument",
            label: "Format Document",
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL],
            run: async (ed: Monaco.editor.IStandaloneCodeEditor) => {
              try {
                const action = ed.getAction("editor.action.formatDocument");
                if (action) await action.run();
                return;
              } catch {}

              // Fallback that works even without a registered formatter.
              // Useful for Java/Python where formatters are typically not bundled.
              try {
                const reindent = ed.getAction("editor.action.reindentlines");
                if (reindent) await reindent.run();
              } catch {
                // ignore
              }
            }
          });
        } catch {
          // ignore
        }
        try {
          // Ensure the model contains the current value (extra safety for controlled usage).
          if (typeof value === "string") {
            const cur = editor.getValue?.();
            if (typeof cur === "string" && cur !== value) editor.setValue(value);
          }
          editor.layout();
        } catch {}
      }} loading={<div className="h-full w-full flex items-center justify-center bg-bg-code border border-border">
              <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора...", "Loading editor...")}</div>
            </div>} />
      </Suspense>
      </div>
    </div>;
});
CodeEditor.displayName = "CodeEditor";
