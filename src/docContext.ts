import { dirname } from "node:path";
import type * as vscode from "vscode";
import { EMPTY_SHA } from "./core/revUri";
import type { BlameRequest } from "./git/blameService";
import type { RepoResolver } from "./git/repository";
import { relPath } from "./git/repository";
import { fromRevUri, REV_SCHEME } from "./uris";

export interface DocContext {
  req: BlameRequest;
  isRevision: boolean;
}

export async function contextForDocument(
  doc: vscode.TextDocument,
  resolver: RepoResolver,
): Promise<DocContext | undefined> {
  if (doc.uri.scheme === "file") {
    const info = await resolver.repoForDir(dirname(doc.uri.fsPath));
    if (!info) return undefined;
    return {
      isRevision: false,
      req: {
        key: doc.uri.toString(),
        version: doc.version,
        repoRoot: info.root,
        relPath: relPath(info.root, doc.uri.fsPath),
        contents: () => doc.getText(),
      },
    };
  }

  if (doc.uri.scheme === REV_SCHEME) {
    const ref = fromRevUri(doc.uri);
    if (!ref || ref.sha === EMPTY_SHA) return undefined;
    return {
      isRevision: true,
      req: {
        key: doc.uri.toString(),
        version: doc.version,
        repoRoot: ref.repoRoot,
        relPath: ref.relPath,
        sha: ref.sha,
      },
    };
  }

  return undefined;
}
