import * as vscode from "vscode";
import { avatarDataUri } from "./core/avatar";
import { avatarUrlCandidates } from "./core/avatarUrl";
import type { GitHubRepo } from "./core/gitRemote";
import { parseGitHubRemote } from "./core/gitRemote";
import { isValidSha } from "./core/sanitize";
import { GitError, runGit } from "./git/run";

const FETCH_TIMEOUT_MS = 2500;
const MAX_AVATAR_BYTES = 200 * 1024;
const CACHE_LIMIT = 64;
const AVATAR_SIZE = 64;

export interface CommitRef {
  repoRoot: string;
  sha: string;
}

async function fetchImageAsDataUri(url: string, token?: string): Promise<string | undefined> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    headers: {
      "User-Agent": "whodunit-vscode",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!response.ok) return undefined;
  const type = (response.headers.get("content-type") ?? "").split(";")[0] as string;
  if (!type.startsWith("image/")) return undefined;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return undefined;
  return `data:${type};base64,${bytes.toString("base64")}`;
}

export class AvatarService {
  private readonly cache = new Map<string, Promise<string>>();
  private readonly remotes = new Map<string, Promise<GitHubRepo | undefined>>();

  avatarFor(name: string, email: string, commit?: CommitRef): Promise<string> {
    const key = `${name}\n${email}`;
    let cached = this.cache.get(key);
    if (!cached) {
      cached = this.resolve(name, email, commit);
      this.cache.set(key, cached);
      while (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    return cached;
  }

  private async resolve(name: string, email: string, commit?: CommitRef): Promise<string> {
    const fromApi = commit && (await this.fromGitHubApi(commit).catch(() => undefined));
    if (fromApi) return fromApi;
    for (const url of avatarUrlCandidates(email, AVATAR_SIZE)) {
      try {
        const image = await fetchImageAsDataUri(url);
        if (image) return image;
      } catch {
        continue;
      }
    }
    return avatarDataUri(name, email);
  }

  // the GitLens mechanism: the repo's own commits, resolved by the GitHub API,
  // link private commit emails to real accounts; silent session only, no prompt
  private async fromGitHubApi(commit: CommitRef): Promise<string | undefined> {
    if (!isValidSha(commit.sha)) return undefined;
    const remote = await this.remoteFor(commit.repoRoot);
    if (!remote) return undefined;

    const session = await vscode.authentication
      .getSession("github", ["repo"], { silent: true })
      .then(
        (value) => value,
        () => undefined,
      );

    const response = await fetch(
      `https://api.github.com/repos/${remote.owner}/${remote.repo}/commits/${commit.sha}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "whodunit-vscode",
          Accept: "application/vnd.github+json",
          ...(session && { Authorization: `Bearer ${session.accessToken}` }),
        },
      },
    );
    if (!response.ok) return undefined;
    const body = (await response.json()) as { author?: { avatar_url?: string } | null };
    const avatarUrl = body.author?.avatar_url;
    if (!avatarUrl || !avatarUrl.startsWith("https://avatars.githubusercontent.com/"))
      return undefined;
    const sized = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}s=${AVATAR_SIZE}`;
    return fetchImageAsDataUri(sized);
  }

  private remoteFor(repoRoot: string): Promise<GitHubRepo | undefined> {
    let cached = this.remotes.get(repoRoot);
    if (!cached) {
      cached = runGit(["remote", "get-url", "origin"], { cwd: repoRoot }).then(
        (url) => parseGitHubRemote(url),
        (error) => {
          if (error instanceof GitError) return undefined;
          throw error;
        },
      );
      this.remotes.set(repoRoot, cached);
    }
    return cached;
  }
}
