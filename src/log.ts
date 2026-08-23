import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;

export function log(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel("Whodunit", { log: true });
  return channel;
}

export async function reportError(context: string, error: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);
  log().error(`${context}: ${detail}`);
  const pick = await vscode.window.showErrorMessage("Whodunit hit an error.", "Open Logs");
  if (pick) log().show();
}
