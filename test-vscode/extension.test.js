const assert = require("node:assert");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "whodunit-e2e-")));
  const git = (...args) =>
    cp
      .execFileSync("git", args, {
        cwd: dir,
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
      })
      .toString()
      .trim();
  git("init", "-qb", "main");
  git("config", "user.name", "Test Author");
  git("config", "user.email", "test@example.com");
  return { dir, git };
}

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

  test("copySha puts the current line's commit on the clipboard", async function () {
    this.timeout(20000);
    const { dir, git } = makeRepo();
    const file = path.join(dir, "a.ts");
    fs.writeFileSync(file, "const a = 1;\n");
    git("add", ".");
    git("commit", "-qm", "first");
    const sha = git("rev-parse", "HEAD");

    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand("whodunit.copySha");
    assert.strictEqual(await vscode.env.clipboard.readText(), sha);
  });

  test("compareWithPrevious opens a whodunit-backed diff with correct contents", async function () {
    this.timeout(20000);
    const { dir, git } = makeRepo();
    const file = path.join(dir, "b.ts");
    fs.writeFileSync(file, "line one\n");
    git("add", ".");
    git("commit", "-qm", "first");
    fs.writeFileSync(file, "line one CHANGED\n");
    git("add", ".");
    git("commit", "-qm", "second");
    const sha2 = git("rev-parse", "HEAD");

    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand("whodunit.compareWithPrevious");

    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab.input instanceof vscode.TabInputTextDiff, "expected a diff tab");
    assert.strictEqual(tab.input.modified.scheme, "whodunit");
    assert.strictEqual(tab.input.original.scheme, "whodunit");

    const original = await vscode.workspace.openTextDocument(tab.input.original);
    const modified = await vscode.workspace.openTextDocument(tab.input.modified);
    assert.strictEqual(original.getText(), "line one\n");
    assert.strictEqual(modified.getText(), "line one CHANGED\n");
    assert.ok(JSON.parse(tab.input.modified.query).sha === sha2, "modified pane pins the commit");
  });
});
