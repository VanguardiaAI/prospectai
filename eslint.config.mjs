import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // New React-Compiler rule that eslint-config-next promotes to "error". It
      // fires only on intentional patterns here: fetch-on-mount (with a loading
      // flag) and SSR-safe client init in providers — e.g. ThemeProvider /
      // LocaleProvider read localStorage *after* mount because a lazy useState
      // initializer would run on the server and break SSR / cause hydration
      // mismatches. There is no correct lazy-init alternative for those, so keep
      // this as a warning (visible, non-blocking) instead of failing the build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
