'use strict';

// Deterministic fake of exactly the external boundaries the rules allow mocking:
// the external network reached through `git`/`gh` and the CI/deploy steps
// (`ci.wait_for_green` / `deploy.merge_and_release`). It records every call so a
// scenario can assert order — in particular that a merge never precedes green CI.
// No real process, no network, no wall clock.

function createFakeActions({ clock, ciGreenAfterPolls = 2, pollIntervalMs = 60_000, llm } = {}) {
  const calls = [];
  const log = (name, args, extra = {}) => {
    const entry = { name, at: clock.now(), args, ...extra };
    calls.push(entry);
    return entry;
  };

  const state = {
    opened: false,
    prUrl: null,
    ciStatus: 'pending',
    polls: 0,
    merged: false,
    released: false,
    llm,
  };

  const actions = {
    'git.open_pr': ({ branch, base = 'main' } = {}) => {
      if (branch === base) throw Object.assign(new Error('refusing to open a PR from the base branch'), { code: 'INVALID_BRANCH' });
      state.opened = true;
      state.prUrl = `https://example.test/${branch}`;
      return log('git.open_pr', { branch, base }, { prUrl: state.prUrl });
    },

    // Models a blocking `gh pr checks --watch`: polls on the (fake) clock until
    // green, then returns. A merge after this is therefore safe to allow.
    'ci.wait_for_green': () => {
      let polls = 0;
      while (polls < Math.max(1, ciGreenAfterPolls)) {
        polls += 1;
        if (polls < ciGreenAfterPolls) clock.advance(pollIntervalMs);
      }
      state.polls = polls;
      state.ciStatus = 'green';
      return log('ci.wait_for_green', {}, { status: 'green', polls });
    },

    'deploy.merge_and_release': ({ prUrl } = {}) => {
      if (!state.opened) throw Object.assign(new Error('merge before PR was opened'), { code: 'NO_PR' });
      if (state.ciStatus !== 'green') throw Object.assign(new Error('merge before CI was green'), { code: 'CI_NOT_GREEN' });
      state.merged = true;
      state.released = true;
      return log('deploy.merge_and_release', { prUrl }, { merged: true });
    },
  };

  function invoke(runner, args) {
    if (typeof runner === 'string' && runner.startsWith('action: ')) {
      const name = runner.slice('action: '.length).trim();
      if (!actions[name]) throw Object.assign(new Error(`unknown fake action: ${name}`), { code: 'UNKNOWN_ACTION' });
      return actions[name](args);
    }
    if (typeof runner === 'string' && runner.startsWith('shell: ')) {
      const command = runner.slice('shell: '.length).trim();
      return log('shell', { command }, { exitCode: 0 });
    }
    throw Object.assign(new Error(`unsupported runner: ${runner}`), { code: 'UNSUPPORTED_RUNNER' });
  }

  return { state, calls, invoke, actions };
}

module.exports = { createFakeActions };
