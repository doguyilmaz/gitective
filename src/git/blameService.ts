import { parsePorcelain, type FileBlame } from "../core/blame";
import { isValidSha } from "../core/sanitize";
import { GitError, runGit } from "./run";

export interface BlameRequest {
  key: string;
  version: number;
  repoRoot: string;
  relPath: string;
  contents?: () => string;
  sha?: string;
}

interface CacheEntry {
  version: number;
  promise: Promise<FileBlame | undefined>;
}

const CACHE_LIMIT = 32;
const MAX_CONTENTS_BYTES = 5 * 1024 * 1024;

export class BlameService {
  private cache = new Map<string, CacheEntry>();
  private repoByKey = new Map<string, string>();

  getBlame(req: BlameRequest, signal?: AbortSignal): Promise<FileBlame | undefined> {
    const cached = this.cache.get(req.key);
    if (cached && cached.version === req.version) {
      this.cache.delete(req.key);
      this.cache.set(req.key, cached);
      return cached.promise;
    }

    const promise = this.blame(req, signal).catch((error) => {
      this.invalidateDoc(req.key);
      throw error;
    });
    this.cache.set(req.key, { version: req.version, promise });
    this.repoByKey.set(req.key, req.repoRoot);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.invalidateDoc(oldest);
    }
    return promise;
  }

  private async blame(req: BlameRequest, signal?: AbortSignal): Promise<FileBlame | undefined> {
    const contents = req.contents?.();
    if (contents !== undefined && contents.length > MAX_CONTENTS_BYTES) return undefined;
    if (req.sha !== undefined && !isValidSha(req.sha)) {
      throw new Error(`invalid revision: ${req.sha}`);
    }

    const args = ["blame", "--porcelain"];
    if (req.sha !== undefined) args.push(req.sha);
    else args.push("--contents=-");
    args.push("--", req.relPath);

    try {
      const output = await runGit(args, {
        cwd: req.repoRoot,
        stdin: contents,
        signal,
      });
      return parsePorcelain(output);
    } catch (error) {
      // exit 128 covers all expected can't-blame states: untracked, unborn HEAD, path absent in rev
      if (error instanceof GitError && error.exitCode === 128) return undefined;
      throw error;
    }
  }

  invalidateDoc(key: string): void {
    this.cache.delete(key);
    this.repoByKey.delete(key);
  }

  invalidateRepo(root: string): void {
    for (const [key, repo] of this.repoByKey) {
      if (repo === root) this.invalidateDoc(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.repoByKey.clear();
  }
}
