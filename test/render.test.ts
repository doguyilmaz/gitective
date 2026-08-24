import { describe, expect, test } from "bun:test";
import type { BlameCommit } from "../src/core/blame";
import { UNCOMMITTED_SHA } from "../src/core/blame";
import { templateValuesFor } from "../src/core/render";

const NOW = 1_800_000_000_000;

const commit: BlameCommit = {
  sha: "a1b2c3d4".padEnd(40, "0"),
  author: "Alice",
  authorEmail: "alice@example.com",
  authorTime: NOW / 1000 - 5 * 86400,
  summary: "add ai package, enrichment stages, hybrid search and public api",
  boundary: false,
  filename: "app.ts",
  isUncommitted: false,
};

describe("templateValuesFor", () => {
  test("renders committed values", () => {
    const values = templateValuesFor(commit, { maxLength: 60, nowMs: NOW, locale: "en-US" });
    expect(values.author).toBe("Alice");
    expect(values.ago).toBe("5 days ago");
    expect(values.agoOrDate).toBe("5 days ago");
    expect(values.sha).toBe("a1b2c3d");
    expect(values.message.length).toBe(60);
    expect(values.message.endsWith("…")).toBe(true);
    expect(values.message.startsWith("add ai package")).toBe(true);
  });

  test("agoOrDate switches to an absolute date for old commits", () => {
    const old = { ...commit, authorTime: NOW / 1000 - 90 * 86400 };
    const values = templateValuesFor(old, { maxLength: 60, nowMs: NOW, locale: "en-US" });
    expect(values.agoOrDate).not.toContain("ago");
    expect(values.agoOrDate.length).toBeGreaterThan(5);
  });

  test("substitutes You for the repo user", () => {
    const values = templateValuesFor(commit, {
      userEmail: "alice@example.com",
      maxLength: 60,
      nowMs: NOW,
    });
    expect(values.author).toBe("You");
  });

  test("maps uncommitted lines", () => {
    const uncommitted: BlameCommit = {
      ...commit,
      sha: UNCOMMITTED_SHA,
      author: "Not Committed Yet",
      authorEmail: "not.committed.yet",
      isUncommitted: true,
    };
    const values = templateValuesFor(uncommitted, { maxLength: 60, nowMs: NOW });
    expect(values.author).toBe("You");
    expect(values.message).toBe("Uncommitted changes");
    expect(values.sha).toBe("working");
  });
});
