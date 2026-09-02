# Whodunit

Git blame that stays out of your way.

Whodunit shows who last touched the line you're on and lets you act on it, without sidebars,
graphs, accounts, or telemetry. Inline blame on the current line, a calm hover card, one grouped
commit menu, real VS Code diffs you can walk through revision by revision, and line history.
That's the whole extension: 27 KB, zero runtime dependencies.

## What you get

- **Inline blame** at the end of the current line, tinted by commit age. Unsaved edits show as
  uncommitted immediately, never as a stale commit.
- **Hover card** on the annotation: avatar, author (linked to their GitHub profile when known), a
  shield when the commit is signed (green when verified, muted if the key is unavailable, red if
  bad), dates, the full commit message, then one compact row: sha (inspect), copy, changes, file history, line history, `Open on
  GitHub`, more (commit menu), settings. A second section shows the blamed line's own diff line
  (copyable on its own) and a `Changes a ↔ b` footer. "You" means the commit email equals this repo's
  `user.email`; names are never matched.
- **Status bar**: `You, 1 month ago` at the left edge of the right-hand items; hover for the same
  card plus a colored `51 files changed, 5675 insertions(+), 401 deletions(-)` line, click for the
  commit menu. VS Code's own built-in blame item shows up next
  to it since 1.98; Whodunit offers once to turn the built-in one off.
- **Commit menu** (`alt+shift+b`, status bar click, or `Commit ⋯`): open changes in this file, vs the
  working tree, all changed files, inspect commit; open or copy the commit link on GitHub, GitLab or
  Bitbucket; file and line history; copy SHA or message; and four safe git actions: create branch,
  create tag, revert, checkout detached. Nothing rewrites history.
- **Real diffs**: parent ↔ commit in a normal VS Code diff editor. Both panes blame themselves, so
  hover inside and keep going back. `←` `→` in the title (`alt+shift+,` / `alt+shift+.`) step through
  the file's revisions. Snapshot tabs are named `file @ sha` and keep syntax highlighting.
- **Inspect commit**: a read-only text document with header, message, stat and patch, with
  `Open side-by-side` lenses on every file. Searchable and copyable; no webview.
- **Search and history**: commit search as you type (message, `@author`, SHA), file history, and
  line history (`alt+shift+h`), each a click from the commit menu.
- Works in VS Code's own Git diffs too (Source Control view documents).

## Privacy

No telemetry. Git runs locally. The only network use is author avatars: GitHub (via the repo's
`origin`, reusing an existing VS Code GitHub session, never prompting) then Gravatar. Avatars are
cached locally for a week, the last cached one is shown offline, and initials are drawn when nothing
is cached. Set `whodunit.hover.avatars` to `false` and Whodunit never touches the network.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `whodunit.inline.enabled` | `true` | Inline blame for the current line |
| `whodunit.inline.format` | `${author}, ${ago} • ${message}` | Inline template |
| `whodunit.inline.ageTint` | `true` | Tint the annotation by commit age (`whodunit.inlineBlame.age1…age5`) |
| `whodunit.hover.enabled` | `true` | Blame hover card |
| `whodunit.hover.trigger` | `annotation` | Card over the inline annotation only, or `line` for any line |
| `whodunit.hover.avatars` | `true` | Author avatars (GitHub, Gravatar; cached; initials offline) |
| `whodunit.hover.showChanges` | `true` | The blamed line's own diff line in the hover |
| `whodunit.statusBar.enabled` | `true` | Status bar blame (click opens the commit menu) |
| `whodunit.statusBar.format` | `$(git-commit) ${author}, ${ago}` | Status bar template (codicons allowed) |
| `whodunit.dateFormat` | `medium` | Absolute date style for `${date}`, `${agoOrDate}`, hover |
| `whodunit.message.maxLength` | `60` | Message truncation for inline/status bar |
| `whodunit.blame.ignoreWhitespace` | `false` | `git blame -w`: reformatting commits stop claiming lines |
| `whodunit.blame.ignoreRevsFile` | `true` | Honor `.git-blame-ignore-revs` at the repo root |

Template tokens: `${author}` `${authorEmail}` `${ago}` `${agoOrDate}` `${date}` `${message}` `${sha}`
(`${agoOrDate}` is relative under 30 days, an absolute date after).

## Keys

| Key | Does | When |
| --- | --- | --- |
| `alt+shift+b` | Commit menu for the current line | editor focused |
| `alt+shift+h` | Line history | editor focused |
| `alt+shift+,` / `alt+shift+.` | Older / newer revision | a Whodunit revision or diff tab is active |

## Commands

`Whodunit:` Commit Menu for Current Line · Inspect Commit · Changes with Previous Revision ·
Changes with Working Tree · Open File at Revision · File History · Line History · Search Commits ·
Open Commit on Remote · Copy Commit Link · Copy Commit SHA · Copy Commit Message · Older / Newer
Revision · Toggle Inline Blame.

## Notes

- Requires `git` on your PATH. Files larger than 5 MB are not blamed.
- Untrusted and virtual workspaces are not supported (Whodunit runs git in your workspace).
- Not in scope, on purpose: whole-file gutter blame, sidebar views, commit graph, rebase/reset,
  PR/issue integrations, AI.

## Development

```sh
bun install
bun run watch     # rebuild on save; F5 launches an Extension Development Host
bun run test      # unit tests (bun)
bun run test:vsc  # real VS Code host tests
bun run check && bun run lint
bun run package   # build the .vsix
```

See `CONTRIBUTING.md`. Publishing: add `repository` to `package.json`, `bunx vsce login doguyilmaz`,
push a `v*` tag (the release workflow publishes with `VSCE_PAT`).

## License

MIT
