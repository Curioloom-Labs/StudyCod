import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "katex/dist/katex.min.css";
import "./i18n";
import { App } from "./App";
import { initTheme } from "./theme";
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
    color: "#fff",
    backgroundColor: "#1a1a1a",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center"
  }}>
      <h1 style={{
      color: "#ef4444",
      marginBottom: "20px"
    }}>Loading Error</h1>
      <p style={{
      marginBottom: "10px",
      color: "#fbbf24"
    }}>{error?.message || "Unknown Error"}</p>
      {error?.stack && <pre style={{
      textAlign: "left",
      fontSize: "12px",
      color: "#9ca3af",
      maxWidth: "800px",
      overflow: "auto",
      marginBottom: "20px",
      padding: "10px",
      backgroundColor: "#0a0a0a",
      borderRadius: "4px"
    }}>
          {error.stack}
        </pre>}
      <button onClick={() => {
      window.location.reload();
    }} style={{
      padding: "10px 20px",
      backgroundColor: "#3b82f6",
      color: "#fff",
      border: "none",
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
  errorInfo?: string;
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
    if (import.meta.env.DEV) {
      console.error("App error:", error, errorInfo);
    }
    this.setState({
      errorInfo: errorInfo.componentStack
    });
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
        <BrowserRouter>
          <App />
        </BrowserRouter>
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
  wrap.style.color = "#fff";
  wrap.style.background = "#1a1a1a";
  wrap.style.minHeight = "100vh";
  const h1 = document.createElement("h1");
  h1.textContent = "Critical initialization error";
  h1.style.color = "#ef4444";
  const p = document.createElement("p");
  p.textContent = errorMessage;
  const pre = document.createElement("pre");
  pre.style.background = "#0a0a0a";
  pre.style.padding = "10px";
  pre.style.borderRadius = "4px";
  pre.style.overflow = "auto";
  pre.textContent = errorStack;
  const btn = document.createElement("button");
  btn.textContent = "Reload";
  btn.style.marginTop = "12px";
  btn.style.padding = "10px 20px";
  btn.style.backgroundColor = "#3b82f6";
  btn.style.color = "#fff";
  btn.style.border = "none";
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