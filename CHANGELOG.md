# Changelog

## 0.2.0

Whodunit stops mirroring GitLens and takes its own shape.

- Commit menu: one grouped QuickPick per commit (open, remote, history, copy, safe git actions:
  branch, tag, revert, detached checkout). Opens from the hover, the status bar, `alt+shift+b`,
  search and history picks.
- Hover card redesigned: avatar beside author and message, plain-word actions, the blamed line's own
  diff line in a copyable block, `Changes a ↔ b` footer with stat. Full commit message body shown.
- Real avatars: GitHub (via the repo's origin) and Gravatar, cached locally for a week; the cached avatar shows offline, initials when nothing is cached. `whodunit.hover.avatars: false` keeps everything local.
- Line history (`git log -L`), Inspect Commit (read-only text view with side-by-side code lenses),
  Changes with Working Tree, Open/Copy commit link for GitHub, GitLab and Bitbucket.
- Revision tabs are named `file @ sha`, keep syntax highlighting, and carry a tooltip.
- Blame inside VS Code's own Git diffs (`git:` documents).
- `blame.ignoreWhitespace` and `.git-blame-ignore-revs` support.
- Inline annotation tinted by commit age (five themable colors).
- Typing-aware refresh: edited lines read as uncommitted immediately; large files re-blame lazily.
- Keyboard: `alt+shift+b` commit menu, `alt+shift+h` line history, `alt+shift+,` / `.` older / newer revision.
- Status bar moved right; click opens the commit menu; its tooltip is the full hover card with a settings link.
- Signature badge in the hover (green verified, gray unverifiable, red bad) and author names linked to GitHub profiles when known.
- One-time offer to switch off VS Code's built-in blame status bar item to avoid duplicates.
- Age tint palette made clearly readable (amber for today, gold for the week, tan for the month, gray beyond).

## 0.1.0

Initial release.

- Inline current-line blame with customizable template
- Blame hover card with actions and the introducing diff hunk
- Compare with previous (rename-aware), recursive blame inside diff panes
- Open file at revision
- Status bar blame with line action menu
- Commit search (message / `@author` / SHA) and file history QuickPicks
