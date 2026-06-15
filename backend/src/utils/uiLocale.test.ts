import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUiLocale, parseAcceptLanguage, resolveUiLocaleFromHeaders } from "./uiLocale";

test("normalizeUiLocale matches base tags and region variants", () => {
  assert.equal(normalizeUiLocale("en"), "en");
  assert.equal(normalizeUiLocale("en-US"), "en");
  assert.equal(normalizeUiLocale("uk-UA"), "uk");
  assert.equal(normalizeUiLocale("fr", "en"), "en", "unsupported → fallback");
  assert.equal(normalizeUiLocale(undefined, "en"), "en");
});

test("parseAcceptLanguage respects q-weights, not header position", () => {
  // The naive includes() approach returned 'en' here; correct answer is 'uk'.
  assert.deepEqual(parseAcceptLanguage("uk,en;q=0.5"), ["uk", "en"]);
  assert.deepEqual(parseAcceptLanguage("en;q=0.5, uk;q=0.9"), ["uk", "en"]);
  assert.deepEqual(parseAcceptLanguage("en-US,en;q=0.8"), ["en"], "deduped to one supported locale");
  assert.deepEqual(parseAcceptLanguage("fr,de"), [], "no supported locales");
});

test("parseAcceptLanguage drops q=0 and tolerates junk", () => {
  assert.deepEqual(parseAcceptLanguage("en;q=0, uk"), ["uk"]);
  assert.deepEqual(parseAcceptLanguage(""), []);
  assert.deepEqual(parseAcceptLanguage("en;q=notanumber"), ["en"]);
});

test("resolveUiLocaleFromHeaders: explicit app header wins over Accept-Language", () => {
  assert.equal(
    resolveUiLocaleFromHeaders({ "x-ui-language": "uk", "accept-language": "en" }, "en"),
    "uk"
  );
  assert.equal(resolveUiLocaleFromHeaders({ "x-lang": "en-GB" }, "uk"), "en");
});

test("resolveUiLocaleFromHeaders falls back when nothing matches", () => {
  assert.equal(resolveUiLocaleFromHeaders({ "accept-language": "fr,de" }, "en"), "en");
  assert.equal(resolveUiLocaleFromHeaders({}, "uk"), "uk");
  assert.equal(resolveUiLocaleFromHeaders(undefined, "en"), "en");
});

test("resolveUiLocaleFromHeaders uses best Accept-Language match by quality", () => {
  assert.equal(resolveUiLocaleFromHeaders({ "accept-language": "uk;q=0.3, en;q=0.9" }, "uk"), "en");
  assert.equal(resolveUiLocaleFromHeaders({ "accept-language": "en;q=0.3, uk;q=0.9" }, "en"), "uk");
});
