import * as vscode from "vscode";
import { LOG_FORMAT, parseLogRecords } from "../core/gitLog";
import { contextForDocument } from "../docContext";
import { runGit } from "../git/run";
import type { Services } from "../services";
import { commitItems } from "./commitPick";
import { isLineTarget } from "./lineActions";

const LINE_HISTORY_LIMIT = 200;

export async function lineHistory(services: Services, arg: unknown): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const ctx = editor ? await contextForDocument(editor.document, services.resolver) : undefined;
  const line = isLineTarget(arg) ? arg.line : editor ? editor.selection.active.line + 1 : undefined;
  const repoRoot = ctx?.req.repoRoot ?? (isLineTarget(arg) ? arg.repoRoot : undefined);
  const relPath = ctx?.req.relPath ?? (isLineTarget(arg) ? arg.relPath : undefined);
  if (!repoRoot || !relPath || line === undefined) {
    void vscode.window.showInformationMessage(
      "Whodunit: put the cursor on a line inside a git repository first.",
    );
    return;
  }

  const args = [
    "log",
    `-L${line},${line}:${relPath}`,
    "--no-patch",
    "-n",
    String(LINE_HISTORY_LIMIT),
    `--format=${LOG_FORMAT}`,
  ];
  if (ctx?.isRevision && ctx.req.sha) args.push(ctx.req.sha);
  const entries = parseLogRecords(await runGit(args, { cwd: repoRoot }));
  if (entries.length === 0) {
    void vscode.window.showInformationMessage("Whodunit: no history for this line yet.");
    return;
  }

  const picked = await vscode.window.showQuickPick(commitItems(entries), {
    title: `Line ${line} · ${relPath}`,
    placeHolder: "Every commit that touched this line, newest first",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;
  await vscode.commands.executeCommand("whodunit.commitMenu", {
    repoRoot,
    sha: picked.entry.sha,
    relPath: picked.entry.changes?.[0]?.path ?? relPath,
    line,
  });
}
