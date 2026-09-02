import { describe, expect, test } from "bun:test";
import { commitDocFiles } from "../src/core/commitDoc";

const doc = [
  "commit abc",
  "",
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1..2 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1 @@",
  "diff --git a/new.ts b/new.ts",
  "new file mode 100644",
  "index 0..3",
  "diff --git a/gone.ts b/gone.ts",
  "deleted file mode 100644",
  "diff --git a/old.ts b/renamed.ts",
  "similarity index 90%",
  "rename from old.ts",
  "rename to renamed.ts",
].join("\n");

describe("commitDocFiles", () => {
  test("finds headers with line numbers and statuses", () => {
    expect(commitDocFiles(doc)).toEqual([
      { line: 2, status: "M", path: "src/a.ts" },
      { line: 7, status: "A", path: "new.ts" },
      { line: 10, status: "D", path: "gone.ts" },
      { line: 12, status: "R", path: "renamed.ts", oldPath: "old.ts" },
    ]);
  });

  test("no headers", () => {
    expect(commitDocFiles("commit abc\n\n    message\n")).toEqual([]);
  });
});
