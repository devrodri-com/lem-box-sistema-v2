

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#005f40",   // verde primario
          accent: "#eb6619",    // naranja secundario
          shadow: "#cf6934",    // naranja oscuro / sombra
        },
      },
    },
  },
  plugins: [],
};
export default config;