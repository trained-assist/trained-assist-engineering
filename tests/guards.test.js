'use strict';

// L3 — Guards: static mirror of the core CI gates. Cheap tripwires that fail
// the build if a forbidden pattern re-enters src/ or the test harness. They do
// not replace L1/L2; they stop regressions the behavioral layers might not see.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile() && abs.endsWith('.js')) out.push(abs);
  }
  return out;
}

const sourceFiles = walk(SRC);
const source = sourceFiles.map((file) => ({ file, rel: path.relative(ROOT, file), text: fs.readFileSync(file, 'utf8') }));

test('quick-action tools never spawn Claude / runner.js', () => {
  const banned = [/runner\.js/, /\bchild_process\b[^\n]*\bclaude\b/i, /\bclaude\b/i];
  for (const { rel, text } of source) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(text), `${rel} matches forbidden pattern ${pattern}`);
    }
  }
});

test('the only external binary src/ spawns is git', () => {
  const spawnCall = /(?:execFileSync|execFile|spawnSync|spawn)\s*\(\s*(['"`])([^'"`]+)\1/g;
  for (const { rel, text } of source) {
    for (const match of text.matchAll(spawnCall)) {
      assert.equal(match[2], 'git', `${rel} spawns "${match[2]}" — external binaries must go through the fake provider boundary`);
    }
  }
});

test('every outbound HTTP/fetch call declares a timeout', () => {
  const usesHttp = /(?:^|[^\w.])fetch\s*\(|https?\.request\s*\(/;
  for (const { rel, text } of source) {
    if (!usesHttp.test(text)) continue;
    assert.match(text, /AbortSignal\.timeout|timeout\s*:/, `${rel} performs outbound HTTP without a timeout`);
  }
});

test('credential-looking files are written with mode 0o600', () => {
  const writeCall = /(?:writeFileSync|writeFile)\s*\(([\s\S]{0,240}?)\)\s*;?/g;
  for (const { rel, text } of source) {
    for (const match of text.matchAll(writeCall)) {
      const call = match[1];
      const target = call.split(',')[0];
      if (!/token|secret|credential|password/i.test(target)) continue;
      assert.match(call, /mode\s*:\s*0o600/, `${rel} writes a credential file without mode 0o600`);
    }
  }
});

test('secrets are never logged', () => {
  const logCall = /console\.(?:log|error|warn|info)\s*\(([^\n]*)\)/g;
  for (const { rel, text } of source) {
    for (const match of text.matchAll(logCall)) {
      assert.ok(!/\b(token|secret|password|apiKey|api_key)\b/i.test(match[1]), `${rel} logs a secret-like value`);
    }
  }
});

test('profile paths go through the resolver, not hardcoded os.homedir()', () => {
  for (const { rel, text } of source) {
    if (rel === path.join('src', 'workspace', 'paths.js')) continue;
    assert.ok(!/os\.homedir\s*\(/.test(text), `${rel} hardcodes os.homedir() — use the paths resolver`);
  }
});

test('the test harness does not mock the MCP registry', () => {
  const harness = ['tests/helpers/mcp.js', 'tests/behavior.test.js', 'tests/contract.test.js']
    .map((rel) => path.join(ROOT, rel))
    .filter((file) => fs.existsSync(file));
  for (const file of harness) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/src\/mcp-skills\/registry/.test(text), `${path.relative(ROOT, file)} imports (and could mock) the registry`);
  }
});
