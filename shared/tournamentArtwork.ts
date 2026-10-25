function chipPins(): string {
  return Array.from({ length: 7 }, (_, i) => {
    const n = 38 + i * 7.35;
    return `<path d="M${n} 27 V34 M${n} 86 V93 M27 ${n} H34 M86 ${n} H93"/>`;
  }).join("");
}

function circuitFace(kind: "processor" | "memory" | "top"): string {
  const frame = `<path d="M14 8 H106 L112 14 V106 L106 112 H14 L8 106 V14 Z"/>`;
  if (kind === "memory") {
    return `${frame}<rect x="23" y="25" width="28" height="40" rx="2"/><rect x="65" y="65" width="31" height="24" rx="2"/><path d="M29 31 H45 V59 H29 Z M71 71 H90 V83 H71 Z M8 38 H16 V19 H37 V25 M8 82 H24 V71 H39 V65 M51 38 H63 V18 H89 V8 M51 53 H58 V57 H80 V65 M96 72 H112 M80 89 V103 H101 V112 M23 45 H16 V100 H47 V112 M65 77 H54 V96 H39"/><circle cx="37" cy="19" r="1.7"/><circle cx="89" cy="18" r="1.7"/><circle cx="24" cy="82" r="1.7"/><circle cx="54" cy="96" r="1.7"/>`;
  }
  const core = `<rect x="34" y="34" width="52" height="52" rx="3"/><rect x="41" y="41" width="38" height="38" rx="1"/><path d="M49 49 H71 V71 H49 Z"/>${chipPins()}`;
  const traces = `<path d="M8 22 H29 V14 H51 V27 M8 45 H19 V38 H27 M8 71 H18 V82 H27 M8 99 H42 V93 M69 8 V20 H84 V27 M112 27 H101 V38 H93 M112 58 H102 V65 H93 M112 97 H101 V84 H93 M81 112 V102 H71 V93 M30 112 V100 H38 V93"/><circle cx="29" cy="22" r="1.7"/><circle cx="19" cy="45" r="1.7"/><circle cx="18" cy="71" r="1.7"/><circle cx="102" cy="58" r="1.7"/><circle cx="81" cy="102" r="1.7"/>`;
  return `${frame}${core}${traces}${kind === "top" ? '<path d="M14 14 H22 M98 14 H106 M14 106 H22 M98 106 H106" stroke-width="2"/>' : ""}`;
}

export function trophyCube(): string {
  const front = circuitFace("processor");
  const side = circuitFace("memory");
  const top = circuitFace("top");
  return `<svg class="sc-cube" viewBox="0 0 280 294" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="sc-cube-top" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#dfe9ee"/></linearGradient>
      <linearGradient id="sc-cube-left" x1="0" x2="1" y1="0" y2=".4"><stop stop-color="#cadbe3"/><stop offset=".6" stop-color="#b9cdd8"/><stop offset="1" stop-color="#93acbc"/></linearGradient>
      <linearGradient id="sc-cube-right" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#f1f6f8"/><stop offset=".48" stop-color="#dfebf1"/><stop offset="1" stop-color="#bbd0dc"/></linearGradient>
      <linearGradient id="sc-cube-edge" x1="0" x2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#a5bccb"/></linearGradient>
    </defs>
    <path d="M30 80 L140 18 L250 80 L140 142 Z" fill="url(#sc-cube-top)"/>
    <path d="M30 80 L140 142 V266 L30 204 Z" fill="url(#sc-cube-left)"/>
    <path d="M140 142 L250 80 V204 L140 266 Z" fill="url(#sc-cube-right)"/>
    <path d="M30 80 L36 80 L140 137 L244 80 L250 80 L140 145 Z" fill="url(#sc-cube-edge)"/>
    <path d="M140 145 L143 144 V261 L140 266 L137 261 V144 Z" fill="#f2f7fa" opacity=".85"/>
    <g transform="matrix(.916667,.516667,0,1.033333,30,80)" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <g transform="translate(.7,-.6)" stroke="#f4f8fb" stroke-width="1.25">${side}</g><g stroke="#708c9e" stroke-width=".85">${side}</g>
    </g>
    <g transform="matrix(.916667,-.516667,0,1.033333,140,142)" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <g transform="translate(.6,-.6)" stroke="#fff" stroke-width="1.35">${front}</g><g stroke="#7895a8" stroke-width=".85">${front}</g>
      <rect x="49" y="49" width="22" height="22" fill="currentColor" fill-opacity=".07" stroke="currentColor" stroke-opacity=".35" stroke-width=".6"/>
    </g>
    <g transform="matrix(.916667,-.516667,.916667,.516667,30,80)" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <g transform="translate(.5,-.6)" stroke="#fff" stroke-width="1.35">${top}</g><g stroke="#829eaf" stroke-width=".85">${top}</g>
    </g>
    <path d="M30 80 L140 18 L250 80 V204 L140 266 L30 204 Z" fill="none" stroke="#829dac" stroke-opacity=".7" stroke-width=".85" stroke-linejoin="round"/>
    <path d="M31 80 L140 19 L249 80 M140 142 V264" fill="none" stroke="#fff" stroke-width="1.3"/>
  </svg>`;
}

export function participantMedal(): string {
  const face = circuitFace("processor");
  return `<svg class="sc-medal" viewBox="0 0 260 260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="sc-medal-metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6faf8"/><stop offset=".5" stop-color="#dce9e2"/><stop offset="1" stop-color="#a9c3b6"/></linearGradient></defs><path d="M45 22 H215 L238 45 V215 L215 238 H45 L22 215 V45 Z" fill="#a1b8ae"/><path d="M46 20 H214 L236 42 V212 L214 234 H46 L24 212 V42 Z" fill="url(#sc-medal-metal)" stroke="#8aa79a" stroke-width="1"/><path d="M49 29 H211 L227 46 V208 L211 225 H49 L33 208 V46 Z" fill="none" stroke="#fff" stroke-width="2"/><g transform="translate(54,54) scale(1.27)" fill="none" stroke-linejoin="round" stroke-linecap="round"><g transform="translate(.6,-.6)" stroke="#fff" stroke-width="1.4">${face}</g><g stroke="#799688" stroke-width=".9">${face}</g></g><circle cx="49" cy="46" r="7.5" fill="#8caa9c"/><circle cx="49" cy="45" r="5" fill="#416350" stroke="#6c897c" stroke-width="1.2"/><ellipse cx="49" cy="31" rx="10" ry="17" fill="none" stroke="#718e80" stroke-width="4"/><path d="M49 14 C36 14 36 48 49 48" fill="none" stroke="#f0f7f2" stroke-width="1.7"/></svg>`;
}
