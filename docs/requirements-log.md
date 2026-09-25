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

## Domain-skill test & CI rules (issue #9)

Adopts `docs/domain-skill-repo-test-rules.md` (trained-assist-agent#1437) in full. This repo is a
domain MCP skill server, so the whole contract applies.

- [реализовано] **L1 Contract** — `mcp.manifest.json` validated against vendored
  `contracts/mcp-skill-sources.schema.json` (dependency-free `tests/helpers/json-schema.js`);
  `revision` is a real 40-hex commit, `artifactDigest` recomputes over the shipped artifact
  (`scripts/mcp-artifact.js`), action names are namespaced, and manifest action names equal the
  real server's `tools/list`.
- [реализовано] **L2 Behavior** — `tests/behavior.test.js` drives the real MCP server as a
  stdio subprocess (`tests/helpers/mcp.js`) with one fixture per tool (`fixtures/tools.json`);
  a failing `tools/call` is an `isError` result, not a process crash.
- [реализовано] **L3 Guards** — `tests/guards.test.js`: no Claude/runner spawn, only `git` binary,
  HTTP timeouts, credential files `0o600`, no secret logging, profile paths via the resolver.
- [реализовано] Mock exactly two boundaries — LLM scripts (`fixtures/`, replay executor) and
  external network git/`gh` + `ci.wait_for_green`/`deploy.merge_and_release`
  (`tests/helpers/fake-provider.js`); MCP registry/service is never mocked (asserted by a guard).
- [реализовано] **Replay gate** vendored: `scripts/staging/run.mjs` + `isolation-guard.cjs` +
  `suites.json`; node:test TAP; fail-fast on prod creds / non-loopback; run manifest artifact.
- [реализовано] **Scenarios + mock plan** — `docs/user-scenarios/engineering/01-development-playbook.md`
  and `scenarios/development-playbook/` (16-step replay, fake timers for `delay_after_sec=600`,
  merge never before green CI).
- [реализовано] CI = deterministic replay (`contract`, `behavior`, `guards`, `staging-gate` jobs
  in `.github/workflows/ci.yml`); LLM judge is staging-only and absent from CI.
- [реализовано] `provider-manifest.json` now enumerates all 4 tools (name parity; it only
  declared `engineering_prepare_task` before).
- [реализовано] Profile paths resolved via `agentDataPath()` in `src/workspace/paths.js` (reads
  `AGENT_DATA_DIR`), not hardcoded `os.homedir()`.
- [планируется] Phase 2 harness extraction to `@trained-assist/mcp-skill-testkit`; staging
  canary (mount the real control plane to a sandbox profile) per the rules doc §4/§6.
