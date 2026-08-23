import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { UNCOMMITTED_SHA } from "../src/core/blame";
import { BlameService } from "../src/git/blameService";
import { commitFile, makeRepo } from "./helpers";

const FILE = "src/app.ts";
const V1 = "line one\nline two\nline three\n";
const V2 = "line one\nline two CHANGED\nline three\n";

async function repoWithHistory() {
  const repo = await makeRepo();
  const sha1 = await commitFile(repo, FILE, V1, "first", {
    name: "Alice",
    email: "alice@example.com",
  });
  const sha2 = await commitFile(repo, FILE, V2, "second", {
    name: "Bob",
    email: "bob@example.com",
  });
  return { repo, sha1, sha2 };
}

function req(repo: string, overrides: Partial<Parameters<BlameService["getBlame"]>[0]> = {}) {
  return {
    key: `${repo}/${FILE}`,
    version: 1,
    repoRoot: repo,
    relPath: FILE,
    ...overrides,
  };
}

describe("BlameService working blame", () => {
  test("blames committed contents", async () => {
    const { repo, sha1, sha2 } = await repoWithHistory();
    const contents = await readFile(join(repo, FILE), "utf8");
    const blame = await new BlameService().getBlame(req(repo, { contents }));
    expect(blame).toBeDefined();
    expect(blame?.lines.map((l) => l.sha)).toEqual([sha1, sha2, sha1]);
    expect(blame?.commits.get(sha2)?.author).toBe("Bob");
    expect(blame?.commits.get(sha2)?.summary).toBe("second");
  });

  test("dirty buffer lines show as uncommitted, rest keep their commits", async () => {
    const { repo, sha1 } = await repoWithHistory();
    const dirty = "line one\nline two CHANGED\nline three EDITED\n";
    const blame = await new BlameService().getBlame(req(repo, { contents: dirty }));
    expect(blame?.lines[2]?.sha).toBe(UNCOMMITTED_SHA);
    expect(blame?.lines[0]?.sha).toBe(sha1);
    expect(blame?.commits.get(UNCOMMITTED_SHA)?.isUncommitted).toBe(true);
  });

  test("untracked file yields undefined", async () => {
    const repo = await makeRepo();
    await commitFile(repo, FILE, V1, "first");
    const blame = await new BlameService().getBlame(
      req(repo, { relPath: "src/untracked.ts", contents: "hello\n" }),
    );
    expect(blame).toBeUndefined();
  });

  test("repo without commits yields undefined", async () => {
    const repo = await makeRepo();
    const blame = await new BlameService().getBlame(req(repo, { contents: "x\n" }));
    expect(blame).toBeUndefined();
  });
});

describe("BlameService revision blame", () => {
  test("blames the file as of an old revision", async () => {
    const { repo, sha1 } = await repoWithHistory();
    const blame = await new BlameService().getBlame(req(repo, { sha: sha1 }));
    expect(blame?.lines).toHaveLength(3);
    expect(new Set(blame?.lines.map((l) => l.sha))).toEqual(new Set([sha1]));
    expect(blame?.commits.get(sha1)?.author).toBe("Alice");
  });

  test("rejects an invalid sha", async () => {
    const { repo } = await repoWithHistory();
    await expect(new BlameService().getBlame(req(repo, { sha: "not-a-sha" }))).rejects.toThrow();
  });
});

describe("BlameService caching", () => {
  test("same key and version reuse the result", async () => {
    const { repo } = await repoWithHistory();
    const service = new BlameService();
    const contents = await readFile(join(repo, FILE), "utf8");
    const first = await service.getBlame(req(repo, { contents }));
    const second = await service.getBlame(req(repo, { contents }));
    expect(second).toBe(first!);
  });

  test("version bump recomputes", async () => {
    const { repo } = await repoWithHistory();
    const service = new BlameService();
    const contents = await readFile(join(repo, FILE), "utf8");
    const first = await service.getBlame(req(repo, { contents }));
    const second = await service.getBlame(req(repo, { contents, version: 2 }));
    expect(second).not.toBe(first!);
  });

  test("invalidateRepo clears entries for that root", async () => {
    const { repo } = await repoWithHistory();
    const service = new BlameService();
    const contents = await readFile(join(repo, FILE), "utf8");
    const first = await service.getBlame(req(repo, { contents }));
    service.invalidateRepo(repo);
    const second = await service.getBlame(req(repo, { contents }));
    expect(second).not.toBe(first!);
  });

  test("oversized contents are refused", async () => {
    const { repo } = await repoWithHistory();
    const service = new BlameService();
    const huge = "x".repeat(6 * 1024 * 1024);
    expect(await service.getBlame(req(repo, { contents: huge }))).toBeUndefined();
  });
});
