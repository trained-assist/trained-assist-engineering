# GitHub onboarding and Merge Relay

## Goal

A user should not need to understand GitHub App installation, webhook permissions, or a large
permission matrix just to enable safe PR merge coordination.

`trained-assist-engineering` owns the onboarding workflow. `merge-relay` remains an independently
deployed worker/API.

The preferred user experience is:

```text
Connect GitHub
  -> engineering requests the minimum credential needed
  -> ZeroCreds performs the credential handoff
  -> engineering validates repository access/capabilities
  -> engineering configures/uses Merge Relay API
  -> user sees "GitHub engineering connected"
```

The user should not need to install Merge Relay as a GitHub App in the normal path.

## Boundary

### Engineering repository owns

- onboarding playbook;
- credential requirements contract;
- invoking ZeroCreds as the credential broker;
- validating token/repository capabilities;
- repository registration/configuration with Merge Relay;
- presenting actionable setup errors;
- project-level merge policy;
- fallback behavior when Merge Relay is unavailable.

### Merge Relay owns

- receiving authenticated API calls/events;
- repository queue state derived from GitHub;
- selecting the next merge candidate;
- updating PR branches;
- observing/returning merge blockers;
- skipping drafts/conflicted/ineligible PRs;
- idempotency and event handling.

### ZeroCreds owns

- secure credential acquisition/handoff;
- keeping raw GitHub credentials out of prompts and user project files.

Engineering must not duplicate ZeroCreds credential storage.

## Credential contract

Do not hardcode a concrete ZeroCreds endpoint in this repository until the ZeroCreds provider
contract is finalized. Treat it as an adapter with this logical interface:

```text
requestCredential({ provider: "github", purpose, requestedCapabilities })
  -> credential reference / execution environment binding
```

The engineering layer should request capabilities, not teach the user a list of GitHub scopes.
The ZeroCreds/GitHub adapter maps those capabilities to the narrowest supported credential form.

Initial capabilities required by merge coordination are conceptually:

- read repository metadata;
- read pull requests and checks/status;
- update a pull-request branch;
- comment on pull requests/issues when blocked;
- merge only if the selected policy enables engineering-managed merge.

Exact GitHub token scopes/permissions must be derived and verified against the chosen token type
when the adapter is implemented; they are deliberately not guessed in this draft.

## Validation before activation

Before declaring GitHub engineering connected:

1. identify the authenticated GitHub principal without exposing the token;
2. verify the selected repository is reachable;
3. probe only the capabilities required by the enabled features;
4. record capabilities, not secrets, in engineering state;
5. keep unsupported features disabled with a clear reason.

## Merge Relay API direction

Merge Relay should support a token/API integration path in addition to (or instead of) GitHub App
installation. The engineering system supplies or binds the GitHub credential through the secure
adapter; Merge Relay should never require the coding LLM to see the raw credential.

Recommended logical operations:

```text
registerRepository(repository, credentialBinding, policy)
getRepositoryState(repository)
advanceQueue(repository)
getBlocker(repository, pr)
```

The API must be idempotent so engineering can safely retry after network failures.

## Merge Relay v2 requirements

- no mandatory GitHub App installation for the normal flow;
- skip draft PRs;
- distinguish checks running / failed / green;
- distinguish conflict / policy block / stale branch;
- deterministic idempotent queue advancement;
- observable reason for every selected/waiting/skipped/blocked PR;
- raw GitHub credential never enters coding-agent context.
