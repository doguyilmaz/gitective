import { encodePng } from "../core/png";
import { escapeCodicons, escapeMarkdown } from "../core/sanitize";

export interface HoverStat {
  files: number;
  insertions: number;
  deletions: number;
}

export interface HoverLinks {
  copySha: string;
  inspect: string;
  changes: string;
  changesWorking: string;
  open: string;
  history: string;
  lineHistory: string;
  menu: string;
  settings: string;
}

export interface HoverRemote {
  label: string;
  url: string;
  icon: "github" | "link-external";
}

export type HoverSignatureStatus = "verified" | "unverified" | "bad";

export interface HoverSignature {
  status: HoverSignatureStatus;
  label: string;
}

// vs code's own outline shield codicons, tinted through theme variables
const SIGNATURE_ICON: Record<HoverSignatureStatus, { icon: string; color: string }> = {
  verified: {
    icon: "workspace-trusted",
    color: "var(--vscode-gitDecoration-addedResourceForeground)",
  },
  unverified: { icon: "shield", color: "var(--vscode-descriptionForeground)" },
  bad: { icon: "workspace-untrusted", color: "var(--vscode-errorForeground)" },
};

export interface HoverModel {
  author: string;
  authorUrl?: string;
  signature?: HoverSignature;
  ago: string;
  date: string;
  summary: string;
  body?: string;
  shortSha: string;
  previousShortSha?: string;
  avatarSrc?: string;
  isUncommitted: boolean;
  stat?: HoverStat;
  remote?: HoverRemote;
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

function attr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// only a plain github profile url may become a link; anything else stays text
const PROFILE_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9-]+$/;

function authorLine(model: HoverModel): string {
  const name = safeText(model.author);
  const url = model.authorUrl && PROFILE_URL_RE.test(model.authorUrl) ? model.authorUrl : undefined;
  const linked = url ? `[${name}](${url} "Open profile")` : name;
  const badge = model.signature
    ? ` <span style="color:${SIGNATURE_ICON[model.signature.status].color};" title="${attr(model.signature.label)}">$(${SIGNATURE_ICON[model.signature.status].icon})</span>`
    : "";
  return [`<strong>${linked}</strong>${badge}`, model.ago, safeText(model.date)].join(
    " &nbsp;·&nbsp; ",
  );
}

function header(model: HoverModel, line1: string, line2: string): string {
  return model.avatarSrc ? avatarBlock(model.avatarSrc, line1, line2) : `${line1}<br>${line2}`;
}

const GAP = " &nbsp; ";
const BAR = " &nbsp;|&nbsp; ";
const ADDED = "var(--vscode-gitDecoration-addedResourceForeground)";
const DELETED = "var(--vscode-gitDecoration-deletedResourceForeground)";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// the built-in blame's stat line, colors via theme variables (the only css
// the hover sanitizer lets through)
export function statLine(stat: HoverStat): string {
  const parts = [plural(stat.files, "file") + " changed"];
  if (stat.insertions > 0) {
    parts.push(`<span style="color:${ADDED};">${plural(stat.insertions, "insertion")}(+)</span>`);
  }
  if (stat.deletions > 0) {
    parts.push(`<span style="color:${DELETED};">${plural(stat.deletions, "deletion")}(-)</span>`);
  }
  return parts.join(", ");
}

function actionRow(model: HoverModel): string {
  const groups: string[] = [
    [
      link(`$(git-commit) ${model.shortSha}`, model.links.inspect, "Inspect commit"),
      link("$(copy)", model.links.copySha, "Copy SHA"),
    ].join(GAP),
    [
      link(
        "$(diff)",
        model.links.changes,
        model.previousShortSha
          ? `Changes ${model.previousShortSha} ↔ ${model.shortSha}`
          : `Changes: added in ${model.shortSha}`,
      ),
      link("$(history)", model.links.history, "File history"),
      link("$(list-ordered)", model.links.lineHistory, "Line history"),
    ].join(GAP),
  ];
  if (model.remote) {
    groups.push(
      link(
        `$(${model.remote.icon}) Open on ${model.remote.label}`,
        model.remote.url,
        `Open this commit on ${model.remote.label}`,
      ),
    );
  }
  groups.push(
    [
      link("$(ellipsis)", model.links.menu, "Commit menu: files, working tree, git actions"),
      link("$(gear)", model.links.settings, "Gitective settings"),
    ].join(GAP),
  );
  return groups.join(BAR);
}

// "line" (editor hover): no stat. "commit" (status bar hover): stat line under the message.
export interface DetailsOptions {
  variant?: "line" | "commit";
}

export function renderDetails(model: HoverModel, opts: DetailsOptions = {}): string {
  if (model.isUncommitted) {
    const actions = [
      link(
        "$(diff) Changes vs HEAD",
        model.links.changesWorking,
        "Diff the working file against HEAD",
      ),
      link("$(history)", model.links.history, "File history"),
      link("$(gear)", model.links.settings, "Gitective settings"),
    ].join(GAP);
    return [
      header(model, "<strong>You</strong>", "<em>uncommitted changes</em>"),
      "---",
      actions,
    ].join("\n\n");
  }

  const line1 = authorLine(model);
  const summary = safeText(model.summary);
  const body = model.body ? [model.body.split("\n").map(safeText).join("<br>")] : [];
  const stat = opts.variant === "commit" && model.stat ? [statLine(model.stat)] : [];
  return [header(model, line1, summary), ...body, ...stat, "---", actionRow(model)].join("\n\n");
}

export function renderChanges(model: HoverModel, diffLine?: string): string {
  const parts: string[] = [];
  if (diffLine !== undefined) parts.push(fence([diffLine]));
  const label = model.previousShortSha
    ? `Changes ${model.previousShortSha} ↔ ${model.shortSha}`
    : `Changes — added in ${model.shortSha}`;
  parts.push(link(label, model.links.changes, "Open the side-by-side diff"));
  return parts.join("\n\n");
}
