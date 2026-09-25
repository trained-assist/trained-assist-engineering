# trained-assist-engineering

Reusable software-engineering control plane for the `trained-assist` ecosystem.

This repository is intentionally separate from product/runtime repositories such as
`trained-assist-agent`, `trained-assist-web`, and future domain repositories.

Its job is not to serve end users. Its job is to make software development faster,
cheaper and more reliable across many users, coding agents and repositories.

## North Star

A coding model should spend expensive tokens on **reasoning and implementation**, not on
repeatedly rediscovering the same repository.

The engineering layer prepares context, coordinates work, runs reusable procedures and
tracks changes through review/CI/merge/deploy. Product repositories expose only their
project-specific manifest and tests/deploy commands.

## First capability: Prepay Task / `engineering_prepare_task`

`prepare_task` builds a compact Task Packet before an expensive coding model starts.

### v1: raw repository, no index required

The first implementation works against a normal local git checkout:

1. reads repository state and recent history;
2. derives search terms from the task;
3. finds likely files with deterministic filename/content search;
4. finds related tests and documentation;
5. returns a compact JSON Task Packet.

No embeddings and no repository index are required.

### later: indexed source

A background/nightly repository indexer will maintain richer module/symbol/dependency maps.
`prepare_task` keeps the same public contract and simply prefers the index when available,
falling back to raw-repository discovery when it is missing/stale.

```text
Task
  -> prepare_task contract
       -> indexed context source (preferred, future)
       -> raw repo source (always available)
  -> Task Packet
  -> expensive coding agent
```

## Multi-surface by design

Capabilities are not MCP-only.

The same `prepareTask()` implementation is exposed as:

- **Node library** — orchestration and tests;
- **CLI** — OpenCode/Codex/scripts/cron/CI;
- **MCP tool** — reusable from trained-assist profiles and other MCP clients;
- **playbook primitive** — engineering procedures can invoke it without caring which transport is used.

This prevents MCP from becoming the architecture itself. MCP is one adapter.

## Quick start

```bash
node bin/engineering.js prepare-task \
  --repo /path/to/trained-assist-agent \
  --task "Move software-engineering tooling out of the agent runtime"
```

MCP server:

```bash
node src/mcp-skills/index.js
```

Tool: `engineering_prepare_task`.

## GitHub onboarding: ZeroCreds + Merge Relay

Merge coordination is intentionally split by deployment boundary:

- **this repository** owns the workflow/policy/onboarding;
- **Merge Relay** remains a separately deployable API worker;
- **ZeroCreds** is the preferred credential broker so users do not have to manually install a
  GitHub App or expose tokens to coding agents.

The normal path should be “connect GitHub” rather than “install and configure Merge Relay GitHub
App”. Engineering derives required capabilities, asks ZeroCreds for the credential binding, validates
repository access, and then binds the repository to Merge Relay.

See `docs/GITHUB-ONBOARDING.md` and `playbooks/connect-github.md`.

## Existing trained-assist integration path

The repository follows the already-existing external MCP skill-provider pattern:

- immutable approved artifact;
- `provider-manifest.json`;
- exact revision pinning;
- per-profile allowlist;
- separate provider process.

The provider can therefore be connected to multiple users without copying its implementation
into `trained-assist-agent`.

See `docs/INTEGRATION.md`.

## Repository layout

```text
src/
  prepare-task.js             core capability
  context-sources/
    raw-repo.js               v1 deterministic source
    indexed-repo.js           future adapter contract / placeholder
  mcp-skills/                 MCP transport only
playbooks/                    reusable engineering procedures
contracts/                    stable project/task packet contracts
docs/                         architecture + roadmap + extraction plan
examples/                     project manifest examples
```

## Boundary

Belongs here:

- task preparation / specification support;
- repository intelligence;
- work admission / WIP gate;
- isolated engineering workspaces;
- impact / fast verification;
- PR review/coherence;
- CI/merge/deploy orchestration policies and GitHub onboarding;
- issue-to-PR automation;
- engineering memory / known failures;
- repository gardener.

Does **not** belong here:

- Telegram delivery;
- user sessions/personas;
- generic durable conversation execution;
- recruiter/HH/legal/freelance domain business logic;
- product-specific deploy implementations.

Those stay in core/domain/product repositories and are referenced through project manifests.
