import { createHash } from "node:crypto";

const NOREPLY_ID_RE = /^(\d+)\+[^@]+@users\.noreply\.github\.com$/;
const NOREPLY_USER_RE = /^([a-z0-9-]+)@users\.noreply\.github\.com$/;

// ordered by confidence: noreply emails identify the account outright,
// gravatar 404s on a miss, github's by-email endpoint always answers
export function avatarUrlCandidates(email: string, size = 64): string[] {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return [];

  const byId = NOREPLY_ID_RE.exec(normalized);
  if (byId) return [`https://avatars.githubusercontent.com/u/${byId[1]}?s=${size}&v=4`];
  const byUser = NOREPLY_USER_RE.exec(normalized);
  if (byUser) return [`https://avatars.githubusercontent.com/${byUser[1]}?s=${size}`];

  const md5 = createHash("md5").update(normalized).digest("hex");
  return [
    `https://www.gravatar.com/avatar/${md5}?s=${size}&d=404`,
    `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(normalized)}&s=${size}`,
  ];
}
