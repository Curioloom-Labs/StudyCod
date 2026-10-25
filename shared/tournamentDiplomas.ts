import { displayFontDataUrl, textFontDataUrl } from "./tournamentDiplomaFonts";

export type TournamentDiplomaVariant = "automatic" | "participant" | "1" | "2" | "3";

import { participantMedal, trophyCube } from "./tournamentArtwork";

const brandMark = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M35 20 C27 20 24 25 24 34 V41 C24 47 21 50 17 50 C21 50 24 53 24 59 V66 C24 75 27 80 35 80 M65 20 C73 20 76 25 76 34 V41 C76 47 79 50 83 50 C79 50 76 53 76 59 V66 C76 75 73 80 65 80" stroke="#68efb0" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M45 73 L55 27 M55 27 L50 32 M55 27 L58 34" stroke="#ffb454" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`;

export function createTournamentDiploma(variant: TournamentDiplomaVariant = "automatic", options: { signatureDataUrl?: string; organizerName?: string } = {}) {
  const place = variant === "automatic" ? "{{place}}" : variant === "participant" ? "" : variant;
  const signature = options.signatureDataUrl ?? "";
  if (signature && !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(signature)) throw new Error("INVALID_SIGNATURE_IMAGE");
  const organizer = options.organizerName ? options.organizerName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : "{{organizer}}";
  const awardLabel = variant === "automatic" ? `<span class="sc-for-winner">за {{place}} місце</span><span class="sc-for-participant">за участь у турнірі</span>` : variant === "participant" ? "за участь у турнірі" : `за ${variant} місце`;
  const htmlTemplate = `<main class="sc-diploma rank-${place}">
    <header class="sc-header"><div class="sc-brand"><span class="sc-brand-mark">${brandMark}</span><span>StudyCod</span></div><div class="sc-event-type">Турнір<br/>із програмування</div></header>
    <section class="sc-title-row"><h1>ДИПЛОМ</h1></section>
    <div class="sc-award">${awardLabel}</div>
    <div class="sc-award-art"><div class="sc-ordinal">${trophyCube()}${participantMedal()}</div></div>
    <section class="sc-recipient"><p class="sc-presented">Нагороджується</p><div class="sc-name">{{name}}</div><p class="sc-contest">{{contest_name}}</p></section>
    <footer class="sc-footer"><div class="sc-merit"><span>Дата проведення</span><strong>{{date}}</strong></div><div class="sc-verification"><img src="{{qr_code}}" alt="Перевірити диплом"/><div><span>{{certificate_id}}</span><small>Перевірка диплома</small></div></div><div class="sc-signature">${signature ? `<img class="sc-signature-image" src="${signature}" alt="Підпис організатора"/>` : ""}<div class="sc-signature-line"></div><div class="sc-signature-caption"><span>Організатор турніру</span><strong>${organizer}</strong></div></div></footer>
  </main>`;
  const cssTemplate = `
@font-face { font-family:SCFixelDisplay; src:url('${displayFontDataUrl}') format('woff2'); font-weight:800; font-style:normal; }
@font-face { font-family:SCFixelText; src:url('${textFontDataUrl}') format('woff2'); font-weight:400; font-style:normal; }
@page { size:A4 landscape; margin:0; }
* { box-sizing:border-box; }
html,body { width:297mm; height:210mm; margin:0; padding:0; }
.sc-diploma { --ink:#171b1a; --color:#193cef; position:relative; width:297mm; height:210mm; overflow:hidden; background:#fffefa; color:var(--ink); font-family:SCFixelText,Arial,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sc-diploma.rank-2 { --color:#284c58; }
.sc-diploma.rank-3 { --color:#ca482c; }
.sc-diploma.rank- { --color:#386b50; }
.sc-header { position:absolute; top:13mm; left:15mm; right:15mm; display:flex; align-items:center; justify-content:space-between; }
.sc-brand { display:flex; align-items:center; gap:9px; font-family:SCFixelDisplay,Arial,sans-serif; font-size:24px; letter-spacing:-1.2px; }
.sc-brand-mark { width:31px; height:31px; background:#172c22; border-radius:7px; display:block; }
.sc-brand-mark svg { width:100%; height:100%; }
.sc-event-type { font-size:12px; line-height:1.25; }
.sc-title-row { position:absolute; left:15mm; top:40mm; width:160mm; }
.sc-title-row h1 { margin:0; font-family:SCFixelDisplay,Arial,sans-serif; font-size:118px; line-height:1; letter-spacing:-6px; font-weight:800; }
.sc-award-art { position:absolute; inset:0; color:var(--color); pointer-events:none; }
.sc-ordinal { position:absolute; left:184mm; top:55mm; width:106mm; height:111.3mm; }
.sc-cube { width:100%; height:100%; }
.rank-2 .sc-ordinal { width:96mm; height:100.8mm; left:191mm; top:60mm; }
.rank-3 .sc-ordinal { width:86mm; height:90.3mm; left:198mm; top:65mm; }
.sc-medal { display:none; width:100%; height:100%; }
.rank- .sc-cube { display:none; }
.rank- .sc-medal { display:block; }
.rank- .sc-ordinal { width:82mm; height:82mm; left:201mm; top:69mm; }
.sc-award { position:absolute; left:15mm; top:76mm; font-size:24px; color:var(--color); line-height:1.2; }
.sc-for-participant { display:none; }
.rank- .sc-for-winner { display:none; }
.rank- .sc-for-participant { display:inline; }
.sc-recipient { position:absolute; top:109mm; left:15mm; width:155mm; }
.sc-presented { margin:0 0 9px; font-size:12px; line-height:1.2; }
.sc-name { max-width:155mm; font-family:SCFixelDisplay,Arial,sans-serif; font-size:41px; letter-spacing:-1.2px; line-height:1.13; overflow-wrap:anywhere; }
.sc-contest { margin:10px 0 0; max-width:155mm; font-size:18px; line-height:1.3; overflow-wrap:anywhere; color:#4f5652; }
.sc-footer { position:absolute; inset:0; pointer-events:none; }
.sc-merit { position:absolute; left:15mm; top:176mm; display:flex; flex-direction:column; gap:5px; }
.sc-merit span,.sc-signature-caption span { font-size:9px; color:#686d68; }
.sc-merit strong { font-size:13px; font-weight:400; }
.sc-verification { position:absolute; left:15mm; bottom:10mm; display:flex; align-items:center; gap:10px; }
.sc-verification>img { width:11mm; height:11mm; mix-blend-mode:multiply; }
.sc-verification>div { display:flex; flex-direction:column; gap:5px; }
.sc-verification span { font-size:8px; }
.sc-verification small { font-size:8px; color:#686d68; }
.sc-signature { position:absolute; left:75mm; bottom:9mm; width:100mm; height:34mm; }
.sc-signature-image { position:absolute; left:0; bottom:9.5mm; width:33mm; height:25mm; object-fit:contain; }
.sc-signature-line { position:absolute; left:0; bottom:9mm; width:34mm; border-top:1px solid #aeb8b0; }
.sc-signature-caption { position:absolute; bottom:7mm; left:39mm; width:61mm; display:flex; flex-direction:column; gap:6px; }
.sc-signature-caption strong { font-size:14px; line-height:1.3; font-weight:400; overflow-wrap:anywhere; }
`;
  return {
    name:`StudyCod · Код форми · ${variant === "automatic" ? "Автоматичний" : variant === "participant" ? "Учасник" : `${variant} місце`}`,
    type:"custom" as const, htmlTemplate, cssTemplate,
    fields:(["name", "contest_name", "place", "date", "organizer", "certificate_id", "qr_code"] as const).map(fieldKey => ({ fieldKey, isEnabled:true, isRequired:fieldKey === "name" })),
  };
}
