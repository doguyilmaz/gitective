export const LOG_FORMAT = "%H%x1f%an%x1f%ae%x1f%at%x1f%s%x1e";

export interface FileChange {
  status: string;
  path: string;
  oldPath?: string;
}

export interface LogEntry {
  sha: string;
  author: string;
  authorEmail: string;
  authorTime: number;
  subject: string;
  changes?: FileChange[];
}

const STATUS_RE = /^([A-Z])\d*\t([^\t]+)(?:\t(.+))?$/;

export function parseNameStatus(output: string): FileChange[] {
  const changes: FileChange[] = [];
  for (const line of output.split("\n")) {
    const match = STATUS_RE.exec(line);
    if (!match) continue;
    const [, status, first, second] = match as unknown as [string, string, string, string?];
    changes.push(second ? { status, path: second, oldPath: first } : { status, path: first });
  }
  return changes;
}

// with --name-status, a record's file changes trail its %x1e separator,
// so they arrive as the preamble of the NEXT chunk and attach backwards
export function parseLogRecords(output: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const record of output.split("\x1e")) {
    const fields = record.split("\x1f");
    const headLines = (fields[0] ?? "").split("\n");
    const sha = headLines.pop()?.trim() ?? "";
    const preamble = headLines.join("\n");
    if (preamble && entries.length > 0) {
      const changes = parseNameStatus(preamble);
      const previous = entries[entries.length - 1];
      if (changes.length > 0 && previous && !previous.changes) previous.changes = changes;
    }
    if (fields.length !== 5 || !/^[0-9a-f]{40}$/.test(sha)) continue;
    entries.push({
      sha,
      author: fields[1] as string,
      authorEmail: fields[2] as string,
      authorTime: Number(fields[3]),
      subject: fields[4] as string,
    });
  }
  return entries;
}
