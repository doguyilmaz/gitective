import { describe, expect, test } from "bun:test";
import { signatureBadgeUri } from "../src/core/badge";
import { parseSignature } from "../src/core/signature";

describe("parseSignature", () => {
  test("maps git %G? codes", () => {
    expect(parseSignature("G", "Dogu Yilmaz <d@e.com>", "ABCDEF0123456789ABCD")).toEqual({
      status: "verified",
      label: "Signed by Dogu Yilmaz <d@e.com>, verified · key EF0123456789ABCD",
    });
    expect(parseSignature("U", "x", "")?.status).toBe("verified");
    expect(parseSignature("E", "", "")?.label).toBe("Signed, key not available to verify");
    expect(parseSignature("X", "", "")?.status).toBe("unverified");
    expect(parseSignature("R", "", "")?.status).toBe("bad");
    expect(parseSignature("B", "", "")?.label).toBe("Bad signature");
  });

  test("unsigned commits have no badge", () => {
    expect(parseSignature("N", "", "")).toBeUndefined();
    expect(parseSignature("", "", "")).toBeUndefined();
  });
});

describe("signatureBadgeUri", () => {
  test("renders distinct cached png badges", () => {
    const verified = signatureBadgeUri("verified");
    expect(verified.startsWith("data:image/png;base64,")).toBe(true);
    expect(signatureBadgeUri("verified")).toBe(verified);
    expect(signatureBadgeUri("bad")).not.toBe(verified);
    expect(signatureBadgeUri("unverified")).not.toBe(verified);
  });
});
