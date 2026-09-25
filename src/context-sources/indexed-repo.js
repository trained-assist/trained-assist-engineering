'use strict';

const fs = require('fs');
const path = require('path');

function indexRoot(repoPath) {
  return path.join(repoPath, '.engineering', 'index');
}

function canUseIndex(repoPath) {
  const root = indexRoot(repoPath);
  return fs.existsSync(path.join(root, 'revision.json'));
}

function discoverIndexedContext() {
  // Deliberately not implemented in v0.2.
  // The adapter exists now so prepare_task's public contract does not change
  // when the nightly/incremental repository indexer arrives.
  throw new Error('indexed repository context source is not implemented yet');
}

module.exports = { canUseIndex, discoverIndexedContext, indexRoot };
