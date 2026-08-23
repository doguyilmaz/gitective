import * as vscode from "vscode";
import type { WhodunitConfig } from "../config";
import { getConfig } from "../config";
import type { LineBlame } from "../core/blame";
import { lineBlameAt } from "../core/blame";
import { templateValuesFor } from "../core/render";
import { escapeCodicons } from "../core/sanitize";
import type { TemplateValues } from "../core/template";
import { renderTemplate, usesToken } from "../core/template";
import { contextForDocument } from "../docContext";
import { log } from "../log";
import type { Services } from "../services";
import { REV_SCHEME } from "../uris";

const SELECTION_DEBOUNCE_MS = 75;
const EDIT_DEBOUNCE_MS = 300;
const AGO_REFRESH_MS = 60_000;

export class BlameHud implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    after: {
      color: new vscode.ThemeColor("whodunit.inlineBlame.foreground"),
      margin: "0 0 0 3ch",
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
  });
  private readonly statusItem = vscode.window.createStatusBarItem(
    "whodunit.blame",
    vscode.StatusBarAlignment.Left,
    100,
  );
  private readonly updateSeq = new WeakMap<vscode.TextEditor, number>();
  private readonly timers = new Map<vscode.TextEditor, ReturnType<typeof setTimeout>>();
  private readonly agoTimer: ReturnType<typeof setInterval>;
  private seqCounter = 0;

  constructor(private readonly services: Services) {
    this.statusItem.name = "Whodunit Blame";
    this.statusItem.command = "whodunit.lineActions";
    this.disposables.push(
      this.decoration,
      this.statusItem,
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) this.statusItem.hide();
        else this.schedule(editor, SELECTION_DEBOUNCE_MS);
      }),
      vscode.window.onDidChangeTextEditorSelection((event) =>
        this.schedule(event.textEditor, SELECTION_DEBOUNCE_MS),
      ),
      vscode.workspace.onDidChangeTextDocument((event) => this.scheduleForDoc(event.document)),
    );
    this.agoTimer = setInterval(() => this.onAgoTick(), AGO_REFRESH_MS);
    if (vscode.window.activeTextEditor) void this.update(vscode.window.activeTextEditor);
  }

  refresh(): void {
    for (const editor of vscode.window.visibleTextEditors) void this.update(editor);
  }

  private schedule(editor: vscode.TextEditor, delay: number): void {
    const pending = this.timers.get(editor);
    if (pending) clearTimeout(pending);
    this.timers.set(
      editor,
      setTimeout(() => {
        this.timers.delete(editor);
        void this.update(editor);
      }, delay),
    );
  }

  private scheduleForDoc(doc: vscode.TextDocument): void {
    if (doc.uri.scheme !== "file" && doc.uri.scheme !== REV_SCHEME) return;
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === doc) this.schedule(editor, EDIT_DEBOUNCE_MS);
    }
  }

  private onAgoTick(): void {
    const cfg = getConfig();
    if (!usesToken(cfg.inlineFormat, "ago") && !usesToken(cfg.statusBarFormat, "ago")) return;
    this.refresh();
  }

  private async update(editor: vscode.TextEditor): Promise<void> {
    try {
      await this.updateUnsafe(editor);
    } catch (error) {
      log().error(`blame hud: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async updateUnsafe(editor: vscode.TextEditor): Promise<void> {
    const seq = ++this.seqCounter;
    this.updateSeq.set(editor, seq);
    const cfg = getConfig();
    // resolved at use time: a slow background update must not steal the
    // status bar from the editor that became active during the awaits
    const isActive = () => vscode.window.activeTextEditor === editor;
    if (!cfg.inlineEnabled && !cfg.statusBarEnabled) return this.clear(editor, isActive());

    const version = editor.document.version;
    const ctx = await contextForDocument(editor.document, this.services.resolver);
    if (this.updateSeq.get(editor) !== seq) return;
    if (!ctx) return this.clear(editor, isActive());

    const blame = await this.services.blame.getBlame(ctx.req);
    if (this.updateSeq.get(editor) !== seq || editor.document.version !== version) return;

    const found = blame && lineBlameAt(blame, editor.selection.active.line + 1);
    if (!found) return this.clear(editor, isActive());

    const values = templateValuesFor(found.commit, {
      userEmail: ctx.userEmail,
      maxLength: cfg.messageMaxLength,
      locale: vscode.env.language,
    });

    if (cfg.inlineEnabled) {
      const lineEnd = editor.document.lineAt(editor.selection.active.line).range.end;
      editor.setDecorations(this.decoration, [
        {
          range: new vscode.Range(lineEnd, lineEnd),
          renderOptions: { after: { contentText: renderTemplate(cfg.inlineFormat, values) } },
        },
      ]);
    } else {
      editor.setDecorations(this.decoration, []);
    }

    if (isActive()) this.renderStatus(cfg, values, found);
  }

  private renderStatus(cfg: WhodunitConfig, values: TemplateValues, found: LineBlame): void {
    if (!cfg.statusBarEnabled) return this.statusItem.hide();
    const safe: TemplateValues = {
      ...values,
      author: escapeCodicons(values.author),
      authorEmail: escapeCodicons(values.authorEmail),
      message: escapeCodicons(values.message),
    };
    this.statusItem.text = renderTemplate(cfg.statusBarFormat, safe);
    this.statusItem.tooltip = found.commit.isUncommitted
      ? "Uncommitted changes"
      : `${values.author}, ${values.date}\n${found.commit.summary}\n${found.commit.sha}`;
    this.statusItem.show();
  }

  private clear(editor: vscode.TextEditor, isActive: boolean): void {
    editor.setDecorations(this.decoration, []);
    if (isActive) this.statusItem.hide();
  }

  dispose(): void {
    clearInterval(this.agoTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const disposable of this.disposables) disposable.dispose();
  }
}
