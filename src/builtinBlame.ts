import * as vscode from "vscode";

const NUDGED_KEY = "builtinBlame.nudged";

// vs code ships its own blame status bar item (default on since 1.98) and an
// optional inline decoration; running both looks like a bug, so ask once
export async function nudgeBuiltinBlame(state: vscode.Memento): Promise<void> {
  if (state.get<boolean>(NUDGED_KEY)) return;
  const git = vscode.workspace.getConfiguration("git");
  const statusOn = git.get<boolean>("blame.statusBarItem.enabled", false);
  const inlineOn = git.get<boolean>("blame.editorDecoration.enabled", false);
  if (!statusOn && !inlineOn) return;
  await state.update(NUDGED_KEY, true);
  const pick = await vscode.window.showInformationMessage(
    "VS Code's built-in Git blame is also on, so you'll see two blame items. Turn the built-in one off?",
    "Turn off built-in",
    "Keep both",
  );
  if (pick !== "Turn off built-in") return;
  await Promise.all([
    git.update("blame.statusBarItem.enabled", false, vscode.ConfigurationTarget.Global),
    git.update("blame.editorDecoration.enabled", false, vscode.ConfigurationTarget.Global),
  ]);
}
