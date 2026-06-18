// @ts-check
// Flat config (ESLint v9) for the Fonte.ia monorepo.
// Root package.json has no "type":"module", so this file uses the .mjs extension.
//
// Goals:
//  - Real, useful linting that exits 0 (warnings allowed, zero errors).
//  - typescript-eslint "recommended" (NOT type-checked) for speed + robustness.
//  - react-hooks rules-of-hooks (a true bug class) kept as ERROR for React apps.
//  - Deno Edge Functions (supabase/functions/**) are excluded — they are checked
//    by `deno check`, not by the workspace tsc/eslint.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  // ---------------------------------------------------------------------------
  // Global ignores. Anything matched here is never linted.
  // ---------------------------------------------------------------------------
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/*.config.*",
      "docs/**",
      "supabase/functions/**", // Deno runtime — verified by `deno check`.
      "apps/web/public/**",
      "apps/web/dist/**",
      "**/*.d.ts",
      "**/scripts/**/*.mjs", // Node build/codegen scripts (root + per-app), not workspace TS.
    ],
  },

  // ---------------------------------------------------------------------------
  // Base JS recommended + typescript-eslint recommended (non type-checked).
  // Applied to all TS/TSX in the workspace.
  // ---------------------------------------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Scope the TS recommended rules to TS/TSX only and wire up TS source globals.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.es2022,
        ...globals.node,
        ...globals.browser,
        // Cloudflare Workers / service worker globals used across services.
        ...globals.serviceworker,
      },
    },
    rules: {
      // Allow intentionally-unused identifiers when prefixed with `_`
      // (common in interface signatures, callbacks, and destructuring).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // `any` shows up in a handful of justified boundary spots (external API
      // payloads, dynamic bridges). Keep it visible as a warning rather than
      // forcing unsafe casts or a codebase-wide churn. NOT turned off.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ---------------------------------------------------------------------------
  // React Hooks — only for the React surfaces (web + React Native mobile).
  // We deliberately enable just the classic, stable rule set:
  //   - rules-of-hooks : ERROR  (true bug class — required to stay strict)
  //   - exhaustive-deps: WARN
  // The React Compiler experimental rules bundled in v7's `flat.recommended`
  // are intentionally NOT enabled to avoid massive, non-bug churn.
  // ---------------------------------------------------------------------------
  {
    files: ["apps/web/**/*.{ts,tsx}", "apps/mobile/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
