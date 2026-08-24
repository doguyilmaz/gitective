export interface GitHubRepo {
  owner: string;
  repo: string;
}

const REMOTE_RES = [
  /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
  /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
];

export function parseGitHubRemote(url: string): GitHubRepo | undefined {
  for (const re of REMOTE_RES) {
    const match = re.exec(url.trim());
    if (match) return { owner: match[1] as string, repo: match[2] as string };
  }
  return undefined;
}
