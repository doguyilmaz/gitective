export const UNCOMMITTED_SHA = "0".repeat(40);

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

const ENTRY_RE = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/;

// git C-quotes paths containing special characters
function unquotePath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  return raw.slice(1, -1).replace(/\\([\\"nrt]|[0-7]{3})/g, (_, esc: string) => {
    switch (esc) {
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return String.fromCharCode(parseInt(esc, 8));
    }
  });
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
    isUncommitted: sha === UNCOMMITTED_SHA,
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
