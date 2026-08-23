import { describe, expect, test } from "bun:test";
import { escapeCodicons, escapeMarkdown, isValidSha, shortSha } from "../src/core/sanitize";
import { UNCOMMITTED_SHA } from "../src/core/blame";

describe("escapeMarkdown", () => {
  test("neutralizes a command link injection", () => {
    const out = escapeMarkdown("[click](command:evil.run)");
    expect(out).not.toContain("[click](");
    expect(out).toContain("\\[");
    expect(out).toContain("\\(");
  });

  test("escapes emphasis, code, and html", () => {
    expect(escapeMarkdown("*bold* `code` <img>")).toBe("\\*bold\\* \\`code\\` \\<img\\>");
  });

  test("plain text untouched", () => {
    expect(escapeMarkdown("add ai package")).toBe("add ai package");
  });
});

describe("escapeCodicons", () => {
  test("breaks codicon syntax", () => {
    expect(escapeCodicons("fix $(alert) bug")).not.toContain("$(");
  });

  test("plain text untouched", () => {
    expect(escapeCodicons("fix bug")).toBe("fix bug");
  });
});

describe("isValidSha", () => {
  test("accepts hex of length 4-40", () => {
    expect(isValidSha("a1b2")).toBe(true);
    expect(isValidSha("A".repeat(40))).toBe(true);
  });

  test("rejects garbage", () => {
    expect(isValidSha("abc")).toBe(false);
    expect(isValidSha("g".repeat(7))).toBe(false);
    expect(isValidSha("a".repeat(41))).toBe(false);
    expect(isValidSha("HEAD; rm -rf /")).toBe(false);
    expect(isValidSha("")).toBe(false);
  });
});

describe("shortSha", () => {
  test("shortens to 7 chars", () => {
    expect(shortSha("a1b2c3d4e5f6a7b8")).toBe("a1b2c3d");
  });

  test("uncommitted sentinel", () => {
    expect(shortSha(UNCOMMITTED_SHA)).toBe("working");
  });
});
