import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "out-e2e/**",
    "build/**",
    "next-env.d.ts",
    // Working copies and scratch files of development tools.
    ".claude/**",
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
