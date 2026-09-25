# Integration with trained-assist-agent

## Principle

Engineering is reusable across users and repositories. It should not be copied into each user's
work directory and should not inflate the core agent system prompt.

## Existing external skill source mechanism

`trained-assist-agent` already has an approved MCP skill source registry with:
- immutable prepared artifacts;
- exact revision pinning;
- `provider-manifest.json` digest;
- explicit `providerId` / `mcpServerId`;
- per-profile allowlist;
- availability separate from credentials/action policy.

`trained-assist-engineering` should use that same mechanism instead of adding another loader.

Suggested source identity:

```json
{
  "id": "engineering",
  "providerId": "engineering",
  "mcpServerId": "engineering",
  "repository": "trained-assist/trained-assist-engineering",
  "revision": "<exact SHA>",
  "manifestVersion": 2,
  "entrypoint": "src/mcp-skills/index.js",
  "manifest": "provider-manifest.json",
  "profiles": ["<enabled profile ids>"]
}
```

The exact activation remains an admin/deploy operation in the core registry.

## Why MCP is not the only reuse layer

MCP is appropriate when a live coding agent needs to discover/call a controlled operation.
It is not required for:
- nightly indexing;
- CI workflows;
- cron/background repository gardening;
- local CLI usage;
- library calls from an orchestrator;
- GitHub Actions reusable workflows.

Therefore every important capability should have a transport-neutral core implementation first.

## Project manifest

Each target repo may add `.engineering/project.yml`.
The first raw `prepare_task` implementation does not require it; manifest support is a next slice.

## First target

Use `trained-assist-agent` as the first target repository for Task Preparation because it is large,
has active concurrent development and already contains the engineering mechanisms being extracted.

## GitHub credential onboarding

Engineering features must not assume that every profile already has a GitHub token or that users
will install a GitHub App manually. The preferred reusable flow is:

```text
feature requests GitHub capability
  -> engineering credential adapter
  -> ZeroCreds secure handoff
  -> capability probe for the target repository
  -> enable feature / bind Merge Relay
```

The profile should receive capability availability, not raw secrets. See
`docs/GITHUB-ONBOARDING.md`.

## Merge Relay

Keep Merge Relay as a separate deployable worker/API rather than moving its Cloudflare/GitHub logic
into this repo. Engineering owns the policy, registration and user-facing setup. A future Merge Relay
v2 should support token-backed API operation without requiring GitHub App installation.
