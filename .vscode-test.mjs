import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "test-vscode/**/*.test.js",
  version: "stable",
  launchArgs: ["--disable-extensions"],
});
