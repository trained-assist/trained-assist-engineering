'use strict';

const prepare = require('./tools/10-prepare-task');
const workspace = require('./tools/20-workspace');
const tools = [prepare, ...workspace];

function listTools() {
  return tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

async function callTool(name, args) {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(args || {});
}

module.exports = { listTools, callTool };
