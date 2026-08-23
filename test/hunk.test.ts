import { describe, expect, test } from "bun:test";
import { clipHunk, hunkForLine, parseUnifiedDiff } from "../src/core/hunk";

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

describe("clipHunk", () => {
  const hunks = parseUnifiedDiff(diff);

  test("small hunk returned whole", () => {
    const hunk = hunkForLine(hunks, 2);
    expect(clipHunk(hunk!, 2, 7)).toEqual(hunk!.lines);
  });

  test("clips around the target line", () => {
    const big = parseUnifiedDiff(
      ["@@ -1,9 +1,9 @@", ...Array.from({ length: 9 }, (_, i) => ` line${i + 1}`), ""].join("\n"),
    );
    const clipped = clipHunk(big[0]!, 5, 1);
    expect(clipped).toEqual([" line4", " line5", " line6"]);
  });
});
