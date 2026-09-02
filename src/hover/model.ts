import * as vscode from "vscode";
import type { AvatarInfo } from "../avatarCache";
import type { LineTarget } from "../commands/lineActions";
import { getConfig } from "../config";
import { signatureBadgeUri } from "../core/badge";
import type { LineBlame } from "../core/blame";
import { messageBody } from "../core/gitLog";
import { templateValuesFor } from "../core/render";
import { shortSha } from "../core/sanitize";
import { parseShortStat, type ShortStat } from "../core/shortstat";
import { parseSignature, type Signature } from "../core/signature";
import type { DocContext } from "../docContext";
import { GitError, runGit } from "../git/run";
import { log } from "../log";
import { commandUri, type HoverModel } from "./render";

export const TRUSTED_COMMANDS = [
  "whodunit.copySha",
  "whodunit.compareWithPrevious",
  "whodunit.compareWithWorking",
  "whodunit.openAtRevision",
  "whodunit.fileHistory",
  "whodunit.lineHistory",
  "whodunit.commitMenu",
  "workbench.action.openSettings",
];

const CACHE_LIMIT = 32;

export interface CommitInfo {
  body?: string;
  stat?: ShortStat;
  signature?: Signature;
}

export function targetFor(ctx: DocContext, found: LineBlame): LineTarget {
  return {
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
}

// body, shortstat and signature status in one git call, cached per commit;
// %G? shells out to gpg, which is why this is never done on the HUD path first
export class CommitInfoCache {
  private readonly cache = new Map<string, Promise<CommitInfo>>();

  get(repoRoot: string, sha: string): Promise<CommitInfo> {
    const key = `${repoRoot} ${sha}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = runGit(
      ["show", "--shortstat", "-m", "--first-parent", "--format=%G?%x1f%GS%x1f%GK%x1f%B%x1e", sha],
      { cwd: repoRoot },
    ).then(
      (out) => {
        const [record = "", rest = ""] = out.split("\x1e");
        const first = record.indexOf("\x1f");
        const second = record.indexOf("\x1f", first + 1);
        const third = record.indexOf("\x1f", second + 1);
        const code = record.slice(0, first);
        const signer = record.slice(first + 1, second);
        const keyId = record.slice(second + 1, third);
        return {
          body: messageBody(record.slice(third + 1)) || undefined,
          stat: parseShortStat(rest),
          signature: parseSignature(code, signer, keyId),
        };
      },
      (error: unknown) => {
        this.cache.delete(key);
        if (error instanceof GitError) log().warn(`commit info: ${error.message}`);
        return {};
      },
    );
    this.cache.set(key, promise);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return promise;
  }
}

export const commitInfo = new CommitInfoCache();

export function modelFor(
  ctx: DocContext,
  found: LineBlame,
  info: CommitInfo,
  avatar?: AvatarInfo,
): HoverModel {
  const cfg = getConfig();
  const target = targetFor(ctx, found);
  const values = templateValuesFor(found.commit, {
    userEmail: ctx.userEmail,
    maxLength: Number.MAX_SAFE_INTEGER,
    locale: vscode.env.language,
    dateStyle: cfg.dateStyle,
  });
  return {
    author: values.author,
    authorUrl: avatar?.profileUrl,
    signature: info.signature && {
      badgeSrc: signatureBadgeUri(info.signature.status),
      label: info.signature.label,
    },
    ago: values.ago,
    date: values.date,
    summary: found.commit.summary,
    body: info.body,
    shortSha: shortSha(found.commit.sha),
    previousShortSha: target.previousSha ? shortSha(target.previousSha) : undefined,
    avatarSrc: avatar?.dataUri,
    isUncommitted: found.commit.isUncommitted,
    stat: info.stat,
    links: {
      copySha: commandUri("whodunit.copySha", target),
      changes: commandUri("whodunit.compareWithPrevious", target),
      changesWorking: commandUri("whodunit.compareWithWorking", target),
      open: commandUri("whodunit.openAtRevision", target),
      history: commandUri("whodunit.fileHistory", target),
      lineHistory: commandUri("whodunit.lineHistory", target),
      menu: commandUri("whodunit.commitMenu", target),
    },
  };
}

export function trusted(markdown: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString(markdown, true);
  md.isTrusted = { enabledCommands: TRUSTED_COMMANDS };
  md.supportHtml = true;
  return md;
}
