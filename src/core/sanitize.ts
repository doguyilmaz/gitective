import { isUncommittedSha } from "./blame";

export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");
}

// zero-width space between $ and ( breaks codicon interpolation
export function escapeCodicons(text: string): string {
  return text.replaceAll("$(", "$​(");
}

export function isValidSha(text: string): boolean {
  return /^(?:[0-9a-f]{4,40}|[0-9a-f]{64})$/i.test(text);
}

export function shortSha(sha: string): string {
  return isUncommittedSha(sha) ? "working" : sha.slice(0, 7);
}
