import React from "react";
import ReactDOM from "react-dom/client";
import "./public.css";
import { initTheme } from "./theme";
import { getMe } from "./lib/api/profile";

const PublicLandingPage = React.lazy(() => import("./pages/public/PublicLandingPage").then(mod => ({ default: mod.PublicLandingPage })));
let appStylesPromise: Promise<unknown> | null = null;

function ensureAppStyles() {
  appStylesPromise ??= import("./index.css");
  return appStylesPromise;
}

const AppShell = React.lazy(async () => {
  await ensureAppStyles();
  const [{ BrowserRouter }, { App }] = await Promise.all([
    import("react-router-dom"),
    import("./App"),
    import("./i18n"),
  ]);

  const RoutedApp: React.FC = () => (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );

  return { default: RoutedApp };
});

function shouldCheckCookieSession() {
  return window.location.pathname === "/" && !new URLSearchParams(window.location.search).has("auth");
}

/**
 * Keep the public homepage on a small route-level entry. The authenticated
 * workspace is intentionally not imported until the URL needs it.
 */
const RouteBootstrap: React.FC = () => {
  const [session, setSession] = React.useState<"checking" | "authenticated" | "anonymous">(() => (
    shouldCheckCookieSession() ? "checking" : "authenticated"
  ));

  React.useEffect(() => {
    if (!shouldCheckCookieSession()) return;
    let active = true;
    getMe({ force: true, suppressAuthRedirect: true })
      .then(() => active && setSession("authenticated"))
      .catch(() => active && setSession("anonymous"));
    return () => {
      active = false;
    };
  }, []);

  if (session === "checking") return null;
  return session === "anonymous" ? <PublicLandingPage /> : <AppShell />;
};

const CHUNK_RELOAD_KEY = "studycod.chunkReloadAttempted";
const CHUNK_LOAD_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed/i;

function extractErrorMessage(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message || "";
  if (reason && typeof reason === "object" && "message" in reason) {
    const msg = (reason as { message?: unknown }).message;
    return typeof msg === "string" ? msg : "";
  }
  return "";
}

function isChunkLoadError(reason: unknown): boolean {
  const message = extractErrorMessage(reason);
  return CHUNK_LOAD_ERROR_RE.test(message);
}

function reloadWithCacheBustOnce(): boolean {
  try {
    const attempted = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
    if (attempted) return false;

    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");

    const url = new URL(window.location.href);
    url.searchParams.set("__chunk_reload", String(Date.now()));
    window.location.replace(url.toString());
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}

// If the previous load succeeded after an auto-reload, clear the guard eventually
// so future deployments can recover once again in this session.
try {
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") {
    window.setTimeout(() => {
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        // ignore
      }
    }, 15000);
  }
} catch {
  // ignore
}

window.addEventListener("unhandledrejection", event => {
  if (!isChunkLoadError(event.reason)) return;
  event.preventDefault();
  reloadWithCacheBustOnce();
});

window.addEventListener("error", event => {
  // Script tag load errors may not always populate event.error.
  if (isChunkLoadError((event as ErrorEvent).error) || CHUNK_LOAD_ERROR_RE.test((event as ErrorEvent).message || "")) {
    reloadWithCacheBustOnce();
    return;
  }

  const target = event.target as HTMLScriptElement | null;
  if (target && target.tagName === "SCRIPT" && target.src && target.src.includes("/assets/")) {
    reloadWithCacheBustOnce();
  }
}, true);

initTheme();
const ErrorDisplay: React.FC<{
  error?: Error;
}> = ({
  error
}) => {
  return <div style={{
    padding: "20px",
    textAlign: "center",
    fontFamily: "monospace",
    color: "var(--text-primary, #e8e8f0)",
    backgroundColor: "var(--bg-surface, #111118)",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  }}>
      <h1 style={{
      color: "var(--accent-error, #ef4444)",
      marginBottom: "20px"
    }}>Loading Error</h1>
      <p style={{
      marginBottom: "10px",
      color: "var(--accent-warn, #fbbf24)"
    }}>{error?.message || "Unknown Error"}</p>
      {error?.stack && <pre style={{
      textAlign: "left",
      fontSize: "12px",
      color: "var(--text-muted, #9ca3af)",
      maxWidth: "800px",
      overflow: "auto",
      marginBottom: "20px",
      padding: "10px",
      backgroundColor: "var(--bg-base, #0a0a0f)",
      borderRadius: "4px"
    }}>
          {error.stack}
        </pre>}
      <button onClick={() => {
      window.location.reload();
    }} style={{
      padding: "10px 20px",
      backgroundColor: "var(--secondary, #3b82f6)",
      color: "var(--text-primary, #e8e8f0)",
      border: "1px solid var(--border, #2a2a3a)",
      borderRadius: "4px",
      cursor: "pointer",
      fontFamily: "monospace"
    }}>
        Reload
      </button>
    </div>;
};
class ErrorBoundary extends React.Component<{
  children: React.ReactNode;
  }, {
  hasError: boolean;
  error?: Error;
}> {
  constructor(props: {
    children: React.ReactNode;
  }) {
    super(props);
    this.state = {
      hasError: false
    };
  }
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      error
    };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      const handled = reloadWithCacheBustOnce();
      if (handled) return;
    }
    if (import.meta.env.DEV) {
      console.error("App error:", error, errorInfo);
    }
  }
  render() {
    if (this.state.hasError) {
      return <ErrorDisplay error={this.state.error} />;
    }
    return this.props.children;
  }
}
try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found!");
  }
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode>
      <ErrorBoundary>
        <React.Suspense fallback={null}>
          <RouteBootstrap />
        </React.Suspense>
      </ErrorBoundary>
    </React.StrictMode>);
} catch (error) {
  if (import.meta.env.DEV) {
    console.error("Failed to initialize app:", error);
  }
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack ?? "" : "";
  document.body.textContent = "";
  const wrap = document.createElement("div");
  wrap.style.padding = "20px";
  wrap.style.fontFamily = "monospace";
  wrap.style.color = "var(--text-primary, #e8e8f0)";
  wrap.style.background = "var(--bg-surface, #111118)";
  wrap.style.minHeight = "100vh";
  const h1 = document.createElement("h1");
  h1.textContent = "Critical initialization error";
  h1.style.color = "var(--accent-error, #ef4444)";
  const p = document.createElement("p");
  p.textContent = errorMessage;
  const pre = document.createElement("pre");
  pre.style.background = "var(--bg-base, #0a0a0f)";
  pre.style.padding = "10px";
  pre.style.borderRadius = "4px";
  pre.style.overflow = "auto";
  pre.textContent = errorStack;
  const btn = document.createElement("button");
  btn.textContent = "Reload";
  btn.style.marginTop = "12px";
  btn.style.padding = "10px 20px";
  btn.style.backgroundColor = "var(--secondary, #3b82f6)";
  btn.style.color = "var(--text-primary, #e8e8f0)";
  btn.style.border = "1px solid var(--border, #2a2a3a)";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";
  btn.style.fontFamily = "monospace";
  btn.addEventListener("click", () => window.location.reload());
  wrap.appendChild(h1);
  wrap.appendChild(p);
  if (errorStack) wrap.appendChild(pre);
  wrap.appendChild(btn);
  document.body.appendChild(wrap);
}
