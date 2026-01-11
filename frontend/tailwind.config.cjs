
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        bg: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          hover: "var(--bg-hover)",
          code: "var(--bg-code)",
        },
        // Text
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        // Borders
        border: {
          DEFAULT: "var(--border)",
        },
        // Primary (Neon Green)
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          muted: "var(--primary-muted)",
        },
        // Secondary (Neon Blue)
        secondary: {
          DEFAULT: "var(--secondary)",
          hover: "var(--secondary-hover)",
        },
        // Accents
        accent: {
          error: "var(--accent-error)",
          success: "var(--accent-success)",
          warn: "var(--accent-warn)",
          "logic-warning": "var(--accent-logic-warning)",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: "var(--font-xs)",
        sm: "var(--font-sm)",
        base: "var(--font-base)",
        lg: "var(--font-lg)",
        xl: "var(--font-xl)",
        "2xl": "var(--font-2xl)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
      },
      transitionTimingFunction: {
        "ease-out": "var(--ease-out)",
        "ease-in-out": "var(--ease-in-out)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
