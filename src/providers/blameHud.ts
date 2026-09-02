import * as vscode from "vscode";
import { AvatarService } from "../avatarService";
import type { WhodunitConfig } from "../config";
import { getConfig } from "../config";
import { ageBucket } from "../core/age";
import type { BlameCommit, LineBlame } from "../core/blame";
import { lineBlameAt, UNCOMMITTED_SHA } from "../core/blame";
import { templateValuesFor } from "../core/render";
import { escapeCodicons } from "../core/sanitize";
import type { TemplateValues } from "../core/template";
import { renderTemplate, usesToken } from "../core/template";
import type { DocContext } from "../docContext";
import { BLAMEABLE_SCHEMES, contextForDocument } from "../docContext";
import { commitInfo, modelFor, trusted } from "../hover/model";
import { renderDetails } from "../hover/render";
import { log } from "../log";
import type { Services } from "../services";

const SELECTION_DEBOUNCE_MS = 75;
const EDIT_DEBOUNCE_MS = 300;
const LARGE_FILE_LINES = 2000;
const LARGE_FILE_EDIT_DEBOUNCE_MS = 1200;
const AGO_REFRESH_MS = 60_000;

function decorationType(color: string): vscode.TextEditorDecorationType {
  return vscode.window.createTextEditorDecorationType({
    after: { color: new vscode.ThemeColor(color), margin: "0 0 0 3ch" },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
  });
}

function uncommittedCommit(): BlameCommit {
  return {
    sha: UNCOMMITTED_SHA,
    author: "You",
    authorEmail: "",
    authorTime: Date.now() / 1000,
    summary: "",
    boundary: false,
    filename: "",
    isUncommitted: true,
  };
}

export class BlameHud implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly plain = decorationType("whodunit.inlineBlame.foreground");
  private readonly tinted = [1, 2, 3, 4, 5].map((n) =>
    decorationType(`whodunit.inlineBlame.age${n}`),
  );
  private readonly applied = new WeakMap<vscode.TextEditor, vscode.TextEditorDecorationType>();
  private readonly statusItem = vscode.window.createStatusBarItem(
    "whodunit.blame",
    vscode.StatusBarAlignment.Right,
    1000,
  );
  private readonly updateSeq = new WeakMap<vscode.TextEditor, number>();
  private readonly timers = new Map<vscode.TextEditor, ReturnType<typeof setTimeout>>();
  private readonly agoTimer: ReturnType<typeof setInterval>;
  private readonly avatars: AvatarService;
  private seqCounter = 0;
  private statusSeq = 0;

  constructor(private readonly services: Services) {
    this.avatars = new AvatarService(services.remotes, services.avatarCache);
    this.statusItem.name = "Whodunit";
    this.statusItem.command = "whodunit.commitMenu";
    this.disposables.push(
      this.plain,
      ...this.tinted,
      this.statusItem,
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) this.statusItem.hide();
        else this.schedule(editor, SELECTION_DEBOUNCE_MS);
      }),
      vscode.window.onDidChangeTextEditorSelection((event) =>
        this.schedule(event.textEditor, SELECTION_DEBOUNCE_MS),
      ),
      vscode.workspace.onDidChangeTextDocument((event) => this.onEdit(event)),
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

  // while typing, the edited line is uncommitted by definition: show that at
  // once and re-blame the file after the edit burst settles
  private onEdit(event: vscode.TextDocumentChangeEvent): void {
    const doc = event.document;
    if (!(BLAMEABLE_SCHEMES as readonly string[]).includes(doc.uri.scheme)) return;
    const delay = doc.lineCount > LARGE_FILE_LINES ? LARGE_FILE_EDIT_DEBOUNCE_MS : EDIT_DEBOUNCE_MS;
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document !== doc) continue;
      const line = editor.selection.active.line;
      const touched = event.contentChanges.some(
        (change) =>
          change.range.start.line <= line &&
          line <= change.range.end.line + change.text.split("\n").length - 1,
      );
      if (touched) this.showUncommitted(editor, line);
      this.schedule(editor, delay);
    }
  }

  private showUncommitted(editor: vscode.TextEditor, line: number): void {
    const cfg = getConfig();
    if (!cfg.inlineEnabled || line >= editor.document.lineCount) return;
    const values = templateValuesFor(uncommittedCommit(), {
      maxLength: cfg.messageMaxLength,
      locale: vscode.env.language,
      dateStyle: cfg.dateStyle,
    });
    this.paint(editor, line, renderTemplate(cfg.inlineFormat, values), cfg.inlineAgeTint ? 1 : 0);
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
      dateStyle: cfg.dateStyle,
    });

    if (cfg.inlineEnabled) {
      const bucket = cfg.inlineAgeTint ? ageBucket(found.commit.authorTime) : 0;
      this.paint(
        editor,
        editor.selection.active.line,
        renderTemplate(cfg.inlineFormat, values),
        bucket,
      );
    } else {
      this.clearDecoration(editor);
    }

    if (isActive()) this.renderStatus(cfg, values, found, ctx);
  }

  private paint(editor: vscode.TextEditor, line: number, text: string, bucket: number): void {
    const type =
      bucket === 0 ? this.plain : (this.tinted[bucket - 1] as vscode.TextEditorDecorationType);
    const previous = this.applied.get(editor);
    if (previous && previous !== type) editor.setDecorations(previous, []);
    const lineEnd = editor.document.lineAt(line).range.end;
    editor.setDecorations(type, [
      {
        range: new vscode.Range(lineEnd, lineEnd),
        renderOptions: { after: { contentText: text } },
      },
    ]);
    this.applied.set(editor, type);
  }

  private renderStatus(
    cfg: WhodunitConfig,
    values: TemplateValues,
    found: LineBlame,
    ctx: DocContext,
  ): void {
    if (!cfg.statusBarEnabled) return this.statusItem.hide();
    const safe: TemplateValues = {
      ...values,
      author: escapeCodicons(values.author),
      authorEmail: escapeCodicons(values.authorEmail),
      message: escapeCodicons(values.message),
    };
    this.statusItem.text = renderTemplate(cfg.statusBarFormat, safe);
    this.statusItem.tooltip = found.commit.isUncommitted
      ? "Uncommitted changes · click for the commit menu"
      : `${values.author}, ${values.date}\n${found.commit.summary}\n${found.commit.sha}\n\nClick for the commit menu`;
    this.statusItem.show();
    void this.decorateStatus(cfg, found, ctx);
  }

  // the same card as the hover, rendered into the status bar tooltip once the
  // avatar and commit details are in; a newer line cancels a slower older one
  private async decorateStatus(
    cfg: WhodunitConfig,
    found: LineBlame,
    ctx: DocContext,
  ): Promise<void> {
    const seq = ++this.statusSeq;
    try {
      const [avatar, info, remote] = await Promise.all([
        cfg.hoverAvatars
          ? found.commit.isUncommitted
            ? this.avatars.avatarFor(ctx.userName ?? "You", ctx.userEmail ?? "")
            : this.avatars.avatarFor(found.commit.author, found.commit.authorEmail, {
                repoRoot: ctx.req.repoRoot,
                sha: found.commit.sha,
              })
          : Promise.resolve(undefined),
        found.commit.isUncommitted
          ? Promise.resolve({})
          : commitInfo.get(ctx.req.repoRoot, found.commit.sha),
        this.services.remotes.remoteFor(ctx.req.repoRoot),
      ]);
      if (seq !== this.statusSeq) return;
      this.statusItem.tooltip = trusted(
        renderDetails(modelFor(ctx, found, info, avatar, remote), { variant: "commit" }),
      );
    } catch (error) {
      log().warn(`status tooltip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private clearDecoration(editor: vscode.TextEditor): void {
    const previous = this.applied.get(editor);
    if (previous) editor.setDecorations(previous, []);
    this.applied.delete(editor);
  }

  private clear(editor: vscode.TextEditor, isActive: boolean): void {
    this.clearDecoration(editor);
    if (isActive) this.statusItem.hide();
  }

  dispose(): void {
    clearInterval(this.agoTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const disposable of this.disposables) disposable.dispose();
  }
}
