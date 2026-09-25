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

## Minimal self-service `engineering_spawn_workspace` (2026-09-26, revises PR #4's original design)

Requirements re-derived from the actual task (two agents under one profile silently corrupting
each other's shared git checkout/branch), not from the earlier multi-tenant/security-hardening plan
in trained-assist-agent#1353 that this originally inherited its shape from. See that issue's
2026-09-26 status block for the full reasoning; `spawnWorkspace()`'s crash-safe state machine
itself was judged genuinely earned complexity and is untouched.

- [реализовано] `layoutFor()` branch naming: `eng/<principal>-<rootTaskId>` (readable — a session
  or a human can tell whose task a branch/PR is by name) instead of an opaque `eng/ws-<hash>`.
  Uniqueness still comes from git's own `BRANCH_COLLISION` on the git-worktree layer, unchanged.
- [реализовано] `src/workspace/for-task.js`: `spawnWorkspaceForTask()` / `statusWorkspaceForTask()`
  / `releaseWorkspaceForTask()` — the actual session-facing surface. Takes only
  `{principal, repositoryUrl, rootTaskId}`; resolves `sourceCheckout` (clone-if-missing mirror,
  fetched on every call), `baseRevision` (default branch tip), `idempotencyKey` (= `rootTaskId`),
  `hostId` (= `os.hostname()`) automatically. `spawnWorkspace()`/`statusWorkspace()`/
  `releaseWorkspace()` remain available directly for callers that need the low-level fields.
- [отклонено] `rootTaskId` as a host-injected/hidden field — it's the session's own readable task
  label and a legitimate required argument, not something to hide (see #1353 thread).
- [отклонено] `allowedRoots` host-issued filesystem binding / "LLM must never set repo_path" as a
  hard requirement for this same-company, first-party repository — access is already gated by the
  calling profile's own git credentials. Deferred, not designed away: `allowedRoots` still exists
  and works in `spawnWorkspace()` if a less-trusted source ever needs it.

## MCP wrapper: `engineering_spawn_workspace` / `_status` / `_release` (issue #6)

- [реализовано] `src/mcp-skills/tools/20-workspace.js` exposes the three `for-task.js` functions as
  MCP tools, same shape as `engineering_prepare_task`. Inputs are only `repository_url` +
  `root_task_id` (spawn also `ref`; release adds `processes_stopped`/`force`/`delivery_evidence`).
  `principal` is never an argument — read from `process.env.USER_ID` inside the handler (matching
  trained-assist-agent's `mcpToolEnv`, so an argument can't override profile identity).
- [реализовано] Registered in `src/mcp-skills/registry.js`; `tests/mcp-workspace-tools.test.js`
  drives spawn→status→release through `registry.callTool()` against a bare-repo fixture, asserting
  env-wins and typed `INVALID_BINDING` errors for missing fields.
- [реализовано] Optional host override of workspace/mirror roots via
  `ENGINEERING_WORKSPACE_ROOT` / `ENGINEERING_MIRRORS_ROOT` (defaults to `~/agent-data/...`); needed
  so tests stay hermetic, and lets a host place workspaces outside the default home.
