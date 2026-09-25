'use strict';

const { prepareTask } = require('../../prepare-task');

module.exports = {
  name: 'engineering_prepare_task',
  description: 'Prepare a compact engineering Task Packet from a local repository before an expensive coding model starts. Works without a repository index and will transparently prefer an index when available.',
  inputSchema: {
    type: 'object',
    required: ['repo_path', 'task'],
    properties: {
      repo_path: { type: 'string', description: 'Absolute or working-directory-relative path to the target repository checkout.' },
      task: { type: 'string', description: 'Issue/task/problem statement to prepare context for.' },
      prefer_index: { type: 'boolean', description: 'Prefer the repository index when available. Defaults to true.' },
      max_results: { type: 'number', description: 'Maximum number of likely files/search results to include. Defaults to 24.' }
    }
  },
  handler: async ({ repo_path, task, prefer_index = true, max_results = 24 }) => prepareTask({
    repoPath: repo_path,
    task,
    preferIndex: prefer_index,
    maxResults: max_results,
  }),
};
