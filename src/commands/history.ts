import * as vscode from "vscode";
import { LOG_FORMAT, parseLogRecords } from "../core/gitLog";
import { shortSha } from "../core/sanitize";
import { contextForDocument } from "../docContext";
import { runGit } from "../git/run";
import type { Services } from "../services";
import { toRevUri } from "../uris";
import { commitItems, openDiffForChange } from "./commitPick";
import { isLineTarget } from "./lineActions";

const HISTORY_LIMIT = 200;

async function historyScope(
  services: Services,
  arg: unknown,
): Promise<{ repoRoot: string; relPath: string } | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const ctx = await contextForDocument(editor.document, services.resolver);
    if (ctx) return { repoRoot: ctx.req.repoRoot, relPath: ctx.req.relPath };
  }
  if (isLineTarget(arg)) return { repoRoot: arg.repoRoot, relPath: arg.relPath };
  return undefined;
}

export async function fileHistory(services: Services, arg: unknown): Promise<void> {
  const scope = await historyScope(services, arg);
  if (!scope) {
    void vscode.window.showInformationMessage(
      "Whodunit: open a file inside a git repository first.",
    );
    return;
  }

  const output = await runGit(
    [
      "log",
      "--follow",
      "-n",
      String(HISTORY_LIMIT),
      `--format=${LOG_FORMAT}`,
      "--name-status",
      "--",
      scope.relPath,
    ],
    { cwd: scope.repoRoot },
  );
  const entries = parseLogRecords(output);
  if (entries.length === 0) {
    void vscode.window.showInformationMessage("Whodunit: no history for this file.");
    return;
  }

  const picked = await vscode.window.showQuickPick(commitItems(entries), {
    placeHolder: `History of ${scope.relPath}`,
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;

  const change = picked.entry.changes?.[0] ?? { status: "M", path: scope.relPath };
  interface ActionItem extends vscode.QuickPickItem {
    run: () => Promise<void>;
  }
  const items: ActionItem[] = [
    {
      label: "$(diff) Open Diff",
      run: () => openDiffForChange(scope.repoRoot, picked.entry.sha, change),
    },
    {
      label: "$(go-to-file) Open File at this Revision",
      run: async () => {
        const uri = toRevUri({
          repoRoot: scope.repoRoot,
          sha: picked.entry.sha,
          relPath: change.path,
        });
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
      },
    },
    {
      label: "$(list-selection) Commit ⋯",
      run: async () => {
        await vscode.commands.executeCommand("whodunit.commitMenu", {
          repoRoot: scope.repoRoot,
          sha: picked.entry.sha,
          relPath: change.path,
        });
      },
    },
  ];
  const action = await vscode.window.showQuickPick(items, {
    placeHolder: `${shortSha(picked.entry.sha)} — ${picked.entry.subject}`,
  });
  if (action) await action.run();
}
