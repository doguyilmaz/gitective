import * as vscode from "vscode";
import { avatarDataUri } from "./core/avatar";
import { avatarUrlCandidates } from "./core/avatarUrl";
import { isValidSha } from "./core/sanitize";
import { log } from "./log";
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

const CONSENT_KEY = "avatars.consent";
const FAILURES_BEFORE_TRIP = 3;

type Consent = "granted" | "denied";

export class AvatarService {
  private readonly cache = new Map<string, Promise<string>>();
  private failures = 0;
  private tripped = false;
  private asked = false;

  constructor(
    private readonly remotes: RemoteResolver,
    private readonly state: vscode.Memento,
  ) {}

  consent(): Consent | undefined {
    return this.state.get<Consent>(CONSENT_KEY);
  }

  async setConsent(value: Consent | undefined): Promise<void> {
    await this.state.update(CONSENT_KEY, value);
    this.cache.clear();
  }

  // one question per install, asked from the first hover that would have fetched
  maybeAskConsent(): void {
    if (this.asked || this.consent() !== undefined) return;
    this.asked = true;
    void vscode.window
      .showInformationMessage(
        "Whodunit: load author avatars from GitHub and Gravatar? Initials stay local otherwise.",
        "Load avatars",
        "Keep initials",
      )
      .then((pick) => {
        if (pick === undefined) {
          this.asked = false;
          return;
        }
        void this.setConsent(pick === "Load avatars" ? "granted" : "denied");
      });
  }

  avatarFor(name: string, email: string, commit?: CommitRef): Promise<string> {
    if (this.consent() !== "granted" || this.tripped) {
      return Promise.resolve(avatarDataUri(name, email));
    }
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
    return avatarDataUri(name, email);
  }

  // rate limits and offline machines: stop asking the network for the session
  private trip(reason: string): void {
    if (this.tripped) return;
    this.tripped = true;
    log().warn(`avatars: remote lookups paused for this session (${reason})`);
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
