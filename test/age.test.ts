import { describe, expect, test } from "bun:test";
import { ageBucket } from "../src/core/age";

const NOW = 1_800_000_000_000;
const ago = (sec: number) => NOW / 1000 - sec;

describe("ageBucket", () => {
  test("buckets by elapsed time", () => {
    expect(ageBucket(ago(0), NOW)).toBe(1);
    expect(ageBucket(ago(86399), NOW)).toBe(1);
    expect(ageBucket(ago(86400), NOW)).toBe(2);
    expect(ageBucket(ago(7 * 86400), NOW)).toBe(3);
    expect(ageBucket(ago(30 * 86400), NOW)).toBe(4);
    expect(ageBucket(ago(365 * 86400), NOW)).toBe(5);
    expect(ageBucket(ago(-500), NOW)).toBe(1);
  });
});
