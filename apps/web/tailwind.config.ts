import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border:     "hsl(var(--border-hsl))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Direct hex tokens for inline use */
        f1: {
          red:    "#e8002d",
          green:  "#00d2a0",
          amber:  "#f5a623",
          w1:     "#f0f0f0",
          w2:     "#8a8a8a",
          w3:     "#444444",
          bg:     "#080808",
          s1:     "#0f0f0f",
          s2:     "#141414",
          border: "#1f1f1f",
        },
      },
      borderRadius: {
        sharp: "2px",
      },
      boxShadow: {
        panel:    "0 0 0 1px #1f1f1f",
        "red-cta":"2px 2px 0 #8c0018",
      },
      fontFamily: {
        display: ["DM Mono", "IBM Plex Mono", "SFMono-Regular", "monospace"],
        body:    ["Inter", "Avenir Next", "Segoe UI", "sans-serif"],
        mono:    ["DM Mono", "IBM Plex Mono", "SFMono-Regular", "monospace"],
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        "telemetry-grid":
          "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
