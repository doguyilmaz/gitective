import { describe, expect, test } from "bun:test";
import { decodeRevQuery, EMPTY_SHA, encodeRevQuery } from "../src/core/revUri";

const ref = {
  repoRoot: "/Users/dev/project",
  sha: "a".repeat(40),
  relPath: "src/app.ts",
};

describe("revision uri query", () => {
  test("round-trips", () => {
    expect(decodeRevQuery(encodeRevQuery(ref))).toEqual(ref);
  });

  test("accepts the empty sentinel sha", () => {
    const empty = { ...ref, sha: EMPTY_SHA };
    expect(decodeRevQuery(encodeRevQuery(empty))).toEqual(empty);
  });

  test("rejects malformed json and wrong shapes", () => {
    expect(decodeRevQuery("not json")).toBeUndefined();
    expect(decodeRevQuery("{}")).toBeUndefined();
    expect(decodeRevQuery(JSON.stringify({ ...ref, sha: 42 }))).toBeUndefined();
  });

  test("rejects invalid shas", () => {
    expect(decodeRevQuery(JSON.stringify({ ...ref, sha: "xyz" }))).toBeUndefined();
    expect(decodeRevQuery(JSON.stringify({ ...ref, sha: "HEAD; rm" }))).toBeUndefined();
  });

  test("rejects path traversal and absolute paths", () => {
    expect(decodeRevQuery(JSON.stringify({ ...ref, relPath: "../etc/passwd" }))).toBeUndefined();
    expect(decodeRevQuery(JSON.stringify({ ...ref, relPath: "a/../../x" }))).toBeUndefined();
    expect(decodeRevQuery(JSON.stringify({ ...ref, relPath: "/abs/path" }))).toBeUndefined();
  });
});
