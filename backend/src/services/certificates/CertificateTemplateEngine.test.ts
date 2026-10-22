import test from "node:test";
import assert from "node:assert/strict";
import { CertificateTemplateEngine } from "./CertificateTemplateEngine";

const engine = new CertificateTemplateEngine();

function render(place: string | null) {
  return engine.renderCustomTemplate({
    htmlTemplate: '<main class="rank-{{place}}">{{name}}</main>',
    cssTemplate: "@font-face{font-family:Test;src:url('data:font/woff2;base64,Zm9v')} .x{background:url('https://example.com/image.png')}",
    payload: {
      contest_name: "StudyCod",
      name: "Учасник",
      full_name: "Учасник",
      place,
      score: 0,
      max_score: 0,
      date: "2026-10-22",
      organizer: "Рубан Микита",
      signature: "",
      certificate_id: "SC-1",
      qr_code: "data:image/png;base64,AA==",
    },
  });
}

test("custom diploma uses each confirmed award place and participation for null", () => {
  assert.match(render("1"), /class="rank-1"/);
  assert.match(render("2"), /class="rank-2"/);
  assert.match(render("3"), /class="rank-3"/);
  assert.match(render(null), /class="rank-"/);
});

test("custom diploma keeps embedded WOFF2 fonts and blocks external CSS URLs", () => {
  const html = render("1");
  assert.match(html, /data:font\/woff2;base64,Zm9v/);
  assert.doesNotMatch(html, /https:\/\/example\.com\/image\.png/);
});
