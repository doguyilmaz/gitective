import { describe, expect, test } from "bun:test";
import { formatAgo, formatDate } from "../src/core/time";

const NOW = 1_800_000_000_000;
const sec = (n: number) => NOW / 1000 - n;

describe("formatAgo", () => {
  test("under a minute is just now", () => {
    expect(formatAgo(sec(0), NOW)).toBe("just now");
    expect(formatAgo(sec(59), NOW)).toBe("just now");
  });

  test("future timestamps clamp to just now", () => {
    expect(formatAgo(sec(-500), NOW)).toBe("just now");
  });

  test("minutes", () => {
    expect(formatAgo(sec(60), NOW)).toBe("1 minute ago");
    expect(formatAgo(sec(59 * 60), NOW)).toBe("59 minutes ago");
  });

  test("hours", () => {
    expect(formatAgo(sec(3600), NOW)).toBe("1 hour ago");
    expect(formatAgo(sec(23 * 3600), NOW)).toBe("23 hours ago");
  });

  test("days", () => {
    expect(formatAgo(sec(86400), NOW)).toBe("1 day ago");
    expect(formatAgo(sec(6 * 86400), NOW)).toBe("6 days ago");
  });

  test("weeks", () => {
    expect(formatAgo(sec(7 * 86400), NOW)).toBe("1 week ago");
    expect(formatAgo(sec(29 * 86400), NOW)).toBe("4 weeks ago");
  });

  test("months", () => {
    expect(formatAgo(sec(30 * 86400), NOW)).toBe("1 month ago");
    expect(formatAgo(sec(360 * 86400), NOW)).toBe("12 months ago");
  });

  test("years", () => {
    expect(formatAgo(sec(365 * 86400), NOW)).toBe("1 year ago");
    expect(formatAgo(sec(4 * 365 * 86400), NOW)).toBe("4 years ago");
  });
});

describe("formatDate", () => {
  test("renders a locale date with time", () => {
    const out = formatDate(1755477840, "en-US");
    expect(out).toContain("2025");
    expect(out.length).toBeGreaterThan(10);
  });
});
