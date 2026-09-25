'use strict';

// Deterministic local git fixtures for behavior/replay tests. No network:
// a temp bare repo plays the remote and a temp worktree plays the checkout.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function mkdir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function configure(work) {
  git(work, ['config', 'user.email', 'test@example.com']);
  git(work, ['config', 'user.name', 'Engineering Test']);
}

// Bare "remote" plus a seed commit on `main`; returns the remote path.
function makeRemote(prefix = 'eng-remote-') {
  const bare = mkdir(prefix);
  git(bare, ['init', '--bare', '-q', '-b', 'main']);
  const work = mkdir(`${prefix}work-`);
  git(work, ['clone', '-q', bare, '.']);
  fs.writeFileSync(path.join(work, 'README.md'), '# demo\n');
  git(work, ['add', '.']);
  configure(work);
  git(work, ['commit', '-qm', 'initial']);
  git(work, ['push', '-q', 'origin', 'HEAD:main']);
  return bare;
}

// Non-bare repo with source + tests + docs, for prepare_task.
function makeRepo(prefix = 'eng-repo-') {
  const dir = mkdir(prefix);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'task-router.js'), 'function routeTask(task) { return task; }\nmodule.exports={routeTask};\n');
  fs.writeFileSync(path.join(dir, 'test', 'task-router.test.js'), 'test("task router",()=>{});\n');
  fs.writeFileSync(path.join(dir, 'docs', 'architecture.md'), '# Task routing architecture\n');
  git(dir, ['init', '-q', '-b', 'main']);
  configure(dir);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-qm', 'add task router']);
  return dir;
}

module.exports = { mkdir, git, makeRemote, makeRepo };
