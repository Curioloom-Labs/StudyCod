import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
