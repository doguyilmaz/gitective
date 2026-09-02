import { describe, expect, test } from "bun:test";
import { commandUri, renderChanges, renderDetails, type HoverModel } from "../src/hover/render";

const links = {
  copySha: "command:whodunit.copySha?%5B%5D",
  changes: "command:whodunit.compareWithPrevious?%5B%5D",
  changesWorking: "command:whodunit.compareWithWorking?%5B%5D",
  open: "command:whodunit.openAtRevision?%5B%5D",
  history: "command:whodunit.fileHistory?%5B%5D",
  lineHistory: "command:whodunit.lineHistory?%5B%5D",
  menu: "command:whodunit.commitMenu?%5B%5D",
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
  stat: { files: 3, insertions: 10, deletions: 4 },
  links,
};

describe("renderDetails", () => {
  test("uses the approved vocabulary and links", () => {
    const out = renderDetails(model);
    for (const label of ["Changes", "Open file @282c899", "History", "Line history", "Commit ⋯"]) {
      expect(out).toContain(`[${label}](`);
    }
    expect(out).toContain("[`282c899`](command:whodunit.copySha");
    expect(out).not.toContain("$(");
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

  test("uncommitted card has two actions and no sha", () => {
    const out = renderDetails({ ...model, isUncommitted: true });
    expect(out).toContain("[Changes vs HEAD](");
    expect(out).toContain("[History](");
    expect(out).not.toContain("282c899");
    expect(out).not.toContain("Line history");
  });

  test("avatar block floats the image when present", () => {
    const out = renderDetails({ ...model, avatarSrc: "data:image/png;base64,AAAA" });
    expect(out).toContain('<img src="data:image/png;base64,AAAA" width="34" height="34" align="left">');
  });
});

describe("renderChanges", () => {
  test("fenced diff line plus footer with stat", () => {
    const out = renderChanges(model, "+ invoice_type = models.CharField()");
    expect(out.startsWith("```diff\n+ invoice_type")).toBe(true);
    expect(out).toContain("[Changes 8652fd9 ↔ 282c899](");
    expect(out).toContain("· 3 files · +10 −4");
  });

  test("added-in variant without previous sha or stat", () => {
    const out = renderChanges({ ...model, previousShortSha: undefined, stat: undefined });
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
