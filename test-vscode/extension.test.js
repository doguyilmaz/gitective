const assert = require("node:assert");
const vscode = require("vscode");

const COMMANDS = [
  "whodunit.toggleInline",
  "whodunit.copySha",
  "whodunit.copyMessage",
  "whodunit.compareWithPrevious",
  "whodunit.openAtRevision",
  "whodunit.showCommit",
  "whodunit.searchCommits",
  "whodunit.fileHistory",
  "whodunit.lineActions",
];

suite("whodunit", () => {
  test("activates and registers every command", async () => {
    const extension = vscode.extensions.getExtension("doguyilmaz.whodunit");
    assert.ok(extension, "extension not found by id");
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of COMMANDS) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });

  test("contributes configuration defaults", () => {
    const config = vscode.workspace.getConfiguration("whodunit");
    assert.strictEqual(config.get("inline.enabled"), true);
    assert.strictEqual(config.get("inline.format"), "${author}, ${ago} • ${message}");
    assert.strictEqual(config.get("statusBar.enabled"), true);
    assert.strictEqual(config.get("message.maxLength"), 60);
  });
});
