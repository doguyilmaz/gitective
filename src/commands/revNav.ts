import * as vscode from "vscode";
import { LOG_FORMAT, parseLogRecords, type LogEntry } from "../core/gitLog";
import type { RevRef } from "../core/revUri";
import { runGit } from "../git/run";
import type { Services } from "../services";
import { fromRevUri } from "../uris";
import { openDiffForChange } from "./commitPick";

const NAV_LOG_LIMIT = 500;

function activeRevisionRef(): { ref: RevRef; tab: vscode.Tab } | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!tab) return undefined;
  const input = tab.input;
  if (input instanceof vscode.TabInputTextDiff) {
    const ref = fromRevUri(input.modified) ?? fromRevUri(input.original);
    return ref ? { ref, tab } : undefined;
  }
  if (input instanceof vscode.TabInputText) {
    const ref = fromRevUri(input.uri);
    return ref ? { ref, tab } : undefined;
  }
  return undefined;
}

async function historyChain(repoRoot: string, relPath: string, from?: string): Promise<LogEntry[]> {
  const args = [
    "log",
    "--follow",
    "-n",
    String(NAV_LOG_LIMIT),
    `--format=${LOG_FORMAT}`,
    "--name-status",
  ];
  if (from) args.push(from);
  args.push("--", relPath);
  return parseLogRecords(await runGit(args, { cwd: repoRoot }));
}

async function step(services: Services, direction: "older" | "newer"): Promise<void> {
  const active = activeRevisionRef();
  if (!active) {
    void vscode.window.showInformationMessage(
      "Gitective: open a Gitective revision or diff first.",
    );
    return;
  }
  const { ref, tab } = active;

  // newest → oldest; the path is valid at HEAD unless renamed since, in which
  // case only stepping older (anchored at the revision itself) still works
  let entries = await historyChain(ref.repoRoot, ref.relPath);
  let index = entries.findIndex((entry) => entry.sha === ref.sha);
  if (index === -1) {
    if (direction === "newer") {
      void vscode.window.showInformationMessage(
        "Gitective: no newer revision found for this file.",
      );
      return;
    }
    entries = await historyChain(ref.repoRoot, ref.relPath, ref.sha);
    index = 0;
  }

  const target = entries[direction === "older" ? index + 1 : index - 1];
  if (!target) {
    void vscode.window.showInformationMessage(
      direction === "older"
        ? "Gitective: already at the oldest revision."
        : "Gitective: already at the newest revision.",
    );
    return;
  }

  const change = target.changes?.[0] ?? { status: "M", path: ref.relPath };
  await openDiffForChange(ref.repoRoot, target.sha, change);
  await vscode.window.tabGroups.close(tab, true);
}

export function olderRevision(services: Services): Promise<void> {
  return step(services, "older");
}

export function newerRevision(services: Services): Promise<void> {
  return step(services, "newer");
}
