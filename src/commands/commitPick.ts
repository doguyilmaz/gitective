import { posix } from "node:path";
import * as vscode from "vscode";
import { EMPTY_SHA } from "../core/revUri";
import type { FileChange, LogEntry } from "../core/gitLog";
import { parseNameStatus } from "../core/gitLog";
import { isValidSha, shortSha } from "../core/sanitize";
import { formatAgo } from "../core/time";
import { GitError, runGit } from "../git/run";
import { openRevisionDocument } from "../language";
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
  await Promise.all([
    openRevisionDocument(left, change.path),
    openRevisionDocument(right, change.path),
  ]);
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
  // -m --first-parent: merge commits otherwise emit no name-status at all
  const output = await runGit(["show", sha, "-m", "--first-parent", "--format=", "--name-status"], {
    cwd: repoRoot,
  });
  const changes = parseNameStatus(output);
  if (changes.length === 0) {
    void vscode.window.showInformationMessage("Gitective: no file changes in this commit.");
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
