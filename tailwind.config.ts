import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#DD1F2A",
          redDark: "#B71C24",
          canvas: "#F3F3F3",
          ink: "#1F2937",
          card: "#FFFFFF"
        }
      },
      boxShadow: {
        panel: "0 8px 30px rgba(31, 41, 55, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;



