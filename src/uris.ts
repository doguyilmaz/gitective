import * as vscode from "vscode";
import { decodeRevQuery, encodeRevQuery, type RevRef } from "./core/revUri";

export const REV_SCHEME = "whodunit";

export function toRevUri(ref: RevRef): vscode.Uri {
  return vscode.Uri.from({
    scheme: REV_SCHEME,
    path: `/${ref.relPath}`,
    query: encodeRevQuery(ref),
  });
}

export function fromRevUri(uri: vscode.Uri): RevRef | undefined {
  if (uri.scheme !== REV_SCHEME) return undefined;
  return decodeRevQuery(uri.query);
}
