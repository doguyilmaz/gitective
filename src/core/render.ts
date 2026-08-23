import type { BlameCommit } from "./blame";
import { shortSha } from "./sanitize";
import type { TemplateValues } from "./template";
import { truncate } from "./template";
import { formatAgo, formatDate } from "./time";

export interface RenderOptions {
  userEmail?: string;
  maxLength: number;
  locale?: string;
  nowMs?: number;
}

export function templateValuesFor(commit: BlameCommit, opts: RenderOptions): TemplateValues {
  const isYou = commit.isUncommitted || (!!opts.userEmail && commit.authorEmail === opts.userEmail);
  return {
    author: isYou ? "You" : commit.author,
    authorEmail: commit.authorEmail,
    ago: formatAgo(commit.authorTime, opts.nowMs),
    date: formatDate(commit.authorTime, opts.locale),
    message: commit.isUncommitted ? "Uncommitted changes" : truncate(commit.summary, opts.maxLength),
    sha: shortSha(commit.sha),
  };
}
