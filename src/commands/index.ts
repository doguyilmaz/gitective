import * as vscode from "vscode";
import { reportError } from "../log";
import type { Services } from "../services";
import { compareWithPrevious, copyMessage, copySha, openAtRevision } from "./lineActions";

type Handler = (services: Services, arg: unknown) => Promise<void>;

const handlers: Record<string, Handler> = {
  "whodunit.copySha": copySha,
  "whodunit.copyMessage": copyMessage,
  "whodunit.compareWithPrevious": compareWithPrevious,
  "whodunit.openAtRevision": openAtRevision,
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
