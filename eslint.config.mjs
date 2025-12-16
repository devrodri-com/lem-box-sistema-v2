import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  // Reglas estrictas para componentes y áreas críticas (error para no-explicit-any)
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/app/partner/**/*.{ts,tsx}",
      "src/app/acceder/page.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Reglas más permisivas para admin, mi, api, tests y lib (warn para no-explicit-any)
  {
    files: [
      "src/app/admin/**/*.{ts,tsx}",
      "src/app/mi/**/*.{ts,tsx}",
      "src/app/api/**/*.{ts,tsx}",
      "src/__tests__/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
