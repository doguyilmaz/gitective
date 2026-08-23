import { describe, expect, test } from "bun:test";
import { renderTemplate, truncate, usesToken, type TemplateValues } from "../src/core/template";

const values: TemplateValues = {
  author: "Alice",
  authorEmail: "alice@example.com",
  ago: "5 days ago",
  date: "Aug 18, 2026",
  message: "add ai package",
  sha: "a1b2c3d",
};

describe("renderTemplate", () => {
  test("substitutes all known tokens", () => {
    expect(renderTemplate("${author}, ${ago} • ${message}", values)).toBe(
      "Alice, 5 days ago • add ai package",
    );
    expect(renderTemplate("${sha} ${authorEmail} ${date}", values)).toBe(
      "a1b2c3d alice@example.com Aug 18, 2026",
    );
  });

  test("unknown tokens stay literal", () => {
    expect(renderTemplate("${author} ${nope}", values)).toBe("Alice ${nope}");
  });

  test("inherited object keys are not tokens", () => {
    expect(renderTemplate("${toString} ${constructor}", values)).toBe(
      "${toString} ${constructor}",
    );
  });

  test("repeated tokens and empty format", () => {
    expect(renderTemplate("${sha}${sha}", values)).toBe("a1b2c3da1b2c3d");
    expect(renderTemplate("", values)).toBe("");
  });
});

describe("truncate", () => {
  test("returns short text unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  test("truncates with ellipsis inside the limit", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
    expect(truncate("hello world", 5).length).toBe(5);
  });

  test("degenerate limits", () => {
    expect(truncate("hello", 1)).toBe("…");
    expect(truncate("hello", 0)).toBe("…");
  });
});

describe("usesToken", () => {
  test("detects tokens", () => {
    expect(usesToken("${author}, ${ago}", "ago")).toBe(true);
    expect(usesToken("${author}", "ago")).toBe(false);
  });
});
