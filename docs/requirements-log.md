# Requirements log

Living list of requirements/features and their status. Statuses: `реализовано`,
`отклонено (почему)`, `планируется`, `в работе`.

## Workspace accelerator (E1 / Track A, issue #3)

- [реализовано] `spawnWorkspace()` core: git worktree from exact committed revision via
  registered source checkout, outside the live checkout; no reset/stash/clean; dirty source not
  carried; unique branch/worktree without force; atomic metadata; verified HEAD → `code_ready`.
- [реализовано] Ownership/lease `(principal, repository, rootTaskId)` with lease generation;
  idempotency by operation key (repeat → same workspace / in-progress; incompatible args → conflict).
- [реализовано] `statusWorkspace()` and `releaseWorkspace()` via the same API.
- [реализовано] Crash recovery: reconcile provisioning intents with `git worktree list --porcelain`;
  orphans retained, never auto-deleted.
- [реализовано] Conservative release: dirty/untracked/unpushed/stash/unknown remote/delivery →
  retained/needs_review; squash-merge requires host delivery evidence; TTL is not `rm -rf`.
- [реализовано] Library-first boundary: no MCP dependency; binding is host-resolved; optional
  `allowedRoots` host policy; symlink/path escape rejected.
- [реализовано] CLI adapter (`workspace-spawn`/`workspace-status`/`workspace-release`/
  `workspace-reconcile`), tests, local proof script.
- [планируется] E2 `runtime_ready`: dependencies/cache, fixtures, ports, dev-server/health,
  supervision, cleanup.
- [отклонено (в этой задаче)] MCP runtime wiring, provider manifest/lockfile packaging,
  core handoff (cwd/env/resume) — Track B / A2, не нужны для библиотечных тестов и proof.
