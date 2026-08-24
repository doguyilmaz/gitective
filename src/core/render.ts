import type { BlameCommit } from "./blame";
import { shortSha } from "./sanitize";
import type { TemplateValues } from "./template";
import { truncate } from "./template";
import type { DateStyle } from "./time";
import { formatAgo, formatDate, formatDateOnly } from "./time";

const AGO_OR_DATE_CUTOFF_DAYS = 30;

export interface RenderOptions {
  userEmail?: string;
  maxLength: number;
  locale?: string;
  nowMs?: number;
  dateStyle?: DateStyle;
}

export function templateValuesFor(commit: BlameCommit, opts: RenderOptions): TemplateValues {
  const isYou = commit.isUncommitted || (!!opts.userEmail && commit.authorEmail === opts.userEmail);
  const ago = formatAgo(commit.authorTime, opts.nowMs);
  const ageDays = ((opts.nowMs ?? Date.now()) / 1000 - commit.authorTime) / 86400;
  return {
    author: isYou ? "You" : commit.author,
    authorEmail: commit.authorEmail,
    ago,
    agoOrDate:
      ageDays < AGO_OR_DATE_CUTOFF_DAYS
        ? ago
        : formatDateOnly(commit.authorTime, opts.locale, opts.dateStyle),
    date: formatDate(commit.authorTime, opts.locale, opts.dateStyle),
    message: commit.isUncommitted
      ? "Uncommitted changes"
      : truncate(commit.summary, opts.maxLength),
    sha: shortSha(commit.sha),
  };
}
