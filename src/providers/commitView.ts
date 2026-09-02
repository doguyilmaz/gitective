import * as vscode from "vscode";
import { toSignal } from "../cancellation";
import { commitDocFiles } from "../core/commitDoc";
import { isValidSha, shortSha } from "../core/sanitize";
import { runGit } from "../git/run";
import { log } from "../log";

export const COMMIT_SCHEME = "gitective-commit";

const FORMAT = "commit %H%nparent %P%nAuthor  %an <%ae>%nDate    %ad%n%n%w(0,4,4)%B";

interface CommitRef {
  repoRoot: string;
  sha: string;
}

export function toCommitUri(ref: CommitRef): vscode.Uri {
  return vscode.Uri.from({
    scheme: COMMIT_SCHEME,
    path: `/Commit ${shortSha(ref.sha)}.diff`,
    query: JSON.stringify(ref),
  });
}

export function fromCommitUri(uri: vscode.Uri): CommitRef | undefined {
  if (uri.scheme !== COMMIT_SCHEME) return undefined;
  try {
    const parsed = JSON.parse(uri.query) as Record<string, unknown>;
    if (typeof parsed.repoRoot !== "string" || typeof parsed.sha !== "string") return undefined;
    if (!isValidSha(parsed.sha)) return undefined;
    return { repoRoot: parsed.repoRoot, sha: parsed.sha };
  } catch {
    return undefined;
  }
}

export class CommitContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): Promise<string> {
    const ref = fromCommitUri(uri);
    if (!ref) return "";
    try {
      return await runGit(
        ["show", "-m", "--first-parent", "--stat", "--patch", `--format=${FORMAT}`, ref.sha],
        { cwd: ref.repoRoot, signal: toSignal(token) },
      );
    } catch (error) {
      log().error(`commit view: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Gitective could not load commit ${shortSha(ref.sha)}.`);
    }
  }
}

export class CommitCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const ref = fromCommitUri(doc.uri);
    if (!ref) return [];
    return commitDocFiles(doc.getText()).map(
      (file) =>
        new vscode.CodeLens(new vscode.Range(file.line, 0, file.line, 0), {
          title: "Open side-by-side",
          command: "gitective.openChangeInCommit",
          arguments: [
            { ...ref, change: { status: file.status, path: file.path, oldPath: file.oldPath } },
          ],
        }),
    );
  }
}
