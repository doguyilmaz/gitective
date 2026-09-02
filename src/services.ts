import type * as vscode from "vscode";
import type { BlameService } from "./git/blameService";
import type { RemoteResolver } from "./git/remotes";
import type { RepoResolver } from "./git/repository";

export interface Services {
  resolver: RepoResolver;
  blame: BlameService;
  remotes: RemoteResolver;
  globalState: vscode.Memento;
}
