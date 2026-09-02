import { describe, expect, test } from "bun:test";
import { mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AvatarDiskCache } from "../src/avatarCache";

const URI = "data:image/png;base64,AAAA";

describe("AvatarDiskCache", () => {
  test("round-trips and reports fresh", async () => {
    const cache = new AvatarDiskCache(join(await mkdtemp(join(tmpdir(), "wd-av-")), "nested"));
    expect(await cache.get("alice@example.com")).toBeUndefined();
    await cache.set("alice@example.com", URI);
    expect(await cache.get("alice@example.com")).toEqual({ dataUri: URI, fresh: true });
  });

  test("old entries are returned but marked stale", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wd-av-"));
    const cache = new AvatarDiskCache(dir);
    await cache.set("bob@example.com", URI);
    const { readdir } = await import("node:fs/promises");
    const [file] = await readdir(dir);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await utimes(join(dir, file as string), old, old);
    expect(await cache.get("bob@example.com")).toEqual({ dataUri: URI, fresh: false });
  });

  test("garbage files and unwritable dirs are tolerated", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wd-av-"));
    const cache = new AvatarDiskCache(dir);
    await cache.set("x@example.com", URI);
    const { readdir } = await import("node:fs/promises");
    const [file] = await readdir(dir);
    await writeFile(join(dir, file as string), "not a data uri");
    expect(await cache.get("x@example.com")).toBeUndefined();
    await expect(new AvatarDiskCache("/dev/null/nope").set("k", URI)).resolves.toBeUndefined();
  });
});
