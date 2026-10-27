/** Reveal a stacked lesson panel only when it is entirely outside the viewport. */
export function shouldRevealLivePanel(stacked: boolean, viewportHeight: number, top: number, bottom: number): boolean {
  return stacked && (top >= viewportHeight || bottom <= 0);
}

export function revealLivePanel(panel: HTMLElement | null): void {
  if (!panel || !window.matchMedia("(max-width: 1000px)").matches) return;
  requestAnimationFrame(() => {
    if (!panel.isConnected) return;
    const rect = panel.getBoundingClientRect();
    if (shouldRevealLivePanel(true, window.innerHeight, rect.top, rect.bottom)) {
      panel.scrollIntoView({ block: "start", behavior: "instant" });
    }
  });
}
