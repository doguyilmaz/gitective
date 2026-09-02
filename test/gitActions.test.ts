import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkoutDetached,
  createBranch,
  createTag,
  revertCommit,
  validRefName,
} from "../src/git/actions";
import { GitError } from "../src/git/run";
import { commitFile, git, makeRepo } from "./helpers";

async function twoCommits() {
  const repo = await makeRepo();
  const sha1 = await commitFile(repo, "a.txt", "one\n", "first");
  const sha2 = await commitFile(repo, "a.txt", "two\n", "second");
  return { repo, sha1, sha2 };
}

describe("validRefName", () => {
  test("accepts and rejects via git itself", async () => {
    const { repo } = await twoCommits();
    expect(await validRefName(repo, "feat/thing")).toBe(true);
    expect(await validRefName(repo, "bad name")).toBe(false);
    expect(await validRefName(repo, "-flag")).toBe(false);
    expect(await validRefName(repo, "")).toBe(false);
  });
});

describe("git actions", () => {
  test("createBranch points at the commit", async () => {
    const { repo, sha1 } = await twoCommits();
    await createBranch(repo, "from-first", sha1);
    expect((await git(repo, "rev-parse", "from-first")).trim()).toBe(sha1);
  });

  test("createTag points at the commit", async () => {
    const { repo, sha1 } = await twoCommits();
    await createTag(repo, "v0", sha1);
    expect((await git(repo, "rev-parse", "v0^{commit}")).trim()).toBe(sha1);
  });

  test("revertCommit creates a new commit undoing the change", async () => {
    const { repo, sha2 } = await twoCommits();
    await revertCommit(repo, sha2);
    expect(await git(repo, "show", "HEAD:a.txt")).toBe("one\n");
    expect((await git(repo, "rev-list", "--count", "HEAD")).trim()).toBe("3");
  });

  test("revert conflict surfaces git's error", async () => {
    const { repo, sha1 } = await twoCommits();
    await commitFile(repo, "a.txt", "three\n", "third");
    await expect(revertCommit(repo, sha1)).rejects.toBeInstanceOf(GitError);
    await git(repo, "revert", "--abort");
  });

  test("checkoutDetached moves HEAD, dirty tree is refused", async () => {
    const { repo, sha1, sha2 } = await twoCommits();
    await checkoutDetached(repo, sha1);
    expect((await git(repo, "rev-parse", "HEAD")).trim()).toBe(sha1);
    await writeFile(join(repo, "a.txt"), "dirty\n");
    await expect(checkoutDetached(repo, sha2)).rejects.toBeInstanceOf(GitError);
  });

  test("invalid shas are refused before touching git", async () => {
    const { repo } = await twoCommits();
    await expect(createBranch(repo, "x", "HEAD")).rejects.toThrow("invalid revision");
  });
});
