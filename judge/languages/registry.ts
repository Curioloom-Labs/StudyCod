import type { LanguageAdapter, LanguageId } from "./types";
import { javaLanguage } from "./java";
import { pythonLanguage } from "./python";
import { cppLanguage } from "./cpp";
import { cLanguage } from "./c";
import { csharpLanguage } from "./csharp";
import { kotlinLanguage } from "./kotlin";
import { jsLanguage } from "./js";
import { goLanguage } from "./go";
import { rustLanguage } from "./rust";
import { pascalLanguage } from "./pascal";
import {
  dLanguage,
  dartLanguage,
  haskellLanguage,
  lispLanguage,
  luaLanguage,
  perlLanguage,
  phpLanguage,
  rubyLanguage,
  swiftLanguage
} from "./extra";

/**
 * Single source of truth for language families. Adding a language is one adapter + one
 * entry here; the engine (entry filename, default limits, compile budget, chroot keys,
 * validation) derives everything from this registry.
 */
export const LANGUAGES: Record<LanguageId, LanguageAdapter> = {
  java: javaLanguage,
  python: pythonLanguage,
  cpp: cppLanguage,
  c: cLanguage,
  csharp: csharpLanguage,
  kotlin: kotlinLanguage,
  js: jsLanguage,
  go: goLanguage,
  rust: rustLanguage,
  pascal: pascalLanguage,
  d: dLanguage,
  dart: dartLanguage,
  haskell: haskellLanguage,
  lisp: lispLanguage,
  lua: luaLanguage,
  perl: perlLanguage,
  php: phpLanguage,
  ruby: rubyLanguage,
  swift: swiftLanguage
};

export const LANGUAGE_IDS: readonly LanguageId[] = Object.keys(LANGUAGES) as LanguageId[];

export function isLanguageId(v: unknown): v is LanguageId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(LANGUAGES, v);
}

export function getLanguage(id: LanguageId): LanguageAdapter {
  return LANGUAGES[id];
}
