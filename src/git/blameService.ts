import { existsSync } from "node:fs";
import { join } from "node:path";
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
const IGNORE_REVS_FILE = ".git-blame-ignore-revs";

export interface BlameOptions {
  ignoreWhitespace: boolean;
  ignoreRevsFile: boolean;
}

export class BlameService {
  private cache = new Map<string, CacheEntry>();
  private repoByKey = new Map<string, string>();
  private options: BlameOptions = { ignoreWhitespace: false, ignoreRevsFile: true };

  configure(options: BlameOptions): void {
    if (
      options.ignoreWhitespace === this.options.ignoreWhitespace &&
      options.ignoreRevsFile === this.options.ignoreRevsFile
    )
      return;
    this.options = options;
    this.clear();
  }

  // no caller-supplied AbortSignal: the promise is shared across consumers,
  // so one consumer's cancellation must not kill everyone's blame
  getBlame(req: BlameRequest): Promise<FileBlame | undefined> {
    const cached = this.cache.get(req.key);
    if (cached && cached.version === req.version) {
      this.cache.delete(req.key);
      this.cache.set(req.key, cached);
      return cached.promise;
    }

    const promise = this.blame(req).catch((error) => {
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

  private async blame(req: BlameRequest): Promise<FileBlame | undefined> {
    const contents = req.contents?.();
    if (contents !== undefined && contents.length > MAX_CONTENTS_BYTES) return undefined;
    if (req.sha !== undefined && !isValidSha(req.sha)) {
      throw new Error(`invalid revision: ${req.sha}`);
    }

    const args = ["blame", "--porcelain"];
    if (this.options.ignoreWhitespace) args.push("-w");
    const revsFile = join(req.repoRoot, IGNORE_REVS_FILE);
    const withRevs = this.options.ignoreRevsFile && existsSync(revsFile);
    if (withRevs) args.push("--ignore-revs-file", IGNORE_REVS_FILE);
    if (req.sha !== undefined) args.push(req.sha);
    else args.push("--contents=-");
    args.push("--", req.relPath);

    try {
      return parsePorcelain(await runGit(args, { cwd: req.repoRoot, stdin: contents }));
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      // a malformed or missing ignore-revs file must not take blame down with it
      if (withRevs && /ignore-revs|could not open|invalid object name/i.test(error.stderr)) {
        const retry = args.filter(
          (arg, i) => arg !== "--ignore-revs-file" && args[i - 1] !== "--ignore-revs-file",
        );
        try {
          return parsePorcelain(await runGit(retry, { cwd: req.repoRoot, stdin: contents }));
        } catch (retryError) {
          if (retryError instanceof GitError && retryError.exitCode === 128) return undefined;
          throw retryError;
        }
      }
      // exit 128 covers all expected can't-blame states: untracked, unborn HEAD, path absent in rev
      if (error.exitCode === 128) return undefined;
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
