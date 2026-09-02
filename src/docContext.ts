import { basename, dirname, join } from "node:path";
import type * as vscode from "vscode";
import { parseGitQuery } from "./core/gitQuery";
import { EMPTY_SHA } from "./core/revUri";
import type { BlameRequest } from "./git/blameService";
import type { RepoInfo, RepoResolver } from "./git/repository";
import { relPath } from "./git/repository";
import { runGit } from "./git/run";
import { fromRevUri, REV_SCHEME } from "./uris";

export const BLAMEABLE_SCHEMES = ["file", REV_SCHEME, "git"] as const;

export interface DocContext {
  req: BlameRequest;
  isRevision: boolean;
  userName?: string;
  userEmail?: string;
}

function workingRequest(doc: vscode.TextDocument, info: RepoInfo, fsPath: string): BlameRequest {
  return {
    key: doc.uri.toString(),
    version: doc.version,
    repoRoot: info.root,
    relPath: relPath(info.root, join(info.realDir, basename(fsPath))),
    contents: () => doc.getText(),
  };
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
      userName: info.userName,
      userEmail: info.userEmail,
      req: workingRequest(doc, info, doc.uri.fsPath),
    };
  }

  if (doc.uri.scheme === REV_SCHEME) {
    const ref = fromRevUri(doc.uri);
    if (!ref || ref.sha === EMPTY_SHA) return undefined;
    const info = await resolver.repoForDir(ref.repoRoot);
    return {
      isRevision: true,
      userName: info?.userName,
      userEmail: info?.userEmail,
      req: {
        key: doc.uri.toString(),
        version: doc.version,
        repoRoot: ref.repoRoot,
        relPath: ref.relPath,
        sha: ref.sha,
      },
    };
  }

  // vs code's own git diffs: index/HEAD-or-index docs blame like working copies,
  // revision docs blame at that revision
  if (doc.uri.scheme === "git") {
    const parsed = parseGitQuery(doc.uri.query);
    if (!parsed) return undefined;
    const info = await resolver.repoForDir(dirname(parsed.path));
    if (!info) return undefined;
    const base = { userName: info.userName, userEmail: info.userEmail };
    if (parsed.ref.kind === "working") {
      return { ...base, isRevision: false, req: workingRequest(doc, info, parsed.path) };
    }
    const sha =
      parsed.ref.ref === "HEAD"
        ? (await runGit(["rev-parse", "HEAD"], { cwd: info.root })).trim()
        : parsed.ref.ref;
    return {
      ...base,
      isRevision: true,
      req: {
        key: doc.uri.toString(),
        version: doc.version,
        repoRoot: info.root,
        relPath: relPath(info.root, join(info.realDir, basename(parsed.path))),
        sha,
      },
    };
  }

  return undefined;
}
