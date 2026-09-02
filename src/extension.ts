import { join } from "node:path";
import * as vscode from "vscode";
import { AvatarDiskCache } from "./avatarCache";
import { nudgeBuiltinBlame } from "./builtinBlame";
import { registerCommands } from "./commands";
import { BlameService } from "./git/blameService";
import { RemoteResolver } from "./git/remotes";
import { RepoResolver } from "./git/repository";
import { runGit } from "./git/run";
import { GitWatcher } from "./gitWatcher";
import { log } from "./log";
import { getConfig } from "./config";
import { BLAMEABLE_SCHEMES } from "./docContext";
import { BlameHud } from "./providers/blameHud";
import {
  COMMIT_SCHEME,
  CommitCodeLensProvider,
  CommitContentProvider,
} from "./providers/commitView";
import { RevisionDecorationProvider } from "./providers/revisionDecoration";
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
    remotes: new RemoteResolver(),
    avatarCache: new AvatarDiskCache(join(context.globalStorageUri.fsPath, "avatars")),
    globalState: context.globalState,
  };
  const applyBlameOptions = () => {
    const cfg = getConfig();
    blame.configure({
      ignoreWhitespace: cfg.blameIgnoreWhitespace,
      ignoreRevsFile: cfg.blameIgnoreRevsFile,
    });
  };
  applyBlameOptions();
  const hud = new BlameHud(services);
  hudRef.current = hud;

  context.subscriptions.push(
    hud,
    watcher,
    vscode.workspace.registerTextDocumentContentProvider(REV_SCHEME, new RevisionContentProvider()),
    vscode.workspace.registerTextDocumentContentProvider(
      COMMIT_SCHEME,
      new CommitContentProvider(),
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: COMMIT_SCHEME },
      new CommitCodeLensProvider(),
    ),
    vscode.window.registerFileDecorationProvider(new RevisionDecorationProvider()),
    // for equal selectors vs code renders the LAST-registered provider's
    // hover first, so changes goes in before details to end up below it
    vscode.languages.registerHoverProvider(
      BLAMEABLE_SCHEMES.map((scheme) => ({ scheme })),
      new BlameChangesHoverProvider(services),
    ),
    vscode.languages.registerHoverProvider(
      BLAMEABLE_SCHEMES.map((scheme) => ({ scheme })),
      new BlameHoverProvider(services),
    ),
    ...registerCommands(services),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("whodunit")) return;
      if (event.affectsConfiguration("whodunit.blame")) applyBlameOptions();
      hud.refresh();
    }),
    // document versions restart on reopen, so a stale entry could match again
    vscode.workspace.onDidCloseTextDocument((doc) => blame.invalidateDoc(doc.uri.toString())),
  );

  void checkGitAvailable();
  void nudgeBuiltinBlame(context.globalState).catch((error) =>
    log().warn(`builtin blame nudge: ${error instanceof Error ? error.message : String(error)}`),
  );
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
