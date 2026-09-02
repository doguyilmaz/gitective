# Contributing to Gitective

Gitective is small on purpose. The bar for a change is "does this help someone understand who
changed a line and why, without getting in their way?" Sidebars, graphs, and anything that needs
an account are out of scope.

## Setup

```sh
bun install
bun run watch      # rebuild on save
```

Press `F5` in VS Code to launch an Extension Development Host, then `Cmd+R` in that window after
each change.

## Layout

- `src/core/` — pure logic, no `vscode` import, every module has a bun test.
- `src/git/` — the only place git is spawned (`execFile`, argument arrays, never a shell).
- `src/hover/` — pure markdown builder for the hover cards.
- `src/providers/` — decorations, hovers, status bar, revision and commit documents.
- `src/commands/` — QuickPicks and command handlers; `commitMenu.ts` is the hub.

## Rules of the road

- Every git invocation passes an argument array and validates shas and paths first.
- Hover markdown escapes all commit-derived text; command links only use the whitelist.
- Add a setting only if you can name who turns it off.
- No telemetry. Network only for avatars, only after consent.

## Checks

```sh
bun run check      # tsc
bun run lint       # eslint
bun run test       # unit (bun)
bun run test:vsc   # real VS Code host
bun run package    # vsix
```

All five must pass before a PR. Commit messages are one line.
