import type { Page } from "playwright";

/** Keep long recipient/contest names clear of the fixed signature area. */
export async function fitTournamentDiploma(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    const root = document.querySelector('.sc-diploma');
    if (!root) return;
    const name = root.querySelector('.sc-name');
    const contest = root.querySelector('.sc-contest');
    const recipient = root.querySelector('.sc-recipient');
    const merit = root.querySelector('.sc-merit');
    const signature = root.querySelector('.sc-signature-image');
    if (!name || !contest || !recipient || !merit) return;
    const initialSize = parseFloat(getComputedStyle(name).fontSize) || 41;
    const footerTop = Math.min(merit.getBoundingClientRect().top, signature ? signature.getBoundingClientRect().top : Infinity);
    for (let size = initialSize; size >= 16; size--) {
      name.style.fontSize = size + 'px';
      contest.style.fontSize = Math.max(11, Math.round(size * 18 / initialSize)) + 'px';
      if (recipient.getBoundingClientRect().bottom <= footerTop - 14) break;
    }
  })()`);
}
