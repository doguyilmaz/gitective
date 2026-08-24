import { describe, expect, test } from "bun:test";
import { messageBody, parseLogRecords, parseNameStatus } from "../src/core/gitLog";

const US = "\x1f";
const RS = "\x1e";

describe("parseLogRecords", () => {
  test("parses records with unit separators", () => {
    const sha1 = "a".repeat(40);
    const sha2 = "b".repeat(40);
    const output =
      `${sha1}${US}Alice${US}alice@example.com${US}1700000000${US}first subject${RS}\n` +
      `${sha2}${US}Bob${US}bob@example.com${US}1700000100${US}second: with punct${RS}\n`;
    const entries = parseLogRecords(output);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sha: sha1,
      author: "Alice",
      authorEmail: "alice@example.com",
      authorTime: 1700000000,
      subject: "first subject",
    });
    expect(entries[1]?.subject).toBe("second: with punct");
  });

  test("captures name-status lines trailing the subject", () => {
    const sha = "c".repeat(40);
    const output = `${sha}${US}Alice${US}a@e.com${US}1700000000${US}renamed stuff${RS}\n\nR100\told.ts\tnew.ts\n`;
    const entries = parseLogRecords(output);
    expect(entries[0]?.subject).toBe("renamed stuff");
    expect(entries[0]?.changes).toEqual([{ status: "R", path: "new.ts", oldPath: "old.ts" }]);
  });

  test("skips malformed records and empty output", () => {
    expect(parseLogRecords("")).toEqual([]);
    expect(parseLogRecords("garbage")).toEqual([]);
  });
});

describe("parseNameStatus", () => {
  test("parses modify, add, delete, rename", () => {
    const output = [
      "M\tsrc/a.ts",
      "A\tsrc/b.ts",
      "D\tsrc/c.ts",
      "R087\told/x.ts\tnew/x.ts",
      "",
    ].join("\n");
    expect(parseNameStatus(output)).toEqual([
      { status: "M", path: "src/a.ts" },
      { status: "A", path: "src/b.ts" },
      { status: "D", path: "src/c.ts" },
      { status: "R", path: "new/x.ts", oldPath: "old/x.ts" },
    ]);
  });

  test("ignores non-status noise", () => {
    expect(parseNameStatus("subject line\n\nM\ta.ts\n")).toEqual([{ status: "M", path: "a.ts" }]);
  });

  test("drops the summary line and trims the body", () => {
    expect(messageBody("fix: summary\n\n- point one\n- point two\n")).toBe(
      "- point one\n- point two",
    );
    expect(messageBody("only a summary\n")).toBe("");
    expect(messageBody("crlf summary\r\n\r\nbody line\r\n")).toBe("body line");
    expect(messageBody("")).toBe("");
  });

  test("unquotes C-quoted non-ascii paths", () => {
    expect(parseNameStatus('M\t"caf\\303\\251.ts"\n')).toEqual([{ status: "M", path: "café.ts" }]);
    expect(parseNameStatus('R100\t"\\303\\241.ts"\tb.ts\n')).toEqual([
      { status: "R", path: "b.ts", oldPath: "á.ts" },
    ]);
  });
});
