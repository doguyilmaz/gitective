import { posix } from "node:path";
import * as vscode from "vscode";
import { lineBlameAt, UNCOMMITTED_SHA } from "../core/blame";
import { EMPTY_SHA } from "../core/revUri";
import { isValidSha, shortSha } from "../core/sanitize";
import { contextForDocument } from "../docContext";
import { runGit } from "../git/run";
import type { Services } from "../services";
import { toRevUri } from "../uris";

export interface LineTarget {
  repoRoot: string;
  relPath: string;
  sha: string;
  line: number;
  origLine: number;
  previousSha?: string;
  previousPath?: string;
}

function isLineTarget(arg: unknown): arg is LineTarget {
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

function diffTitle(relPath: string, left: string, right: string): string {
  const name = posix.basename(relPath);
  return `${name} (${left}) ↔ ${name} (${right})`;
}

export async function compareWithPrevious(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  const { repoRoot, relPath, sha } = target;

  if (sha === UNCOMMITTED_SHA) {
    const head = (await runGit(["rev-parse", "HEAD"], { cwd: repoRoot })).trim();
    await vscode.commands.executeCommand(
      "vscode.diff",
      toRevUri({ repoRoot, sha: head, relPath }),
      vscode.Uri.file(posix.join(repoRoot, relPath)),
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
