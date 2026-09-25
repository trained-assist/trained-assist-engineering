'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  spawnWorkspace,
  statusWorkspace,
  releaseWorkspace,
  reconcileWorkspaces,
  WorkspaceError,
  workspaceIdOf,
  ownerKeyOf,
} = require('../src/workspace');
const gitlib = require('../src/workspace/git');
const { sanitizeSegment } = require('../src/workspace/paths');

const cleanup = [];

function tmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanup.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of cleanup) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeSourceRepo() {
  const dir = tmp('eng-src-');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'module.exports = 1;\n');
  runGit(dir, ['init', '-q']);
  runGit(dir, ['config', 'user.email', 'test@example.com']);
  runGit(dir, ['config', 'user.name', 'Test']);
  runGit(dir, ['add', '.']);
  runGit(dir, ['commit', '-qm', 'initial']);
  const sha = runGit(dir, ['rev-parse', 'HEAD']).trim();
  return { dir, sha };
}

function bindingFor(source, root, overrides = {}) {
  return {
    workspaceRoot: root,
    sourceCheckout: source.dir,
    baseRevision: source.sha,
    principal: 'alice',
    hostId: 'host-1',
    repositoryId: 'trained-assist-agent',
    rootTaskId: 'task-1',
    idempotencyKey: 'op-1',
    ...overrides,
  };
}

function codePathFor(binding) {
  const ownerKey = ownerKeyOf(binding);
  const workspaceId = workspaceIdOf(ownerKey, binding.idempotencyKey);
  return path.join(binding.workspaceRoot, binding.principal, binding.repositoryId, workspaceId, 'code');
}

function branchFor(binding) {
  return `eng/${sanitizeSegment(binding.principal)}-${sanitizeSegment(binding.rootTaskId)}`;
}

function commitChange(codePath, name = 'change.txt') {
  fs.writeFileSync(path.join(codePath, name), 'work\n');
  runGit(codePath, ['add', '.']);
  runGit(codePath, ['commit', '-qm', `add ${name}`]);
}

function expectCode(fn, code) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof WorkspaceError, `expected WorkspaceError, got ${e}`);
    assert.equal(e.code, code);
    return e;
  }
  assert.fail(`expected WorkspaceError ${code}`);
}

test('spawn materializes the exact committed revision outside the source checkout', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const result = spawnWorkspace(bindingFor(source, root));

  assert.equal(result.status, 'code_ready');
  assert.equal(result.baseRevision, source.sha);
  assert.equal(gitlib.currentHead(result.codePath), source.sha);
  assert.equal(result.git.headRevision, source.sha);
  assert.ok(fs.existsSync(path.join(result.runtimePath, 'data')));
  assert.ok(result.codePath.startsWith(root + path.sep));
  assert.ok(!result.codePath.startsWith(source.dir + path.sep));
  assert.equal(runGit(source.dir, ['status', '--porcelain']), '');
});

test('dirty source is never carried into the workspace and is left untouched', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  fs.writeFileSync(path.join(source.dir, 'src', 'app.js'), 'module.exports = 2;\n');

  const result = spawnWorkspace(bindingFor(source, root));

  assert.equal(runGit(result.codePath, ['status', '--porcelain']), '');
  assert.match(runGit(source.dir, ['status', '--porcelain']), /src\/app\.js/);
});

test('detached HEAD source still materializes the requested revision', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  runGit(source.dir, ['checkout', '-q', '--detach', source.sha]);

  const result = spawnWorkspace(bindingFor(source, root));
  assert.equal(result.status, 'code_ready');
  assert.equal(gitlib.currentHead(result.codePath), source.sha);
});

test('same operation key is idempotent and creates exactly one worktree', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);

  const first = spawnWorkspace(binding);
  const second = spawnWorkspace(binding);

  assert.equal(first.workspaceId, second.workspaceId);
  assert.equal(second.reused, true);
  const registered = gitlib.worktreeList(source.dir).filter((w) => w.path === first.codePath);
  assert.equal(registered.length, 1);
});

test('same key with incompatible arguments conflicts', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);
  spawnWorkspace(binding);

  fs.writeFileSync(path.join(source.dir, 'src', 'next.js'), 'module.exports = 2;\n');
  runGit(source.dir, ['add', '.']);
  runGit(source.dir, ['commit', '-qm', 'next']);
  const nextSha = runGit(source.dir, ['rev-parse', 'HEAD']).trim();

  expectCode(() => spawnWorkspace({ ...binding, baseRevision: nextSha }), 'CONFLICT');
  expectCode(() => spawnWorkspace({ ...binding, rootTaskId: 'other-task' }), 'CONFLICT');
});

test('a different operation key for the same owner conflicts', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);
  spawnWorkspace(binding);

  expectCode(() => spawnWorkspace({ ...binding, idempotencyKey: 'op-2' }), 'CONFLICT');
});

test('unknown revision fails explicitly without touching git', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  expectCode(() => spawnWorkspace(bindingFor(source, root, { baseRevision: '0123456789abcdef0123456789abcdef01234567' })), 'UNKNOWN_REVISION');
  assert.equal(fs.existsSync(codePathFor(bindingFor(source, root))), false);
});

test('branch collision is explicit', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);
  runGit(source.dir, ['branch', branchFor(binding), source.sha]);

  expectCode(() => spawnWorkspace(binding), 'BRANCH_COLLISION');
});

test('path collision is explicit', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);
  const codePath = codePathFor(binding);
  fs.mkdirSync(codePath, { recursive: true });
  fs.writeFileSync(path.join(codePath, 'occupied.txt'), 'x\n');

  expectCode(() => spawnWorkspace(binding), 'PATH_COLLISION');
});

test('symlink escape outside the workspace root is rejected', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const outside = tmp('eng-outside-');
  fs.symlinkSync(outside, path.join(root, 'alice'));

  expectCode(() => spawnWorkspace(bindingFor(source, root)), 'PATH_ESCAPE');
});

test('crash before worktree creation is recovered on retry', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);

  assert.throws(() => spawnWorkspace(binding, {
    hooks: { beforeWorktree: () => { throw new Error('simulated crash'); } },
  }));

  const result = spawnWorkspace(binding);
  assert.equal(result.status, 'code_ready');
  assert.equal(gitlib.worktreeList(source.dir).filter((w) => w.path === result.codePath).length, 1);
});

test('crash after worktree creation before metadata is recovered without duplicating work', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);

  assert.throws(() => spawnWorkspace(binding, {
    hooks: { afterWorktree: () => { throw new Error('simulated crash'); } },
  }));
  const codePath = codePathFor(binding);
  assert.ok(fs.existsSync(codePath));

  const result = spawnWorkspace(binding);
  assert.equal(result.status, 'code_ready');
  assert.equal(result.codePath, codePath);
  assert.equal(gitlib.worktreeList(source.dir).filter((w) => w.path === codePath).length, 1);
  assert.equal(runGit(source.dir, ['branch', '--list', branchFor(binding)]).trim().split('\n').length, 1);
});

test('crash after metadata write before finalize is recovered', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const binding = bindingFor(source, root);

  assert.throws(() => spawnWorkspace(binding, {
    hooks: { afterMetadata: () => { throw new Error('simulated crash'); } },
  }));

  const result = spawnWorkspace(binding);
  assert.equal(result.status, 'code_ready');
  assert.equal(gitlib.worktreeList(source.dir).filter((w) => w.path === result.codePath).length, 1);
});

test('two tasks receive different cwd and runtime paths', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const a = spawnWorkspace(bindingFor(source, root, { rootTaskId: 'task-a', idempotencyKey: 'op-a' }));
  const b = spawnWorkspace(bindingFor(source, root, { rootTaskId: 'task-b', idempotencyKey: 'op-b' }));

  assert.notEqual(a.codePath, b.codePath);
  assert.notEqual(a.runtimePath, b.runtimePath);
  assert.ok(fs.existsSync(a.codePath) && fs.existsSync(b.codePath));
});

test('a different principal cannot read or release another principal workspace', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const alice = spawnWorkspace(bindingFor(source, root, { principal: 'alice' }));

  expectCode(() => statusWorkspace({ workspaceRoot: root, workspaceId: alice.workspaceId, principal: 'bob' }), 'OWNERSHIP');
  expectCode(() => releaseWorkspace({ workspaceRoot: root, workspaceId: alice.workspaceId, principal: 'bob', rootTaskId: 'task-1' }), 'OWNERSHIP');

  const bob = spawnWorkspace(bindingFor(source, root, { principal: 'bob', idempotencyKey: 'bob-op' }));
  assert.notEqual(alice.workspaceId, bob.workspaceId);
  assert.notEqual(alice.codePath, bob.codePath);
});

test('status reports observed worktree state and ownership', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const spawned = spawnWorkspace(bindingFor(source, root));

  const status = statusWorkspace({ workspaceRoot: root, workspaceId: spawned.workspaceId });
  assert.equal(status.status, 'code_ready');
  assert.equal(status.observed.worktreeRegistered, true);
  assert.equal(status.observed.headRevision, source.sha);
  assert.equal(status.observed.dirty, false);
});

test('release removes a clean workspace and its branch', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const spawned = spawnWorkspace(bindingFor(source, root));

  const released = releaseWorkspace({
    workspaceRoot: root,
    workspaceId: spawned.workspaceId,
    principal: 'alice',
    rootTaskId: 'task-1',
    processesStopped: true,
  });

  assert.equal(released.status, 'released');
  assert.equal(released.removed, true);
  assert.equal(fs.existsSync(spawned.codePath), false);
  assert.equal(runGit(source.dir, ['branch', '--list', branchFor(bindingFor(source, root))]).trim(), '');
});

test('release retains a dirty workspace', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const spawned = spawnWorkspace(bindingFor(source, root));
  fs.writeFileSync(path.join(spawned.codePath, 'src', 'app.js'), 'module.exports = 99;\n');

  const released = releaseWorkspace({ workspaceRoot: root, workspaceId: spawned.workspaceId, principal: 'alice', rootTaskId: 'task-1' });
  assert.equal(released.status, 'needs_review');
  assert.ok(released.reasons.includes('dirty'));
  assert.ok(fs.existsSync(spawned.codePath));
});

test('release retains a workspace with untracked files', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const spawned = spawnWorkspace(bindingFor(source, root));
  fs.writeFileSync(path.join(spawned.codePath, 'scratch.txt'), 'notes\n');

  const released = releaseWorkspace({ workspaceRoot: root, workspaceId: spawned.workspaceId, principal: 'alice', rootTaskId: 'task-1' });
  assert.equal(released.status, 'needs_review');
  assert.ok(released.reasons.includes('untracked'));
});

test('release retains a workspace with unpushed commits when a remote exists', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const bare = tmp('eng-remote-');
  runGit(bare, ['init', '--bare', '-q']);
  runGit(source.dir, ['remote', 'add', 'origin', bare]);
  const branchName = runGit(source.dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  runGit(source.dir, ['push', '-q', 'origin', branchName]);

  const spawned = spawnWorkspace(bindingFor(source, root));
  commitChange(spawned.codePath);

  const released = releaseWorkspace({ workspaceRoot: root, workspaceId: spawned.workspaceId, principal: 'alice', rootTaskId: 'task-1' });
  assert.equal(released.status, 'needs_review');
  assert.ok(released.reasons.includes('unpushed'));
});

test('release retains a workspace when the remote is unknown', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const spawned = spawnWorkspace(bindingFor(source, root));
  commitChange(spawned.codePath);

  const released = releaseWorkspace({ workspaceRoot: root, workspaceId: spawned.workspaceId, principal: 'alice', rootTaskId: 'task-1' });
  assert.equal(released.status, 'needs_review');
  assert.ok(released.reasons.includes('unknown_remote'));
});

test('release retains a workspace when a stash references its branch', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const spawned = spawnWorkspace(bindingFor(source, root));
  fs.writeFileSync(path.join(spawned.codePath, 'src', 'app.js'), 'module.exports = 3;\n');
  runGit(spawned.codePath, ['stash', 'push', '-q']);

  const released = releaseWorkspace({ workspaceRoot: root, workspaceId: spawned.workspaceId, principal: 'alice', rootTaskId: 'task-1' });
  assert.equal(released.status, 'needs_review');
  assert.ok(released.reasons.includes('stash'));
});

test('squash-merged workspace is released only with delivery evidence', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const spawned = spawnWorkspace(bindingFor(source, root));
  commitChange(spawned.codePath);

  const blocked = releaseWorkspace({ workspaceRoot: root, workspaceId: spawned.workspaceId, principal: 'alice', rootTaskId: 'task-1' });
  assert.equal(blocked.status, 'needs_review');

  const released = releaseWorkspace({
    workspaceRoot: root,
    workspaceId: spawned.workspaceId,
    principal: 'alice',
    rootTaskId: 'task-1',
    deliveryEvidence: { merged: true, evidence: 'reviewer:pr-42' },
  });
  assert.equal(released.status, 'released');
  assert.equal(released.removed, true);
});

test('reconcile reports orphans without deleting them', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  spawnWorkspace(bindingFor(source, root));
  const orphanCode = path.join(root, 'alice', 'trained-assist-agent', 'ws-orphan', 'code');
  fs.mkdirSync(orphanCode, { recursive: true });
  fs.writeFileSync(path.join(orphanCode, '.git'), 'gitdir: /nonexistent\n');

  const report = reconcileWorkspaces({ workspaceRoot: root });
  assert.ok(report.orphans.some((o) => o.codePath === orphanCode && o.action === 'retained'));
  assert.ok(fs.existsSync(orphanCode));
});

test('CLI adapter exposes spawn/status/release', () => {
  const source = makeSourceRepo();
  const root = tmp('eng-ws-');
  const bin = path.join(__dirname, '..', 'bin', 'engineering.js');
  const common = [
    '--root', root,
    '--source-checkout', source.dir,
    '--base-revision', source.sha,
    '--principal', 'cli-user',
    '--host', 'host-cli',
    '--repo-id', 'agent',
    '--root-task-id', 'cli-task',
    '--idempotency-key', 'cli-op',
  ];
  const spawned = JSON.parse(execFileSync('node', [bin, 'workspace-spawn', ...common], { encoding: 'utf8' }));
  assert.equal(spawned.status, 'code_ready');

  const status = JSON.parse(execFileSync('node', [bin, 'workspace-status', '--root', root, '--workspace-id', spawned.workspaceId], { encoding: 'utf8' }));
  assert.equal(status.status, 'code_ready');

  const released = JSON.parse(execFileSync('node', [
    bin, 'workspace-release', '--root', root, '--workspace-id', spawned.workspaceId,
    '--principal', 'cli-user', '--root-task-id', 'cli-task', '--processes-stopped',
  ], { encoding: 'utf8' }));
  assert.equal(released.status, 'released');
});
