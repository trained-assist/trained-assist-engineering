'use strict';

// Replay gate for the engineering development playbook: same 16-step flow, but
// deterministic and offline. Mock exactly two boundaries — the LLM (`fixtures/
// llm-responses.json`) and external git/CI/deploy (`fake-provider`). The playbook
// artifact, compiler, stage order and lifecycle run for real.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createFakeClock } = require('../../tests/helpers/fake-clock');
const { createFakeActions } = require('../../tests/helpers/fake-provider');
const { ReplayExecutor } = require('./executor');

const ROOT = path.resolve(__dirname, '../..');
const playbook = JSON.parse(fs.readFileSync(path.join(ROOT, 'playbooks/development.json'), 'utf8'));
const actionsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/actions.json'), 'utf8'));
const llmConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/llm-responses.json'), 'utf8'));

const DELAY_TITLE = 'Wait for CI and staging; repair failures';

function setup({ ciGreenAfterPolls = actionsConfig.ci.greenAfterPolls, llm = llmConfig.scripts } = {}) {
  const clock = createFakeClock();
  const actions = createFakeActions({ clock, ciGreenAfterPolls });
  const executor = new ReplayExecutor({ playbook, clock, actions, llm, runnerMap: actionsConfig.runnerMap });
  executor.compile('fix bug — notification on HH token expiry');
  return { clock, actions, executor };
}

test('compiles into 16 items pinned to development@1 in stage order', () => {
  const { executor } = setup();
  assert.equal(executor.items.length, 16);
  for (const item of executor.items) {
    assert.equal(item.playbook_id, 'development');
    assert.equal(item.playbook_version, 1);
  }
  assert.deepEqual(executor.items.map((i) => i.stage), [
    'frame', 'frame', 'frame',
    'discover', 'discover',
    'design', 'design', 'design',
    'build', 'build', 'build',
    'deliver', 'deliver', 'deliver', 'deliver', 'deliver',
  ]);
  const agentStep = executor.items[0];
  assert.deepEqual([agentStep.kind, agentStep.role, agentStep.level, agentStep.budget], ['agent', 'researcher', 'bachelor', 'small']);
  const wait = executor.items.find((i) => i.title === DELAY_TITLE);
  assert.equal(wait.delaySec, 600);
});

test('a draft plan is not claimable until explicitly activated', () => {
  const { executor } = setup();
  assert.equal(executor.claim(), null, 'draft must not be claimable');
  executor.activate();
  assert.equal(executor.claim().title, 'Define user value', 'claims start at stage 1');
});

test('claims proceed in stage order and delay_after_sec holds on the fake clock', () => {
  const { clock, executor } = setup();
  executor.activate();
  executor.drain(); // runs everything due at t0 — stops at the delayed wait step

  const wait = executor.items.find((i) => i.title === DELAY_TITLE);
  assert.equal(wait.status, 'pending', 'the delayed step must not run before its deadline');
  const later = executor.items.slice(wait.index + 1);
  assert.ok(later.every((i) => i.status === 'pending'), 'steps after the delayed one wait too');

  clock.advance(599_000);
  assert.equal(executor.claim(), null, 'not runnable at +599s');
  clock.advance(1_000);
  assert.equal(executor.claim().title, DELAY_TITLE, 'runnable at +600s');

  executor.drain();
  assert.ok(executor.items.every((i) => i.status === 'done'), 'all steps finish once the clock passes the delay');
});

test('a failed step retries within max_attempts and then succeeds', () => {
  const { executor } = setup();
  executor.activate();
  executor.drain();
  const research = executor.items.find((i) => i.title === 'Research or reproduce the problem');
  assert.equal(research.attempts, 2, 'failed once, succeeded on retry');
  assert.equal(research.status, 'done');
});

test('a step that keeps failing ends failed, not pending forever', () => {
  const llm = { 'Define user value': { failAttempts: [1, 2, 3, 4] } };
  const { executor } = setup({ llm });
  executor.activate();
  executor.drain();
  const first = executor.items[0];
  assert.equal(first.attempts, 3, 'bounded by max_attempts');
  assert.equal(first.status, 'failed');
});

test('programmatic steps invoke the declared runner and merge never precedes green CI', () => {
  const { actions, executor } = setup();
  executor.activate();
  executor.drain();
  clockAdvanceToRunAll(executor);

  const order = actions.calls.map((c) => c.name);
  assert.deepEqual(order, ['shell', 'git.open_pr', 'ci.wait_for_green', 'deploy.merge_and_release']);
  const deploy = actions.calls.find((c) => c.name === 'deploy.merge_and_release');
  const firstGreen = actions.calls.findIndex((c) => c.name === 'ci.wait_for_green' && c.status === 'green');
  assert.ok(firstGreen >= 0 && actions.calls.indexOf(deploy) > firstGreen, 'merge must follow the green CI poll');
  assert.equal(actions.state.merged, true);
});

test('merge without green CI is refused by the fake CI boundary', () => {
  const { actions } = setup({ ciGreenAfterPolls: 99 });
  assert.throws(() => actions.invoke('action: deploy.merge_and_release', {}), /merge before PR was opened|CI_NOT_GREEN/);
  actions.invoke('action: git.open_pr', { branch: 'eng/vova-x' });
  assert.throws(() => actions.invoke('action: deploy.merge_and_release', {}), (e) => e.code === 'CI_NOT_GREEN');
});

test('finalization is refused without current acceptance evidence', () => {
  const { executor } = setup();
  executor.activate();
  assert.throws(() => executor.finalize(), /cannot finalize/);
  executor.drain();
  clockAdvanceToRunAll(executor);
  assert.equal(executor.finalize(), true);
});

// After the wait step becomes due, drain the remaining deliver-stage steps.
function clockAdvanceToRunAll(executor) {
  const wait = executor.items.find((i) => i.title === DELAY_TITLE);
  if (wait.status === 'pending') {
    executor.clock.advance(wait.delaySec * 1000);
    executor.drain();
  }
}
