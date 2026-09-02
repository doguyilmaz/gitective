import type * as vscode from "vscode";
import type { AvatarDiskCache } from "./avatarCache";
import type { BlameService } from "./git/blameService";
import type { RemoteResolver } from "./git/remotes";
import type { RepoResolver } from "./git/repository";

export interface Services {
  resolver: RepoResolver;
  blame: BlameService;
  remotes: RemoteResolver;
  avatarCache: AvatarDiskCache;
  globalState: vscode.Memento;
}
