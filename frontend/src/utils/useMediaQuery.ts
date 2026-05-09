import React from "react";

function getMatches(query: string, fallback: boolean): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return fallback;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return fallback;
  }
}

export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = React.useState<boolean>(() => getMatches(query, fallback));

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setMatches(fallback);
      return;
    }

    let media: MediaQueryList;
    try {
      media = window.matchMedia(query);
    } catch {
      setMatches(fallback);
      return;
    }

    const update = () => {
      setMatches(media.matches);
    };

    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, [query, fallback]);

  return matches;
}