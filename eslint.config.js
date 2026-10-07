import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", "public/**", "uploads/**", "coverage/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
      // Existing controllers wrap everything in try { } catch (e) { throw e }.
      // Removed module by module in the service-layer refactor.
      "no-useless-catch": "warn",
    },
  },
  {
    files: ["test/**/*.js", "**/*.test.js"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
