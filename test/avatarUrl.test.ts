import { describe, expect, test } from "bun:test";
import { avatarUrlCandidates, githubLoginFromEmail } from "../src/core/avatarUrl";

describe("avatarUrlCandidates", () => {
  test("noreply email with id resolves straight to the github id", () => {
    expect(avatarUrlCandidates("52458408+doguyilmaz@users.noreply.github.com")).toEqual([
      "https://avatars.githubusercontent.com/u/52458408?s=64&v=4",
    ]);
  });

  test("legacy noreply email resolves by username", () => {
    expect(avatarUrlCandidates("doguyilmaz@users.noreply.github.com")).toEqual([
      "https://avatars.githubusercontent.com/doguyilmaz?s=64",
    ]);
  });

  test("regular email tries gravatar then github by-email", () => {
    expect(avatarUrlCandidates("Alice@Example.com", 32)).toEqual([
      "https://www.gravatar.com/avatar/c160f8cc69a4f0bf2b0362752353d060?s=32&d=404",
      "https://avatars.githubusercontent.com/u/e?email=alice%40example.com&s=32",
    ]);
  });

  test("non-emails yield nothing", () => {
    expect(avatarUrlCandidates("")).toEqual([]);
    expect(avatarUrlCandidates("not-an-email")).toEqual([]);
  });

  test("githubLoginFromEmail reads both noreply forms", () => {
    expect(githubLoginFromEmail("52458408+doguyilmaz@users.noreply.github.com")).toBe("doguyilmaz");
    expect(githubLoginFromEmail("doguyilmaz@users.noreply.github.com")).toBe("doguyilmaz");
    expect(githubLoginFromEmail("dogu@togg.com.tr")).toBeUndefined();
  });
});
