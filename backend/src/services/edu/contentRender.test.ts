import test from "node:test";
import assert from "node:assert/strict";
import { renderPageContent, safeHttpUrl, youtubeEmbedUrl } from "./contentRender";

test("safeHttpUrl accepts http/https, rejects everything else", () => {
  assert.equal(safeHttpUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeHttpUrl("http://example.com"), "http://example.com/");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("ftp://x"), null);
  assert.equal(safeHttpUrl("not a url"), null);
  assert.equal(safeHttpUrl(""), null);
  assert.equal(safeHttpUrl(undefined), null);
});

test("youtubeEmbedUrl handles watch, short, youtu.be, embed; rejects non-youtube", () => {
  assert.equal(youtubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(youtubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(youtubeEmbedUrl("https://www.youtube.com/shorts/abcdefghijk"), "https://www.youtube-nocookie.com/embed/abcdefghijk");
  assert.equal(youtubeEmbedUrl("https://example.com/watch?v=x"), null);
});

test("renderPageContent embeds a YouTube video as a no-cookie iframe", () => {
  const html = renderPageContent("Lesson", { videoUrl: "https://youtu.be/dQw4w9WgXcQ" });
  assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(html, /<iframe/);
  assert.match(html, /<h3>Lesson<\/h3>/);
});

test("renderPageContent uses a <video> tag for direct media files", () => {
  const html = renderPageContent("V", { videoUrl: "https://cdn.example.com/clip.mp4" });
  assert.match(html, /<video controls src="https:\/\/cdn\.example\.com\/clip\.mp4">/);
});

test("renderPageContent renders a document link with a label", () => {
  const html = renderPageContent("Doc", { docUrl: "https://example.com/handout.pdf", docLabel: "Handout" });
  assert.match(html, /href="https:\/\/example\.com\/handout\.pdf"/);
  assert.match(html, />Handout</);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("renderPageContent keeps authored body and escapes the title", () => {
  const html = renderPageContent("A & B <x>", { html: "<p>hi</p>" });
  assert.match(html, /<p>hi<\/p>/);
  assert.match(html, /A &amp; B &lt;x&gt;/);
});

test("renderPageContent drops unsafe video URLs", () => {
  const html = renderPageContent("X", { videoUrl: "javascript:alert(1)", html: "body" });
  assert.equal(html.includes("javascript:"), false);
  assert.match(html, /body/);
});

test("renderPageContent returns empty string when there is nothing to show", () => {
  assert.equal(renderPageContent("Empty", {}), "");
  assert.equal(renderPageContent("Empty", null), "");
});
