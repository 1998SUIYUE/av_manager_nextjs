import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // MARGIN 深色编辑风 token（供 /movies-v2 使用）
        canvas: "#111112",
        deep: "#0c0c0d",
        surface: "#1a1a1c",
        ink: {
          DEFAULT: "#ededee",
          2: "#b4b5b9",
        },
        muted: "#9a9ba0",
        faint: "#66686d",
        accent: "#00aeec",
        danger: {
          DEFAULT: "#ff7866",
          strong: "#c93a2e",
        },
        line: "rgba(255, 255, 255, 0.08)",
        "line-strong": "rgba(255, 255, 255, 0.16)",
        chip: "rgba(255, 255, 255, 0.06)",
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "Microsoft YaHei",
          "PingFang SC",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "ui-monospace",
          "Menlo",
          "monospace",
        ],
        serif: [
          "var(--font-instrument-serif)",
          "SimSun",
          "Songti SC",
          "serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
