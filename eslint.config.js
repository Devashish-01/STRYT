import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Flat config (ESLint 9). Scope is intentionally the standard Vite+React+TS
// baseline (no project-wide type-aware rules yet — those need a much slower
// parserOptions.project pass across 300+ files) so this lands as pure
// additive tooling: it catches real bugs (hook-rule violations, undefined
// globals, unreachable code) without relitigating every existing style
// choice at once. Tighten incrementally in later passes.
export default tseslint.config(
  { ignores: ["dist", "android", "ios", "supabase/functions", "*.config.js", "*.config.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Matches tsconfig's noUnusedLocals/noUnusedParameters: false — this
      // codebase already tolerates unused locals/params at the type-check
      // level, so mirror that here rather than surfacing hundreds of
      // pre-existing "violations" this same pass just invented.
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // This codebase has an established, deliberate "best-effort, ignore
      // failure" pattern for non-critical writes (localStorage persistence,
      // etc.) — almost all of them already carry a `/* ignore */`-style
      // comment; allowEmptyCatch covers the handful that don't, rather than
      // forcing a comment into every one for the linter's sake.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
