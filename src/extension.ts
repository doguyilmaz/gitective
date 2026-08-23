import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { BlameService } from "./git/blameService";
import { RepoResolver } from "./git/repository";
import { BlameHud } from "./providers/blameHud";
import { RevisionContentProvider } from "./providers/revisionProvider";
import type { Services } from "./services";
import { REV_SCHEME } from "./uris";

export function activate(context: vscode.ExtensionContext): void {
  const services: Services = {
    resolver: new RepoResolver(),
    blame: new BlameService(),
  };
  const hud = new BlameHud(services);

  context.subscriptions.push(
    hud,
    vscode.workspace.registerTextDocumentContentProvider(REV_SCHEME, new RevisionContentProvider()),
    ...registerCommands(services),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("whodunit")) hud.refresh();
    }),
  );
}

export function deactivate(): void {}
