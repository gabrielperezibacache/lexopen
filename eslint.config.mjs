import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "desktop/**",
      // Espejo estático del sitio del estudio (bundle generado, no código LexOpen)
      "docs/perezibacache-site/**",
    ],
  },
  {
    files: ["desktop/**/*.cjs"],
    rules: {
      // Electron's main/preload/config entrypoints are intentionally CommonJS.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
