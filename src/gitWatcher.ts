import { watch, type FSWatcher } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type * as vscode from "vscode";
import { log } from "./log";

const CHANGE_DEBOUNCE_MS = 500;
const WATCHED_FILES = new Set(["HEAD", "index", "packed-refs"]);

// .git may be a file pointing at the real git dir (worktrees, submodules)
async function resolveGitDir(root: string): Promise<string | undefined> {
  const dotGit = join(root, ".git");
  try {
    const info = await stat(dotGit);
    if (info.isDirectory()) return dotGit;
    const content = await readFile(dotGit, "utf8");
    const match = /^gitdir:\s*(.+)$/m.exec(content);
    if (!match) return undefined;
    const target = (match[1] as string).trim();
    return isAbsolute(target) ? target : resolve(root, target);
  } catch {
    return undefined;
  }
}

export class GitWatcher implements vscode.Disposable {
  private readonly roots = new Set<string>();
  private readonly watchers = new Map<string, FSWatcher[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private readonly onChange: (root: string) => void) {}

  watch(root: string): void {
    if (this.disposed || this.roots.has(root)) return;
    this.roots.add(root);
    void this.start(root);
  }

  private notify(root: string): void {
    const pending = this.timers.get(root);
    if (pending) clearTimeout(pending);
    this.timers.set(
      root,
      setTimeout(() => {
        this.timers.delete(root);
        this.onChange(root);
      }, CHANGE_DEBOUNCE_MS),
    );
  }

  // dropping the root on any failure lets the next repo discovery retry the watch
  private dropRoot(root: string): void {
    this.roots.delete(root);
    const watchers = this.watchers.get(root);
    this.watchers.delete(root);
    for (const watcher of watchers ?? []) watcher.close();
  }

  private tryWatch(
    root: string,
    dir: string,
    accepts: (filename: string) => boolean,
  ): FSWatcher | undefined {
    try {
      const watcher = watch(dir, (_event, filename) => {
        if (filename !== null && accepts(filename)) this.notify(root);
      });
      watcher.on("error", (error) => {
        log().warn(`git watcher (${root}): ${error.message}`);
        this.dropRoot(root);
      });
      return watcher;
    } catch (error) {
      log().warn(`git watcher (${root}): ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  private async start(root: string): Promise<void> {
    const gitDir = await resolveGitDir(root);
    if (!gitDir || this.disposed) {
      this.roots.delete(root);
      return;
    }
    const watchers: FSWatcher[] = [];
    const main = this.tryWatch(root, gitDir, (name) => WATCHED_FILES.has(name));
    if (!main) {
      this.roots.delete(root);
      return;
    }
    watchers.push(main);
    // logs/HEAD is appended on every ref update, catching amends and
    // branch moves that touch neither HEAD, index, nor packed-refs
    const logs = this.tryWatch(root, join(gitDir, "logs"), (name) => name === "HEAD");
    if (logs) watchers.push(logs);

    if (this.disposed) {
      for (const watcher of watchers) watcher.close();
      return;
    }
    this.watchers.set(root, watchers);
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const watchers of this.watchers.values()) {
      for (const watcher of watchers) watcher.close();
    }
    this.watchers.clear();
    this.roots.clear();
  }
}
