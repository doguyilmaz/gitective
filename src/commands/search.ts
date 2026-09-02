import * as vscode from "vscode";
import type { LogEntry } from "../core/gitLog";
import { LOG_FORMAT, parseLogRecords } from "../core/gitLog";
import { isValidSha } from "../core/sanitize";
import { contextForDocument } from "../docContext";
import { GitError, runGit } from "../git/run";
import { log } from "../log";
import type { Services } from "../services";
import type { CommitPickItem } from "./commitPick";
import { commitItems } from "./commitPick";

const SEARCH_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 250;

async function currentRepoRoot(services: Services): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const ctx = await contextForDocument(editor.document, services.resolver);
    if (ctx) return ctx.req.repoRoot;
  }
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== "file") continue;
    const info = await services.resolver.repoForDir(folder.uri.fsPath);
    if (info) return info.root;
  }
  return undefined;
}

async function queryCommits(repoRoot: string, value: string): Promise<LogEntry[]> {
  const base = ["log", "-n", String(SEARCH_LIMIT), `--format=${LOG_FORMAT}`];
  if (!value) {
    return parseLogRecords(await runGit(base, { cwd: repoRoot }));
  }
  if (value.startsWith("@")) {
    const author = value.slice(1);
    if (!author) return parseLogRecords(await runGit(base, { cwd: repoRoot }));
    // --author has no --fixed-strings equivalent, so neutralize regex metachars
    const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return parseLogRecords(
      await runGit([...base, "--regexp-ignore-case", `--author=${escaped}`], { cwd: repoRoot }),
    );
  }

  const results: LogEntry[] = [];
  if (isValidSha(value)) {
    try {
      results.push(
        ...parseLogRecords(
          await runGit(["log", "-1", `--format=${LOG_FORMAT}`, value, "--"], { cwd: repoRoot }),
        ),
      );
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
    }
  }
  const grepped = parseLogRecords(
    await runGit([...base, "--regexp-ignore-case", "--fixed-strings", `--grep=${value}`], {
      cwd: repoRoot,
    }),
  );
  const seen = new Set(results.map((entry) => entry.sha));
  for (const entry of grepped) {
    if (!seen.has(entry.sha)) results.push(entry);
  }
  return results;
}

export async function searchCommits(services: Services): Promise<void> {
  const repoRoot = await currentRepoRoot(services);
  if (!repoRoot) {
    void vscode.window.showInformationMessage("Whodunit: no git repository found.");
    return;
  }

  const picker = vscode.window.createQuickPick<CommitPickItem>();
  picker.placeholder = "Search commit messages, @author, or paste a sha";
  picker.matchOnDescription = true;
  picker.matchOnDetail = true;

  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const load = async (value: string): Promise<void> => {
    const mySeq = ++seq;
    picker.busy = true;
    try {
      const entries = await queryCommits(repoRoot, value.trim());
      if (mySeq !== seq) return;
      picker.items = commitItems(entries);
    } catch (error) {
      log().error(`search: ${error instanceof Error ? error.message : String(error)}`);
      if (mySeq === seq) picker.items = [];
    } finally {
      if (mySeq === seq) picker.busy = false;
    }
  };

  picker.onDidChangeValue((value) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void load(value), SEARCH_DEBOUNCE_MS);
  });
  picker.onDidAccept(() => {
    const item = picker.selectedItems[0];
    if (!item) return;
    picker.hide();
    void vscode.commands.executeCommand("whodunit.commitMenu", { repoRoot, sha: item.entry.sha });
  });
  picker.onDidHide(() => {
    if (timer) clearTimeout(timer);
    picker.dispose();
  });

  picker.show();
  void load("");
}
