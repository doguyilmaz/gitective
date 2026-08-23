import { join } from "node:path";
import * as vscode from "vscode";
import { lineBlameAt, UNCOMMITTED_SHA } from "../core/blame";
import { EMPTY_SHA } from "../core/revUri";
import { isValidSha, shortSha } from "../core/sanitize";
import { contextForDocument } from "../docContext";
import { runGit } from "../git/run";
import type { Services } from "../services";
import { toRevUri } from "../uris";
import { diffTitle, showCommitFiles } from "./commitPick";
import { fileHistory } from "./history";

export interface LineTarget {
  repoRoot: string;
  relPath: string;
  sha: string;
  line: number;
  origLine: number;
  previousSha?: string;
  previousPath?: string;
}

export function isLineTarget(arg: unknown): arg is LineTarget {
  if (typeof arg !== "object" || arg === null) return false;
  const t = arg as Record<string, unknown>;
  return (
    typeof t.repoRoot === "string" &&
    typeof t.relPath === "string" &&
    typeof t.sha === "string" &&
    (t.sha === UNCOMMITTED_SHA || isValidSha(t.sha)) &&
    typeof t.line === "number" &&
    typeof t.origLine === "number"
  );
}

export async function targetFromEditor(
  services: Services,
  editor: vscode.TextEditor,
): Promise<LineTarget | undefined> {
  const ctx = await contextForDocument(editor.document, services.resolver);
  if (!ctx) return undefined;
  const blame = await services.blame.getBlame(ctx.req);
  if (!blame) return undefined;
  const line = editor.selection.active.line + 1;
  const found = lineBlameAt(blame, line);
  if (!found) return undefined;
  return {
    repoRoot: ctx.req.repoRoot,
    relPath: found.commit.filename || ctx.req.relPath,
    sha: found.commit.sha,
    line,
    origLine: found.line.origLine,
    ...(found.commit.previous && {
      previousSha: found.commit.previous.sha,
      previousPath: found.commit.previous.path,
    }),
  };
}

export async function resolveTarget(
  services: Services,
  arg: unknown,
): Promise<LineTarget | undefined> {
  if (isLineTarget(arg)) return arg;
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  return targetFromEditor(services, editor);
}

function noBlame(): void {
  void vscode.window.showInformationMessage("Whodunit: no blame for the current line.");
}

function flash(message: string): void {
  vscode.window.setStatusBarMessage(message, 3000);
}

export async function copySha(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  if (target.sha === UNCOMMITTED_SHA) {
    void vscode.window.showInformationMessage("Whodunit: the line is uncommitted.");
    return;
  }
  await vscode.env.clipboard.writeText(target.sha);
  flash(`Copied ${shortSha(target.sha)}`);
}

export async function copyMessage(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  if (target.sha === UNCOMMITTED_SHA) {
    void vscode.window.showInformationMessage("Whodunit: the line is uncommitted.");
    return;
  }
  const message = await runGit(["show", "-s", "--format=%B", target.sha], {
    cwd: target.repoRoot,
  });
  await vscode.env.clipboard.writeText(message.trim());
  flash(`Copied message of ${shortSha(target.sha)}`);
}

export async function compareWithPrevious(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  const { repoRoot, relPath, sha } = target;

  if (sha === UNCOMMITTED_SHA) {
    let head: string;
    try {
      head = (await runGit(["rev-parse", "HEAD"], { cwd: repoRoot })).trim();
    } catch {
      void vscode.window.showInformationMessage("Whodunit: the repository has no commits yet.");
      return;
    }
    await vscode.commands.executeCommand(
      "vscode.diff",
      toRevUri({ repoRoot, sha: head, relPath }),
      vscode.Uri.file(join(repoRoot, ...relPath.split("/"))),
      diffTitle(relPath, shortSha(head), "working"),
    );
    return;
  }

  const left = target.previousSha
    ? toRevUri({ repoRoot, sha: target.previousSha, relPath: target.previousPath ?? relPath })
    : toRevUri({ repoRoot, sha: EMPTY_SHA, relPath });
  await vscode.commands.executeCommand(
    "vscode.diff",
    left,
    toRevUri({ repoRoot, sha, relPath }),
    diffTitle(relPath, target.previousSha ? shortSha(target.previousSha) : "added", shortSha(sha)),
  );
}

export async function showCommit(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  if (target.sha === UNCOMMITTED_SHA) {
    void vscode.window.showInformationMessage("Whodunit: the line is uncommitted.");
    return;
  }
  await showCommitFiles(target.repoRoot, target.sha);
}

export async function lineActions(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();

  interface ActionItem extends vscode.QuickPickItem {
    run: () => Promise<void>;
  }
  const uncommitted = target.sha === UNCOMMITTED_SHA;
  const items: ActionItem[] = uncommitted
    ? [
        { label: "$(diff) Compare with HEAD", run: () => compareWithPrevious(services, target) },
        { label: "$(history) File History", run: () => fileHistory(services, target) },
      ]
    : [
        { label: "$(copy) Copy SHA", run: () => copySha(services, target) },
        { label: "$(note) Copy Message", run: () => copyMessage(services, target) },
        {
          label: "$(diff) Compare with Previous",
          run: () => compareWithPrevious(services, target),
        },
        { label: "$(go-to-file) Open at Revision", run: () => openAtRevision(services, target) },
        { label: "$(git-commit) Show Commit", run: () => showCommit(services, target) },
        { label: "$(history) File History", run: () => fileHistory(services, target) },
      ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: uncommitted
      ? `Line ${target.line} — uncommitted`
      : `Line ${target.line} — ${shortSha(target.sha)}`,
  });
  if (picked) await picked.run();
}

export async function openAtRevision(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  if (target.sha === UNCOMMITTED_SHA) {
    void vscode.window.showInformationMessage("Whodunit: the line is uncommitted.");
    return;
  }
  const uri = toRevUri({ repoRoot: target.repoRoot, sha: target.sha, relPath: target.relPath });
  const doc = await vscode.workspace.openTextDocument(uri);
  const position = new vscode.Position(Math.max(0, target.origLine - 1), 0);
  await vscode.window.showTextDocument(doc, {
    selection: new vscode.Range(position, position),
  });
}
