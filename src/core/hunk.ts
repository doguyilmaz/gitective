export interface Hunk {
  header: string;
  lines: string[];
  newStart: number;
  newCount: number;
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: (Hunk & { remainingOld: number; remainingNew: number }) | undefined;

  for (const line of diff.split("\n")) {
    const header = HUNK_RE.exec(line);
    if (header) {
      current = {
        header: line,
        lines: [],
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        remainingOld: header[2] === undefined ? 1 : Number(header[2]),
        remainingNew: header[4] === undefined ? 1 : Number(header[4]),
      };
      hunks.push(current);
      continue;
    }
    if (!current || (current.remainingOld <= 0 && current.remainingNew <= 0)) continue;

    const kind = line[0];
    if (kind === " ") {
      current.remainingOld--;
      current.remainingNew--;
    } else if (kind === "-") {
      current.remainingOld--;
    } else if (kind === "+") {
      current.remainingNew--;
    } else if (kind !== "\\") {
      continue;
    }
    current.lines.push(line);
  }

  return hunks.map(({ header, lines, newStart, newCount }) => ({
    header,
    lines,
    newStart,
    newCount,
  }));
}

export function hunkForLine(hunks: Hunk[], line: number): Hunk | undefined {
  return hunks.find((h) => line >= h.newStart && line < h.newStart + h.newCount);
}

export function lineAtInHunk(hunk: Hunk, line: number): string | undefined {
  let newLine = hunk.newStart;
  for (const text of hunk.lines) {
    const kind = text[0];
    if (kind === " " || kind === "+") {
      if (newLine === line) return text;
      newLine++;
    }
  }
  return undefined;
}
