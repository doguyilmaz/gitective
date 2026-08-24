import * as vscode from "vscode";
import { AvatarService } from "../avatarService";
import { getConfig } from "../config";
import type { BlameCommit, LineBlame } from "../core/blame";
import { lineBlameAt } from "../core/blame";
import { messageBody } from "../core/gitLog";
import { clipHunk, hunkForLine, parseUnifiedDiff } from "../core/hunk";
import { templateValuesFor } from "../core/render";
import { escapeCodicons, escapeMarkdown, shortSha } from "../core/sanitize";
import type { DocContext } from "../docContext";
import { contextForDocument } from "../docContext";
import { encodePng } from "../core/png";
import { GitError, runGit } from "../git/run";
import { log } from "../log";
import type { Services } from "../services";
import type { LineTarget } from "../commands/lineActions";

const TRUSTED_COMMANDS = [
  "whodunit.copySha",
  "whodunit.copyMessage",
  "whodunit.compareWithPrevious",
  "whodunit.openAtRevision",
  "whodunit.showCommit",
  "whodunit.fileHistory",
];

const HUNK_CONTEXT_LINES = 3;
const DIFF_CACHE_LIMIT = 16;
const AVATAR_SIZE = 34;

// floats have no margin without a style attribute, so a transparent
// 1x1 png stretched into a second float acts as the gutter
const GUTTER_URI = `data:image/png;base64,${Buffer.from(encodePng(new Uint8Array(4), 1, 1)).toString("base64")}`;

function avatarBlock(src: string, line1: string, line2: string): string {
  return [
    `<img src="${src}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" align="left">`,
    `<img src="${GUTTER_URI}" width="10" height="${AVATAR_SIZE}" align="left">`,
    `${line1}<br>${line2}`,
  ].join("");
}

function commandLink(label: string, command: string, target: LineTarget, title?: string): string {
  // encodeURIComponent leaves ( ) unescaped, and a bare ) truncates a markdown link
  const args = encodeURIComponent(JSON.stringify([target])).replace(/[()]/g, (char) =>
    char === "(" ? "%28" : "%29",
  );
  return `[${label}](command:${command}?${args}${title ? ` "${title}"` : ""})`;
}

function fence(lines: string[]): string {
  let longest = 2;
  for (const line of lines) {
    for (const match of line.matchAll(/`+/g)) {
      longest = Math.max(longest, match[0].length);
    }
  }
  const ticks = "`".repeat(longest + 1);
  return `${ticks}diff\n${lines.join("\n")}\n${ticks}`;
}

function safeText(text: string): string {
  return escapeCodicons(escapeMarkdown(text));
}

export class BlameHoverProvider implements vscode.HoverProvider {
  private readonly diffCache = new Map<string, Promise<string | undefined>>();
  private readonly messageCache = new Map<string, Promise<string | undefined>>();
  private readonly avatars = new AvatarService();

  constructor(private readonly services: Services) {}

  async provideHover(
    doc: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | undefined> {
    const cfg = getConfig();
    if (!cfg.hoverEnabled) return undefined;
    if (cfg.hoverTrigger === "annotation" && !this.overAnnotation(doc, position, cfg.inlineEnabled))
      return undefined;
    const ctx = await contextForDocument(doc, this.services.resolver);
    if (!ctx || token.isCancellationRequested) return undefined;
    const blame = await this.services.blame.getBlame(ctx.req);
    if (!blame || token.isCancellationRequested) return undefined;
    const found = lineBlameAt(blame, position.line + 1);
    if (!found) return undefined;

    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.isTrusted = { enabledCommands: TRUSTED_COMMANDS };
    markdown.supportHtml = true;

    const target: LineTarget = {
      repoRoot: ctx.req.repoRoot,
      relPath: found.commit.filename || ctx.req.relPath,
      sha: found.commit.sha,
      line: found.line.line,
      origLine: found.line.origLine,
      ...(found.commit.previous && {
        previousSha: found.commit.previous.sha,
        previousPath: found.commit.previous.path,
      }),
    };

    if (found.commit.isUncommitted) {
      const line1 = "<strong>You</strong>";
      const line2 = "<em>Uncommitted changes</em>";
      const header = cfg.hoverAvatars
        ? avatarBlock(
            await this.avatars.avatarFor(ctx.userName ?? "You", ctx.userEmail ?? ""),
            line1,
            line2,
          )
        : `${line1}<br>${line2}`;
      markdown.appendMarkdown(
        [
          header,
          "---",
          [
            commandLink(
              "$(diff) Compare with HEAD",
              "whodunit.compareWithPrevious",
              target,
              "Diff the working file against HEAD",
            ),
            commandLink("$(history) History", "whodunit.fileHistory", target, "File history"),
          ].join(" &nbsp;&nbsp; "),
        ].join("\n\n"),
      );
      return new vscode.Hover(markdown, doc.lineAt(position.line).range);
    }

    const values = templateValuesFor(found.commit, {
      userEmail: ctx.userEmail,
      maxLength: Number.MAX_SAFE_INTEGER,
      locale: vscode.env.language,
      dateStyle: cfg.dateStyle,
    });

    const line1 = [
      `<strong>${safeText(values.author)}</strong>`,
      `${values.ago} <em>(${safeText(values.date)})</em>`,
    ].join(" &nbsp;·&nbsp; ");
    const line2 = safeText(found.commit.summary);
    const [avatarSrc, body] = await Promise.all([
      cfg.hoverAvatars
        ? this.avatars.avatarFor(found.commit.author, found.commit.authorEmail, {
            repoRoot: ctx.req.repoRoot,
            sha: found.commit.sha,
          })
        : Promise.resolve(undefined),
      this.messageBodyFor(ctx.req.repoRoot, found.commit.sha),
    ]);
    if (token.isCancellationRequested) return undefined;
    const header = avatarSrc ? avatarBlock(avatarSrc, line1, line2) : `${line1}<br>${line2}`;

    const actions = [
      `\`${shortSha(found.commit.sha)}\``,
      commandLink("$(copy)", "whodunit.copySha", target, "Copy SHA"),
      commandLink("$(note)", "whodunit.copyMessage", target, "Copy commit message"),
      "&nbsp;",
      commandLink(
        "$(diff) Compare",
        "whodunit.compareWithPrevious",
        target,
        "Diff this commit against its previous revision",
      ),
      commandLink(
        "$(go-to-file) Open",
        "whodunit.openAtRevision",
        target,
        "Open the file at this revision",
      ),
      commandLink(
        "$(files) Commit",
        "whodunit.showCommit",
        target,
        "Browse the files changed in this commit",
      ),
      commandLink("$(history) History", "whodunit.fileHistory", target, "File history"),
    ].join(" &nbsp; ");

    const bodyBlock = body ? [body.split("\n").map(safeText).join("<br>")] : [];
    const changesFooter = target.previousSha
      ? commandLink(
          `$(compare-changes) Changes \`${shortSha(target.previousSha)}\` ↔ \`${shortSha(found.commit.sha)}\``,
          "whodunit.compareWithPrevious",
          target,
          "Open changes with previous revision",
        )
      : commandLink(
          `$(compare-changes) Changes — added in \`${shortSha(found.commit.sha)}\``,
          "whodunit.compareWithPrevious",
          target,
          "Open changes",
        );

    markdown.appendMarkdown([header, ...bodyBlock, "---", actions].join("\n\n"));

    if (cfg.hoverShowChanges) {
      const section = await this.changesSection(ctx, found);
      if (token.isCancellationRequested) return undefined;
      if (section) markdown.appendMarkdown(`\n\n---\n\n${section}`);
    }
    markdown.appendMarkdown(`\n\n---\n\n${changesFooter}`);

    return new vscode.Hover(markdown, doc.lineAt(position.line).range);
  }

  private messageBodyFor(repoRoot: string, sha: string): Promise<string | undefined> {
    const key = `${repoRoot} ${sha}`;
    const cached = this.messageCache.get(key);
    if (cached) return cached;
    const promise = runGit(["show", "-s", "--format=%B", sha], { cwd: repoRoot }).then(
      (full) => messageBody(full) || undefined,
      (error: unknown) => {
        this.messageCache.delete(key);
        if (error instanceof GitError) log().warn(`hover message: ${error.message}`);
        return undefined;
      },
    );
    this.messageCache.set(key, promise);
    while (this.messageCache.size > DIFF_CACHE_LIMIT) {
      const oldest = this.messageCache.keys().next().value;
      if (oldest === undefined) break;
      this.messageCache.delete(oldest);
    }
    return promise;
  }

  // annotation mode: only the current line, and only past the end of its text
  // (where the inline blame renders); anywhere on the line when inline is off
  private overAnnotation(
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

  private async changesSection(ctx: DocContext, found: LineBlame): Promise<string | undefined> {
    const diff = await this.diffFor(ctx.req.repoRoot, found.commit);
    if (!diff) return undefined;
    const hunk = hunkForLine(parseUnifiedDiff(diff), found.line.origLine);
    if (!hunk) return undefined;
    const lines = clipHunk(hunk, found.line.origLine, HUNK_CONTEXT_LINES);
    if (lines.length === 0) return undefined;
    return `Changes in \`${shortSha(found.commit.sha)}\`\n\n${fence(lines)}`;
  }

  // shared cached promise: never bound to one hover's cancellation signal;
  // -m --first-parent keeps merge commits parseable as plain unified diffs
  private diffFor(repoRoot: string, commit: BlameCommit): Promise<string | undefined> {
    const key = `${repoRoot} ${commit.sha} ${commit.filename}`;
    const cached = this.diffCache.get(key);
    if (cached) return cached;
    const promise = runGit(
      [
        "show",
        commit.sha,
        "-m",
        "--first-parent",
        "--format=",
        "--unified=3",
        "--",
        commit.filename,
      ],
      { cwd: repoRoot },
    ).catch((error: unknown) => {
      this.diffCache.delete(key);
      if (error instanceof GitError) {
        log().warn(`hover changes: ${error.message}`);
        return undefined;
      }
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
