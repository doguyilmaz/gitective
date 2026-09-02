import * as vscode from "vscode";
import { AvatarService } from "../avatarService";
import { getConfig } from "../config";
import type { LineBlame } from "../core/blame";
import { lineBlameAt } from "../core/blame";
import { hunkForLine, lineAtInHunk, parseUnifiedDiff } from "../core/hunk";
import type { DocContext } from "../docContext";
import { contextForDocument } from "../docContext";
import { GitError, runGit } from "../git/run";
import { commitInfo, modelFor, trusted } from "../hover/model";
import { renderChanges, renderDetails } from "../hover/render";
import { log } from "../log";
import type { Services } from "../services";

const DIFF_CACHE_LIMIT = 32;

interface ResolvedLine {
  ctx: DocContext;
  found: LineBlame;
}

// shared by both hover providers: same gating, same cached blame lookup
async function resolveLine(
  services: Services,
  doc: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
): Promise<ResolvedLine | undefined> {
  const cfg = getConfig();
  if (!cfg.hoverEnabled) return undefined;
  if (cfg.hoverTrigger === "annotation" && !overAnnotation(doc, position, cfg.inlineEnabled))
    return undefined;
  const ctx = await contextForDocument(doc, services.resolver);
  if (!ctx || token.isCancellationRequested) return undefined;
  const blame = await services.blame.getBlame(ctx.req);
  if (!blame || token.isCancellationRequested) return undefined;
  const found = lineBlameAt(blame, position.line + 1);
  return found && { ctx, found };
}

// annotation mode: only the current line, and only past the end of its text
// (where the inline blame renders); anywhere on the line when inline is off
function overAnnotation(
  doc: vscode.TextDocument,
  position: vscode.Position,
  inlineEnabled: boolean,
): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== doc) return false;
  if (position.line !== editor.selection.active.line) return false;
  if (!inlineEnabled) return true;
  return position.character >= doc.lineAt(position.line).range.end.character;
}

export class BlameHoverProvider implements vscode.HoverProvider {
  private readonly avatars: AvatarService;

  constructor(private readonly services: Services) {
    this.avatars = new AvatarService(services.remotes, services.avatarCache);
  }

  async provideHover(
    doc: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const resolved = await resolveLine(this.services, doc, position, token);
    if (!resolved) return undefined;
    const { ctx, found } = resolved;
    const cfg = getConfig();

    const [avatar, info, remote] = await Promise.all([
      cfg.hoverAvatars
        ? found.commit.isUncommitted
          ? this.avatars.avatarFor(ctx.userName ?? "You", ctx.userEmail ?? "")
          : this.avatars.avatarFor(found.commit.author, found.commit.authorEmail, {
              repoRoot: ctx.req.repoRoot,
              sha: found.commit.sha,
            })
        : Promise.resolve(undefined),
      found.commit.isUncommitted
        ? Promise.resolve({})
        : commitInfo.get(ctx.req.repoRoot, found.commit.sha),
      this.services.remotes.remoteFor(ctx.req.repoRoot),
    ]);
    if (token.isCancellationRequested) return undefined;

    return new vscode.Hover(
      trusted(renderDetails(modelFor(ctx, found, info, avatar, remote))),
      doc.lineAt(position.line).range,
    );
  }
}

// a second, independent provider: its result renders as a separate hover
// section with its own copy scope
export class BlameChangesHoverProvider implements vscode.HoverProvider {
  private readonly diffCache = new Map<string, Promise<string | undefined>>();

  constructor(private readonly services: Services) {}

  async provideHover(
    doc: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const resolved = await resolveLine(this.services, doc, position, token);
    if (!resolved || resolved.found.commit.isUncommitted) return undefined;
    const { ctx, found } = resolved;
    const cfg = getConfig();

    const [diffLine, info] = await Promise.all([
      cfg.hoverShowChanges ? this.diffLineFor(ctx, found) : Promise.resolve(undefined),
      commitInfo.get(ctx.req.repoRoot, found.commit.sha),
    ]);
    if (token.isCancellationRequested) return undefined;

    return new vscode.Hover(
      trusted(renderChanges(modelFor(ctx, found, info), diffLine)),
      doc.lineAt(position.line).range,
    );
  }

  private async diffLineFor(ctx: DocContext, found: LineBlame): Promise<string | undefined> {
    const diff = await this.diffFor(ctx.req.repoRoot, found.commit.sha, found.commit.filename);
    if (!diff) return undefined;
    const hunk = hunkForLine(parseUnifiedDiff(diff), found.line.origLine);
    return hunk && lineAtInHunk(hunk, found.line.origLine);
  }

  // shared cached promise: never bound to one hover's cancellation signal;
  // -m --first-parent keeps merge commits parseable as plain unified diffs
  private diffFor(repoRoot: string, sha: string, path: string): Promise<string | undefined> {
    const key = `${repoRoot} ${sha} ${path}`;
    const cached = this.diffCache.get(key);
    if (cached) return cached;
    const promise = runGit(
      ["show", sha, "-m", "--first-parent", "--format=", "--unified=3", "--", path],
      { cwd: repoRoot },
    ).catch((error: unknown) => {
      this.diffCache.delete(key);
      if (error instanceof GitError) log().warn(`hover changes: ${error.message}`);
      return undefined;
    });
    this.diffCache.set(key, promise);
    while (this.diffCache.size > DIFF_CACHE_LIMIT) {
      const oldest = this.diffCache.keys().next().value;
      if (oldest === undefined) break;
      this.diffCache.delete(oldest);
    }
    return promise;
  }
}
