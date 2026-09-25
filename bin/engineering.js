#!/usr/bin/env node
'use strict';

const { prepareTask } = require('../src/prepare-task');

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

const a = args(process.argv.slice(2));
const command = a._[0];
if (command !== 'prepare-task') {
  console.error('Usage: trained-engineering prepare-task --repo <path> --task <text> [--max-results 24] [--no-index]');
  process.exit(2);
}

try {
  const packet = prepareTask({
    repoPath: a.repo,
    task: a.task,
    preferIndex: !a['no-index'],
    maxResults: Number(a['max-results'] || 24),
  });
  process.stdout.write(JSON.stringify(packet, null, 2) + '\n');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
