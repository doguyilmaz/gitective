# Whodunit

Git blame, and nothing else.

Whodunit shows you who last touched the line you're on — inline, in a hover card with
real actions, in the status bar — and lets you jump into an actual VS Code diff of the
commit that introduced it. Old revisions blame themselves too, so you can keep digging
backwards through history from inside a diff. That's the whole extension.

## Features

- **Inline blame** — the current line's last commit (author, age, message) rendered at
  the end of the line. Unsaved edits show as `Uncommitted changes`, never a stale commit.
- **Hover card** — real author avatars (GitHub repo lookup → Gravatar → GitHub by-email,
  with locally generated initials when offline), author, dates, the full commit message (body included), short SHA,
  and actions: copy SHA/message, compare, open at revision, show commit, file history.
  Includes the diff hunk that introduced the line. By default it appears when hovering
  the inline annotation (GitLens-style); set `whodunit.hover.trigger: "line"` to hover
  any line anywhere.
- **Compare** — opens a real VS Code diff between the line's commit and its parent
  (rename-aware). Both diff panes are themselves blameable, recursively, and ←/→ buttons
  in the diff title step through the file's history one revision at a time.
- **Status bar blame** — a compact, customizable blame for the current line; click it
  for the line's action menu.
- **Search** — a commit QuickPick that searches messages as you type, `@name` for
  authors, or paste a SHA. Plus per-file history with one-keystroke diffs.

No sidebars, no graphs, no AI, no telemetry. Local git only — the single network use is
avatar lookup (GitHub/Gravatar) while `whodunit.hover.avatars` is on; it reuses an
existing VS Code GitHub session when present and never prompts.

## Commands

| Command | What it does |
| --- | --- |
| `Whodunit: Toggle Inline Blame` | Turn the inline annotation on/off |
| `Whodunit: Line Blame Actions` | Action menu for the current line (also on status bar click) |
| `Whodunit: Compare Line Commit with Previous` | Diff the line's commit against its parent |
| `Whodunit: Open File at Line Revision` | Open the file as it was in the line's commit |
| `Whodunit: Show Commit` | Browse the files changed in the line's commit |
| `Whodunit: Search Commits` | Search commits by message, `@author`, or SHA |
| `Whodunit: File History` | Walk the current file's commits |
| `Whodunit: Older / Newer Revision` | Step through history from a Whodunit diff or revision tab |
| `Whodunit: Copy Commit SHA / Message` | Straight to the clipboard |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `whodunit.inline.enabled` | `true` | Inline blame for the current line |
| `whodunit.inline.format` | `${author}, ${ago} • ${message}` | Inline template |
| `whodunit.hover.enabled` | `true` | Blame hover card |
| `whodunit.hover.trigger` | `annotation` | Card over the inline annotation only, or `line` for any line |
| `whodunit.hover.avatars` | `true` | Author avatars (GitHub/Gravatar, initials fallback offline) |
| `whodunit.hover.showChanges` | `false` | Diff hunk in the hover card (opt-in; Compare/Commit have the diff) |
| `whodunit.dateFormat` | `medium` | Absolute date style for `${date}`, `${agoOrDate}`, hover |
| `whodunit.statusBar.enabled` | `true` | Status bar blame |
| `whodunit.statusBar.format` | `$(git-commit) ${author}, ${ago}` | Status bar template (codicons allowed) |
| `whodunit.message.maxLength` | `60` | Message truncation for inline/status bar |

Template tokens: `${author}` `${authorEmail}` `${ago}` `${agoOrDate}` `${date}` `${message}` `${sha}`
(`${agoOrDate}` is relative under 30 days, an absolute date after).
The inline annotation color is themable via the `whodunit.inlineBlame.foreground` color.

## Notes

- Requires `git` on your PATH. Files larger than 5 MB are not blamed.
- Untrusted and virtual workspaces are not supported (Whodunit runs git in your workspace).

## Development

```sh
bun install
bun run build     # bundle with esbuild
bun test          # unit tests (bun)
bun run test:vsc  # extension host smoke test
bun run check     # tsc --noEmit
bun run lint      # eslint
bun run package   # build the .vsix
```

Press `F5` in VS Code to launch an Extension Development Host.

### Publishing checklist

1. Add a `repository` field to `package.json` once the repo is public.
2. `bunx vsce login doguyilmaz`
3. `bun run package` and sanity-check the `.vsix` contents with `bunx vsce ls`.
4. `bunx vsce publish`

## License

MIT
