import { join } from "node:path";
import * as vscode from "vscode";
import { isUncommittedSha, lineBlameAt } from "../core/blame";
import { EMPTY_SHA, isSafeRelPath } from "../core/revUri";
import { isValidSha, shortSha } from "../core/sanitize";
import { contextForDocument } from "../docContext";
import { runGit } from "../git/run";
import type { Services } from "../services";
import { toRevUri } from "../uris";
import { openRevisionDocument } from "../language";
import { diffTitle } from "./commitPick";

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
    isSafeRelPath(t.relPath) &&
    typeof t.sha === "string" &&
    (isUncommittedSha(t.sha) || isValidSha(t.sha)) &&
    typeof t.line === "number" &&
    typeof t.origLine === "number" &&
    (t.previousSha === undefined ||
      (typeof t.previousSha === "string" && isValidSha(t.previousSha))) &&
    (t.previousPath === undefined ||
      (typeof t.previousPath === "string" && isSafeRelPath(t.previousPath)))
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
  if (isUncommittedSha(target.sha)) {
    void vscode.window.showInformationMessage("Whodunit: the line is uncommitted.");
    return;
  }
  await vscode.env.clipboard.writeText(target.sha);
  flash(`Copied ${shortSha(target.sha)}`);
}

export async function copyMessage(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  if (isUncommittedSha(target.sha)) {
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

  if (isUncommittedSha(sha)) {
    let head: string;
    try {
      head = (await runGit(["rev-parse", "HEAD"], { cwd: repoRoot })).trim();
    } catch {
      void vscode.window.showInformationMessage("Whodunit: the repository has no commits yet.");
      return;
    }
    await openWorkingDiff(repoRoot, relPath, head);
    return;
  }

  const left = target.previousSha
    ? toRevUri({ repoRoot, sha: target.previousSha, relPath: target.previousPath ?? relPath })
    : toRevUri({ repoRoot, sha: EMPTY_SHA, relPath });
  const right = toRevUri({ repoRoot, sha, relPath });
  await Promise.all([openRevisionDocument(left, relPath), openRevisionDocument(right, relPath)]);
  await vscode.commands.executeCommand(
    "vscode.diff",
    left,
    right,
    diffTitle(relPath, target.previousSha ? shortSha(target.previousSha) : "added", shortSha(sha)),
  );
}

async function openWorkingDiff(repoRoot: string, relPath: string, sha: string): Promise<void> {
  const left = toRevUri({ repoRoot, sha, relPath });
  await openRevisionDocument(left, relPath);
  await vscode.commands.executeCommand(
    "vscode.diff",
    left,
    vscode.Uri.file(join(repoRoot, ...relPath.split("/"))),
    diffTitle(relPath, shortSha(sha), "working"),
  );
}

export async function compareWithWorking(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  const { repoRoot, relPath } = target;
  let sha = target.sha;
  if (isUncommittedSha(sha)) {
    try {
      sha = (await runGit(["rev-parse", "HEAD"], { cwd: repoRoot })).trim();
    } catch {
      void vscode.window.showInformationMessage("Whodunit: the repository has no commits yet.");
      return;
    }
  }
  await openWorkingDiff(repoRoot, relPath, sha);
}

export async function openAtRevision(services: Services, arg: unknown): Promise<void> {
  const target = await resolveTarget(services, arg);
  if (!target) return noBlame();
  if (isUncommittedSha(target.sha)) {
    void vscode.window.showInformationMessage("Whodunit: the line is uncommitted.");
    return;
  }
  const uri = toRevUri({ repoRoot: target.repoRoot, sha: target.sha, relPath: target.relPath });
  const doc = await openRevisionDocument(
    uri,
    target.relPath,
    vscode.window.activeTextEditor?.document.languageId,
  );
  const position = new vscode.Position(Math.max(0, target.origLine - 1), 0);
  await vscode.window.showTextDocument(doc, {
    selection: new vscode.Range(position, position),
  });
}
