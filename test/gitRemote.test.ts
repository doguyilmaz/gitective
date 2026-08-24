import { describe, expect, test } from "bun:test";
import { parseGitHubRemote } from "../src/core/gitRemote";

describe("parseGitHubRemote", () => {
  test("parses https, ssh, and scp-like github urls", () => {
    expect(parseGitHubRemote("https://github.com/doguyilmaz/whodunit.git")).toEqual({
      owner: "doguyilmaz",
      repo: "whodunit",
    });
    expect(parseGitHubRemote("https://github.com/a/b")).toEqual({ owner: "a", repo: "b" });
    expect(parseGitHubRemote("git@github.com:a/b.git")).toEqual({ owner: "a", repo: "b" });
    expect(parseGitHubRemote("ssh://git@github.com/a/b.git")).toEqual({ owner: "a", repo: "b" });
  });

  test("rejects non-github and malformed urls", () => {
    expect(parseGitHubRemote("https://gitlab.com/a/b.git")).toBeUndefined();
    expect(parseGitHubRemote("git@bitbucket.org:a/b.git")).toBeUndefined();
    expect(parseGitHubRemote("https://github.com/only-owner")).toBeUndefined();
    expect(parseGitHubRemote("")).toBeUndefined();
    expect(parseGitHubRemote("https://evilgithub.com/a/b")).toBeUndefined();
  });
});
