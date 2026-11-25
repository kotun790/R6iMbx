import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b100e",
        panel: "#131b17",
        jade: "#8eb89e",
        brass: "#c7a56a",
        paper: "#eef1ec"
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "serif"],
        sans: ["Segoe UI", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
