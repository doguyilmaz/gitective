import * as vscode from "vscode";
import { isUncommittedSha } from "../core/blame";
import { LOG_FORMAT, parseLogRecords, type LogEntry } from "../core/gitLog";
import { commitUrl, hostLabel } from "../core/remote";
import { isValidSha, shortSha } from "../core/sanitize";
import { parseShortStat, type ShortStat } from "../core/shortstat";
import { formatAgo } from "../core/time";
import {
  checkoutDetached,
  createBranch,
  createTag,
  revertCommit,
  validRefName,
} from "../git/actions";
import { GitError, runGit } from "../git/run";
import type { Services } from "../services";
import { toCommitUri } from "../providers/commitView";
import { openDiffForChange, showCommitFiles } from "./commitPick";
import { fileHistory } from "./history";
import {
  compareWithPrevious,
  compareWithWorking,
  isLineTarget,
  openAtRevision,
  resolveTarget,
  type LineTarget,
} from "./lineActions";
import { lineHistory } from "./lineHistory";

export interface MenuContext {
  repoRoot: string;
  sha: string;
  relPath?: string;
  line?: number;
  target?: LineTarget;
}

interface ActionItem extends vscode.QuickPickItem {
  run?: () => Promise<void> | void;
}

function isMenuContext(arg: unknown): arg is MenuContext {
  if (typeof arg !== "object" || arg === null) return false;
  const t = arg as Record<string, unknown>;
  return typeof t.repoRoot === "string" && typeof t.sha === "string" && isValidSha(t.sha);
}

async function resolveContext(services: Services, arg: unknown): Promise<MenuContext | undefined> {
  if (isMenuContext(arg)) return arg;
  const target = await resolveTarget(services, isLineTarget(arg) ? arg : undefined);
  if (!target) return undefined;
  return {
    repoRoot: target.repoRoot,
    sha: target.sha,
    relPath: target.relPath,
    line: target.line,
    target,
  };
}

async function commitDetails(
  repoRoot: string,
  sha: string,
): Promise<{ entry: LogEntry; stat?: ShortStat } | undefined> {
  const out = await runGit(
    ["show", "--shortstat", "-m", "--first-parent", `--format=${LOG_FORMAT}`, sha],
    { cwd: repoRoot },
  );
  const entry = parseLogRecords(out)[0];
  return entry && { entry, stat: parseShortStat(out) };
}

const separator = (label: string): ActionItem => ({
  label,
  kind: vscode.QuickPickItemKind.Separator,
});

function flash(message: string): void {
  vscode.window.setStatusBarMessage(message, 3000);
}

async function askRefName(prompt: string, repoRoot: string): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    prompt,
    validateInput: (value) => (value.trim() ? undefined : "Enter a name"),
  });
  if (!name) return undefined;
  if (!(await validRefName(repoRoot, name.trim()))) {
    void vscode.window.showErrorMessage(`Gitective: "${name}" is not a valid git ref name.`);
    return undefined;
  }
  return name.trim();
}

async function confirm(message: string, action: string): Promise<boolean> {
  const pick = await vscode.window.showWarningMessage(message, { modal: true }, action);
  return pick === action;
}

async function runGitAction(
  services: Services,
  repoRoot: string,
  work: () => Promise<void>,
  done: string,
): Promise<void> {
  try {
    await work();
    services.blame.invalidateRepo(repoRoot);
    void vscode.window.showInformationMessage(`Gitective: ${done}`);
  } catch (error) {
    if (error instanceof GitError) {
      void vscode.window.showErrorMessage(
        `Gitective: git said: ${error.stderr.trim() || error.message}`,
      );
      return;
    }
    throw error;
  }
}

export async function commitMenu(services: Services, arg: unknown): Promise<void> {
  const ctx = await resolveContext(services, arg);
  if (!ctx) {
    void vscode.window.showInformationMessage("Gitective: no commit for the current line.");
    return;
  }
  const { repoRoot, sha, relPath, target } = ctx;

  if (isUncommittedSha(sha)) {
    const items: ActionItem[] = [
      {
        label: "Changes vs HEAD",
        description: "working file ↔ HEAD",
        run: () => compareWithWorking(services, target),
      },
      { label: "File history", run: () => fileHistory(services, target) },
    ];
    const picked = await vscode.window.showQuickPick(items, { placeHolder: "Uncommitted line" });
    await picked?.run?.();
    return;
  }

  const [details, remote] = await Promise.all([
    commitDetails(repoRoot, sha),
    services.remotes.remoteFor(repoRoot),
  ]);
  if (!details) {
    void vscode.window.showInformationMessage(`Gitective: commit ${shortSha(sha)} not found.`);
    return;
  }
  const { entry, stat } = details;
  const short = shortSha(sha);
  const inspect = () => openInspect(repoRoot, sha);

  const items: ActionItem[] = [
    {
      label: entry.subject,
      description: `${entry.author} · ${formatAgo(entry.authorTime)}`,
      run: inspect,
    },
    {
      label: stat
        ? `${stat.files} ${stat.files === 1 ? "file" : "files"} changed · +${stat.insertions} −${stat.deletions}`
        : "Changed files",
      description: "All changed files",
      run: () => showCommitFiles(repoRoot, sha),
    },
    separator("Open"),
    { label: "Inspect commit", description: "message, stat, patch", run: inspect },
    ...(relPath
      ? [
          {
            label: "Changes in this file",
            description: target?.previousSha
              ? `${shortSha(target.previousSha)} ↔ ${short}`
              : `parent ↔ ${short}`,
            run: () =>
              target
                ? compareWithPrevious(services, target)
                : openDiffForChange(repoRoot, sha, { status: "M", path: relPath }),
          },
          {
            label: "Changes vs working tree",
            description: `${short} ↔ working`,
            run: () =>
              compareWithWorking(
                services,
                target ?? { repoRoot, relPath, sha, line: 1, origLine: 1 },
              ),
          },
          {
            label: `Open file @${short}`,
            run: () =>
              openAtRevision(services, target ?? { repoRoot, relPath, sha, line: 1, origLine: 1 }),
          },
        ]
      : []),
    {
      label: "All changed files…",
      description: "pick one to diff",
      run: () => showCommitFiles(repoRoot, sha),
    },
    ...(remote
      ? [
          separator(hostLabel(remote.host)),
          {
            label: `Open commit on ${hostLabel(remote.host)}`,
            run: async () => {
              await vscode.env.openExternal(vscode.Uri.parse(commitUrl(remote, sha)));
            },
          },
          {
            label: "Copy link to commit",
            run: async () => {
              await vscode.env.clipboard.writeText(commitUrl(remote, sha));
              flash("Copied commit link");
            },
          },
        ]
      : []),
    ...(relPath
      ? [
          separator("History"),
          {
            label: "File history",
            run: () =>
              fileHistory(services, target ?? { repoRoot, relPath, sha, line: 1, origLine: 1 }),
          },
          ...(ctx.line !== undefined && target
            ? [
                {
                  label: "Line history",
                  description: `line ${ctx.line}`,
                  run: () => lineHistory(services, target),
                },
              ]
            : []),
        ]
      : []),
    separator("Copy"),
    {
      label: "Copy SHA",
      description: sha,
      run: async () => {
        await vscode.env.clipboard.writeText(sha);
        flash(`Copied ${short}`);
      },
    },
    {
      label: "Copy message",
      run: async () => {
        const message = await runGit(["show", "-s", "--format=%B", sha], { cwd: repoRoot });
        await vscode.env.clipboard.writeText(message.trim());
        flash(`Copied message of ${short}`);
      },
    },
    separator("Git actions"),
    {
      label: "Create branch at commit…",
      run: async () => {
        const name = await askRefName(`Branch name at ${short}`, repoRoot);
        if (name)
          await runGitAction(
            services,
            repoRoot,
            () => createBranch(repoRoot, name, sha),
            `branch ${name} created at ${short}`,
          );
      },
    },
    {
      label: "Create tag at commit…",
      run: async () => {
        const name = await askRefName(`Tag name at ${short}`, repoRoot);
        if (name)
          await runGitAction(
            services,
            repoRoot,
            () => createTag(repoRoot, name, sha),
            `tag ${name} created at ${short}`,
          );
      },
    },
    {
      label: "Revert commit…",
      description: "creates a new commit",
      run: async () => {
        if (
          await confirm(
            `Revert ${short} "${entry.subject}"? This creates a new commit that undoes it.`,
            "Revert",
          )
        )
          await runGitAction(
            services,
            repoRoot,
            () => revertCommit(repoRoot, sha),
            `reverted ${short}`,
          );
      },
    },
    {
      label: "Checkout commit (detached)…",
      run: async () => {
        if (
          await confirm(
            `Checkout ${short} as a detached HEAD? Your branch stays where it is.`,
            "Checkout",
          )
        )
          await runGitAction(
            services,
            repoRoot,
            () => checkoutDetached(repoRoot, sha),
            `HEAD is now at ${short} (detached)`,
          );
      },
    },
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: `Commit ${short} · ${entry.subject}`,
    placeHolder: "Type to filter actions",
    matchOnDescription: true,
  });
  await picked?.run?.();
}

async function openInspect(repoRoot: string, sha: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(toCommitUri({ repoRoot, sha }));
  await vscode.window.showTextDocument(doc, { preview: true });
}

export function inspectCommit(services: Services, arg: unknown): Promise<void> {
  return resolveContext(services, arg).then((ctx) => {
    if (!ctx || isUncommittedSha(ctx.sha)) {
      void vscode.window.showInformationMessage("Gitective: no commit for the current line.");
      return;
    }
    return openInspect(ctx.repoRoot, ctx.sha);
  });
}

export async function openChangeInCommit(_services: Services, arg: unknown): Promise<void> {
  if (typeof arg !== "object" || arg === null) return;
  const { repoRoot, sha, change } = arg as Record<string, unknown>;
  if (typeof repoRoot !== "string" || typeof sha !== "string" || !isValidSha(sha)) return;
  if (typeof change !== "object" || change === null) return;
  const { status, path, oldPath } = change as Record<string, unknown>;
  if (typeof status !== "string" || typeof path !== "string") return;
  await openDiffForChange(repoRoot, sha, {
    status,
    path,
    ...(typeof oldPath === "string" && { oldPath }),
  });
}
