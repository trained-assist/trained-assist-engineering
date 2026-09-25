# Playbooks

Reusable engineering workflows. Two kinds live here — do not confuse them:

## 1. `development.json` — Playbook v1 (machine-consumed)

A versioned, machine-checkable process artifact conforming to Playbook v1
(`contracts/playbook.schema.json` in `trained-assist-agent`). It is **consumed by
the Control Plane's durable executor**: `playbook_run` compiles it + a goal into a
durable plan (items pinned to `playbook_id@version`), then `runDueDurable` claims
and runs the steps.

- 5 stages / 16 steps: frame → discover → design → build → deliver.
- Every agent step declares `executor_role` / `minimum_model_level` /
  `context_budget` + a machine-checkable `validation`; objective steps are
  `execution_kind: "programmatic"` (tests/PR/CI/merge/deploy).
- **Never names a concrete model/provider** — the runtime resolves the step
  contract to an engine (see `src/playbook-executor.js` in the Control Plane).

Where it is read from: `PlaybookStore` resolves `profile → sibling repo → system`.
This file is the **sibling** copy, so `trained-assist-agent` finds it when this
repo is checked out next to it (`DEFAULT_SIBLING_REPOS`). The Control Plane holds
no copy — see `docs/specs/engineering-playbook-master-plan.md` §«Доменный вынос».

**Opt-in, not a dependency.** If this repo is absent, the playbook is simply not
visible: `playbook_list` omits it, `playbook_run` returns `PLAYBOOK_NOT_FOUND`,
and agents just work without the process scaffold. Nothing breaks.

## 2. `*.md` — human engineering procedures (prose)

`connect-github.md`, `fix-bug.md`, `implement-feature.md`, `prepare-task.md` are
plain prose checklists read by a coding agent as instructions. They carry no
id/version/contract and are **not** executed by the durable executor. They may
later be expressed as Playbook v1, but that is a separate step.

## Schema

The authoritative JSON Schema is in the Control Plane:
`trained-assist-agent/contracts/playbook.schema.json`. Validate a local edit:

```bash
node -e "
const Ajv = require('ajv');
const schema = require('../trained-assist-agent/contracts/playbook.schema.json');
const pb = require('./development.json');
const v = new Ajv({ allErrors:true, strict:false, allowUnionTypes:true }).compile(schema);
console.log(v(pb) || v.errors);
"
```
