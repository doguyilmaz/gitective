import * as vscode from "vscode";
import { reportError } from "../log";
import type { Services } from "../services";
import { fileHistory } from "./history";
import {
  compareWithPrevious,
  copyMessage,
  copySha,
  lineActions,
  openAtRevision,
  showCommit,
} from "./lineActions";
import { newerRevision, olderRevision } from "./revNav";
import { searchCommits } from "./search";

type Handler = (services: Services, arg: unknown) => Promise<void>;

// write to the scope that currently defines the value, or the toggle is a no-op
async function toggleInline(): Promise<void> {
  const config = vscode.workspace.getConfiguration("whodunit");
  const current = config.get("inline.enabled", true);
  const info = config.inspect<boolean>("inline.enabled");
  const target =
    info?.workspaceFolderValue !== undefined || info?.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await config.update("inline.enabled", !current, target);
}

const handlers: Record<string, Handler> = {
  "whodunit.copySha": copySha,
  "whodunit.copyMessage": copyMessage,
  "whodunit.compareWithPrevious": compareWithPrevious,
  "whodunit.openAtRevision": openAtRevision,
  "whodunit.showCommit": showCommit,
  "whodunit.lineActions": lineActions,
  "whodunit.fileHistory": fileHistory,
  "whodunit.searchCommits": (services) => searchCommits(services),
  "whodunit.olderRevision": (services) => olderRevision(services),
  "whodunit.newerRevision": (services) => newerRevision(services),
  "whodunit.toggleInline": toggleInline,
};

export function registerCommands(services: Services): vscode.Disposable[] {
  return Object.entries(handlers).map(([id, handler]) =>
    vscode.commands.registerCommand(id, async (arg?: unknown) => {
      try {
        await handler(services, arg);
      } catch (error) {
        reportError(id, error);
      }
    }),
  );
}
