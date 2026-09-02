import type * as vscode from "vscode";
import { EMPTY_SHA } from "../core/revUri";
import { shortSha } from "../core/sanitize";
import { fromRevUri, REV_SCHEME } from "../uris";

export class RevisionDecorationProvider implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== REV_SCHEME) return undefined;
    const ref = fromRevUri(uri);
    if (!ref) return undefined;
    const label = ref.sha === EMPTY_SHA ? "before this file existed" : `at ${shortSha(ref.sha)}`;
    return { tooltip: `Gitective snapshot ${label} (read-only)` };
  }
}
