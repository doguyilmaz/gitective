import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export interface AvatarInfo {
  dataUri: string;
  profileUrl?: string;
}

export interface CachedAvatar {
  info: AvatarInfo;
  fresh: boolean;
}

function parseStored(text: string): AvatarInfo | undefined {
  if (text.startsWith("data:image/")) return { dataUri: text };
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.dataUri !== "string" || !parsed.dataUri.startsWith("data:image/"))
      return undefined;
    const profileUrl = parsed.profileUrl;
    return {
      dataUri: parsed.dataUri,
      ...(typeof profileUrl === "string" && /^https:\/\//.test(profileUrl) && { profileUrl }),
    };
  } catch {
    return undefined;
  }
}

// best effort: a failed read or write must never break a hover
export class AvatarDiskCache {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    return join(this.dir, `${createHash("sha1").update(key).digest("hex")}.avatar`);
  }

  async get(key: string): Promise<CachedAvatar | undefined> {
    try {
      const path = this.file(key);
      const [text, stats] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      const info = parseStored(text);
      return info && { info, fresh: Date.now() - stats.mtimeMs < FRESH_MS };
    } catch {
      return undefined;
    }
  }

  async set(key: string, info: AvatarInfo): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.file(key), JSON.stringify(info));
    } catch {
      return;
    }
  }
}
