import type { ContestBannerTheme } from "../../lib/api/contests";

export const CONTEST_ICONS = ["🏆", "⚡", "🎯", "🧠", "🚀", "🧩", "💻", "📚", "🔥", "🌟"] as const;

export const CONTEST_BANNER_THEMES: Record<ContestBannerTheme, { label: string; background: string; glow: string }> = {
  forest: { label: "Ліс", background: "linear-gradient(125deg, #123a27 0%, #176b46 55%, #00a86b 100%)", glow: "rgba(0, 255, 136, .22)" },
  ocean: { label: "Океан", background: "linear-gradient(125deg, #102d48 0%, #17618a 55%, #18a7a0 100%)", glow: "rgba(56, 189, 248, .25)" },
  violet: { label: "Фіолет", background: "linear-gradient(125deg, #30204c 0%, #6543a0 55%, #ad5cc8 100%)", glow: "rgba(216, 180, 254, .23)" },
  sunset: { label: "Захід сонця", background: "linear-gradient(125deg, #532c2c 0%, #a95335 55%, #e99d42 100%)", glow: "rgba(255, 196, 92, .24)" },
};

export function contestTheme(value: string | null | undefined): ContestBannerTheme {
  return value && value in CONTEST_BANNER_THEMES ? value as ContestBannerTheme : "forest";
}
