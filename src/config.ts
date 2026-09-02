import * as vscode from "vscode";
import type { DateStyle } from "./core/time";

export interface WhodunitConfig {
  inlineEnabled: boolean;
  inlineFormat: string;
  inlineAgeTint: boolean;
  hoverEnabled: boolean;
  hoverTrigger: "annotation" | "line";
  hoverAvatars: boolean;
  hoverShowChanges: boolean;
  statusBarEnabled: boolean;
  statusBarFormat: string;
  messageMaxLength: number;
  dateStyle: DateStyle;
  blameIgnoreWhitespace: boolean;
  blameIgnoreRevsFile: boolean;
}

export function getConfig(): WhodunitConfig {
  const config = vscode.workspace.getConfiguration("whodunit");
  return {
    inlineEnabled: config.get("inline.enabled", true),
    inlineFormat: config.get("inline.format", "${author}, ${ago} • ${message}"),
    inlineAgeTint: config.get("inline.ageTint", true),
    hoverEnabled: config.get("hover.enabled", true),
    hoverTrigger: config.get("hover.trigger", "annotation" as const),
    hoverAvatars: config.get("hover.avatars", true),
    hoverShowChanges: config.get("hover.showChanges", true),
    statusBarEnabled: config.get("statusBar.enabled", true),
    statusBarFormat: config.get("statusBar.format", "$(git-commit) ${author}, ${ago}"),
    messageMaxLength: Math.max(4, config.get("message.maxLength", 60)),
    dateStyle: config.get("dateFormat", "medium" as const),
    blameIgnoreWhitespace: config.get("blame.ignoreWhitespace", false),
    blameIgnoreRevsFile: config.get("blame.ignoreRevsFile", true),
  };
}
