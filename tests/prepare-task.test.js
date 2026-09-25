'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { prepareTask } = require('../src/prepare-task');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-test-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'task-router.js'), 'function routeTask(task) { return task; }\nmodule.exports={routeTask};\n');
  fs.writeFileSync(path.join(dir, 'test', 'task-router.test.js'), 'test("task router",()=>{});\n');
  fs.writeFileSync(path.join(dir, 'docs', 'architecture.md'), '# Task routing architecture\n');
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-qm', 'add task router']);
  return dir;
}

test('prepareTask works on raw git repo without an index', () => {
  const dir = makeRepo();
  const packet = prepareTask({ repoPath: dir, task: 'change task router behavior' });
  assert.equal(packet.version, 1);
  assert.equal(packet.source, 'raw-repo');
  assert.equal(packet.repository.dirty, false);
  assert.ok(packet.context.likelyFiles.some(x => x.file === 'src/task-router.js'));
  assert.ok(packet.context.relatedTests.includes('test/task-router.test.js'));
  assert.ok(packet.context.relatedDocs.includes('docs/architecture.md'));
});

test('prepareTask is read-only', () => {
  const dir = makeRepo();
  const before = git(dir, ['status', '--porcelain']);
  prepareTask({ repoPath: dir, task: 'task router' });
  const after = git(dir, ['status', '--porcelain']);
  assert.equal(after, before);
});
