'use strict';

const path = require('path');
const { discoverRawContext, repoState } = require('./context-sources/raw-repo');
const { canUseIndex, discoverIndexedContext } = require('./context-sources/indexed-repo');

function prepareTask({ repoPath, task, preferIndex = true, maxResults = 24 }) {
  if (!repoPath) throw new Error('repoPath is required');
  if (!task || !String(task).trim()) throw new Error('task is required');

  const abs = path.resolve(repoPath);
  let context;
  let source = 'raw-repo';

  if (preferIndex && canUseIndex(abs)) {
    try {
      context = discoverIndexedContext({ repoPath: abs, task, maxResults });
      source = 'indexed-repo';
    } catch {
      context = discoverRawContext({ repoPath: abs, task, maxResults });
      source = 'raw-repo';
    }
  } else {
    context = discoverRawContext({ repoPath: abs, task, maxResults });
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    task: String(task).trim(),
    repository: { path: abs, ...repoState(abs) },
    source,
    context,
    hints: {
      nextStep: 'Give this Task Packet to the implementation agent before broad repository exploration.',
      indexStatus: source === 'indexed-repo' ? 'used' : 'not-used',
    },
  };
}

module.exports = { prepareTask };
