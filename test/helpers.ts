import { mkdtemp, realpath, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "../src/git/run";

const hermetic = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

export async function git(cwd: string, ...args: string[]): Promise<string> {
  return runGit(args, { cwd, env: hermetic });
}

export async function makeRepo(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "gitective-")));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.name", "Test Author");
  await git(dir, "config", "user.email", "test@example.com");
  return dir;
}

export async function commitFile(
  repo: string,
  relPath: string,
  content: string,
  message: string,
  author?: { name: string; email: string },
): Promise<string> {
  const abs = join(repo, relPath);
  const parent = join(abs, "..");
  await mkdir(parent, { recursive: true });
  await writeFile(abs, content);
  await git(repo, "add", "--", relPath);
  const authorArgs = author ? [`--author=${author.name} <${author.email}>`] : [];
  await git(repo, "commit", "-q", "-m", message, ...authorArgs);
  return (await git(repo, "rev-parse", "HEAD")).trim();
}
