import { posix } from "node:path";
import * as vscode from "vscode";
import { decodeRevQuery, EMPTY_SHA, encodeRevQuery, type RevRef } from "./core/revUri";
import { shortSha } from "./core/sanitize";

export const REV_SCHEME = "whodunit";

// tab label is the last path segment, so it names the revision explicitly
export function toRevUri(ref: RevRef): vscode.Uri {
  const dir = posix.dirname(ref.relPath);
  const base = posix.basename(ref.relPath);
  const label = ref.sha === EMPTY_SHA ? "added" : shortSha(ref.sha);
  return vscode.Uri.from({
    scheme: REV_SCHEME,
    path: `${dir === "." ? "" : `/${dir}`}/${base} @ ${label}`,
    query: encodeRevQuery(ref),
  });
}

export function fromRevUri(uri: vscode.Uri): RevRef | undefined {
  if (uri.scheme !== REV_SCHEME) return undefined;
  return decodeRevQuery(uri.query);
}
