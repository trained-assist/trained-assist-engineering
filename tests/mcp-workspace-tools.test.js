'use strict';

// MCP-wrapper layer for the self-service workspace API (issue #6): the same
// spawn/status/release round-trip as tests/workspace-for-task.test.js, but
// driven through registry.callTool() exactly as the MCP server would, against a
// local bare-repo fixture. Covers the two things the wrapper itself is
// responsible for: (1) principal comes from the server process env (USER_ID),
// never from tool arguments; (2) bad/missing input surfaces as a clear typed
// error, not a crash.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { callTool } = require('../src/mcp-skills/registry');
const { WorkspaceError } = require('../src/workspace/workspace');

const cleanup = [];
const savedEnv = {};
for (const key of ['USER_ID', 'ENGINEERING_WORKSPACE_ROOT', 'ENGINEERING_MIRRORS_ROOT']) {
  savedEnv[key] = process.env[key];
}

test.after(() => {
  for (const key of Object.keys(savedEnv)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const dir of cleanup) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

function tmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  cleanup.push(dir);
  return dir;
}

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// Bare "remote" that the wrapper clones into its mirror — proves the tool-call
// layer never needs a pre-existing local checkout from the caller.
function makeRemote() {
  const bare = tmp('mcp-remote-');
  runGit(bare, ['init', '--bare', '-q', '-b', 'main']);
  const work = tmp('mcp-remote-work-');
  runGit(work, ['clone', '-q', bare, '.']);
  fs.writeFileSync(path.join(work, 'README.md'), '# demo\n');
  runGit(work, ['add', '.']);
  runGit(work, ['config', 'user.email', 'test@example.com']);
  runGit(work, ['config', 'user.name', 'Test']);
  runGit(work, ['commit', '-qm', 'initial']);
  runGit(work, ['push', '-q', 'origin', 'HEAD:main']);
  return bare;
}

function env(...keys) {
  for (const key of keys) delete process.env[key];
}

function useTmpRoots() {
  process.env.ENGINEERING_WORKSPACE_ROOT = tmp('mcp-ws-');
  process.env.ENGINEERING_MIRRORS_ROOT = tmp('mcp-mirrors-');
}

test('engineering_spawn_workspace uses USER_ID from the env, ignoring a principal argument (env wins)', async () => {
  process.env.USER_ID = 'vova';
  useTmpRoots();
  const repositoryUrl = makeRemote();

  const result = await callTool('engineering_spawn_workspace', {
    repository_url: repositoryUrl,
    root_task_id: 'fix-forum-topics',
    principal: 'attacker',
  });

  assert.equal(result.status, 'code_ready');
  assert.equal(result.principal, 'vova');
  assert.equal(result.branch, 'eng/vova-fix-forum-topics');
  assert.ok(fs.existsSync(path.join(result.codePath, 'README.md')));
});

test('engineering_spawn_workspace without USER_ID fails clearly (principal is host-derived)', async () => {
  env('USER_ID');
  useTmpRoots();
  const repositoryUrl = makeRemote();

  await assert.rejects(
    () => callTool('engineering_spawn_workspace', { repository_url: repositoryUrl, root_task_id: 'fix-forum-topics' }),
    (e) => e instanceof WorkspaceError && e.code === 'INVALID_BINDING',
  );
});

test('missing repository_url/root_task_id fails with a typed MCP-level error, not a crash', async () => {
  process.env.USER_ID = 'vova';
  useTmpRoots();

  await assert.rejects(
    () => callTool('engineering_spawn_workspace', { root_task_id: 'fix-forum-topics' }),
    (e) => e instanceof WorkspaceError && e.code === 'INVALID_BINDING',
  );
  await assert.rejects(
    () => callTool('engineering_workspace_status', {}),
    (e) => e instanceof WorkspaceError && e.code === 'INVALID_BINDING',
  );
  await assert.rejects(
    () => callTool('engineering_release_workspace', {}),
    (e) => e instanceof WorkspaceError && e.code === 'INVALID_BINDING',
  );
});

test('spawn -> status -> release round-trips through the tool-call layer', async () => {
  process.env.USER_ID = 'vova';
  useTmpRoots();
  const repositoryUrl = makeRemote();
  const args = { repository_url: repositoryUrl, root_task_id: 'fix-forum-topics' };

  const spawned = await callTool('engineering_spawn_workspace', args);
  assert.equal(spawned.status, 'code_ready');

  const status = await callTool('engineering_workspace_status', args);
  assert.equal(status.status, 'code_ready');
  assert.equal(status.codePath, spawned.codePath);

  const released = await callTool('engineering_release_workspace', args);
  assert.equal(released.status, 'released');
  assert.equal(fs.existsSync(spawned.codePath), false);
});
