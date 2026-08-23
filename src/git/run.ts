import { execFile } from "node:child_process";

export class GitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export interface RunOptions {
  cwd: string;
  stdin?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  env?: Record<string, string>;
}

const MAX_BUFFER = 32 * 1024 * 1024;

export function runGit(args: string[], opts: RunOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd: opts.cwd,
        signal: opts.signal,
        timeout: opts.timeoutMs ?? 15_000,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_OPTIONAL_LOCKS: "0",
          ...opts.env,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          const exitCode = typeof error.code === "number" ? error.code : -1;
          reject(
            new GitError(`git ${args[0] ?? ""} failed: ${stderr.trim() || error.message}`, exitCode, stderr),
          );
          return;
        }
        resolve(stdout);
      },
    );
    if (opts.stdin !== undefined && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }
  });
}
