import { realpath } from "node:fs/promises";
import { relative, sep } from "node:path";
import { GitError, runGit } from "./run";

export interface RepoInfo {
  root: string;
  realDir: string;
  userName?: string;
  userEmail?: string;
}

interface CacheEntry {
  promise: Promise<RepoInfo | undefined>;
  negativeAt?: number;
}

const NEGATIVE_TTL_MS = 30_000;

async function readConfig(root: string, key: string): Promise<string | undefined> {
  try {
    const value = (await runGit(["config", key], { cwd: root })).trim();
    return value || undefined;
  } catch (error) {
    if (error instanceof GitError) return undefined;
    throw error;
  }
}

// rev-parse returns a symlink-resolved root, so resolve the queried dir the
// same way or relative paths computed against the root escape the repo
async function discover(dir: string): Promise<RepoInfo | undefined> {
  const realDir = await realpath(dir).catch(() => dir);
  let root: string;
  try {
    root = (await runGit(["rev-parse", "--show-toplevel"], { cwd: realDir })).trim();
  } catch (error) {
    if (error instanceof GitError) return undefined;
    throw error;
  }
  if (!root) return undefined;
  const [userName, userEmail] = await Promise.all([
    readConfig(root, "user.name"),
    readConfig(root, "user.email"),
  ]);
  return { root, realDir, userName, userEmail };
}

export class RepoResolver {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private readonly onDiscovered?: (info: RepoInfo) => void,
    private readonly negativeTtlMs = NEGATIVE_TTL_MS,
  ) {}

  repoForDir(dir: string): Promise<RepoInfo | undefined> {
    const cached = this.cache.get(dir);
    if (cached) {
      const expired =
        cached.negativeAt !== undefined && Date.now() - cached.negativeAt > this.negativeTtlMs;
      if (!expired) return cached.promise;
      this.cache.delete(dir);
    }

    const entry: CacheEntry = {
      promise: discover(dir)
        .then((info) => {
          if (info) this.onDiscovered?.(info);
          else entry.negativeAt = Date.now();
          return info;
        })
        .catch((error) => {
          this.cache.delete(dir);
          throw error;
        }),
    };
    this.cache.set(dir, entry);
    return entry.promise;
  }

  invalidate(): void {
    this.cache.clear();
  }
}

export function relPath(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join("/");
}
