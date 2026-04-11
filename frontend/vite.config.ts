import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // DEV: proxy API calls to the backend to keep frontend <-> backend working out of the box.
    // Frontend API client defaults to window.location.origin + /api
    // so without a proxy it would hit the Vite dev server instead of the backend.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
    // Зменшуємо кількість воркерів у dev для економії пам'яті
    hmr: {
      overlay: true,
    },
  },
  build: {
    // Вимикаємо source maps у production для зменшення розміру
    sourcemap: false,
    // Мінімізуємо розмір
    minify: "esbuild",
    // Спираємось на дефолтне чанкування Vite/Rollup, щоб уникнути пустих чанків
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks(id) {
          // Split big vendor deps into separate chunks.
          // Helps keep the entry chunk smaller and reduces "chunk > 1000kB" warnings.
          if (!id) return;
          const inNodeModules = id.includes("node_modules") || id.includes("node_modules\\") || id.includes("node_modules/");
          if (!inNodeModules) return;

          const norm = id.replace(/\\/g, "/");

          // React core + router
          if (norm.includes("/node_modules/react/") || norm.includes("/node_modules/react-dom/") || norm.includes("/node_modules/react-router/") || norm.includes("/node_modules/react-router-dom/") || norm.includes("/node_modules/scheduler/")) {
            return "react-vendor";
          }

          // Animations
          if (norm.includes("/node_modules/framer-motion/")) return "framer-motion";

          // Markdown + math rendering
          if (norm.includes("/node_modules/remark-math/") || norm.includes("/node_modules/rehype-katex/") || norm.includes("/node_modules/katex/") || norm.includes("/node_modules/mdast-util-math/") || norm.includes("/node_modules/micromark-extension-math/")) {
            return "markdown-math";
          }
          if (norm.includes("/node_modules/html-parse-stringify/") || norm.includes("/node_modules/void-elements/")) {
            return "markdown-core";
          }
          if (norm.includes("/node_modules/react-markdown/") || norm.includes("/node_modules/remark-gfm/") || norm.includes("/node_modules/remark-parse/") || norm.includes("/node_modules/remark-rehype/") || norm.includes("/node_modules/rehype-stringify/") || norm.includes("/node_modules/unified/") || norm.includes("/node_modules/vfile/") || norm.includes("/node_modules/vfile-message/") || /\/node_modules\/(micromark|mdast-|hast-|unist-|zwitch|property-information|web-namespaces|space-separated-tokens|comma-separated-tokens|trim-lines|ccount|longest-streak|is-alphabetical|is-alphanumerical|is-decimal|is-hexadecimal|decode-named-character-reference|parse-entities|character-entities|character-entities-legacy|character-reference-invalid|html-url-attributes|markdown-table|hastscript|hast-util-|mdast-util-|micromark-extension-|micromark-factory-|micromark-core-commonmark|micromark-util-)/.test(norm)) {
            return "markdown-core";
          }

          // Syntax highlighting (very large) – also lazy-loaded in MarkdownView.
          if (norm.includes("/node_modules/react-syntax-highlighter/")) return "syntax-highlighter";

          // Charts
          if (norm.includes("/node_modules/recharts/") || norm.includes("/node_modules/d3-")) return "charts";

          // i18n
          if (norm.includes("/node_modules/i18next/") || norm.includes("/node_modules/react-i18next/")) return "i18n";

          // HTTP
          if (norm.includes("/node_modules/axios/")) return "http";
          if (norm.includes("/node_modules/cookie/") || norm.includes("/node_modules/set-cookie-parser/")) return "http";

          // Fallback: split by package name to avoid a single gigantic vendor chunk.
          // This keeps individual chunks reasonably sized without hand-maintaining a long allowlist.
          const afterNodeModules = norm.split("/node_modules/")[1];
          if (!afterNodeModules) return "vendor";

          // Handle pnpm-style paths: /node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/...
          if (afterNodeModules.startsWith(".pnpm/")) {
            const pnpmParts = afterNodeModules.split("/node_modules/");
            const realPkgPath = pnpmParts[1] ?? "";
            const pkgName = realPkgPath.startsWith("@") ? realPkgPath.split("/").slice(0, 2).join("_") : realPkgPath.split("/")[0];
            return `vendor_${pkgName.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
          }

          const pkgName = afterNodeModules.startsWith("@") ? afterNodeModules.split("/").slice(0, 2).join("_") : afterNodeModules.split("/")[0];
          return `vendor_${pkgName.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
        },
      },
    },
    // Збільшуємо chunk size warning limit (Monaco великий)
    chunkSizeWarningLimit: 1000,
    // Оптимізація для production
    target: "esnext",
    cssCodeSplit: true,
  },
  // Оптимізація для dev
  optimizeDeps: {
    // Виключаємо Monaco з pre-bundling (завантажуємо тільки коли потрібен)
    exclude: ["@monaco-editor/react", "monaco-editor"],
    // Включаємо тільки необхідні залежності
    include: ["react", "react-dom", "react-router-dom"],
  },
});
