# Checklist — pr-autofix service slice 1: registration store + status (issue #15)

Design: `docs/PR-AUTOFIX-SERVICE.md` §1 (registration model), §6 (first slice). Additive,
zero credential writes, no external GitHub writes.

## Goal

Give the pr-autofix service a transport-neutral registration store + state machine and read/write
MCP tools backed by local engineering state only — nothing installed into any repo, no secret stored
or delivered, so nothing that works today can regress.

## Definition of done

- [x] CI green on https://github.com/trained-assist/trained-assist-engineering/pull/16
- [ ] Merged to main
- [ ] Deployed to prod — verified live

## Slices

- [x] Slice 1 — registration store + state machine (`src/pr-autofix/`): keyed by `(profileId, repo)`,
      `register` idempotent upsert, `disable` kill-switch, per-profile paths, capability records only.
- [x] Slice 2 — MCP tools `engineering_pr_autofix_register` / `_status` / `_disable` + provider manifest.
- [x] Tests: upsert idempotency + `updated_at` bump, no-auto-enable, per-profile isolation, disable
      transition + idempotency, secret rejection / no-secret-fields guard, MCP env-identity round-trip,
      contract guards (registry↔manifest, schema enum).
- [x] `npm run check`, `npm test`, `npm run manifest:check`

## Non-goals (unchanged — slices 2/3)

Workflow install, credential/secret delivery, `credential_refs`/`installed_workflow`, run-event
lifecycle, notifications, reimplementing the fixer. A later external-write slice (secrets + PR) will
require approval.
