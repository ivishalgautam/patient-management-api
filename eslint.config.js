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
      "no-unused-vars": ["error", { args: "none", ignoreRestSiblings: true }],
    },
  },
  {
    files: ["test/**/*.js", "**/*.test.js"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
