import { posix } from "node:path";
import * as vscode from "vscode";
import { EMPTY_SHA } from "../core/revUri";
import type { FileChange, LogEntry } from "../core/gitLog";
import { parseNameStatus } from "../core/gitLog";
import { isValidSha, shortSha } from "../core/sanitize";
import { formatAgo } from "../core/time";
import { GitError, runGit } from "../git/run";
import { toRevUri } from "../uris";

export interface CommitPickItem extends vscode.QuickPickItem {
  entry: LogEntry;
}

export function commitItems(entries: LogEntry[]): CommitPickItem[] {
  return entries.map((entry) => ({
    label: `$(git-commit) ${entry.subject}`,
    description: shortSha(entry.sha),
    detail: `${entry.author}, ${formatAgo(entry.authorTime)}`,
    alwaysShow: true,
    entry,
  }));
}

export function diffTitle(relPath: string, left: string, right: string): string {
  const name = posix.basename(relPath);
  return `${name} (${left}) ↔ ${name} (${right})`;
}

export async function parentSha(repoRoot: string, sha: string): Promise<string | undefined> {
  if (!isValidSha(sha)) return undefined;
  try {
    return (await runGit(["rev-parse", `${sha}^`], { cwd: repoRoot })).trim();
  } catch (error) {
    if (error instanceof GitError) return undefined;
    throw error;
  }
}

export async function openDiffForChange(
  repoRoot: string,
  sha: string,
  change: FileChange,
): Promise<void> {
  const parent = await parentSha(repoRoot, sha);
  const oldPath = change.oldPath ?? change.path;
  const added = change.status === "A" || parent === undefined;
  const deleted = change.status === "D";
  const left = added
    ? toRevUri({ repoRoot, sha: EMPTY_SHA, relPath: change.path })
    : toRevUri({ repoRoot, sha: parent, relPath: oldPath });
  const right = deleted
    ? toRevUri({ repoRoot, sha: EMPTY_SHA, relPath: change.path })
    : toRevUri({ repoRoot, sha, relPath: change.path });
  await vscode.commands.executeCommand(
    "vscode.diff",
    left,
    right,
    diffTitle(
      change.path,
      added ? "added" : shortSha(parent as string),
      deleted ? "deleted" : shortSha(sha),
    ),
  );
}

const STATUS_ICONS: Record<string, string> = {
  M: "diff-modified",
  A: "diff-added",
  D: "diff-removed",
  R: "diff-renamed",
  C: "diff-added",
};

export async function showCommitFiles(repoRoot: string, sha: string): Promise<void> {
  const output = await runGit(["show", sha, "--format=", "--name-status"], { cwd: repoRoot });
  const changes = parseNameStatus(output);
  if (changes.length === 0) {
    void vscode.window.showInformationMessage("Whodunit: no file changes in this commit.");
    return;
  }
  interface FileItem extends vscode.QuickPickItem {
    change: FileChange;
  }
  const items: FileItem[] = changes.map((change) => ({
    label: `$(${STATUS_ICONS[change.status] ?? "file"}) ${change.path}`,
    description: change.status,
    change,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Files changed in ${shortSha(sha)}`,
    matchOnDescription: true,
  });
  if (picked) await openDiffForChange(repoRoot, sha, picked.change);
}

export async function pickCommitAction(repoRoot: string, entry: LogEntry): Promise<void> {
  interface ActionItem extends vscode.QuickPickItem {
    run: () => Promise<void>;
  }
  const items: ActionItem[] = [
    {
      label: "$(git-commit) Show Commit",
      run: () => showCommitFiles(repoRoot, entry.sha),
    },
    {
      label: "$(copy) Copy SHA",
      run: async () => {
        await vscode.env.clipboard.writeText(entry.sha);
        vscode.window.setStatusBarMessage(`Copied ${shortSha(entry.sha)}`, 3000);
      },
    },
    {
      label: "$(note) Copy Message",
      run: async () => {
        const message = await runGit(["show", "-s", "--format=%B", entry.sha], { cwd: repoRoot });
        await vscode.env.clipboard.writeText(message.trim());
        vscode.window.setStatusBarMessage(`Copied message of ${shortSha(entry.sha)}`, 3000);
      },
    },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `${shortSha(entry.sha)} — ${entry.subject}`,
  });
  if (picked) await picked.run();
}
