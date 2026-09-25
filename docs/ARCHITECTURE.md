# Architecture

## Purpose

`trained-assist-engineering` is the reusable software-development layer shared by multiple
trained-assist users, coding engines and product repositories.

It is deliberately not a product runtime and not an MCP-only repository.

## Layers

### 1. Core capabilities

Plain functions with explicit inputs/outputs. They contain the reusable behavior.

Examples:
- `prepareTask()`
- future `requestWork()`
- future `fastVerify()`
- future `submitChange()`

These functions must not depend on MCP.

### 2. Context sources

Pluggable sources behind stable capability contracts.

`prepare_task` v1 uses `raw-repo`:
- git metadata;
- tracked files;
- deterministic filename/content search;
- related tests/docs;
- recent history.

Future source: `index`:
- module relationships;
- symbol definitions/references;
- dependency graph;
- test-to-code mapping;
- architecture summaries;
- historical hotspots;
- freshness metadata.

Selection policy:

```text
fresh index available? -> index/hybrid
otherwise              -> raw-repo
```

The public Task Packet contract does not change.

### 3. Adapters

Adapters expose core capabilities to callers:
- CLI;
- MCP;
- later HTTP/worker if needed;
- CI/reusable workflows.

Adapters must stay thin.

### 4. Playbooks

Markdown procedures loaded only for the current engineering task type.
They describe workflow, not implementation internals.

### 5. Project manifests

Product repos keep `.engineering/project.yml` with project-specific facts:
- quick/full test commands;
- important docs;
- deploy environments;
- domains;
- optional custom hooks.

Engineering owns policy; the target repo owns product-specific mechanics.

## Reuse across users

The same engineering release can be enabled for many trained-assist profiles through the existing
approved external MCP skill-source registry. Each release is revision-pinned and profile eligibility
is controlled outside the provider code.

A non-MCP caller can use the same capability through the CLI/library.

## State ownership

Avoid a second source of truth.

- GitHub owns issue/PR/CI state.
- Product git repo owns source/revision.
- generic trained-assist durable execution owns generic task continuation.
- engineering may keep derived caches/indexes/leases, never canonical product state.

## Security / mutation rule

Read-only discovery capabilities can be broadly reusable.
Mutation capabilities introduced later must declare effects and pass through work admission / action
policy. Repository indexing must never imply permission to write to a repository.

## External workers and credential brokers

Do not merge independently deployed infrastructure into this repository only for conceptual purity.

### Merge Relay

Merge Relay is a separate API worker because it has its own deployment/runtime and GitHub mutation
responsibility. Engineering owns its policy and onboarding, but calls it through an adapter. The
preferred integration path does **not** require the user to install a GitHub App: engineering obtains
or binds the required GitHub credential via ZeroCreds and supplies an opaque credential binding to
the relay integration.

### ZeroCreds

ZeroCreds is a credential broker, not engineering state. Engineering asks for capabilities; the
credential adapter handles acquisition/storage. Raw tokens must not enter Task Packets, playbooks,
project manifests, repository indexes, or coding-model prompts.

This gives the runtime boundary:

```text
Coding agent / user
      -> engineering control plane
           -> ZeroCreds adapter (credential handoff)
           -> GitHub adapter
           -> Merge Relay API (merge worker)
```

The exact ZeroCreds and Merge Relay HTTP contracts remain adapter concerns and can evolve without
changing engineering capability contracts.
