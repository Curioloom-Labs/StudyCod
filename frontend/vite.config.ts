import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

function deferMonacoStyles() {
  return {
    name: "defer-monaco-styles",
    apply: "build" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string) {
        // The generated editor chunk already loads these CSS files through
        // Vite's dynamic-import dependency map. Keeping them out of
        // index.html prevents non-editor routes from downloading Monaco styles.
        return html.replace(/\s*<link rel="stylesheet" crossorigin href="\/assets\/monaco-[^"]+\.css">/g, "");
      },
    },
  };
}

function manualChunks(id: string): string | undefined {
  if (!id) return undefined;
  const norm = id.replace(/\\/g, "/");
  if (!norm.includes("/node_modules/")) return undefined;

  if (norm.includes("/node_modules/react/") || norm.includes("/node_modules/react-dom/") || norm.includes("/node_modules/scheduler/")) return "react-vendor";
  if (norm.includes("/node_modules/react-router/") || norm.includes("/node_modules/react-router-dom/")) return "router-vendor";

  if (norm.includes("/node_modules/framer-motion/")) return "framer-motion";
  if (norm.includes("/node_modules/gsap/") || norm.includes("/node_modules/@gsap/")) return "gsap";

  if (norm.includes("/node_modules/remark-math/") || norm.includes("/node_modules/rehype-katex/") || norm.includes("/node_modules/katex/") || norm.includes("/node_modules/mdast-util-math/") || norm.includes("/node_modules/micromark-extension-math/")) return "markdown-math";
  if (norm.includes("/node_modules/html-parse-stringify/") || norm.includes("/node_modules/void-elements/")) return "markdown-core";
  if (norm.includes("/node_modules/react-markdown/") || norm.includes("/node_modules/remark-gfm/") || norm.includes("/node_modules/remark-parse/") || norm.includes("/node_modules/remark-rehype/") || norm.includes("/node_modules/rehype-stringify/") || norm.includes("/node_modules/unified/") || norm.includes("/node_modules/vfile/") || norm.includes("/node_modules/vfile-message/") || /\/node_modules\/(micromark|mdast-|hast-|unist-|zwitch|property-information|web-namespaces|space-separated-tokens|comma-separated-tokens|trim-lines|ccount|longest-streak|is-alphabetical|is-alphanumerical|is-decimal|is-hexadecimal|decode-named-character-reference|parse-entities|character-entities|character-entities-legacy|character-reference-invalid|html-url-attributes|markdown-table|hastscript|hast-util-|mdast-util-|micromark-extension-|micromark-factory-|micromark-core-commonmark|micromark-util-)/.test(norm)) return "markdown-core";
  if (norm.includes("/node_modules/react-syntax-highlighter/")) return "syntax-highlighter";

  // Monaco is reached only from the editor route. Language contributions are
  // split by language and inline completions are isolated so no single editor
  // chunk exceeds the bundle budget.
  if (norm.includes("/node_modules/@monaco-editor/react/")) return "monaco-react";
  const basicLanguageMatch = norm.match(/\/node_modules\/monaco-editor\/esm\/vs\/basic-languages\/([^/]+)\//);
  if (basicLanguageMatch) return `monaco-language-${basicLanguageMatch[1]}`;
  if (norm.includes("/node_modules/monaco-editor/esm/vs/editor/contrib/clipboard/")) return "monaco-editor-clipboard";
  const contributionMatch = norm.match(/\/node_modules\/monaco-editor\/esm\/vs\/editor\/contrib\/([^/]+)\//);
  if (contributionMatch?.[1] === "inlineCompletions") return "monaco-editor-inline-completions";
  if (contributionMatch) return "monaco-editor-contrib";
  if (norm.includes("/node_modules/monaco-editor/esm/vs/editor/standalone/")) return "monaco-editor-standalone";
  if (norm.includes("/node_modules/monaco-editor/esm/vs/editor/browser/")) return "monaco-editor-browser";
  if (norm.includes("/node_modules/monaco-editor/esm/vs/editor/common/")) return "monaco-editor-common";
  if (norm.includes("/node_modules/monaco-editor/esm/vs/editor/")) return "monaco-editor-core";
  if (norm.includes("/node_modules/monaco-editor/esm/vs/language/")) return "monaco-language-services";
  if (norm.includes("/node_modules/monaco-editor/esm/vs/base/")) return "monaco-base";
  if (norm.includes("/node_modules/monaco-editor/esm/vs/platform/")) return "monaco-platform";
  if (norm.includes("/node_modules/monaco-editor/")) return "monaco-runtime";

  if (norm.includes("/node_modules/recharts/") || norm.includes("/node_modules/d3-")) return "charts";
  if (norm.includes("/node_modules/i18next/") || norm.includes("/node_modules/react-i18next/")) return "i18n";
  if (norm.includes("/node_modules/axios/") || norm.includes("/node_modules/cookie/") || norm.includes("/node_modules/set-cookie-parser/")) return "http";

  const afterNodeModules = norm.split("/node_modules/")[1];
  if (!afterNodeModules) return "vendor";
  if (afterNodeModules.startsWith(".pnpm/")) {
    const pnpmParts = afterNodeModules.split("/node_modules/");
    const realPkgPath = pnpmParts[1] ?? "";
    const pkgName = realPkgPath.startsWith("@") ? realPkgPath.split("/").slice(0, 2).join("_") : realPkgPath.split("/")[0];
    return `vendor_${pkgName.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
  }
  const pkgName = afterNodeModules.startsWith("@") ? afterNodeModules.split("/").slice(0, 2).join("_") : afterNodeModules.split("/")[0];
  return `vendor_${pkgName.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
}

export default defineConfig({
  plugins: [react(), deferMonacoStyles()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // DEV: proxy API calls to the backend to keep frontend <-> backend working out of the box.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
    hmr: { overlay: true },
    watch: {
      // Local visual-review browser profiles are not source files and Windows
      // locks their Cookie databases. Watching them can terminate Vite.
      ignored: ["**/.edge-preview*/**", "**/.chrome-preview*/**"],
    },
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Monaco's editor.api has intentional bidirectional module references.
        // The async chunks are covered by the explicit size/lazy-boundary
        // contract; report all other Rollup warnings normally.
        const warningText = String(warning.message ?? "");
        if (/circular/i.test(String(warning.code ?? "")) && /monaco|editor|runtime|platform|base/i.test(warningText)) return;
        if (/Circular (chunk|dependency):/i.test(warningText) && /monaco|editor|runtime|platform|base/i.test(warningText)) return;
        defaultHandler(warning);
      },
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks,
      },
    },
    // All application/vendor chunks remain below the standard warning limit.
    chunkSizeWarningLimit: 1100,
    target: "esnext",
    cssCodeSplit: true,
    // Monaco is reached through React.lazy/editor-only dynamic imports. Vite's
    // dependency discovery must not turn those into entry modulepreloads.
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter(dep => !/monaco-/i.test(dep));
      },
    },
  },
  optimizeDeps: {
    exclude: ["@monaco-editor/react", "monaco-editor"],
    include: ["react", "react-dom", "react-router-dom"],
  },
});
