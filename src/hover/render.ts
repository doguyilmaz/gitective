import { encodePng } from "../core/png";
import { escapeCodicons, escapeMarkdown } from "../core/sanitize";

export interface HoverStat {
  files: number;
  insertions: number;
  deletions: number;
}

export interface HoverLinks {
  copySha: string;
  changes: string;
  changesWorking: string;
  open: string;
  history: string;
  lineHistory: string;
  menu: string;
}

export interface HoverModel {
  author: string;
  ago: string;
  date: string;
  summary: string;
  body?: string;
  shortSha: string;
  previousShortSha?: string;
  avatarSrc?: string;
  isUncommitted: boolean;
  stat?: HoverStat;
  links: HoverLinks;
}

const AVATAR_SIZE = 34;
const GUTTER_WIDTH = 10;

// floats have no margin without a style attribute, so a transparent
// 1x1 png stretched into a second float acts as the gutter
const GUTTER_URI = `data:image/png;base64,${Buffer.from(encodePng(new Uint8Array(4), 1, 1)).toString("base64")}`;

export function safeText(text: string): string {
  return escapeCodicons(escapeMarkdown(text));
}

// encodeURIComponent leaves ( ) unescaped, and a bare ) truncates a markdown link
export function commandUri(command: string, args: unknown): string {
  const encoded = encodeURIComponent(JSON.stringify([args])).replace(/[()]/g, (char) =>
    char === "(" ? "%28" : "%29",
  );
  return `command:${command}?${encoded}`;
}

function link(label: string, target: string, title?: string): string {
  return `[${label}](${target}${title ? ` "${title}"` : ""})`;
}

export function fence(lines: string[]): string {
  let longest = 2;
  for (const line of lines) {
    for (const match of line.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  }
  const ticks = "`".repeat(longest + 1);
  return `${ticks}diff\n${lines.join("\n")}\n${ticks}`;
}

export function avatarBlock(src: string, line1: string, line2: string): string {
  return [
    `<img src="${src}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" align="left">`,
    `<img src="${GUTTER_URI}" width="${GUTTER_WIDTH}" height="${AVATAR_SIZE}" align="left">`,
    `${line1}<br>${line2}`,
  ].join("");
}

function header(model: HoverModel, line1: string, line2: string): string {
  return model.avatarSrc ? avatarBlock(model.avatarSrc, line1, line2) : `${line1}<br>${line2}`;
}

const GAP = " &nbsp;&nbsp; ";

export function renderDetails(model: HoverModel): string {
  if (model.isUncommitted) {
    const actions = [
      link("Changes vs HEAD", model.links.changesWorking, "Diff the working file against HEAD"),
      link("History", model.links.history, "This file's commits"),
    ].join(GAP);
    return [
      header(model, "<strong>You</strong>", "<em>uncommitted changes</em>"),
      "---",
      actions,
    ].join("\n\n");
  }

  const line1 = [`<strong>${safeText(model.author)}</strong>`, model.ago, safeText(model.date)].join(
    " &nbsp;·&nbsp; ",
  );
  const line2 = safeText(model.summary);
  const body = model.body ? [model.body.split("\n").map(safeText).join("<br>")] : [];
  const actions = [
    link(`\`${model.shortSha}\``, model.links.copySha, "Copy SHA"),
    link(
      "Changes",
      model.links.changes,
      model.previousShortSha
        ? `Diff this file: ${model.previousShortSha} ↔ ${model.shortSha}`
        : `This file was added in ${model.shortSha}`,
    ),
    link(`Open file @${model.shortSha}`, model.links.open, "Read-only snapshot at this commit"),
    link("History", model.links.history, "This file's commits"),
    link("Line history", model.links.lineHistory, "Every commit that touched this line"),
    link("Commit ⋯", model.links.menu, "Files, remote, copy, git actions"),
  ].join(GAP);

  return [header(model, line1, line2), ...body, "---", actions].join("\n\n");
}

export function renderChanges(model: HoverModel, diffLine?: string): string {
  const parts: string[] = [];
  if (diffLine !== undefined) parts.push(fence([diffLine]));
  const label = model.previousShortSha
    ? `Changes ${model.previousShortSha} ↔ ${model.shortSha}`
    : `Changes — added in ${model.shortSha}`;
  const stat = model.stat
    ? ` · ${model.stat.files} ${model.stat.files === 1 ? "file" : "files"} · +${model.stat.insertions} −${model.stat.deletions}`
    : "";
  parts.push(`${link(label, model.links.changes, "Open the side-by-side diff")}${stat}`);
  return parts.join("\n\n");
}
