# Extraction plan from trained-assist-agent

This document describes the desired ownership boundary; migration should be incremental.

## Move / reimplement in engineering

### Issue automation

Current sources:
- `src/issue-fixer.js`
- `scripts/issue-fixer-cron.sh`
- `docs/issue-fixer-runbook.md`

Why: queue -> relevance gate -> coding engine -> verify -> PR is generic software-engineering
orchestration, not end-user agent runtime behavior.

Migration rule: first reproduce behavior in engineering against `trained-assist-agent` as a target
repo, then retire the old implementation.

### PR review / coherence

Current sources:
- `scripts/pr-coherence-check.mjs`
- `scripts/pr-per-file-coherence.mjs`
- corresponding tests/workflow wiring

Why: reusable review policy across repositories.

### CI/autofix installation and batch helpers

Current sources:
- `scripts/install-ci-fixer.sh`
- `.github/workflows/batch-fix-prs.yml`
- `ci-fix-cleanup` integration wiring

Why: generic engineering infrastructure. Keep `trained-assist/pr-autofix` as the specialized worker
for now; engineering orchestrates/installs it.

### PR lifecycle capability

Current source:
- engineering-specific behavior in `src/mcp-skills/tools/63-ci-cd.js`

Split:
- "track this PR through CI/merge/deploy" -> engineering;
- generic durable follow-up/timers -> stays in agent runtime.

## Keep in trained-assist-agent

- user sessions and persona;
- Telegram/web delivery;
- generic durable execution / resume / GTD machinery;
- generic MCP provider runtime/action policy;
- profile/user credential isolation;
- user-facing project/session storage.

Engineering may call these generic primitives through stable contracts but should not own them.

## Keep in domain repositories

- HH/recruiter behavior;
- freelance business process;
- legal/business domain logic;
- domain-specific pages and integrations.

## Temporary duplication is allowed

Extraction should prefer safe strangler migration:

1. implement new capability in engineering;
2. run read-only/shadow comparison;
3. route one target/use case to new implementation;
4. verify CI/staging behavior;
5. remove old code only after parity.

DRY is the destination, not a reason for a risky big-bang move.
