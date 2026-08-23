import { describe, expect, test } from "bun:test";
import {
  isUncommittedSha,
  lineBlameAt,
  parsePorcelain,
  UNCOMMITTED_SHA,
  unquotePath,
} from "../src/core/blame";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_PREV = "c".repeat(40);

const singleCommit = [
  `${SHA_A} 1 1 2`,
  "author Dogu Yilmaz",
  "author-mail <dogu@example.com>",
  "author-time 1755477840",
  "author-tz +0300",
  "committer Dogu Yilmaz",
  "committer-mail <dogu@example.com>",
  "committer-time 1755477840",
  "committer-tz +0300",
  "summary add ai package, enrichment stages",
  "filename app.ts",
  "\tconst a = 1;",
  `${SHA_A} 2 2`,
  "\tconst b = 2;",
  "",
].join("\n");

const interleaved = [
  `${SHA_A} 1 1 1`,
  "author Alice",
  "author-mail <alice@example.com>",
  "author-time 1700000000",
  "author-tz +0000",
  "summary first",
  "boundary",
  "filename app.ts",
  "\tone",
  `${SHA_B} 2 2 1`,
  "author Bob",
  "author-mail <bob@example.com>",
  "author-time 1700000100",
  "author-tz +0000",
  "summary second",
  `previous ${SHA_PREV} old name.ts`,
  "filename app.ts",
  "\ttwo",
  `${SHA_A} 3 3 1`,
  "filename app.ts",
  "\tthree",
  "",
].join("\n");

const uncommitted = [
  `${UNCOMMITTED_SHA} 1 1 1`,
  "author Not Committed Yet",
  "author-mail <not.committed.yet>",
  "author-time 1755477840",
  "author-tz +0300",
  "summary Version of app.ts from app.ts",
  "filename app.ts",
  "\tdirty line",
  "",
].join("\n");

describe("parsePorcelain", () => {
  test("single commit, grouped lines", () => {
    const blame = parsePorcelain(singleCommit);
    expect(blame.lines).toEqual([
      { line: 1, sha: SHA_A, origLine: 1 },
      { line: 2, sha: SHA_A, origLine: 2 },
    ]);
    const commit = blame.commits.get(SHA_A);
    expect(commit).toBeDefined();
    expect(commit?.author).toBe("Dogu Yilmaz");
    expect(commit?.authorEmail).toBe("dogu@example.com");
    expect(commit?.authorTime).toBe(1755477840);
    expect(commit?.summary).toBe("add ai package, enrichment stages");
    expect(commit?.filename).toBe("app.ts");
    expect(commit?.isUncommitted).toBe(false);
    expect(commit?.boundary).toBe(false);
    expect(commit?.previous).toBeUndefined();
  });

  test("interleaved commits reuse suppressed metadata", () => {
    const blame = parsePorcelain(interleaved);
    expect(blame.lines.map((l) => l.sha)).toEqual([SHA_A, SHA_B, SHA_A]);
    expect(blame.commits.size).toBe(2);
    expect(blame.commits.get(SHA_A)?.author).toBe("Alice");
    expect(blame.commits.get(SHA_A)?.boundary).toBe(true);
    expect(blame.commits.get(SHA_B)?.previous).toEqual({
      sha: SHA_PREV,
      path: "old name.ts",
    });
  });

  test("uncommitted zero-sha lines", () => {
    const blame = parsePorcelain(uncommitted);
    const commit = blame.commits.get(UNCOMMITTED_SHA);
    expect(commit?.isUncommitted).toBe(true);
    expect(blame.lines[0]?.sha).toBe(UNCOMMITTED_SHA);
  });

  test("quoted filename with escapes", () => {
    const input = [
      `${SHA_A} 1 1 1`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "summary quoted",
      'filename "weird\\tname.ts"',
      "\tx",
      "",
    ].join("\n");
    expect(parsePorcelain(input).commits.get(SHA_A)?.filename).toBe("weird\tname.ts");
  });

  test("empty output", () => {
    const blame = parsePorcelain("");
    expect(blame.lines).toEqual([]);
    expect(blame.commits.size).toBe(0);
  });
});

describe("unquotePath", () => {
  test("decodes octal escapes as utf-8 bytes, not code points", () => {
    expect(unquotePath('"caf\\303\\251.ts"')).toBe("café.ts");
    expect(unquotePath('"\\303\\274n\\303\\257code.ts"')).toBe("ünïcode.ts");
  });

  test("unquoted paths pass through", () => {
    expect(unquotePath("plain/path.ts")).toBe("plain/path.ts");
  });
});

describe("sha256 object format", () => {
  const sha256 = "ab".repeat(32);

  test("parses 64-hex entry lines", () => {
    const input = [
      `${sha256} 1 1 1`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "summary sha256 repo",
      "filename app.ts",
      "\tx",
      "",
    ].join("\n");
    const blame = parsePorcelain(input);
    expect(blame.lines[0]?.sha).toBe(sha256);
    expect(blame.commits.get(sha256)?.author).toBe("Alice");
  });

  test("isUncommittedSha accepts 40- and 64-zero sentinels only", () => {
    expect(isUncommittedSha(UNCOMMITTED_SHA)).toBe(true);
    expect(isUncommittedSha("0".repeat(64))).toBe(true);
    expect(isUncommittedSha("0".repeat(10))).toBe(false);
    expect(isUncommittedSha(sha256)).toBe(false);
  });
});

describe("lineBlameAt", () => {
  test("returns line and commit for a 1-based line", () => {
    const blame = parsePorcelain(interleaved);
    expect(lineBlameAt(blame, 2)?.commit.author).toBe("Bob");
    expect(lineBlameAt(blame, 2)?.line.origLine).toBe(2);
  });

  test("out of range yields undefined", () => {
    const blame = parsePorcelain(interleaved);
    expect(lineBlameAt(blame, 99)).toBeUndefined();
    expect(lineBlameAt(blame, 0)).toBeUndefined();
  });
});
