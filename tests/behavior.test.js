'use strict';

// L2 — Behavior layer (hermetic: real server subprocess + fixtures).
// Every tool in mcp.manifest.json has a fixture {name, validArgs, expectedEnvelope}
// and is driven through tools/call over stdio. Handlers are never called in-process.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startMcp } = require('./helpers/mcp');
const { mkdir, makeRemote, makeRepo } = require('./helpers/repos');

const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/tools.json'), 'utf8')).tools;

const cleanup = [];
test.after(() => {
  for (const dir of cleanup) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
});

function substitute(args, vars) {
  const out = {};
  for (const [key, value] of Object.entries(args)) out[key] = typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, n) => vars[n]) : value;
  return out;
}

test('each tool has a fixture and returns a valid MCP envelope', async (t) => {
  const workspaceRoot = mkdir('eng-ws-');
  const mirrorsRoot = mkdir('eng-mirrors-');
  cleanup.push(workspaceRoot, mirrorsRoot);
  const mcp = await startMcp({ env: { ENGINEERING_WORKSPACE_ROOT: workspaceRoot, ENGINEERING_MIRRORS_ROOT: mirrorsRoot } });

  try {
    const vars = {};
    const spawned = {};
    for (const fixture of fixtures) {
      if (fixture.setup === 'repo' && !vars.repoPath) vars.repoPath = makeRepo();
      if (fixture.setup === 'remote' && !vars.remoteUrl) vars.remoteUrl = makeRemote();
      if (fixture.setup === 'remote') cleanup.push(vars.remoteUrl);

      const args = substitute(fixture.args, vars);
      const result = await mcp.call('tools/call', { name: fixture.name, arguments: args });

      assert.ok(result && Array.isArray(result.content), `${fixture.name}: envelope must have content[]`);
      assert.ok(!result.isError, `${fixture.name}: unexpected isError: ${result.content[0].text}`);
      assert.equal(result.content[0].type, 'text');

      const value = JSON.parse(result.content[0].text);
      for (const [key, expected] of Object.entries(fixture.expect || {})) {
        assert.equal(value[key], expected, `${fixture.name}: expected ${key}=${expected}`);
      }
      if (fixture.name === 'engineering_spawn_workspace') spawned.codePath = value.codePath;
      if (fixture.dependsOn === 'engineering_spawn_workspace') {
        assert.ok(spawned.codePath, 'status is asserted before spawn');
      }
    }

    // Every manifest tool was actually exercised with a fixture.
    const { tools } = await mcp.call('tools/list');
    const covered = new Set(fixtures.map((f) => f.name));
    for (const tool of tools) assert.ok(covered.has(tool.name), `no fixture for tool ${tool.name}`);
  } finally {
    await mcp.stop();
  }
});

test('a failing tool call is an isError result, not a process crash', async () => {
  const workspaceRoot = mkdir('eng-ws-');
  const mirrorsRoot = mkdir('eng-mirrors-');
  cleanup.push(workspaceRoot, mirrorsRoot);
  const mcp = await startMcp({ env: { ENGINEERING_WORKSPACE_ROOT: workspaceRoot, ENGINEERING_MIRRORS_ROOT: mirrorsRoot } });

  try {
    const bad = await mcp.call('tools/call', { name: 'engineering_spawn_workspace', arguments: { root_task_id: 'no-url' } });
    assert.equal(bad.isError, true, 'missing repository_url must surface as isError');
    assert.match(bad.content[0].text, /repositoryUrl|repository_url|INVALID_BINDING/);

    const unknown = await mcp.call('tools/call', { name: 'engineering_nope', arguments: {} });
    assert.equal(unknown.isError, true, 'unknown tool must surface as isError');

    const alive = await mcp.call('tools/list');
    assert.ok(Array.isArray(alive.tools), 'server must stay alive after a failed call');
    assert.equal(mcp.exited, null);
  } finally {
    await mcp.stop();
  }
});
