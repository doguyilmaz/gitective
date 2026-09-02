import { describe, expect, test } from "bun:test";
import { parseGitQuery } from "../src/core/gitQuery";

describe("parseGitQuery", () => {
  test("index and index-or-head refs are working blame", () => {
    expect(parseGitQuery(JSON.stringify({ path: "/r/a.ts", ref: "" }))).toEqual({
      path: "/r/a.ts",
      ref: { kind: "working" },
    });
    expect(parseGitQuery(JSON.stringify({ path: "/r/a.ts", ref: "~" }))?.ref).toEqual({
      kind: "working",
    });
  });

  test("revisions pass through", () => {
    expect(parseGitQuery(JSON.stringify({ path: "/r/a.ts", ref: "HEAD" }))?.ref).toEqual({
      kind: "revision",
      ref: "HEAD",
    });
    expect(parseGitQuery(JSON.stringify({ path: "/r/a.ts", ref: "a".repeat(40) }))?.ref).toEqual({
      kind: "revision",
      ref: "a".repeat(40),
    });
  });

  test("garbage and unknown refs are rejected", () => {
    expect(parseGitQuery("nope")).toBeUndefined();
    expect(parseGitQuery(JSON.stringify({ path: 1, ref: "" }))).toBeUndefined();
    expect(parseGitQuery(JSON.stringify({ path: "/r", ref: "main; rm" }))).toBeUndefined();
  });
});
