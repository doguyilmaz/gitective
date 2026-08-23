import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: ["error", "smart"],
      "no-console": "error",
    },
  },
  {
    ignores: ["dist/", "out-test/", "node_modules/", "*.mjs"],
  },
);
