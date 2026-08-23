import { relative, sep } from "node:path";
import { GitError, runGit } from "./run";

export interface RepoInfo {
  root: string;
  userName?: string;
  userEmail?: string;
}

async function readConfig(root: string, key: string): Promise<string | undefined> {
  try {
    const value = (await runGit(["config", key], { cwd: root })).trim();
    return value || undefined;
  } catch (error) {
    if (error instanceof GitError) return undefined;
    throw error;
  }
}

async function discover(dir: string): Promise<RepoInfo | undefined> {
  let root: string;
  try {
    root = (await runGit(["rev-parse", "--show-toplevel"], { cwd: dir })).trim();
  } catch (error) {
    if (error instanceof GitError) return undefined;
    throw error;
  }
  if (!root) return undefined;
  const [userName, userEmail] = await Promise.all([
    readConfig(root, "user.name"),
    readConfig(root, "user.email"),
  ]);
  return { root, userName, userEmail };
}

export class RepoResolver {
  private cache = new Map<string, Promise<RepoInfo | undefined>>();

  repoForDir(dir: string): Promise<RepoInfo | undefined> {
    let cached = this.cache.get(dir);
    if (!cached) {
      cached = discover(dir).catch((error) => {
        this.cache.delete(dir);
        throw error;
      });
      this.cache.set(dir, cached);
    }
    return cached;
  }

  invalidate(): void {
    this.cache.clear();
  }
}

export function relPath(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join("/");
}
