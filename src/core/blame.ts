export const UNCOMMITTED_SHA = "0".repeat(40);

// sha256 repos use 64-hex object ids and a 64-zero uncommitted sentinel
export function isUncommittedSha(sha: string): boolean {
  return (sha.length === 40 || sha.length === 64) && /^0+$/.test(sha);
}

export interface BlameCommit {
  sha: string;
  author: string;
  authorEmail: string;
  authorTime: number;
  summary: string;
  previous?: { sha: string; path: string };
  boundary: boolean;
  filename: string;
  isUncommitted: boolean;
}

export interface BlameLine {
  line: number;
  sha: string;
  origLine: number;
}

export interface FileBlame {
  commits: Map<string, BlameCommit>;
  lines: BlameLine[];
}

export interface LineBlame {
  line: BlameLine;
  commit: BlameCommit;
}

export function lineBlameAt(blame: FileBlame, line: number): LineBlame | undefined {
  const direct = blame.lines[line - 1];
  const entry = direct?.line === line ? direct : blame.lines.find((l) => l.line === line);
  if (!entry) return undefined;
  const commit = blame.commits.get(entry.sha);
  return commit ? { line: entry, commit } : undefined;
}

const ENTRY_RE = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) (\d+) (\d+)(?: \d+)?$/;

const SIMPLE_ESCAPES: Record<string, number> = {
  "\\": 0x5c,
  '"': 0x22,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  v: 0x0b,
};

// git C-quotes special paths; octal escapes are raw UTF-8 BYTES, not code points
export function unquotePath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const inner = raw.slice(1, -1);
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === "\\" && i + 1 < inner.length) {
      const octal = inner.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        bytes.push(parseInt(octal, 8));
        i += 4;
        continue;
      }
      const simple = SIMPLE_ESCAPES[inner[i + 1] as string];
      if (simple !== undefined) {
        bytes.push(simple);
        i += 2;
        continue;
      }
    }
    bytes.push(...encoder.encode(inner[i] as string));
    i += 1;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function newCommit(sha: string): BlameCommit {
  return {
    sha,
    author: "",
    authorEmail: "",
    authorTime: 0,
    summary: "",
    boundary: false,
    filename: "",
    isUncommitted: isUncommittedSha(sha),
  };
}

export function parsePorcelain(output: string): FileBlame {
  const commits = new Map<string, BlameCommit>();
  const lines: BlameLine[] = [];
  let current: { commit: BlameCommit; origLine: number; finalLine: number } | undefined;

  for (const raw of output.split("\n")) {
    if (raw.startsWith("\t")) {
      if (current) {
        lines.push({
          line: current.finalLine,
          sha: current.commit.sha,
          origLine: current.origLine,
        });
      }
      continue;
    }

    const entry = ENTRY_RE.exec(raw);
    if (entry) {
      const sha = entry[1] as string;
      let commit = commits.get(sha);
      if (!commit) {
        commit = newCommit(sha);
        commits.set(sha, commit);
      }
      current = {
        commit,
        origLine: Number(entry[2]),
        finalLine: Number(entry[3]),
      };
      continue;
    }

    if (!current) continue;
    const commit = current.commit;
    const space = raw.indexOf(" ");
    const key = space === -1 ? raw : raw.slice(0, space);
    const value = space === -1 ? "" : raw.slice(space + 1);

    switch (key) {
      case "author":
        commit.author = value;
        break;
      case "author-mail":
        commit.authorEmail = value.replace(/^<|>$/g, "");
        break;
      case "author-time":
        commit.authorTime = Number(value);
        break;
      case "summary":
        commit.summary = value;
        break;
      case "boundary":
        commit.boundary = true;
        break;
      case "previous": {
        const shaEnd = value.indexOf(" ");
        if (shaEnd > 0) {
          commit.previous = {
            sha: value.slice(0, shaEnd),
            path: unquotePath(value.slice(shaEnd + 1)),
          };
        }
        break;
      }
      case "filename":
        commit.filename = unquotePath(value);
        break;
    }
  }

  return { commits, lines };
}
