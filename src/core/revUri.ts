import { isValidSha } from "./sanitize";

export const EMPTY_SHA = "EMPTY";

export interface RevRef {
  repoRoot: string;
  sha: string;
  relPath: string;
}

export function encodeRevQuery(ref: RevRef): string {
  return JSON.stringify(ref);
}

export function decodeRevQuery(query: string): RevRef | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(query);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { repoRoot, sha, relPath } = parsed as Record<string, unknown>;
  if (typeof repoRoot !== "string" || typeof sha !== "string" || typeof relPath !== "string") {
    return undefined;
  }
  if (sha !== EMPTY_SHA && !isValidSha(sha)) return undefined;
  if (!isSafeRelPath(relPath)) return undefined;
  return { repoRoot, sha, relPath };
}

export function isSafeRelPath(relPath: string): boolean {
  return !relPath.startsWith("/") && !relPath.split("/").includes("..");
}
