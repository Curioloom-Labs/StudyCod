import { afterEach, describe, expect, it, vi } from "vitest";
import { revealLivePanel, shouldRevealLivePanel } from "./livePanelNavigation";

describe("live lesson panel visibility", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reveals an offscreen stacked panel above or below the viewport", () => {
    expect(shouldRevealLivePanel(true, 800, 1200, 1600)).toBe(true);
    expect(shouldRevealLivePanel(true, 800, -500, 0)).toBe(true);
  });

  it("does not move a visible panel or a desktop side panel", () => {
    expect(shouldRevealLivePanel(true, 800, 700, 1100)).toBe(false);
    expect(shouldRevealLivePanel(false, 800, 1200, 1600)).toBe(false);
  });

  it("scrolls to an offscreen mobile panel after the view updates", () => {
    const scrollIntoView = vi.fn();
    const panel = { isConnected: true, getBoundingClientRect: () => ({ top: 1200, bottom: 1600 }), scrollIntoView } as unknown as HTMLElement;
    vi.stubGlobal("window", { innerHeight: 800, matchMedia: () => ({ matches: true }) });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    revealLivePanel(panel);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  });

  it("does not scroll a disconnected panel", () => {
    const scrollIntoView = vi.fn();
    const panel = { isConnected: false, scrollIntoView } as unknown as HTMLElement;
    vi.stubGlobal("window", { innerHeight: 800, matchMedia: () => ({ matches: true }) });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback());
    revealLivePanel(panel);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
