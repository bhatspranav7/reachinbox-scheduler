import type { Config } from "tailwindcss";

/** Tokens taken from the Outbox Labs Figma (1440×900 frames). */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
        logo: ['"Pixelify Sans"', "monospace"],
      },
      colors: {
        brand: {
          50: "#ECF8F0", // active nav / google button background
          100: "#D6F1DF",
          300: "#8FD9A8",
          500: "#0FA14A", // primary green (Login button, Compose outline)
          600: "#0B8A3E",
          700: "#086E31",
        },
        ink: {
          900: "#1A1A1A",
          700: "#3D3D3D",
          500: "#777777",
          400: "#9A9A9A",
          300: "#C9C9C9",
          200: "#E6E6E6",
          100: "#F3F4F4", // input fill / user card
          50: "#FAFAFA", // editor background
        },
        scheduled: { bg: "#FFF1E5", text: "#D9651B", ring: "#F9CBA6" },
      },
      boxShadow: {
        pop: "0 8px 24px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)",
      },
      fontSize: { "2xs": ["11px", "14px"] },
    },
  },
  plugins: [],
} satisfies Config;
