# Changelog

## 1.0.1

- Marketplace listing refreshed: new README and keywords. No functional changes.

## 1.0.0

First release of Gitective: git blame, investigated.

- Inline blame on the current line, tinted by commit age; unsaved edits read as uncommitted at once.
- Hover card: avatar (GitHub via the repo's origin, then Gravatar, cached; initials offline), author
  linked to their GitHub profile, signature shield (green verified, muted unverifiable, red bad), dates,
  full commit message, compact action row, the blamed line's own diff line in a copyable block, and a
  `Changes a ↔ b` footer.
- Commit menu (`alt+shift+b`, status bar click, `⋯` in the hover): changes in this file, vs the working
  tree, all changed files, inspect commit; open or copy the commit link on GitHub, GitLab or Bitbucket;
  file and line history; copy SHA or message; create branch, create tag, revert, checkout detached.
- Real VS Code diffs, parent ↔ commit, with both panes blameable and ←/→ revision navigation
  (`alt+shift+,` / `alt+shift+.`); snapshot tabs named `file @ sha` with syntax highlighting kept.
- Inspect commit: read-only text document with header, message, stat and patch, plus side-by-side lenses.
- Commit search (message, `@author`, SHA), file history, line history (`alt+shift+h`).
- Blame inside VS Code's own Git diffs; `blame.ignoreWhitespace` and `.git-blame-ignore-revs` support.
- Status bar blame at the left edge of the right-hand items; its hover is the full card with a colored
  files/insertions/deletions line and a settings link. One-time offer to turn off VS Code's built-in
  blame item to avoid duplicates.
- Zero runtime dependencies, no telemetry; the only network use is avatars, off with
  `gitective.hover.avatars: false`.
