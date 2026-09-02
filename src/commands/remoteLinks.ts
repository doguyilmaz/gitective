import * as vscode from "vscode";
import { isUncommittedSha } from "../core/blame";
import { commitUrl, hostLabel } from "../core/remote";
import type { Services } from "../services";
import { resolveTarget } from "./lineActions";

async function linkFor(
  services: Services,
  arg: unknown,
): Promise<{ url: string; host: string } | undefined> {
  const target = await resolveTarget(services, arg);
  if (!target || isUncommittedSha(target.sha)) {
    void vscode.window.showInformationMessage("Whodunit: no commit for the current line.");
    return undefined;
  }
  const remote = await services.remotes.remoteFor(target.repoRoot);
  if (!remote) {
    void vscode.window.showInformationMessage(
      "Whodunit: origin is not a GitHub, GitLab or Bitbucket remote.",
    );
    return undefined;
  }
  return { url: commitUrl(remote, target.sha), host: hostLabel(remote.host) };
}

export async function openOnRemote(services: Services, arg: unknown): Promise<void> {
  const link = await linkFor(services, arg);
  if (link) await vscode.env.openExternal(vscode.Uri.parse(link.url));
}

export async function copyRemoteLink(services: Services, arg: unknown): Promise<void> {
  const link = await linkFor(services, arg);
  if (!link) return;
  await vscode.env.clipboard.writeText(link.url);
  vscode.window.setStatusBarMessage(`Copied ${link.host} commit link`, 3000);
}
