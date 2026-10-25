import test from "node:test";
import assert from "node:assert/strict";
import { createTournamentDiploma } from "../../../../shared/tournamentDiplomas";
import { CertificateTemplateEngine } from "./CertificateTemplateEngine";

test("all four diploma designs import as self-contained custom templates and escape participant content", () => {
  const engine = new CertificateTemplateEngine();
  for (const variant of ["participant", "1", "2", "3", "automatic"] as const) {
    const template = JSON.parse(JSON.stringify(createTournamentDiploma(variant)));
    const html = engine.renderCustomTemplate({ ...template, payload: {
      name: '<script>alert("x")</script>', full_name: "", contest_name: "Contest & Code", place: variant === "participant" ? null : "1",
      score: 1, max_score: 10, date: "22.10.2026", organizer: "StudyCod", signature: "", certificate_id: "SC-DEMO", qr_code: "data:image/png;base64,AA==",
    } });
    assert.match(html, /size: A4 landscape/);
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("{{"));
    assert.ok(!html.includes("http://") || html.includes('xmlns="http://www.w3.org/2000/svg"'));
    assert.doesNotMatch(template.cssTemplate, /url\s*\(['"]?https?:|@import/);
    assert.ok(html.includes('class="sc-ordinal"'));
    assert.doesNotMatch(template.htmlTemplate, /sc-ribbon|sc-series-art|<image\b/);
    assert.ok(html.includes("data:font/woff2;base64,"));
  }
});

test("personal signatures are opt-in and data fonts do not permit remote CSS requests", () => {
  const unsigned = createTournamentDiploma();
  assert.ok(!unsigned.htmlTemplate.includes('class="sc-signature-image"'));
  const signed = createTournamentDiploma("1", { signatureDataUrl: "data:image/png;base64,AA==" });
  assert.ok(signed.htmlTemplate.includes('src="data:image/png;base64,AA=="'));
  assert.throws(() => createTournamentDiploma("1", { signatureDataUrl: 'https://example.test/signature.png' }), /INVALID_SIGNATURE_IMAGE/);
  const personalized = createTournamentDiploma("1", { organizerName: "Рубан Микита" });
  assert.ok(personalized.htmlTemplate.includes("Рубан Микита"));
  assert.ok(!personalized.htmlTemplate.includes("{{organizer}}"));
});
