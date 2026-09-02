import { describe, expect, test } from "bun:test";
import {
  commandUri,
  renderChanges,
  renderDetails,
  statLine,
  type HoverModel,
} from "../src/hover/render";

const links = {
  copySha: "command:whodunit.copySha?%5B%5D",
  inspect: "command:whodunit.inspectCommit?%5B%5D",
  changes: "command:whodunit.compareWithPrevious?%5B%5D",
  changesWorking: "command:whodunit.compareWithWorking?%5B%5D",
  open: "command:whodunit.openAtRevision?%5B%5D",
  history: "command:whodunit.fileHistory?%5B%5D",
  lineHistory: "command:whodunit.lineHistory?%5B%5D",
  menu: "command:whodunit.commitMenu?%5B%5D",
  settings: "command:workbench.action.openSettings?%5B%22whodunit%22%5D",
};

const model: HoverModel = {
  author: "Umut Topalak",
  ago: "20 months ago",
  date: "Dec 6, 2024",
  summary: "fix: improve invoice API filtering",
  body: "- api.py: exclude deleted\n- models.py: trailing comma",
  shortSha: "282c899",
  previousShortSha: "8652fd9",
  isUncommitted: false,
  stat: { files: 51, insertions: 5675, deletions: 401 },
  links,
};

describe("renderDetails", () => {
  test("mixed action row: sha + icons, github text link, menu and settings", () => {
    const out = renderDetails({
      ...model,
      remote: { label: "GitHub", url: "https://github.com/a/b/commit/282c899", icon: "github" },
    });
    expect(out).toContain("[$(git-commit) 282c899](command:whodunit.inspectCommit");
    expect(out).toContain('[$(copy)](command:whodunit.copySha?%5B%5D "Copy SHA")');
    expect(out).toContain(
      '[$(diff)](command:whodunit.compareWithPrevious?%5B%5D "Changes 8652fd9 ↔ 282c899")',
    );
    expect(out).toContain("[$(history)](command:whodunit.fileHistory");
    expect(out).toContain("[$(list-ordered)](command:whodunit.lineHistory");
    expect(out).toContain("[$(github) Open on GitHub](https://github.com/a/b/commit/282c899");
    expect(out).toContain("[$(ellipsis)](command:whodunit.commitMenu");
    expect(out).toContain("[$(gear)](command:workbench.action.openSettings");
    expect(out).not.toContain("Open file @");
  });

  test("no remote row without a known remote", () => {
    expect(renderDetails(model)).not.toContain("Open on");
  });

  test("commit variant puts the stat beside the avatar and the message below", () => {
    expect(renderDetails(model)).not.toContain("files changed");
    const out = renderDetails(model, { variant: "commit" });
    const statAt = out.indexOf("51 files changed, ");
    const summaryAt = out.indexOf("fix: improve invoice API filtering");
    expect(statAt).toBeGreaterThan(-1);
    expect(statAt).toBeLessThan(summaryAt);
    expect(out).toContain("<br>51 files changed, ");
    expect(out).toContain(
      '<span style="color:var(--vscode-gitDecoration-addedResourceForeground);">5675 insertions(+)</span>',
    );
    expect(out).toContain(
      '<span style="color:var(--vscode-gitDecoration-deletedResourceForeground);">401 deletions(-)</span>',
    );
    expect(statLine({ files: 1, insertions: 1, deletions: 0 })).toBe(
      '1 file changed, <span style="color:var(--vscode-gitDecoration-addedResourceForeground);">1 insertion(+)</span>',
    );
  });

  test("renders header, body with line breaks, and escapes injection", () => {
    const plain = renderDetails(model);
    expect(plain).toContain("<strong>Umut Topalak</strong>");
    expect(plain).toContain("exclude deleted<br>");
    const evil = { ...model, summary: "[x](command:evil.run) <img onerror=1>", body: "* bold *" };
    const out = renderDetails(evil);
    expect(out).not.toContain("[x](command:evil.run)");
    expect(out).toContain("\\<img");
    expect(out).toContain("\\* bold \\*");
  });

  test("uncommitted card is compact", () => {
    const out = renderDetails({ ...model, isUncommitted: true });
    expect(out).toContain("[$(diff) Changes vs HEAD](");
    expect(out).toContain("[$(history)](");
    expect(out).toContain("[$(gear)](");
    expect(out).not.toContain("282c899");
    expect(out).not.toContain("files changed");
  });

  test("author links to a profile and shows a signature badge when known", () => {
    const out = renderDetails({
      ...model,
      authorUrl: "https://github.com/umut",
      signature: { status: "verified", label: 'Signed by "Umut", verified' },
    });
    expect(out).toContain(
      '<strong>[Umut Topalak](https://github.com/umut "Open profile")</strong>',
    );
    expect(out).toContain(
      '<span style="color:var(--vscode-gitDecoration-addedResourceForeground);" title="Signed by &quot;Umut&quot;, verified">$(workspace-trusted)</span>',
    );
    expect(
      renderDetails({ ...model, signature: { status: "bad", label: "Bad signature" } }),
    ).toContain("$(workspace-untrusted)");
    expect(renderDetails({ ...model, signature: { status: "unverified", label: "x" } })).toContain(
      "$(shield)",
    );
  });

  test("a hostile author url is never linked", () => {
    for (const authorUrl of [
      "https://github.com/x)[evil](https://evil.example",
      'https://github.com/x" onclick="1',
      "https://evil.example/doguyilmaz",
      "javascript:alert(1)",
    ]) {
      const out = renderDetails({ ...model, authorUrl });
      expect(out).toContain("<strong>Umut Topalak</strong>");
      expect(out).not.toContain(authorUrl);
    }
  });

  test("avatar block floats the image when present", () => {
    const out = renderDetails({ ...model, avatarSrc: "data:image/png;base64,AAAA" });
    expect(out).toContain(
      '<img src="data:image/png;base64,AAAA" width="34" height="34" align="left">',
    );
  });
});

describe("renderChanges", () => {
  test("fenced diff line plus footer link", () => {
    const out = renderChanges(model, "+ invoice_type = models.CharField()");
    expect(out.startsWith("```diff\n+ invoice_type")).toBe(true);
    expect(out).toContain("[Changes 8652fd9 ↔ 282c899](");
    expect(out).not.toContain("files");
  });

  test("added-in variant without previous sha", () => {
    const out = renderChanges({ ...model, previousShortSha: undefined });
    expect(out).toContain("Changes — added in 282c899");
    expect(out).not.toContain("```");
  });

  test("backticks in the diff line grow the fence", () => {
    const out = renderChanges(model, "+ const s = ``` + x;");
    expect(out.startsWith("````diff")).toBe(true);
  });
});

describe("commandUri", () => {
  test("encodes parens so markdown links survive", () => {
    const uri = commandUri("whodunit.copySha", { repoRoot: "/x/proj (old)", sha: "a".repeat(40) });
    expect(uri).not.toContain("(");
    expect(uri).not.toContain(")");
    expect(uri.startsWith("command:whodunit.copySha?")).toBe(true);
  });
});
