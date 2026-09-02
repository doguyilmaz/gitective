import { posix } from "node:path";
import * as vscode from "vscode";

// revision tabs carry " @ sha" in their name, which defeats extension-based
// language detection, so borrow the language from an open document of the same type
export function guessLanguageId(relPath: string): string | undefined {
  const ext = posix.extname(relPath).toLowerCase();
  const base = posix.basename(relPath).toLowerCase();
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "plaintext") continue;
    const name = posix.basename(doc.uri.path).toLowerCase();
    if (name === base || (ext && name.endsWith(ext))) return doc.languageId;
  }
  return undefined;
}

export async function openRevisionDocument(
  uri: vscode.Uri,
  relPath: string,
  languageId?: string,
): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const language = languageId ?? guessLanguageId(relPath);
  if (language && doc.languageId !== language) {
    return vscode.languages.setTextDocumentLanguage(doc, language);
  }
  return doc;
}
