import { describe, expect, test } from "bun:test";
import { parseShortStat } from "../src/core/shortstat";

describe("parseShortStat", () => {
  test("parses full, insert-only, delete-only, singular forms", () => {
    expect(parseShortStat(" 3 files changed, 10 insertions(+), 4 deletions(-)")).toEqual({
      files: 3,
      insertions: 10,
      deletions: 4,
    });
    expect(parseShortStat(" 1 file changed, 1 insertion(+)")).toEqual({
      files: 1,
      insertions: 1,
      deletions: 0,
    });
    expect(parseShortStat("x\n 2 files changed, 5 deletions(-)\n")).toEqual({
      files: 2,
      insertions: 0,
      deletions: 5,
    });
  });

  test("no stat yields undefined", () => {
    expect(parseShortStat("")).toBeUndefined();
    expect(parseShortStat("commit abc")).toBeUndefined();
  });
});
