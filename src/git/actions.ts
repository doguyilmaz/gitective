import { isValidSha } from "../core/sanitize";
import { GitError, runGit } from "./run";

function assertSha(sha: string): void {
  if (!isValidSha(sha)) throw new Error(`invalid revision: ${sha}`);
}

export async function validRefName(repoRoot: string, name: string): Promise<boolean> {
  if (!name || name.startsWith("-")) return false;
  try {
    await runGit(["check-ref-format", "--branch", name], { cwd: repoRoot });
    return true;
  } catch (error) {
    if (error instanceof GitError) return false;
    throw error;
  }
}

export async function createBranch(repoRoot: string, name: string, sha: string): Promise<void> {
  assertSha(sha);
  await runGit(["branch", "--", name, sha], { cwd: repoRoot });
}

export async function createTag(repoRoot: string, name: string, sha: string): Promise<void> {
  assertSha(sha);
  await runGit(["tag", "--", name, sha], { cwd: repoRoot });
}

export async function revertCommit(repoRoot: string, sha: string): Promise<void> {
  assertSha(sha);
  await runGit(["revert", "--no-edit", sha], { cwd: repoRoot });
}

export async function checkoutDetached(repoRoot: string, sha: string): Promise<void> {
  assertSha(sha);
  await runGit(["switch", "--detach", sha], { cwd: repoRoot });
}
