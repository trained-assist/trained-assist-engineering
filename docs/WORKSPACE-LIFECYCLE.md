# Workspace lifecycle (`code_ready`, E1)

Core capability for issue → workspace. Library first: the same operation is exposed as a
Node library, a CLI adapter and (later) an MCP action. MCP is not required by the core.

This slice covers **`code_ready`** only: exact committed revision materialized as a git
worktree, ownership persisted, crash recovery possible. Dependencies, fixtures, ports,
dev-server/health and supervision are `runtime_ready` (E2) and are out of scope.

## Boundary

- The core never accepts a trusted filesystem root or repository path from the model or from
  issue text. The caller passes an **already resolved host binding**. If the host is configured
  with `allowedRoots`, the library verifies the binding stays inside them.
- The workspace is created from a **dedicated registered source checkout / object store**, never
  the live production checkout. The source checkout is never `reset`, `stash`ed or `clean`ed.
- Git worktrees share refs/config. This is engineering isolation, **not** a security sandbox.
  Multi-tenant/untrusted execution needs a separate OS/container boundary.

## Binding

```js
spawnWorkspace({
  workspaceRoot,     // configured engineering root, host-resolved, absolute
  sourceCheckout,    // registered git source checkout / object store
  baseRevision,      // exact committed revision (SHA); offline works when known
  principal,         // trusted principal id (profile/user)
  hostId,            // trusted host id
  repositoryId,      // opaque repository id
  rootTaskId,        // root task / issue id
  idempotencyKey,    // durable operation key
  workspaceProfile,  // optional, default 'cli'
  allowFetch,        // optional; fetch only when the revision is missing
  allowedRoots,      // optional host-approved roots
})
```

Layout:

```text
<workspaceRoot>/<principal>/<repositoryId>/<workspaceId>/
  code/      # git worktree; coding cwd
  runtime/   # data/ logs/ tmp/ config/ (E2 fills these)
```

`workspaceId` is deterministic from `(principal, repositoryId, rootTaskId, idempotencyKey)`, so a
retry after a crash resolves to the same workspace instead of creating another one.

## Ownership and leases

- Owner identity is `(principal, repository, rootTaskId)`.
- Each provisioning attempt carries a monotonically increasing **lease generation** (persisted).
- Ownership is checked before status/release. A different principal cannot read or release a
  workspace it does not own.
- Idempotency is by operation key. Repeating the same key and compatible args returns the same
  workspace (or its in-progress state). The same key with incompatible args → `CONFLICT`. A
  different key while the owner already holds an active workspace → `CONFLICT`.

## Mutation effects and retry semantics

`spawnWorkspace`:

1. validates the trusted binding and resolves the exact revision;
2. writes a **provisioning intent and operation record before any git mutation**;
3. creates a unique branch + worktree without `--force`;
4. writes the workspace record atomically (temp file + rename);
5. verifies the created `HEAD` equals `baseRevision`;
6. transitions to `code_ready`.

Effects: creates directories under `workspaceRoot`, a new branch and a worktree; updates the
store under `<workspaceRoot>/.engineering-workspaces/`. It does not mutate the source checkout's
worktree state. Retrying is safe and idempotent: nothing is cloned twice, and a partially
created worktree is adopted rather than duplicated.

`statusWorkspace`: read-only, except it may reconcile a provisioning intent it finds.

`releaseWorkspace`: mutating and conservative. It only removes its own worktree and runtime
resources after ownership and process-stop checks. It never removes other worktrees, shared
stashes or unrelated branches, and never runs `rm -rf`.

## Crash recovery

Recovery matches provisioning intents with `git worktree list --porcelain`:

- intent exists, worktree missing → retry continues provisioning;
- intent exists, worktree present → adopt and finalize (`code_ready`) without duplicating work;
- worktree present without metadata → reconciled, not deleted;
- orphan worktrees under the root → reported as `retained`; NEVER auto-deleted.

`reconcileWorkspaces({ workspaceRoot })` returns a report of recovered / needs-review / failed /
orphans. Locks are stale-detected by pid + age, so a crash does not permanently block retries.

## Release retention

A workspace is removed only when the worktree is clean and there is no unproven local work.
Otherwise it is marked `needs_review` and retained. Retention reasons:

- `dirty` — tracked modifications;
- `untracked` — untracked files;
- `unpushed` — local commits not on any remote branch (remote configured);
- `unknown_remote` — local commits and no remote to prove push/merge;
- `stash` — a stash references this workspace branch;
- `processes_active` — caller did not confirm processes stopped.

Squash-merge cannot be proven with `git branch --merged`. The host may pass
`deliveryEvidence: { merged: true, evidence }` (task/PR/head evidence) to allow release. TTL is a
trigger for reconciliation, not deletion.

## Errors

All failures are `WorkspaceError` with a stable `code`: `INVALID_BINDING`, `PATH_ESCAPE`,
`UNKNOWN_REVISION`, `CONFLICT`, `BRANCH_COLLISION`, `PATH_COLLISION`, `HEAD_MISMATCH`,
`WORKTREE_FAILED`, `OWNERSHIP`, `NEEDS_REVIEW`, `NOT_FOUND`, `CORRUPT_STATE`, `BUSY`.

## Local proof

```bash
npm run proof:workspace
```

Runs spawn → worktree → simulated crash/retry → status → clean release on a temporary git repo.
No GCP, no live agent, no MCP.
