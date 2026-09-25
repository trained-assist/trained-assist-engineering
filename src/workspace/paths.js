'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fail } = require('./errors');

// Single resolver for host/profile-derived data paths. Everything else must go
// through here (or an explicit host override) instead of hardcoding os.homedir(),
// so a host can relocate all state and tests stay hermetic.
function agentDataDir() {
  return process.env.AGENT_DATA_DIR || path.join(os.homedir(), 'agent-data');
}

function agentDataPath(...segments) {
  return path.join(agentDataDir(), ...segments);
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function realpathOrNull(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

function assertAbsolute(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('INVALID_BINDING', `${label} is required`);
  if (value.includes('\0')) fail('INVALID_BINDING', `${label} contains a null byte`);
  if (!path.isAbsolute(value)) fail('INVALID_BINDING', `${label} must be an absolute resolved path`);
}

function assertContained(root, target, label = 'path') {
  const rootReal = realpathOrNull(root);
  if (!rootReal) fail('INVALID_BINDING', `workspace root does not exist: ${root}`);
  const targetAbs = path.resolve(target);
  if (!isInside(rootReal, targetAbs)) {
    fail('PATH_ESCAPE', `${label} escapes the workspace root`, { root: rootReal, target: targetAbs });
  }
  let cursor = targetAbs;
  for (;;) {
    if (fs.existsSync(cursor)) {
      const real = realpathOrNull(cursor);
      if (real && !isInside(rootReal, real)) {
        fail('PATH_ESCAPE', `${label} resolves outside the workspace root via symlink`, { root: rootReal, target: cursor, real });
      }
    }
    if (cursor === rootReal) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
    if (!isInside(rootReal, cursor)) break;
  }
}

function sanitizeSegment(value) {
  const cleaned = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  if (!cleaned || cleaned === '.' || cleaned === '..') fail('INVALID_BINDING', `invalid path segment: ${value}`);
  return cleaned;
}

module.exports = { isInside, realpathOrNull, assertAbsolute, assertContained, sanitizeSegment, agentDataDir, agentDataPath };
