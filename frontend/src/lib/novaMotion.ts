import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export const NOVA = {
  dur: { instant: 0.12, fast: 0.16, base: 0.22, slow: 0.3 },
  ease: { out: "power3.out", inOut: "power2.inOut", in: "power2.in", pop: "back.out(1.4)" },
  stagger: { tight: 0.025, base: 0.04 }
} as const;

let reducedMotionCache: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  if (reducedMotionCache === null) {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionCache = mql.matches;
    const onChange = (event: MediaQueryListEvent) => {
      reducedMotionCache = event.matches;
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
    } else if (typeof mql.addListener === "function") {
      mql.addListener(onChange);
    }
  }
  return reducedMotionCache;
}

export function novaDur(seconds: number): number {
  return prefersReducedMotion() ? 0 : seconds;
}
