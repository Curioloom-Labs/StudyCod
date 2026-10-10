import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import loader from "@monaco-editor/loader";
import { useTranslation } from "react-i18next";
import type * as Monaco from "monaco-editor";
import { getCurrentTheme, type AppTheme } from "../theme";
import { connectStudyCodLsp } from "../lib/lspClient";
import { JUDGE_ENTRY_FILES, JUDGE_MONACO_LANG, type JudgeLanguage } from "../lib/judgeLanguages";

let javaStdlibCompletionRegistered = false;
let studycodMonacoThemesRegistered = false;
let javascriptIoGlobalsRegistered = false;
let kotlinLanguageRegistered = false;
const snippetLanguagesRegistered = new Set<string>();
const languageServicesRegistered = new Set<string>();
const importCompletionLanguagesRegistered = new Set<string>();

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
        "editor.background": "#111612",
        "editor.foreground": "#e8eee7",
        "editorLineNumber.foreground": "#758278",
        "editorLineNumber.activeForeground": "#e8eee7",
        "editorCursor.foreground": "#a2cdaa",
        "editor.selectionBackground": "#8fbd9933",
        "editor.inactiveSelectionBackground": "#8fbd991f",
        "editor.lineHighlightBackground": "#171e19",
        "editorIndentGuide.background": "#2d3830",
        "editorIndentGuide.activeBackground": "#435247",
        "editorBracketMatch.background": "#8fbd991a",
        "editorBracketMatch.border": "#8fbd9966"
      }
    });

    monaco.editor.defineTheme("studycod-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#e9ece6",
        "editor.foreground": "#1b2720",
        "editorLineNumber.foreground": "#748178",
        "editorLineNumber.activeForeground": "#1b2720",
        "editorCursor.foreground": "#346f4b",
        "editor.selectionBackground": "#346f4b33",
        "editor.inactiveSelectionBackground": "#346f4b1f",
        "editor.lineHighlightBackground": "#f1f3ed",
        "editorIndentGuide.background": "#d8ded7",
        "editorIndentGuide.activeBackground": "#b9c5b9",
        "editorBracketMatch.background": "#346f4b1a",
        "editorBracketMatch.border": "#346f4b66"
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

type ImportCompletionSpec = {
  label: string;
  importText: string;
  detail?: string;
};

const IMPORT_COMPLETIONS: Record<string, ImportCompletionSpec[]> = {
  java: [
    { label: "Scanner", importText: "import java.util.Scanner;" },
    { label: "ArrayList", importText: "import java.util.ArrayList;" },
    { label: "HashMap", importText: "import java.util.HashMap;" },
    { label: "HashSet", importText: "import java.util.HashSet;" },
    { label: "List", importText: "import java.util.List;" },
    { label: "Map", importText: "import java.util.Map;" },
    { label: "Set", importText: "import java.util.Set;" },
    { label: "Queue", importText: "import java.util.Queue;" },
    { label: "Arrays", importText: "import java.util.Arrays;" },
    { label: "Collections", importText: "import java.util.Collections;" },
    { label: "StringTokenizer", importText: "import java.util.StringTokenizer;" },
    { label: "BufferedReader", importText: "import java.io.BufferedReader;" },
    { label: "File", importText: "import java.io.File;" },
    { label: "LocalDate", importText: "import java.time.LocalDate;" },
    { label: "BigInteger", importText: "import java.math.BigInteger;" },
  ],
  python: [
    { label: "Path", importText: "from pathlib import Path" },
    { label: "Counter", importText: "from collections import Counter" },
    { label: "defaultdict", importText: "from collections import defaultdict" },
    { label: "deque", importText: "from collections import deque" },
    { label: "datetime", importText: "from datetime import datetime" },
    { label: "List", importText: "from typing import List" },
    { label: "Dict", importText: "from typing import Dict" },
    { label: "Optional", importText: "from typing import Optional" },
    { label: "json", importText: "import json" },
    { label: "math", importText: "import math" },
    { label: "random", importText: "import random" },
    { label: "re", importText: "import re" },
    { label: "sys", importText: "import sys" },
    { label: "heapq", importText: "import heapq" },
  ],
  cpp: [
    { label: "iostream", importText: "#include <iostream>" },
    { label: "vector", importText: "#include <vector>" },
    { label: "string", importText: "#include <string>" },
    { label: "algorithm", importText: "#include <algorithm>" },
    { label: "map", importText: "#include <map>" },
    { label: "unordered_map", importText: "#include <unordered_map>" },
    { label: "set", importText: "#include <set>" },
    { label: "queue", importText: "#include <queue>" },
    { label: "stack", importText: "#include <stack>" },
    { label: "deque", importText: "#include <deque>" },
    { label: "sstream", importText: "#include <sstream>" },
    { label: "cmath", importText: "#include <cmath>" },
    { label: "limits", importText: "#include <limits>" },
    { label: "printf", importText: "#include <cstdio>" },
    { label: "strlen", importText: "#include <cstring>" },
  ],
  c: [
    { label: "printf", importText: "#include <stdio.h>" },
    { label: "scanf", importText: "#include <stdio.h>" },
    { label: "malloc", importText: "#include <stdlib.h>" },
    { label: "strlen", importText: "#include <string.h>" },
    { label: "qsort", importText: "#include <stdlib.h>" },
  ],
  csharp: [
    { label: "Console", importText: "using System;" },
    { label: "List", importText: "using System.Collections.Generic;" },
    { label: "Dictionary", importText: "using System.Collections.Generic;" },
    { label: "Enumerable", importText: "using System.Linq;" },
    { label: "StringBuilder", importText: "using System.Text;" },
    { label: "File", importText: "using System.IO;" },
    { label: "DateTime", importText: "using System;" },
  ],
  kotlin: [
    { label: "Scanner", importText: "import java.util.Scanner" },
    { label: "StringTokenizer", importText: "import java.util.StringTokenizer" },
    { label: "BufferedReader", importText: "import java.io.BufferedReader" },
    { label: "File", importText: "import java.io.File" },
    { label: "LocalDate", importText: "import java.time.LocalDate" },
  ],
  javascript: [
    { label: "readFileSync", importText: 'import { readFileSync } from "node:fs"' },
    { label: "writeFileSync", importText: 'import { writeFileSync } from "node:fs"' },
    { label: "join", importText: 'import { join } from "node:path"' },
    { label: "resolve", importText: 'import { resolve } from "node:path"' },
    { label: "randomUUID", importText: 'import { randomUUID } from "node:crypto"' },
    { label: "createServer", importText: 'import { createServer } from "node:http"' },
  ],
  go: [
    { label: "fmt", importText: 'import "fmt"' },
    { label: "bufio", importText: 'import "bufio"' },
    { label: "os", importText: 'import "os"' },
    { label: "strings", importText: 'import "strings"' },
    { label: "strconv", importText: 'import "strconv"' },
    { label: "sort", importText: 'import "sort"' },
    { label: "time", importText: 'import "time"' },
  ],
  rust: [
    { label: "HashMap", importText: "use std::collections::HashMap;" },
    { label: "HashSet", importText: "use std::collections::HashSet;" },
    { label: "io", importText: "use std::io::{self, Read};" },
    { label: "fs", importText: "use std::fs;" },
    { label: "Ordering", importText: "use std::cmp::Ordering;" },
  ],
  pascal: [
    { label: "TStringList", importText: "uses SysUtils, Classes;" },
    { label: "Format", importText: "uses SysUtils;" },
    { label: "Sqrt", importText: "uses Math;" },
  ],
  dart: [
    { label: "jsonDecode", importText: "import 'dart:convert';" },
    { label: "File", importText: "import 'dart:io';" },
    { label: "Platform", importText: "import 'dart:io';" },
    { label: "Future", importText: "import 'dart:async';" },
  ],
  haskell: [
    { label: "sort", importText: "import Data.List (sort)" },
    { label: "nub", importText: "import Data.List (nub)" },
    { label: "Map", importText: "import qualified Data.Map as Map" },
    { label: "Set", importText: "import qualified Data.Set as Set" },
  ],
  d: [
    { label: "std.stdio", importText: "import std.stdio;" },
    { label: "std.algorithm", importText: "import std.algorithm;" },
    { label: "std.array", importText: "import std.array;" },
    { label: "std.conv", importText: "import std.conv;" },
    { label: "std.string", importText: "import std.string;" },
  ],
  lua: [
    { label: "cjson", importText: 'local cjson = require("cjson")' },
    { label: "socket", importText: 'local socket = require("socket")' },
    { label: "lfs", importText: 'local lfs = require("lfs")' },
  ],
  perl: [
    { label: "decode_json", importText: "use JSON qw(decode_json);" },
    { label: "encode_json", importText: "use JSON qw(encode_json);" },
    { label: "sum", importText: "use List::Util qw(sum);" },
    { label: "max", importText: "use List::Util qw(max);" },
  ],
  php: [
    { label: "DateTime", importText: "use DateTime;" },
    { label: "json_encode", importText: "use function json_encode;" },
    { label: "json_decode", importText: "use function json_decode;" },
  ],
  ruby: [
    { label: "JSON", importText: "require 'json'" },
    { label: "Set", importText: "require 'set'" },
    { label: "Date", importText: "require 'date'" },
    { label: "CSV", importText: "require 'csv'" },
  ],
  swift: [
    { label: "Foundation", importText: "import Foundation" },
    { label: "URLSession", importText: "import Foundation" },
    { label: "UIKit", importText: "import UIKit" },
  ],
};

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function hasImport(text: string, importText: string): boolean {
  const normalized = importText.trim().replace(/;$/, "");
  if (!normalized) return false;
  return new RegExp(`(^|\\n)\\s*${escapeRegExp(normalized)}\\s*;?\\s*(?=\\n|$)`, "m").test(text);
}

function importInsertionLine(model: Monaco.editor.ITextModel, language: string): number {
  const lines = model.getLinesContent();
  const normalized = language.toLowerCase();
  let lastHeaderLine = 0;
  const headerPattern = normalized === "cpp" || normalized === "c"
    ? /^\s*#include\b/
    : normalized === "go"
      // Separate import declarations are valid in Go and avoid corrupting an
      // existing import (...) block.
      ? /^\s*package\b/
      : normalized === "d"
        ? /^\s*(?:module|import)\b/
      : normalized === "php"
        ? /^\s*<\?php\b/
        : normalized === "haskell"
          ? /^\s*(?:module\b|import\b)/
          : normalized === "pascal"
            ? /^\s*(?:program\b|unit\b|uses\b)/i
            : normalized === "python"
              ? /^\s*(?:#!|#.*coding[:=]|from\s+__future__\s+import\b|import\b|from\b)/
              : normalized === "rust"
                ? /^\s*(?:#!\[|extern\s+crate\b|use\b)/
                : normalized === "csharp"
                  ? /^\s*using\b/
                  : normalized === "lua"
                    ? /^\s*(?:local\s+\w+\s*=\s*)?require\s*\(/
                    : normalized === "ruby"
                      ? /^\s*(?:require|gem)\b/
                      : normalized === "perl"
                        ? /^\s*(?:use|require)\b/
                        : normalized === "java" || normalized === "kotlin"
                          ? /^\s*(?:package|import)\b/
                          : /^\s*(?:import|require)\b/;

  for (let index = 0; index < lines.length; index += 1) {
    if (headerPattern.test(lines[index])) lastHeaderLine = index + 1;
  }

  if (normalized === "php" && lastHeaderLine > 0) return lastHeaderLine + 1;
  return lastHeaderLine > 0 ? lastHeaderLine + 1 : 1;
}

function importEditFor(model: Monaco.editor.ITextModel, language: string, importText: string): Monaco.editor.ISingleEditOperation | undefined {
  if (hasImport(model.getValue(), importText)) return undefined;
  const lineNumber = importInsertionLine(model, language);
  return {
    range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 },
    text: `${importText}\n`,
  };
}

function registerImportCompletions(monaco: MonacoApi, language: string): void {
  const sourceLanguage = language.toLowerCase();
  const normalized = sourceLanguage === "js" || sourceLanguage === "typescript" ? "javascript" : sourceLanguage;
  const specs = normalized === "cpp"
    ? [...(IMPORT_COMPLETIONS.cpp || []), ...(IMPORT_COMPLETIONS.c || [])]
    : IMPORT_COMPLETIONS[normalized];
  if (!monaco || !specs?.length || importCompletionLanguagesRegistered.has(normalized)) return;
  importCompletionLanguagesRegistered.add(normalized);

  try {
    monaco.languages.registerCompletionItemProvider(normalized, {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const prefix = word.word.trim();
        if (!prefix) return { suggestions: [] };
        const simpleRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = specs
          .filter((spec) => spec.label.toLowerCase().startsWith(prefix.toLowerCase()))
          .map((spec) => {
            const importEdit = importEditFor(model, normalized, spec.importText);
            let range = simpleRange;
            let insertText = spec.label;
            let additionalTextEdits = importEdit ? [importEdit] : undefined;

            // Monaco forbids overlapping main/additional edits. If the user is
            // completing on the first line, fold the import into one edit.
            if (importEdit && importEdit.range.startLineNumber === position.lineNumber) {
              const line = model.getLineContent(position.lineNumber);
              const completedLine = `${line.slice(0, word.startColumn - 1)}${spec.label}${line.slice(word.endColumn - 1)}`;
              range = { startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: line.length + 1 };
              insertText = `${spec.importText}\n${completedLine}`;
              additionalTextEdits = undefined;
            }

            return {
              label: spec.label,
              kind: monaco.languages.CompletionItemKind.Module,
              detail: spec.detail || `Add import: ${spec.importText}`,
              documentation: "Adds import: " + spec.importText,
              insertText,
              range,
              additionalTextEdits,
            } as Monaco.languages.CompletionItem;
          });

        return { suggestions };
      },
    });
  } catch {
    // Import suggestions are optional and must never block the editor.
  }
}

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
            range,
            additionalTextEdits: detail === "java.util" ? (() => {
              const edit = importEditFor(model, "java", `import java.util.${label};`);
              return edit ? [edit] : undefined;
            })() : undefined,
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
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "java.util.Scanner ${1:sc} = new java.util.Scanner(System.in);\n${2:String} ${3:value} = ${1:sc}.nextLine();\nSystem.out.println(${3:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      python: [
        { label: "main", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "if __name__ == \"__main__\":\n\t$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Python entry point" },
        { label: "fori", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for ${1:item} in ${2:items}:\n\t$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Python for loop" },
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "${1:value} = input().strip()\nprint(${1:value})$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read a line and print a value" },
      ],
      cpp: [
        { label: "main", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "int main() {\n\t$0\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "C++ main function" },
        { label: "fori", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Indexed for loop" },
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "${1:type} ${2:value};\ncin >> ${2:value};\ncout << ${2:value} << '\\n';$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a value" },
      ],
      javascript: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "const ${1:value} = readline();\nprint(${1:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read one input line and print a value" },
      ],
      c: [
        { label: "main", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "int main(void) {\n\t$0\n\treturn 0;\n}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "C entry point" },
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "int ${1:value};\nscanf(\"%d\", &${1:value});\nprintf(\"%d\\n\", ${1:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print an integer" },
      ],
      csharp: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "string ${1:value} = Console.ReadLine() ?? string.Empty;\nConsole.WriteLine(${1:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      kotlin: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "val ${1:value} = readln()\nprintln(${1:value})$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      go: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "in := bufio.NewReader(os.Stdin)\n${1:value}, _ := in.ReadString('\\n')\nos.Stdout.WriteString(${1:value})$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line (bufio, os)" },
      ],
      rust: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "let mut ${1:value} = String::new();\nstd::io::stdin().read_line(&mut ${1:value}).unwrap();\nprintln!(\"{}\", ${1:value}.trim());$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      pascal: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "readln(${1:value});\nwriteln(${1:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      d: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "auto ${1:value} = readln().strip();\nwriteln(${1:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line (std.stdio)" },
      ],
      dart: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "final ${1:value} = stdin.readLineSync() ?? '';\nstdout.writeln(${1:value});$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line (dart:io)" },
      ],
      haskell: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "${1:value} <- getLine\nputStrLn ${1:value}$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      lisp: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "(define ${1:value} (read-line))\n(display ${1:value})\n(newline)$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      lua: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "local ${1:value} = io.read()\nprint(${1:value})$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      perl: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "my ${1:$value} = <STDIN>;\nprint ${1:$value};$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      php: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "${1:$value} = trim(fgets(STDIN));\necho ${1:$value}, PHP_EOL;$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      ruby: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "${1:value} = STDIN.gets&.chomp\nputs ${1:value}$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
      ],
      swift: [
        { label: "io", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "if let ${1:value} = readLine() {\n    print(${1:value})\n}$0", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "Read and print a line" },
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

function studyCodWordRanges(model: Monaco.editor.ITextModel, word: string) {
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
  const markers: Monaco.editor.IMarkerData[] = [];
  if (language === "python") {
    const lines = maskStudyCodStringsAndComments(model.getValue()).split("\n");
    lines.forEach((line, index) => {
      if (/^\s*(?:if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(line) && !/:\s*$/.test(line)) {
        markers.push({ severity: monaco.MarkerSeverity.Warning, message: "This Python statement usually needs a trailing ':'.", startLineNumber: index + 1, startColumn: Math.max(1, line.trimEnd().length), endLineNumber: index + 1, endColumn: Math.max(2, line.trimEnd().length + 1) });
      }
    });
  }
  // Do not run a hand-written, language-agnostic bracket parser over user code:
  // valid syntax such as Haskell comments, language-specific strings, and macros
  // was being marked as an error even though the judge accepts it.
  monaco.editor.setModelMarkers(model, "studycod-language-service", markers);
}

const registerStudyCodLanguageService = (monaco: MonacoApi, language: string) => {
  if (!monaco || languageServicesRegistered.has(language) || ["plaintext", "html", "css", "scheme"].includes(language)) return;
  languageServicesRegistered.add(language);
  try {
    if (language === "javascript" && !javascriptIoGlobalsRegistered) {
      javascriptIoGlobalsRegistered = true;
      monaco.typescript.javascriptDefaults.addExtraLib(
        "declare function readline(): string;\ndeclare function print(...values: unknown[]): void;\n",
        "file:///studycod-competitive-io.d.ts"
      );
    }
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
        return word ? studyCodWordRanges(model, word).map((range) => ({ uri: model.uri, range })) : [];
      },
    });
    monaco.languages.registerRenameProvider(language, {
      provideRenameEdits: (model, position, newName) => {
        const word = studyCodWordAt(model, position);
        if (!word || !/^[A-Za-z_$][\w$]*$/.test(newName)) return { edits: [] };
        return { edits: studyCodWordRanges(model, word).map((range) => ({ resource: model.uri, versionId: model.getVersionId(), textEdit: { range, text: newName } })) };
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
let monacoLoadPromise: Promise<MonacoApi> | null = null;
const monacoLanguageLoadPromises = new Map<string, Promise<unknown>>();
const customJudgeLanguagesRegistered = new Set<string>();

function registerCustomJudgeLanguage(
  monaco: MonacoApi,
  id: string,
  extension: string,
  alias: string,
  languageDefinition: Monaco.languages.IMonarchLanguage,
  comments: { lineComment: string; blockComment?: [string, string] },
) {
  try {
    const exists = (monaco.languages.getLanguages?.() ?? []).some((entry) => entry.id === id);
    if (!exists) monaco.languages.register({ id, extensions: [extension], aliases: [alias, id] });
    monaco.languages.setMonarchTokensProvider(id, languageDefinition);
    monaco.languages.setLanguageConfiguration(id, {
      comments,
      brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
      autoClosingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" }, { open: "\"", close: "\"" }, { open: "'", close: "'" }],
      surroundingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" }, { open: "\"", close: "\"" }, { open: "'", close: "'" }],
    });
  } catch {
    // A language grammar must never prevent Monaco from opening the editor.
  }
}

const registerJudgeLanguageModes = (monaco: MonacoApi) => {
  if (!monaco) return;
  if (!customJudgeLanguagesRegistered.has("c")) {
    customJudgeLanguagesRegistered.add("c");
    registerCustomJudgeLanguage(monaco, "c", ".c", "C", {
      defaultToken: "",
      tokenPostfix: ".c",
      keywords: ["auto", "break", "case", "char", "const", "continue", "default", "do", "double", "else", "enum", "extern", "float", "for", "goto", "if", "inline", "int", "long", "register", "restrict", "return", "short", "signed", "sizeof", "static", "struct", "switch", "typedef", "union", "unsigned", "void", "volatile", "while"],
      typeKeywords: ["bool", "size_t", "FILE", "int8_t", "int16_t", "int32_t", "int64_t", "uint8_t", "uint16_t", "uint32_t", "uint64_t"],
      tokenizer: {
        root: [[/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@typeKeywords": "type", "@default": "identifier" } }],
          [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[uUlLfF]*/, "number"], [/"([^"\\]|\\.)*$/, "string.invalid"], [/"/, { token: "string.quote", next: "@string" }], [/'([^'\\]|\\.)*$/, "string.invalid"], [/'/, { token: "string.quote", next: "@character" }],
          [/\/\*/, { token: "comment", next: "@comment" }], [/\/\/.*$/, "comment"], [/#[ \t]*[a-zA-Z_]+/, "keyword.directive"], [/[{}()\[\]]/, "@brackets"], [/[;,.]/, "delimiter"], [/[=<>!~?:&|+\-*\/%^]+/, "operator"]],
        comment: [[/[^*/]+/, "comment"], [/\*\//, { token: "comment", next: "@pop" }], [/./, "comment"]],
        string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, { token: "string.quote", next: "@pop" }]],
        character: [[/[^\\']+/, "string"], [/\\./, "string.escape"], [/'/, { token: "string.quote", next: "@pop" }]],
      },
    }, { lineComment: "//", blockComment: ["/*", "*/"] });
  }
  if (!customJudgeLanguagesRegistered.has("d")) {
    customJudgeLanguagesRegistered.add("d");
    registerCustomJudgeLanguage(monaco, "d", ".d", "D", {
      defaultToken: "",
      tokenPostfix: ".d",
      keywords: ["abstract", "alias", "align", "asm", "assert", "auto", "body", "bool", "break", "byte", "case", "cast", "catch", "class", "const", "continue", "dchar", "debug", "default", "delegate", "delete", "deprecated", "do", "double", "else", "enum", "export", "extern", "false", "final", "finally", "float", "for", "foreach", "foreach_reverse", "function", "goto", "if", "immutable", "import", "in", "inout", "int", "interface", "invariant", "is", "lazy", "long", "mixin", "module", "new", "nothrow", "null", "out", "override", "package", "pragma", "private", "protected", "public", "pure", "real", "ref", "return", "scope", "shared", "short", "static", "string", "struct", "super", "switch", "synchronized", "template", "this", "throw", "true", "try", "typeid", "typeof", "ubyte", "uint", "ulong", "union", "unittest", "ushort", "version", "void", "volatile", "wchar", "while", "with"],
      tokenizer: {
        root: [[/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }], [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[uUlLfF]*/, "number"], [/"([^"\\]|\\.)*$/, "string.invalid"], [/"/, { token: "string.quote", next: "@string" }], [/`/, { token: "string.quote", next: "@rawString" }],
          [/\/\+/, { token: "comment", next: "@nestedComment" }], [/\/\*/, { token: "comment", next: "@comment" }], [/\/\/.*$/, "comment"], [/[{}()\[\]]/, "@brackets"], [/[;,.]/, "delimiter"], [/[=<>!~?:&|+\-*\/%^]+/, "operator"]],
        comment: [[/[^*]+/, "comment"], [/\*\//, { token: "comment", next: "@pop" }], [/\*/, "comment"]],
        nestedComment: [[/[^/+]+/, "comment"], [/\/\+/, { token: "comment", next: "@push" }], [/\+\//, { token: "comment", next: "@pop" }], [/[+/]/, "comment"]],
        string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, { token: "string.quote", next: "@pop" }]],
        rawString: [[/[^`]+/, "string"], [/`/, { token: "string.quote", next: "@pop" }]],
      },
    }, { lineComment: "//", blockComment: ["/*", "*/"] });
  }
  if (!customJudgeLanguagesRegistered.has("haskell")) {
    customJudgeLanguagesRegistered.add("haskell");
    registerCustomJudgeLanguage(monaco, "haskell", ".hs", "Haskell", {
      defaultToken: "",
      tokenPostfix: ".hs",
      keywords: ["as", "case", "class", "data", "default", "deriving", "do", "else", "family", "forall", "foreign", "hiding", "if", "import", "in", "infix", "infixl", "infixr", "instance", "let", "mdo", "module", "newtype", "of", "qualified", "then", "type", "where"],
      tokenizer: {
        root: [[/[A-Z][\w']*/, "type.identifier"], [/[a-z_][\w']*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }], [/\d+(?:\.\d+)?/, "number"], [/'(?:\\.|[^'\\])'/, "string"], [/"([^"\\]|\\.)*$/, "string.invalid"], [/"/, { token: "string.quote", next: "@string" }],
          [/{-/, { token: "comment", next: "@nestedComment" }], [/--.*$/, "comment"], [/[{}()\[\]]/, "@brackets"], [/[;,]/, "delimiter"], [/[:=<>!~?&|+\-*\/%^\\.]+/, "operator"]],
        nestedComment: [[/{-/, { token: "comment", next: "@push" }], [/-}/, { token: "comment", next: "@pop" }], [/./, "comment"]],
        string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, { token: "string.quote", next: "@pop" }]],
      },
    }, { lineComment: "--", blockComment: ["{-", "-}"] });
  }
  if (!customJudgeLanguagesRegistered.has("lisp")) {
    customJudgeLanguagesRegistered.add("lisp");
    registerCustomJudgeLanguage(monaco, "lisp", ".lisp", "Common Lisp", {
      defaultToken: "",
      tokenPostfix: ".lisp",
      keywords: ["block", "catch", "cond", "declare", "defconstant", "defmacro", "defparameter", "defun", "defvar", "do", "dolist", "dotimes", "ecase", "flet", "function", "if", "labels", "lambda", "let", "let*", "loop", "macrolet", "multiple-value-bind", "or", "prog1", "progn", "quote", "return", "return-from", "setq", "tagbody", "the", "throw", "unless", "unwind-protect", "when", "with-open-file"],
      tokenizer: {
        root: [[/;.*$/, "comment"], [/#\|/, { token: "comment", next: "@blockComment" }], [/"([^"\\]|\\.)*$/, "string.invalid"], [/"/, { token: "string.quote", next: "@string" }],
          [/#\\(?:.|name)/, "string"], [/[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, "number"], [/[()]/, "@brackets"], [/[a-zA-Z*+!_$%&<=>?@^~:\-][\w*+!_$%&<=>?@^~:\-]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }], [/[`'#,\.]/, "operator"]],
        blockComment: [[/#\|/, { token: "comment", next: "@push" }], [/\|#/, { token: "comment", next: "@pop" }], [/./, "comment"]],
        string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, { token: "string.quote", next: "@pop" }]],
      },
    }, { lineComment: ";" });
  }
};

const monacoLanguageLoaders: Record<string, () => Promise<unknown>> = {
  java: () => import("monaco-editor/esm/vs/basic-languages/java/java.contribution"),
  python: () => import("monaco-editor/esm/vs/basic-languages/python/python.contribution"),
  cpp: () => import("monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution"),
  csharp: () => import("monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution"),
  kotlin: () => import("monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution"),
  javascript: () => import("monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution"),
  go: () => import("monaco-editor/esm/vs/basic-languages/go/go.contribution"),
  rust: () => import("monaco-editor/esm/vs/basic-languages/rust/rust.contribution"),
  pascal: () => import("monaco-editor/esm/vs/basic-languages/pascal/pascal.contribution"),
  dart: () => import("monaco-editor/esm/vs/basic-languages/dart/dart.contribution"),
  lua: () => import("monaco-editor/esm/vs/basic-languages/lua/lua.contribution"),
  perl: () => import("monaco-editor/esm/vs/basic-languages/perl/perl.contribution"),
  php: () => import("monaco-editor/esm/vs/basic-languages/php/php.contribution"),
  ruby: () => import("monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution"),
  swift: () => import("monaco-editor/esm/vs/basic-languages/swift/swift.contribution"),
  typescript: () => import("monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution"),
  html: () => import("monaco-editor/esm/vs/basic-languages/html/html.contribution"),
  css: () => import("monaco-editor/esm/vs/basic-languages/css/css.contribution"),
  xml: () => import("monaco-editor/esm/vs/basic-languages/xml/xml.contribution"),
  sql: () => import("monaco-editor/esm/vs/basic-languages/sql/sql.contribution"),
};

/**
 * Keep Monaco out of the application entry chunk. The editor API and worker
 * are fetched only when an editor is rendered; the selected language grammar
 * is loaded independently on demand.
 */
export const loadStudyCodMonaco = (language?: string): Promise<MonacoApi> => {
  if (!monacoLoadPromise) {
    monacoLoadPromise = Promise.all([
      import("monaco-editor/esm/vs/editor/editor.api"),
      import("monaco-editor/esm/vs/editor/editor.worker?worker"),
      import("monaco-editor/min/vs/editor/editor.main.css?inline"),
    ]).then(([monaco, editorWorker, cssModule]) => {
      const cssModuleValue = cssModule as { default?: unknown };
      const cssText = typeof cssModuleValue?.default === "string" ? cssModuleValue.default : "";
      if (cssText && typeof document !== "undefined" && !document.head.querySelector("style[data-studycod-monaco]")) {
        const style = document.createElement("style");
        style.dataset.studycodMonaco = "true";
        style.textContent = cssText;
        document.head.appendChild(style);
      }
      const worker = editorWorker.default;
      (globalThis as typeof globalThis & {
        MonacoEnvironment?: { getWorker: () => Worker };
      }).MonacoEnvironment = {
        getWorker: () => new worker(),
      };
      loader.config({ monaco });
      return monaco as MonacoApi;
    });
  }
  if (!language) return monacoLoadPromise;

  const loadLanguage = monacoLanguageLoaders[language];
  if (!loadLanguage) return monacoLoadPromise;
  const languagePromise = monacoLanguageLoadPromises.get(language) ?? loadLanguage();
  monacoLanguageLoadPromises.set(language, languagePromise);
  return monacoLoadPromise.then(async monaco => {
    await languagePromise;
    return monaco;
  });
};

const Editor = React.lazy(async () => {
  await loadStudyCodMonaco();
  const mod = await import("@monaco-editor/react");
  return { default: mod.default };
});
interface Props {
  language: JudgeLanguage | Uppercase<JudgeLanguage> | "html" | "css" | "javascript";
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
  /** Focus and reveal a source line after the editor has mounted. */
  focusLine?: number | null;
  /**
   * Exposes the underlying Monaco editor + api once mounted, so callers can
   * attach cursor listeners or decorations (e.g. the live code board's shared
   * teacher pointer). Optional; most usages don't need it.
   */
  onEditorMount?: (editor: Monaco.editor.IStandaloneCodeEditor, monaco: MonacoApi) => void;
}

const toMonacoLanguage = (language: Props["language"]) => {
  const normalized = String(language).toLowerCase();
  if (normalized === "html" || normalized === "css" || normalized === "javascript") return normalized;
  return JUDGE_MONACO_LANG[normalized as JudgeLanguage] ?? "plaintext";
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
  // Formatting on every keystroke makes the editor compete with diagnostics
  // and language services for the main thread. Formatting is still available
  // through paste and the explicit formatter action below.
  formatOnType: false,
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
  showMobileToolbar = true,
  focusLine = null,
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

    loadStudyCodMonaco(monacoLang)
      .then(() => loader.init())
      .then(monaco => {
        if (cancelled) return;
        setLoaderReady(true);
        setLoaderError(null);

        // Ensure our customizations exist as soon as Monaco is available.
        ensureStudyCodMonacoThemes(monaco);
        registerJudgeLanguageModes(monaco);
        registerKotlinHighlighting(monaco);
        if (monacoLang === "java") registerJavaStdlibCompletions(monaco);
        registerImportCompletions(monaco, language);
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
  }, [monacoLang, language]);

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
    if (!editor || !Number.isFinite(focusLine) || Number(focusLine) < 1) return;
    try {
      const model = editor.getModel();
      if (!model) return;
      const lineNumber = Math.min(Math.floor(Number(focusLine)), model.getLineCount());
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: 1 });
      editor.focus();
    } catch {
      // A line jump is a convenience; never let it break the editor.
    }
  }, [focusLine]);
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
            Monaco did not mount (5s). Check the browser console and bundled editor assets.
          </div>
        </div>}
      {import.meta.env.DEV && new URLSearchParams(window.location.search).get("debugEditor") === "1" && <div className="absolute z-10 left-2 bottom-2 pointer-events-none">
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
      {loaderReady ? <Suspense fallback={<div className="h-full w-full flex items-center justify-center bg-bg-code border border-border">
            <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора…", "Loading editor…")}</div>
          </div>}>
        <Editor height="100%" width="100%" language={monacoLang} theme={monacoTheme} value={value} options={editorOptions} onChange={handleChange} beforeMount={(monaco: MonacoApi) => {
        // Theme must be defined before the editor instance is created.
        // Otherwise setting an unknown theme name can lead to a blank editor.
        ensureStudyCodMonacoThemes(monaco);
        registerJudgeLanguageModes(monaco);

        // Register completions early as well.
        if (monacoLang === "java") {
          registerJavaStdlibCompletions(monaco);
        }
        registerImportCompletions(monaco, language);
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
        registerJudgeLanguageModes(monaco);
        registerKotlinHighlighting(monaco);
        if (monacoLang === "java") registerJavaStdlibCompletions(monaco);
        registerImportCompletions(monaco, language);
        registerStudyCodSnippets(monaco, monacoLang);
        registerStudyCodLanguageService(monaco, monacoLang);

        try {
          const model = editor.getModel();
          if (model) {
            refreshStudyCodMarkers(monaco, model, monacoLang);
            let markerTimer: number | null = null;
            const scheduleMarkers = () => {
              if (markerTimer !== null) window.clearTimeout(markerTimer);
              markerTimer = window.setTimeout(() => {
                markerTimer = null;
                refreshStudyCodMarkers(monaco, model, monacoLang);
              }, 120);
            };
            const markerSubscription = model.onDidChangeContent(scheduleMarkers);
            // Read-only previews do not need a dedicated language-server process.
            // Starting one for every preview (especially JDTLS) made opening pages
            // compete with the active editor and delayed completions.
            const defaultFilePath = (JUDGE_ENTRY_FILES[String(language).toLowerCase() as JudgeLanguage] ?? "main.cpp");
            const lspDispose = enableSemanticLsp && !readOnly ? connectStudyCodLsp(monaco, model, monacoLang, filePath || defaultFilePath, readOnly) : () => undefined;
            editor.onDidDispose(() => {
              markerSubscription.dispose();
              if (markerTimer !== null) window.clearTimeout(markerTimer);
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
              <div className="text-text-secondary font-mono text-sm">{tr("Завантаження редактора…", "Loading editor…")}</div>
            </div>} />
      </Suspense> : <div className="flex h-full w-full items-center justify-center border border-border bg-bg-code">
        <div className="text-text-secondary font-mono text-sm">
          {loaderError ? tr("Редактор тимчасово недоступний.", "The editor is temporarily unavailable.") : tr("Завантаження редактора…", "Loading editor…")}
        </div>
      </div>}
      </div>
    </div>;
});
CodeEditor.displayName = "CodeEditor";
