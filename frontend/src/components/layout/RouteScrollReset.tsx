import React from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** The legacy root route uses `app` to select a different screen. */
export function scrollPageKey(pathname: string, search: string): string {
  if (pathname !== "/") return pathname;
  const app = new URLSearchParams(search).get("app") || "home";
  return `${pathname}?app=${app}`;
}

/** Start newly opened pages at the top without disturbing tabs or back navigation. */
export const RouteScrollReset: React.FC = () => {
  const { pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();
  const pageKey = scrollPageKey(pathname, search);
  const previousPage = React.useRef(pageKey);

  React.useLayoutEffect(() => {
    const changedPage = previousPage.current !== pageKey;
    previousPage.current = pageKey;
    if (!changedPage || navigationType === "POP" || hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const main = document.getElementById("main-content");
    if (main) {
      main.scrollTop = 0;
      main.scrollLeft = 0;
    }
  }, [pageKey, hash, navigationType]);

  return null;
};
