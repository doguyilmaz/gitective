import { describe, expect, test } from "bun:test";
import { avatarDataUri, initialsFor } from "../src/core/avatar";

describe("initialsFor", () => {
  test("takes up to two word initials", () => {
    expect(initialsFor("Dogu Yilmaz")).toBe("DY");
    expect(initialsFor("Alice")).toBe("A");
    expect(initialsFor("Mary Jane Watson")).toBe("MJ");
  });

  test("falls back for unsupported alphabets", () => {
    expect(initialsFor("张伟")).toBe("?");
    expect(initialsFor("")).toBe("?");
  });
});

describe("avatarDataUri", () => {
  test("produces a png data uri", () => {
    const uri = avatarDataUri("Alice", "alice@example.com");
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    const bytes = Buffer.from(uri.split(",")[1] as string, "base64");
    expect([...bytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
  });

  test("is deterministic and varies by email", () => {
    const a = avatarDataUri("Alice", "alice@example.com");
    expect(avatarDataUri("Alice", "alice@example.com")).toBe(a);
    expect(avatarDataUri("Alice", "other@example.com")).not.toBe(a);
  });
});
