import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;

export function log(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel("Whodunit", { log: true });
  return channel;
}

// never awaited into a command's lifetime: an unclicked toast must not block callers
export function reportError(context: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  log().error(`${context}: ${detail}`);
  void vscode.window.showErrorMessage("Whodunit hit an error.", "Open Logs").then((pick) => {
    if (pick) log().show();
  });
}
