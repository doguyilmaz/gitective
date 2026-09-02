import type * as vscode from "vscode";
import { toSignal } from "../cancellation";
import { EMPTY_SHA } from "../core/revUri";
import { runGit } from "../git/run";
import { log } from "../log";
import { fromRevUri } from "../uris";

export class RevisionContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const ref = fromRevUri(uri);
    if (!ref) {
      log().warn(`revision provider: rejected malformed uri ${uri.toString()}`);
      return "";
    }
    if (ref.sha === EMPTY_SHA) return "";
    try {
      return await runGit(["show", `${ref.sha}:${ref.relPath}`], {
        cwd: ref.repoRoot,
        signal: toSignal(token),
      });
    } catch (error) {
      log().error(`revision provider: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Gitective could not load ${ref.relPath} at ${ref.sha.slice(0, 7)}.`);
    }
  }
}
