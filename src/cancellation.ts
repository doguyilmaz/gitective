import type * as vscode from "vscode";

export function toSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  } else {
    const sub = token.onCancellationRequested(() => {
      controller.abort();
      sub.dispose();
    });
  }
  return controller.signal;
}
