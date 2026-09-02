import type { Remote } from "../core/remote";
import { parseRemote } from "../core/remote";
import { GitError, runGit } from "./run";

export class RemoteResolver {
  private readonly cache = new Map<string, Promise<Remote | undefined>>();

  remoteFor(repoRoot: string): Promise<Remote | undefined> {
    let cached = this.cache.get(repoRoot);
    if (!cached) {
      cached = runGit(["remote", "get-url", "origin"], { cwd: repoRoot }).then(
        (url) => parseRemote(url),
        (error) => {
          if (error instanceof GitError) return undefined;
          throw error;
        },
      );
      this.cache.set(repoRoot, cached);
    }
    return cached;
  }

  invalidate(): void {
    this.cache.clear();
  }
}
