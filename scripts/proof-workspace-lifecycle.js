#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  spawnWorkspace,
  statusWorkspace,
  releaseWorkspace,
} = require('../src/workspace');
const gitlib = require('../src/workspace/git');

const steps = [];

function check(label, condition, detail = '') {
  steps.push({ label, ok: Boolean(condition), detail });
  if (!condition) {
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    console.error(JSON.stringify(steps, null, 2));
    process.exit(1);
  }
  console.log(`ok   ${label}`);
}

function tmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeSourceRepo() {
  const dir = tmp('proof-src-');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'module.exports = 1;\n');
  runGit(dir, ['init', '-q']);
  runGit(dir, ['config', 'user.email', 'proof@example.com']);
  runGit(dir, ['config', 'user.name', 'Proof']);
  runGit(dir, ['add', '.']);
  runGit(dir, ['commit', '-qm', 'initial']);
  return { dir, sha: runGit(dir, ['rev-parse', 'HEAD']).trim() };
}

function main() {
  const source = makeSourceRepo();
  const workspaceRoot = tmp('proof-ws-');
  const baseBinding = {
    workspaceRoot,
    sourceCheckout: source.dir,
    baseRevision: source.sha,
    principal: 'proof-principal',
    hostId: 'proof-host',
    repositoryId: 'trained-assist-agent',
    rootTaskId: 'proof-task',
    idempotencyKey: 'proof-op-1',
  };

  console.log(`source checkout: ${source.dir} @ ${source.sha}`);
  console.log(`workspace root:  ${workspaceRoot}\n`);

  let crashed = false;
  try {
    spawnWorkspace(baseBinding, {
      hooks: { beforeWorktree: () => { throw new Error('simulated crash before worktree'); } },
    });
  } catch {
    crashed = true;
  }
  check('simulated crash before worktree creation', crashed);

  const spawned = spawnWorkspace(baseBinding);
  check('retry after crash reaches code_ready', spawned.status === 'code_ready', spawned.status);
  check('worktree HEAD equals requested revision', gitlib.currentHead(spawned.codePath) === source.sha);
  check('code path is outside the source checkout', !spawned.codePath.startsWith(source.dir + path.sep));
  check('worktree is clean (dirty source not carried)', runGit(spawned.codePath, ['status', '--porcelain']) === '');

  const reused = spawnWorkspace(baseBinding);
  check('same operation key is idempotent', reused.reused === true && reused.workspaceId === spawned.workspaceId);
  check(
    'exactly one worktree registered for the task',
    gitlib.worktreeList(source.dir).filter((w) => w.path === spawned.codePath).length === 1,
  );

  const secondBinding = { ...baseBinding, rootTaskId: 'proof-task-2', idempotencyKey: 'proof-op-2' };
  let midCrashed = false;
  try {
    spawnWorkspace(secondBinding, {
      hooks: { afterWorktree: () => { throw new Error('simulated crash after worktree'); } },
    });
  } catch {
    midCrashed = true;
  }
  check('simulated crash after worktree creation, before metadata', midCrashed);
  const second = spawnWorkspace(secondBinding);
  check('recovery finalizes the existing worktree', second.status === 'code_ready');
  check('recovery does not create a second worktree', gitlib.worktreeList(source.dir).filter((w) => w.path === second.codePath).length === 1);
  check('two tasks use different code paths', second.codePath !== spawned.codePath);

  const status = statusWorkspace({ workspaceRoot, workspaceId: spawned.workspaceId });
  check('status reports code_ready with observed worktree', status.status === 'code_ready' && status.observed.worktreeRegistered === true);

  const released = releaseWorkspace({
    workspaceRoot,
    workspaceId: spawned.workspaceId,
    principal: baseBinding.principal,
    rootTaskId: baseBinding.rootTaskId,
    processesStopped: true,
  });
  check('clean release removes the worktree', released.status === 'released' && !fs.existsSync(spawned.codePath));

  console.log('\nPASS: workspace lifecycle proof completed');
  console.log(JSON.stringify({ source: source.dir, workspaceRoot, spawned, second, released }, null, 2));

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.rmSync(source.dir, { recursive: true, force: true });
}

try {
  main();
} catch (e) {
  console.error(`proof failed: ${e.stack || e.message}`);
  process.exit(1);
}
