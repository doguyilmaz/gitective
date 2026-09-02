import * as vscode from "vscode";
import { avatarDataUri } from "./core/avatar";
import { avatarUrlCandidates } from "./core/avatarUrl";
import { isValidSha } from "./core/sanitize";
import { log } from "./log";
import type { AvatarDiskCache } from "./avatarCache";
import type { RemoteResolver } from "./git/remotes";

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

const FAILURES_BEFORE_TRIP = 3;
const TRIP_COOLDOWN_MS = 5 * 60 * 1000;

export class AvatarService {
  private readonly cache = new Map<string, Promise<string>>();
  private failures = 0;
  private trippedUntil = 0;

  constructor(
    private readonly remotes: RemoteResolver,
    private readonly disk: AvatarDiskCache,
  ) {}

  private get tripped(): boolean {
    return Date.now() < this.trippedUntil;
  }

  avatarFor(name: string, email: string, commit?: CommitRef): Promise<string> {
    const key = `${name}\n${email}`;
    let cached = this.cache.get(key);
    if (!cached) {
      cached = this.resolve(name, email, commit).then((result) => {
        if (!result.remote) this.cache.delete(key);
        return result.dataUri;
      });
      this.cache.set(key, cached);
      while (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    return cached;
  }

  // memory → fresh disk copy → network → stale disk copy → initials
  private async resolve(
    name: string,
    email: string,
    commit?: CommitRef,
  ): Promise<{ dataUri: string; remote: boolean }> {
    const diskKey = email || name;
    const stored = await this.disk.get(diskKey);
    if (stored?.fresh) return { dataUri: stored.dataUri, remote: true };
    if (!this.tripped) {
      const fetched = await this.fetchRemote(email, commit);
      if (fetched) {
        void this.disk.set(diskKey, fetched);
        return { dataUri: fetched, remote: true };
      }
    }
    return { dataUri: stored?.dataUri ?? avatarDataUri(name, email), remote: false };
  }

  private async fetchRemote(email: string, commit?: CommitRef): Promise<string | undefined> {
    const fromApi = commit && (await this.fromGitHubApi(commit).catch(() => undefined));
    if (fromApi) return fromApi;
    for (const url of avatarUrlCandidates(email, AVATAR_SIZE)) {
      if (this.tripped) break;
      try {
        const image = await fetchImageAsDataUri(url);
        if (image) {
          this.failures = 0;
          return image;
        }
      } catch {
        this.noteFailure();
      }
    }
    return undefined;
  }

  // rate limits and offline machines: stop asking the network for the session
  private trip(reason: string): void {
    if (this.tripped) return;
    this.trippedUntil = Date.now() + TRIP_COOLDOWN_MS;
    this.failures = 0;
    log().warn(`avatars: remote lookups paused for five minutes (${reason})`);
  }

  private noteFailure(): void {
    this.failures++;
    if (this.failures >= FAILURES_BEFORE_TRIP) this.trip("network failures");
  }

  // the GitLens mechanism: the repo's own commits, resolved by the GitHub API,
  // link private commit emails to real accounts; silent session only, no prompt
  private async fromGitHubApi(commit: CommitRef): Promise<string | undefined> {
    if (!isValidSha(commit.sha)) return undefined;
    const remote = await this.remotes.remoteFor(commit.repoRoot);
    if (remote?.host !== "github") return undefined;

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
    if (response.status === 403 || response.status === 429) {
      this.trip(`github api ${response.status}`);
      return undefined;
    }
    if (!response.ok) return undefined;
    this.failures = 0;
    const body = (await response.json()) as { author?: { avatar_url?: string } | null };
    const avatarUrl = body.author?.avatar_url;
    if (!avatarUrl || !avatarUrl.startsWith("https://avatars.githubusercontent.com/"))
      return undefined;
    const sized = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}s=${AVATAR_SIZE}`;
    return fetchImageAsDataUri(sized);
  }
}
