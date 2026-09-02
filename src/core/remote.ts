export type RemoteHost = "github" | "gitlab" | "bitbucket";

export interface Remote {
  host: RemoteHost;
  owner: string;
  repo: string;
  webBase: string;
}

const HOSTS: Array<[domain: string, host: RemoteHost]> = [
  ["github.com", "github"],
  ["gitlab.com", "gitlab"],
  ["bitbucket.org", "bitbucket"],
];

const FORMS = [
  /^https?:\/\/(?:[^@/]+@)?([^/:]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/,
  /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?$/,
];

export function parseRemote(url: string): Remote | undefined {
  for (const form of FORMS) {
    const match = form.exec(url.trim());
    if (!match) continue;
    const [, domain, owner, repo] = match as unknown as [string, string, string, string];
    const known = HOSTS.find(([d]) => d === domain.toLowerCase());
    if (!known) return undefined;
    return { host: known[1], owner, repo, webBase: `https://${domain}/${owner}/${repo}` };
  }
  return undefined;
}

export function commitUrl(remote: Remote, sha: string): string {
  switch (remote.host) {
    case "github":
      return `${remote.webBase}/commit/${sha}`;
    case "gitlab":
      return `${remote.webBase}/-/commit/${sha}`;
    case "bitbucket":
      return `${remote.webBase}/commits/${sha}`;
  }
}

export function hostLabel(host: RemoteHost): string {
  return host === "github" ? "GitHub" : host === "gitlab" ? "GitLab" : "Bitbucket";
}
