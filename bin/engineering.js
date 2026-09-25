#!/usr/bin/env node
'use strict';

const { prepareTask } = require('../src/prepare-task');
const {
  spawnWorkspace,
  statusWorkspace,
  releaseWorkspace,
  reconcileWorkspaces,
  WorkspaceError,
} = require('../src/workspace');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) out._.push(a);
    else {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[k] = v;
    }
  }
  return out;
}

function print(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

const USAGE = [
  'Usage: trained-engineering <command> [options]',
  '',
  '  prepare-task --repo <path> --task <text> [--max-results 24] [--no-index]',
  '',
  '  workspace-spawn --root <dir> --source-checkout <git-repo> --base-revision <sha>',
  '                  --principal <id> --host <id> --repo-id <id> --root-task-id <id> --idempotency-key <key>',
  '                  [--profile cli] [--allow-fetch]',
  '  workspace-status --root <dir> --workspace-id <id> [--principal <id>] [--root-task-id <id>] [--host <id>]',
  '  workspace-release --root <dir> --workspace-id <id> --principal <id> --root-task-id <id>',
  '                    [--host <id>] [--processes-stopped] [--force] [--delivery-merged]',
  '  workspace-reconcile --root <dir>',
].join('\n');

const a = args(process.argv.slice(2));
const command = a._[0];

function boolFlag(value) {
  return value === undefined ? undefined : value !== 'false';
}

try {
  if (command === 'prepare-task') {
    const packet = prepareTask({
      repoPath: a.repo,
      task: a.task,
      preferIndex: !a['no-index'],
      maxResults: Number(a['max-results'] || 24),
    });
    print(packet);
  } else if (command === 'workspace-spawn') {
    print(spawnWorkspace({
      workspaceRoot: a.root,
      sourceCheckout: a['source-checkout'],
      baseRevision: a['base-revision'],
      principal: a.principal,
      hostId: a.host,
      repositoryId: a['repo-id'],
      rootTaskId: a['root-task-id'],
      idempotencyKey: a['idempotency-key'],
      workspaceProfile: a.profile || 'cli',
      allowFetch: Boolean(a['allow-fetch']),
    }));
  } else if (command === 'workspace-status') {
    print(statusWorkspace({
      workspaceRoot: a.root,
      workspaceId: a['workspace-id'],
      principal: a.principal,
      rootTaskId: a['root-task-id'],
      hostId: a.host,
    }));
  } else if (command === 'workspace-release') {
    print(releaseWorkspace({
      workspaceRoot: a.root,
      workspaceId: a['workspace-id'],
      principal: a.principal,
      rootTaskId: a['root-task-id'],
      hostId: a.host,
      processesStopped: boolFlag(a['processes-stopped']) !== false,
      force: Boolean(a.force),
      deliveryEvidence: a['delivery-merged'] ? { merged: true, evidence: a['delivery-evidence'] || 'cli' } : null,
    }));
  } else if (command === 'workspace-reconcile') {
    print(reconcileWorkspaces({ workspaceRoot: a.root }));
  } else {
    console.error(USAGE);
    process.exit(2);
  }
} catch (e) {
  if (e instanceof WorkspaceError) {
    print({ error: e.code, message: e.message, details: e.details });
    process.exit(1);
  }
  console.error(e.message);
  process.exit(1);
}
