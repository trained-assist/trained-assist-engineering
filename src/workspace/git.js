'use strict';

const { execFileSync } = require('child_process');

const MAX_BUFFER = 32 * 1024 * 1024;

function git(args, cwd, { allowFail = true } = {}) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: MAX_BUFFER,
    });
    return { ok: true, stdout: stdout.trim(), stderr: '' };
  } catch (e) {
    if (!allowFail) throw e;
    return { ok: false, stdout: '', stderr: String(e.stderr || e.message || '') };
  }
}

function gitOut(args, cwd) {
  return git(args, cwd).stdout;
}

function isGitRepo(dir) {
  return git(['rev-parse', '--is-inside-work-tree'], dir).stdout === 'true';
}

function isGitWorktree(dir) {
  return git(['rev-parse', '--is-inside-work-tree'], dir).stdout === 'true';
}

function resolveCommit(repoPath, revision) {
  const out = git(['rev-parse', '--verify', '--quiet', `${revision}^{commit}`], repoPath).stdout;
  return out || null;
}

function currentHead(repoPath) {
  return git(['rev-parse', 'HEAD'], repoPath).stdout || null;
}

function isDetached(repoPath) {
  return git(['symbolic-ref', '-q', 'HEAD'], repoPath).ok === false;
}

function branchExists(repoPath, branch) {
  return git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoPath).ok;
}

function remoteNames(repoPath) {
  const out = git(['remote'], repoPath).stdout;
  return out ? out.split('\n').filter(Boolean) : [];
}

function fetchRevision(repoPath, revision, remote) {
  if (!remote) return false;
  const refspec = revision === 'HEAD' ? 'HEAD' : revision;
  return git(['fetch', '--no-tags', remote, refspec], repoPath, { allowFail: true }).ok;
}

function worktreeAdd(repoPath, { worktreePath, branch, revision }) {
  return git(['worktree', 'add', '-b', branch, worktreePath, revision], repoPath, { allowFail: false });
}

function worktreeRemove(repoPath, worktreePath, { force = false } = {}) {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);
  return git(args, repoPath);
}

function worktreeList(repoPath) {
  const out = git(['worktree', 'list', '--porcelain'], repoPath).stdout;
  if (!out) return [];
  const entries = [];
  let current = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length), head: null, branch: null, detached: false, bare: false, locked: false, prunable: false };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line.startsWith('locked')) {
      current.locked = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function worktreeForPath(repoPath, worktreePath) {
  return worktreeList(repoPath).find((w) => w.path === worktreePath) || null;
}

function status(repoPath) {
  const out = git(['status', '--porcelain', '--untracked-files=all'], repoPath).stdout;
  const lines = out ? out.split('\n').filter(Boolean) : [];
  const tracked = [];
  const untracked = [];
  for (const line of lines) {
    const code = line.slice(0, 2);
    const file = line.slice(3);
    if (code === '??') untracked.push(file);
    else tracked.push({ code, file });
  }
  return { tracked, untracked, dirty: tracked.length > 0, hasUntracked: untracked.length > 0, lines };
}

function stashEntries(repoPath) {
  const out = git(['stash', 'list'], repoPath).stdout;
  return out ? out.split('\n').filter(Boolean) : [];
}

function upstream(repoPath, branch) {
  return git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${branch}@{upstream}`], repoPath).stdout || null;
}

function countAhead(repoPath, range) {
  const out = git(['rev-list', '--count', range], repoPath).stdout;
  return out ? Number(out) : null;
}

function remoteBranchesContaining(repoPath, revision) {
  const out = git(['branch', '-r', '--contains', revision], repoPath).stdout;
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

function defaultBranch(repoPath, remote) {
  const head = git(['symbolic-ref', '-q', `refs/remotes/${remote}/HEAD`], repoPath).stdout;
  if (head) return head.replace(`refs/remotes/${remote}/`, '');
  for (const candidate of ['main', 'master']) {
    if (git(['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${candidate}`], repoPath).ok) return candidate;
  }
  return null;
}

function isMergedInto(repoPath, branch, ref) {
  if (!ref) return false;
  return git(['merge-base', '--is-ancestor', branch, ref], repoPath).ok;
}

function deleteBranch(repoPath, branch, { force = false } = {}) {
  return git(['branch', force ? '-D' : '-d', branch], repoPath);
}

module.exports = {
  git,
  gitOut,
  isGitRepo,
  isGitWorktree,
  resolveCommit,
  currentHead,
  isDetached,
  branchExists,
  remoteNames,
  fetchRevision,
  worktreeAdd,
  worktreeRemove,
  worktreeList,
  worktreeForPath,
  status,
  stashEntries,
  upstream,
  countAhead,
  remoteBranchesContaining,
  defaultBranch,
  isMergedInto,
  deleteBranch,
};
