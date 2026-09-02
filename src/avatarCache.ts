import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

export interface CachedAvatar {
  dataUri: string;
  fresh: boolean;
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
      const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      if (!text.startsWith("data:image/")) return undefined;
      return { dataUri: text, fresh: Date.now() - info.mtimeMs < FRESH_MS };
    } catch {
      return undefined;
    }
  }

  async set(key: string, dataUri: string): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.file(key), dataUri);
    } catch {
      return;
    }
  }
}
