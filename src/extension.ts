import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { BlameService } from "./git/blameService";
import { RepoResolver } from "./git/repository";
import { runGit } from "./git/run";
import { GitWatcher } from "./gitWatcher";
import { log } from "./log";
import { BlameHud } from "./providers/blameHud";
import { BlameChangesHoverProvider, BlameHoverProvider } from "./providers/hoverProvider";
import { RevisionContentProvider } from "./providers/revisionProvider";
import type { Services } from "./services";
import { REV_SCHEME } from "./uris";

export function activate(context: vscode.ExtensionContext): void {
  const hudRef: { current?: BlameHud } = {};
  const blame = new BlameService();
  const watcher = new GitWatcher((root) => {
    blame.invalidateRepo(root);
    hudRef.current?.refresh();
  });
  const services: Services = {
    resolver: new RepoResolver((info) => watcher.watch(info.root)),
    blame,
  };
  const hud = new BlameHud(services);
  hudRef.current = hud;

  context.subscriptions.push(
    hud,
    watcher,
    vscode.workspace.registerTextDocumentContentProvider(REV_SCHEME, new RevisionContentProvider()),
    vscode.languages.registerHoverProvider(
      [{ scheme: "file" }, { scheme: REV_SCHEME }],
      new BlameHoverProvider(services),
    ),
    vscode.languages.registerHoverProvider(
      [{ scheme: "file" }, { scheme: REV_SCHEME }],
      new BlameChangesHoverProvider(services),
    ),
    ...registerCommands(services),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("whodunit")) hud.refresh();
    }),
    // document versions restart on reopen, so a stale entry could match again
    vscode.workspace.onDidCloseTextDocument((doc) => blame.invalidateDoc(doc.uri.toString())),
  );

  void checkGitAvailable();
}

async function checkGitAvailable(): Promise<void> {
  try {
    await runGit(["--version"], { cwd: "/" });
  } catch (error) {
    log().error(`git unavailable: ${error instanceof Error ? error.message : String(error)}`);
    void vscode.window.showWarningMessage("Whodunit needs git on your PATH to work.");
  }
}

export function deactivate(): void {}
