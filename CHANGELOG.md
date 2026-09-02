# Changelog

## 0.2.0

Whodunit stops mirroring GitLens and takes its own shape.

- Commit menu: one grouped QuickPick per commit (open, remote, history, copy, safe git actions:
  branch, tag, revert, detached checkout). Opens from the hover, the status bar, `alt+shift+b`,
  search and history picks.
- Hover card redesigned: avatar beside author and message, plain-word actions, the blamed line's own
  diff line in a copyable block, `Changes a ↔ b` footer with stat. Full commit message body shown.
- Real avatars: GitHub (via the repo's origin) and Gravatar, after a one-time opt-in; initials otherwise.
- Line history (`git log -L`), Inspect Commit (read-only text view with side-by-side code lenses),
  Changes with Working Tree, Open/Copy commit link for GitHub, GitLab and Bitbucket.
- Revision tabs are named `file @ sha`, keep syntax highlighting, and carry a tooltip.
- Blame inside VS Code's own Git diffs (`git:` documents).
- `blame.ignoreWhitespace` and `.git-blame-ignore-revs` support.
- Inline annotation tinted by commit age (five themable colors).
- Typing-aware refresh: edited lines read as uncommitted immediately; large files re-blame lazily.
- Keyboard: `alt+shift+b` commit menu, `alt+shift+h` line history, `alt+shift+,` / `.` older / newer revision.
- Status bar moved right; click opens the commit menu.

## 0.1.0

Initial release.

- Inline current-line blame with customizable template
- Blame hover card with actions and the introducing diff hunk
- Compare with previous (rename-aware), recursive blame inside diff panes
- Open file at revision
- Status bar blame with line action menu
- Commit search (message / `@author` / SHA) and file history QuickPicks
