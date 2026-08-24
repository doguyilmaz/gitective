import { describe, expect, test } from "bun:test";
import { hunkForLine, lineAtInHunk, parseUnifiedDiff } from "../src/core/hunk";

const diff = [
  "diff --git a/app.ts b/app.ts",
  "index 8d508e8..faace53 100644",
  "--- a/app.ts",
  "+++ b/app.ts",
  "@@ -1,3 +1,4 @@",
  " import a from 'a';",
  "+import b from 'b';",
  " import c from 'c';",
  " export {};",
  "@@ -10,2 +11,3 @@ export function x() {",
  " const one = 1;",
  "-const two = 2;",
  "+const two = 22;",
  "+const three = 3;",
  "",
].join("\n");

describe("parseUnifiedDiff", () => {
  test("parses hunks with headers and line ranges", () => {
    const hunks = parseUnifiedDiff(diff);
    expect(hunks.length).toBe(2);
    expect(hunks[0]).toMatchObject({ newStart: 1, newCount: 4 });
    expect(hunks[0]?.header).toBe("@@ -1,3 +1,4 @@");
    expect(hunks[0]?.lines).toEqual([
      " import a from 'a';",
      "+import b from 'b';",
      " import c from 'c';",
      " export {};",
    ]);
    expect(hunks[1]).toMatchObject({ newStart: 11, newCount: 3 });
  });

  test("zero-count deletion hunk", () => {
    const del = ["@@ -5,2 +4,0 @@", "-gone", "-also gone", ""].join("\n");
    const hunks = parseUnifiedDiff(del);
    expect(hunks.length).toBe(1);
    expect(hunks[0]?.newCount).toBe(0);
  });

  test("empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});

describe("hunkForLine", () => {
  const hunks = parseUnifiedDiff(diff);

  test("finds the covering hunk", () => {
    expect(hunkForLine(hunks, 2)?.newStart).toBe(1);
    expect(hunkForLine(hunks, 12)?.newStart).toBe(11);
  });

  test("misses lines outside all hunks", () => {
    expect(hunkForLine(hunks, 7)).toBeUndefined();
    expect(hunkForLine(hunks, 100)).toBeUndefined();
  });

  test("deletion-only hunks never match", () => {
    const del = parseUnifiedDiff(["@@ -5,2 +4,0 @@", "-x", "-y", ""].join("\n"));
    expect(hunkForLine(del, 4)).toBeUndefined();
  });
});

describe("lineAtInHunk", () => {
  const hunks = parseUnifiedDiff(diff);

  test("returns exactly the blamed line's diff line", () => {
    expect(lineAtInHunk(hunkForLine(hunks, 2)!, 2)).toBe("+import b from 'b';");
    expect(lineAtInHunk(hunkForLine(hunks, 12)!, 12)).toBe("+const two = 22;");
  });

  test("context lines and misses", () => {
    expect(lineAtInHunk(hunkForLine(hunks, 1)!, 1)).toBe(" import a from 'a';");
    expect(lineAtInHunk(hunkForLine(hunks, 2)!, 99)).toBeUndefined();
  });
});
