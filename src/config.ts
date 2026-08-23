import * as vscode from "vscode";

export interface WhodunitConfig {
  inlineEnabled: boolean;
  inlineFormat: string;
  hoverEnabled: boolean;
  hoverShowChanges: boolean;
  statusBarEnabled: boolean;
  statusBarFormat: string;
  messageMaxLength: number;
}

export function getConfig(): WhodunitConfig {
  const config = vscode.workspace.getConfiguration("whodunit");
  return {
    inlineEnabled: config.get("inline.enabled", true),
    inlineFormat: config.get("inline.format", "${author}, ${ago} • ${message}"),
    hoverEnabled: config.get("hover.enabled", true),
    hoverShowChanges: config.get("hover.showChanges", true),
    statusBarEnabled: config.get("statusBar.enabled", true),
    statusBarFormat: config.get("statusBar.format", "$(git-commit) ${author}, ${ago}"),
    messageMaxLength: Math.max(4, config.get("message.maxLength", 60)),
  };
}
