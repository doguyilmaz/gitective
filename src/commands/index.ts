import * as vscode from "vscode";
import { reportError } from "../log";
import type { Services } from "../services";
import { commitMenu, inspectCommit, openChangeInCommit } from "./commitMenu";
import { fileHistory } from "./history";
import {
  compareWithPrevious,
  compareWithWorking,
  copyMessage,
  copySha,
  openAtRevision,
} from "./lineActions";
import { lineHistory } from "./lineHistory";
import { copyRemoteLink, openOnRemote } from "./remoteLinks";
import { newerRevision, olderRevision } from "./revNav";
import { searchCommits } from "./search";

type Handler = (services: Services, arg: unknown) => Promise<void>;

// write to the scope that currently defines the value, or the toggle is a no-op
async function toggleInline(): Promise<void> {
  const config = vscode.workspace.getConfiguration("gitective");
  const current = config.get("inline.enabled", true);
  const info = config.inspect<boolean>("inline.enabled");
  const target =
    info?.workspaceFolderValue !== undefined || info?.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await config.update("inline.enabled", !current, target);
}

const handlers: Record<string, Handler> = {
  "gitective.copySha": copySha,
  "gitective.copyMessage": copyMessage,
  "gitective.compareWithPrevious": compareWithPrevious,
  "gitective.compareWithWorking": compareWithWorking,
  "gitective.openAtRevision": openAtRevision,
  "gitective.commitMenu": commitMenu,
  "gitective.inspectCommit": inspectCommit,
  "gitective.openChangeInCommit": openChangeInCommit,
  "gitective.lineHistory": lineHistory,
  "gitective.openOnRemote": openOnRemote,
  "gitective.copyRemoteLink": copyRemoteLink,
  "gitective.fileHistory": fileHistory,
  "gitective.searchCommits": (services) => searchCommits(services),
  "gitective.olderRevision": (services) => olderRevision(services),
  "gitective.newerRevision": (services) => newerRevision(services),
  "gitective.toggleInline": toggleInline,
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
