import * as vscode from "vscode";
import { reportError } from "../log";
import type { Services } from "../services";
import { compareWithPrevious, copyMessage, copySha, openAtRevision } from "./lineActions";

type Handler = (services: Services, arg: unknown) => Promise<void>;

async function toggleInline(): Promise<void> {
  const config = vscode.workspace.getConfiguration("whodunit");
  const current = config.get("inline.enabled", true);
  await config.update("inline.enabled", !current, vscode.ConfigurationTarget.Global);
}

const handlers: Record<string, Handler> = {
  "whodunit.copySha": copySha,
  "whodunit.copyMessage": copyMessage,
  "whodunit.compareWithPrevious": compareWithPrevious,
  "whodunit.openAtRevision": openAtRevision,
  "whodunit.toggleInline": toggleInline,
};

export function registerCommands(services: Services): vscode.Disposable[] {
  return Object.entries(handlers).map(([id, handler]) =>
    vscode.commands.registerCommand(id, async (arg?: unknown) => {
      try {
        await handler(services, arg);
      } catch (error) {
        await reportError(id, error);
      }
    }),
  );
}
