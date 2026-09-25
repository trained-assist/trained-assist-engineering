'use strict';

// Minimal deterministic replay executor for Playbook v1. It is NOT the core
// durable executor — it replays the same compile → draft → activate → claim →
// step lifecycle against fake LLM responses, a fake clock and fake git/CI/deploy
// actions, so CI can assert the scenario's invariants without Hermes or a network.

function compile(playbook, { goal }) {
  const items = [];
  let index = 0;
  for (const stage of playbook.stages) {
    for (const step of stage.steps) {
      items.push({
        index: index++,
        stage: stage.id,
        title: step.title,
        kind: step.execution_kind,
        role: step.executor_role ?? null,
        level: step.minimum_model_level ?? null,
        budget: step.context_budget ?? null,
        validation: step.validation ?? null,
        delaySec: step.delay_after_sec ?? 0,
        playbook_id: playbook.id,
        playbook_version: playbook.version,
        status: 'pending',
        attempts: 0,
        dueAt: null,
        evidence: null,
        goal,
      });
    }
  }
  return items;
}

class ReplayExecutor {
  constructor({ playbook, clock, actions, llm = {}, runnerMap = {}, maxAttempts = playbook.defaults?.max_attempts ?? 3 }) {
    this.playbook = playbook;
    this.clock = clock;
    this.actions = actions;
    this.llm = llm;
    this.runnerMap = runnerMap;
    this.maxAttempts = maxAttempts;
    this.status = 'draft';
    this.items = [];
  }

  compile(goal) {
    this.items = compile(this.playbook, { goal });
    return this.items;
  }

  activate() {
    if (this.status !== 'draft') throw new Error(`cannot activate from ${this.status}`);
    this.status = 'active';
    for (const item of this.items) item.dueAt = this.clock.now() + item.delaySec * 1000;
  }

  // Next claimable item: active plan, first pending in stage order, due by the
  // fake clock. A delayed earlier step blocks the steps after it (linear plan).
  claim() {
    if (this.status !== 'active') return null;
    const next = this.items.find((item) => item.status === 'pending');
    if (!next) return null;
    return next.dueAt <= this.clock.now() ? next : null;
  }

  runItem(item) {
    item.attempts += 1;
    if (item.kind === 'programmatic') {
      const runner = this.runnerMap[item.title];
      if (!runner) throw new Error(`no runner declared for programmatic step: ${item.title}`);
      this.actions.invoke(runner, { branch: 'eng/vova-fix-forum-topics', base: 'main', prUrl: this.actions.state.prUrl });
      item.status = 'done';
      item.evidence = { kind: 'action', runner, at: this.clock.now() };
      return;
    }
    const script = this.llm[item.title] ?? { marker: 'DURABLE: done' };
    const failed = Array.isArray(script.failAttempts) && script.failAttempts.includes(item.attempts);
    if (failed) {
      item.status = item.attempts < this.maxAttempts ? 'pending' : 'failed';
      item.evidence = null;
      return;
    }
    item.status = 'done';
    item.evidence = { kind: 'llm', marker: script.marker ?? 'DURABLE: done', at: this.clock.now() };
  }

  // Run until no item is claimable at the current fake time.
  drain({ limit = 1000 } = {}) {
    let steps = 0;
    while (steps++ < limit) {
      const item = this.claim();
      if (!item) break;
      this.runItem(item);
    }
    return this.items;
  }

  finalize() {
    const unfinished = this.items.filter((i) => i.status !== 'done');
    if (unfinished.length) throw new Error(`cannot finalize: ${unfinished.length} item(s) not done`);
    const stale = this.items.filter((i) => !i.evidence || typeof i.evidence.at !== 'number');
    if (stale.length) throw new Error('cannot finalize without current acceptance evidence');
    this.status = 'done';
    return true;
  }
}

module.exports = { compile, ReplayExecutor };
