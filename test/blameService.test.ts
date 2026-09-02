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
    const blame = await new BlameService().getBlame(req(repo, { contents: () => contents }));
    expect(blame).toBeDefined();
    expect(blame?.lines.map((l) => l.sha)).toEqual([sha1, sha2, sha1]);
    expect(blame?.commits.get(sha2)?.author).toBe("Bob");
    expect(blame?.commits.get(sha2)?.summary).toBe("second");
  });

  test("dirty buffer lines show as uncommitted, rest keep their commits", async () => {
    const { repo, sha1 } = await repoWithHistory();
    const dirty = "line one\nline two CHANGED\nline three EDITED\n";
    const blame = await new BlameService().getBlame(req(repo, { contents: () => dirty }));
    expect(blame?.lines[2]?.sha).toBe(UNCOMMITTED_SHA);
    expect(blame?.lines[0]?.sha).toBe(sha1);
    expect(blame?.commits.get(UNCOMMITTED_SHA)?.isUncommitted).toBe(true);
  });

  test("untracked file yields undefined", async () => {
    const repo = await makeRepo();
    await commitFile(repo, FILE, V1, "first");
    const blame = await new BlameService().getBlame(
      req(repo, { relPath: "src/untracked.ts", contents: () => "hello\n" }),
    );
    expect(blame).toBeUndefined();
  });

  test("repo without commits yields undefined", async () => {
    const repo = await makeRepo();
    const blame = await new BlameService().getBlame(req(repo, { contents: () => "x\n" }));
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
    const first = await service.getBlame(req(repo, { contents: () => contents }));
    const second = await service.getBlame(req(repo, { contents: () => contents }));
    expect(second).toBe(first!);
  });

  test("version bump recomputes", async () => {
    const { repo } = await repoWithHistory();
    const service = new BlameService();
    const contents = await readFile(join(repo, FILE), "utf8");
    const first = await service.getBlame(req(repo, { contents: () => contents }));
    const second = await service.getBlame(req(repo, { contents: () => contents, version: 2 }));
    expect(second).not.toBe(first!);
  });

  test("invalidateRepo clears entries for that root", async () => {
    const { repo } = await repoWithHistory();
    const service = new BlameService();
    const contents = await readFile(join(repo, FILE), "utf8");
    const first = await service.getBlame(req(repo, { contents: () => contents }));
    service.invalidateRepo(repo);
    const second = await service.getBlame(req(repo, { contents: () => contents }));
    expect(second).not.toBe(first!);
  });

  test("oversized contents are refused", async () => {
    const { repo } = await repoWithHistory();
    const service = new BlameService();
    const huge = "x".repeat(6 * 1024 * 1024);
    expect(await service.getBlame(req(repo, { contents: () => huge }))).toBeUndefined();
  });
});

describe("BlameService options", () => {
  const WS_FILE = "ws.txt";

  async function repoWithWhitespaceCommit() {
    const repo = await makeRepo();
    const original = await commitFile(repo, WS_FILE, "alpha\nbeta\n", "content", {
      name: "Alice",
      email: "alice@example.com",
    });
    const reformat = await commitFile(repo, WS_FILE, "alpha\n  beta\n", "reindent", {
      name: "Bot",
      email: "bot@example.com",
    });
    return { repo, original, reformat };
  }

  test("ignoreWhitespace attributes reindented lines to the original author", async () => {
    const { repo, original, reformat } = await repoWithWhitespaceCommit();
    const contents = await readFile(join(repo, WS_FILE), "utf8");
    const plain = new BlameService();
    const withWs = new BlameService();
    withWs.configure({ ignoreWhitespace: true, ignoreRevsFile: false });
    const req = {
      key: `${repo}/${WS_FILE}`,
      version: 1,
      repoRoot: repo,
      relPath: WS_FILE,
      contents: () => contents,
    };
    expect((await plain.getBlame(req))?.lines[1]?.sha).toBe(reformat);
    expect((await withWs.getBlame(req))?.lines[1]?.sha).toBe(original);
  });

  test(".git-blame-ignore-revs is honored and a broken one is tolerated", async () => {
    const { repo, original, reformat } = await repoWithWhitespaceCommit();
    const contents = await readFile(join(repo, WS_FILE), "utf8");
    const req = {
      key: `${repo}/${WS_FILE}`,
      version: 1,
      repoRoot: repo,
      relPath: WS_FILE,
      contents: () => contents,
    };
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(repo, ".git-blame-ignore-revs"), `${reformat}\n`);
    expect((await new BlameService().getBlame(req))?.lines[1]?.sha).toBe(original);
    await writeFile(join(repo, ".git-blame-ignore-revs"), "not-a-sha\n");
    expect((await new BlameService().getBlame(req))?.lines[1]?.sha).toBe(reformat);
  });

  test("configure clears the cache only when options change", async () => {
    const { repo } = await repoWithWhitespaceCommit();
    const contents = await readFile(join(repo, WS_FILE), "utf8");
    const req = {
      key: `${repo}/${WS_FILE}`,
      version: 1,
      repoRoot: repo,
      relPath: WS_FILE,
      contents: () => contents,
    };
    const service = new BlameService();
    const first = await service.getBlame(req);
    service.configure({ ignoreWhitespace: false, ignoreRevsFile: true });
    expect(await service.getBlame(req)).toBe(first!);
    service.configure({ ignoreWhitespace: true, ignoreRevsFile: true });
    expect(await service.getBlame(req)).not.toBe(first!);
  });
});
