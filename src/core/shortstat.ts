export interface ShortStat {
  files: number;
  insertions: number;
  deletions: number;
}

const STAT_RE = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

export function parseShortStat(text: string): ShortStat | undefined {
  const match = STAT_RE.exec(text);
  if (!match) return undefined;
  return {
    files: Number(match[1]),
    insertions: Number(match[2] ?? 0),
    deletions: Number(match[3] ?? 0),
  };
}
