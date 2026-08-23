import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitError, runGit } from "../src/git/run";
import { relPath, RepoResolver } from "../src/git/repository";
import { commitFile, git, makeRepo } from "./helpers";

describe("runGit", () => {
  test("runs git and returns stdout", async () => {
    const out = await runGit(["--version"], { cwd: tmpdir() });
    expect(out).toContain("git version");
  });

  test("rejects with GitError on failure", async () => {
    expect.assertions(2);
    try {
      await runGit(["definitely-not-a-command"], { cwd: tmpdir() });
    } catch (error) {
      expect(error).toBeInstanceOf(GitError);
      expect((error as GitError).exitCode).not.toBe(0);
    }
  });

  test("passes stdin", async () => {
    const out = await runGit(["hash-object", "--stdin"], {
      cwd: tmpdir(),
      stdin: "hello\n",
    });
    expect(out.trim()).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  test("abort kills the process", async () => {
    const controller = new AbortController();
    const promise = runGit(["--version"], { cwd: tmpdir(), signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeDefined();
  });
});

describe("RepoResolver", () => {
  test("finds repo root from root and subdirectory", async () => {
    const repo = await makeRepo();
    await commitFile(repo, "src/a.ts", "const a = 1;\n", "init");
    const resolver = new RepoResolver();
    expect((await resolver.repoForDir(repo))?.root).toBe(repo);
    expect((await resolver.repoForDir(join(repo, "src")))?.root).toBe(repo);
  });

  test("reads user identity", async () => {
    const repo = await makeRepo();
    const info = await new RepoResolver().repoForDir(repo);
    expect(info?.userName).toBe("Test Author");
    expect(info?.userEmail).toBe("test@example.com");
  });

  test("returns undefined outside a repo", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "whodunit-norepo-")));
    await mkdir(join(dir, "sub"));
    expect(await new RepoResolver().repoForDir(join(dir, "sub"))).toBeUndefined();
  });

  test("resolves symlinked directories to the real repo path", async () => {
    const repo = await makeRepo();
    await commitFile(repo, "src/a.ts", "x\n", "init");
    const linkParent = await realpath(await mkdtemp(join(tmpdir(), "whodunit-link-")));
    const link = join(linkParent, "link");
    await symlink(repo, link);
    const info = await new RepoResolver().repoForDir(join(link, "src"));
    expect(info?.root).toBe(repo);
    expect(info?.realDir).toBe(join(repo, "src"));
    expect(relPath(info!.root, join(info!.realDir, "a.ts"))).toBe("src/a.ts");
  });

  test("expired negative results are re-probed", async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "whodunit-late-")));
    const resolver = new RepoResolver(undefined, 0);
    expect(await resolver.repoForDir(dir)).toBeUndefined();
    await git(dir, "init", "-qb", "main");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await resolver.repoForDir(dir))?.root).toBe(dir);
  });

  test("caches by directory until invalidated", async () => {
    const repo = await makeRepo();
    const resolver = new RepoResolver();
    const first = await resolver.repoForDir(repo);
    const second = await resolver.repoForDir(repo);
    expect(second).toBe(first!);
    resolver.invalidate();
    const third = await resolver.repoForDir(repo);
    expect(third).not.toBe(first!);
    expect(third?.root).toBe(first!.root);
  });
});

describe("relPath", () => {
  test("posix-normalizes nested paths", () => {
    const root = join(tmpdir(), "repo");
    expect(relPath(root, join(root, "a", "b.ts"))).toBe("a/b.ts");
  });
});
