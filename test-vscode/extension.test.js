const assert = require("node:assert");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gitective-e2e-")));
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
  "gitective.toggleInline",
  "gitective.commitMenu",
  "gitective.inspectCommit",
  "gitective.compareWithPrevious",
  "gitective.compareWithWorking",
  "gitective.openAtRevision",
  "gitective.fileHistory",
  "gitective.lineHistory",
  "gitective.searchCommits",
  "gitective.openOnRemote",
  "gitective.copyRemoteLink",
  "gitective.copySha",
  "gitective.copyMessage",
  "gitective.olderRevision",
  "gitective.newerRevision",
  "gitective.openChangeInCommit",
];

suite("gitective", () => {
  test("activates and registers every command", async () => {
    const extension = vscode.extensions.getExtension("doguyilmaz.gitective");
    assert.ok(extension, "extension not found by id");
    await extension.activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of COMMANDS) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });

  test("contributes configuration defaults", () => {
    const config = vscode.workspace.getConfiguration("gitective");
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
    await vscode.commands.executeCommand("gitective.copySha");
    assert.strictEqual(await vscode.env.clipboard.readText(), sha);
  });

  test("compareWithPrevious opens a gitective-backed diff with correct contents", async function () {
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
    await vscode.commands.executeCommand("gitective.compareWithPrevious");

    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab.input instanceof vscode.TabInputTextDiff, "expected a diff tab");
    assert.strictEqual(tab.input.modified.scheme, "gitective");
    assert.strictEqual(tab.input.original.scheme, "gitective");

    const original = await vscode.workspace.openTextDocument(tab.input.original);
    const modified = await vscode.workspace.openTextDocument(tab.input.modified);
    assert.strictEqual(original.getText(), "line one\n");
    assert.strictEqual(modified.getText(), "line one CHANGED\n");
    assert.ok(JSON.parse(tab.input.modified.query).sha === sha2, "modified pane pins the commit");
  });

  test("older/newer revision navigation steps through file history", async function () {
    this.timeout(20000);
    const { dir, git } = makeRepo();
    const file = path.join(dir, "c.ts");
    const shas = [];
    for (const [index, content] of ["one\n", "two\n", "three\n"].entries()) {
      fs.writeFileSync(file, content);
      git("add", ".");
      git("commit", "-qm", `commit ${index + 1}`);
      shas.push(git("rev-parse", "HEAD"));
    }

    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand("gitective.compareWithPrevious");

    const modifiedSha = () => {
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
      assert.ok(tab.input instanceof vscode.TabInputTextDiff, "expected a diff tab");
      return JSON.parse(tab.input.modified.query).sha;
    };
    assert.strictEqual(modifiedSha(), shas[2]);

    await vscode.commands.executeCommand("gitective.olderRevision");
    assert.strictEqual(modifiedSha(), shas[1]);

    await vscode.commands.executeCommand("gitective.newerRevision");
    assert.strictEqual(modifiedSha(), shas[2]);
  });

  test("openAtRevision names the tab after the revision and keeps the language", async function () {
    this.timeout(20000);
    const { dir, git } = makeRepo();
    const file = path.join(dir, "d.ts");
    fs.writeFileSync(file, "export const d = 1;\n");
    git("add", ".");
    git("commit", "-qm", "first");
    const sha = git("rev-parse", "HEAD");

    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand("gitective.openAtRevision");

    const active = vscode.window.activeTextEditor;
    assert.strictEqual(active.document.uri.scheme, "gitective");
    assert.ok(path.posix.basename(active.document.uri.path).includes(`@ ${sha.slice(0, 7)}`), "tab carries the sha");
    assert.strictEqual(active.document.languageId, "typescript");
    assert.strictEqual(active.document.getText(), "export const d = 1;\n");
  });

  test("inspectCommit opens a diff-language document with the commit header", async function () {
    this.timeout(20000);
    const { dir, git } = makeRepo();
    const file = path.join(dir, "e.ts");
    fs.writeFileSync(file, "one\n");
    git("add", ".");
    git("commit", "-qm", "inspect me");
    const sha = git("rev-parse", "HEAD");

    await vscode.commands.executeCommand("gitective.inspectCommit", { repoRoot: dir, sha });
    const active = vscode.window.activeTextEditor;
    assert.strictEqual(active.document.uri.scheme, "gitective-commit");
    assert.strictEqual(active.document.languageId, "diff");
    assert.ok(active.document.getText().startsWith(`commit ${sha}`));
    assert.ok(active.document.getText().includes("inspect me"));
    assert.ok(active.document.getText().includes("diff --git a/e.ts b/e.ts"));
  });

  test("compareWithWorking diffs the line's commit against the working file", async function () {
    this.timeout(20000);
    const { dir, git } = makeRepo();
    const file = path.join(dir, "f.ts");
    fs.writeFileSync(file, "v1\n");
    git("add", ".");
    git("commit", "-qm", "first");
    fs.writeFileSync(file, "v1\nlocal edit\n");

    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    await vscode.commands.executeCommand("gitective.compareWithWorking");
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab.input instanceof vscode.TabInputTextDiff);
    assert.strictEqual(tab.input.original.scheme, "gitective");
    assert.strictEqual(tab.input.modified.scheme, "file");
  });

  test("contributes the default keybindings", () => {
    const extension = vscode.extensions.getExtension("doguyilmaz.gitective");
    const keys = extension.packageJSON.contributes.keybindings.map((k) => `${k.command}=${k.key}`);
    assert.ok(keys.includes("gitective.commitMenu=alt+shift+b"));
    assert.ok(keys.includes("gitective.lineHistory=alt+shift+h"));
    assert.ok(keys.includes("gitective.olderRevision=alt+shift+,"));
  });
});
