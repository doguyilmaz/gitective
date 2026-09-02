import type { FileChange } from "./gitLog";

export interface CommitDocFile extends FileChange {
  line: number;
}

const HEADER_RE = /^diff --git a\/(.+) b\/(.+)$/;

// file headers of a `git show --patch` document, with status inferred from
// the mode lines that follow each header
export function commitDocFiles(text: string): CommitDocFile[] {
  const lines = text.split("\n");
  const files: CommitDocFile[] = [];
  for (const [index, line] of lines.entries()) {
    const match = HEADER_RE.exec(line);
    if (!match) continue;
    const oldPath = match[1] as string;
    const path = match[2] as string;
    const tail = lines.slice(index + 1, index + 5).join("\n");
    const status = /^new file mode/m.test(tail)
      ? "A"
      : /^deleted file mode/m.test(tail)
        ? "D"
        : oldPath !== path
          ? "R"
          : "M";
    files.push({ line: index, status, path, ...(oldPath !== path && { oldPath }) });
  }
  return files;
}
