import { describe, expect, test } from "bun:test";
import { commitUrl, parseRemote } from "../src/core/remote";

describe("parseRemote", () => {
  test("github, gitlab, bitbucket in https, ssh and scp forms", () => {
    expect(parseRemote("https://github.com/doguyilmaz/whodunit.git")).toEqual({
      host: "github",
      owner: "doguyilmaz",
      repo: "whodunit",
      webBase: "https://github.com/doguyilmaz/whodunit",
    });
    expect(parseRemote("git@gitlab.com:group/proj.git")?.host).toBe("gitlab");
    expect(parseRemote("ssh://git@bitbucket.org/team/repo.git")?.host).toBe("bitbucket");
    expect(parseRemote("https://user@github.com/a/b")?.webBase).toBe("https://github.com/a/b");
  });

  test("unknown hosts and malformed urls are rejected", () => {
    expect(parseRemote("https://git.corp.internal/a/b.git")).toBeUndefined();
    expect(parseRemote("https://github.com/only-owner")).toBeUndefined();
    expect(parseRemote("https://evilgithub.com/a/b")).toBeUndefined();
    expect(parseRemote("")).toBeUndefined();
  });
});

describe("commitUrl", () => {
  const sha = "282c899f".padEnd(40, "0");
  test("per-host commit paths", () => {
    expect(commitUrl(parseRemote("https://github.com/a/b")!, sha)).toBe(
      `https://github.com/a/b/commit/${sha}`,
    );
    expect(commitUrl(parseRemote("https://gitlab.com/a/b")!, sha)).toBe(
      `https://gitlab.com/a/b/-/commit/${sha}`,
    );
    expect(commitUrl(parseRemote("https://bitbucket.org/a/b")!, sha)).toBe(
      `https://bitbucket.org/a/b/commits/${sha}`,
    );
  });
});
