'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fail } = require('./errors');

// Slice 1 of the pr-autofix service: a per-profile registration store and state
// machine. Registrations are *capability records* keyed by (profileId, repo) —
// they describe what autofix is allowed to run and its lifecycle state. They
// never carry raw credentials: secrets live in ZeroCreds / the target repo's
// Actions secrets (docs/PR-AUTOFIX-SERVICE.md §1-§2). This module performs no
// external writes (no workflow install, no secret delivery); those are later
// slices.
//
// Layout: <root>/<profileId>.json with { schemaVersion, profileId, registrations }.
// Root defaults to ~/agent-data/pr-autofix and is overridable per host with
// ENGINEERING_PR_AUTOFIX_ROOT (used by the MCP tools and by hermetic tests).

const SCHEMA_VERSION = 1;

const STATUSES = ['registered', 'credentials_bound', 'workflow_installed', 'active', 'disabled', 'error'];

const RECORD_FIELDS = ['repo', 'base_branch', 'features', 'autofix_ref', 'capabilities', 'status', 'created_at', 'updated_at'];

const FEATURES = ['fix', 'cleanup', 'batch'];

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization)\b\s*[:=]\s*\S{6,}/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
];

function defaultRoot() {
  return path.join(os.homedir(), 'agent-data', 'pr-autofix');
}

function sanitizeProfile(profileId) {
  const cleaned = String(profileId || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  if (!cleaned || cleaned === '.' || cleaned === '..') fail('INVALID_PROFILE', `invalid profileId: ${profileId}`);
  return cleaned;
}

function registrationFile({ profileId, root } = {}) {
  return path.join(root || defaultRoot(), `${sanitizeProfile(profileId)}.json`);
}

function emptyRegistry(profileId) {
  return { schemaVersion: SCHEMA_VERSION, profileId: sanitizeProfile(profileId), registrations: [] };
}

function readRegistry(file, profileId) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return emptyRegistry(profileId);
    throw e;
  }
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.registrations)) return emptyRegistry(profileId);
    return data;
  } catch {
    fail('CORRUPT_REGISTRY', `corrupt pr-autofix registry: ${file}`);
  }
}

function writeRegistry(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function assertString(value, label, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    fail('INVALID_REGISTRATION', `${label} is required`);
  }
  if (typeof value !== 'string') fail('INVALID_REGISTRATION', `${label} must be a string`);
  const trimmed = value.trim();
  if (required && !trimmed) fail('INVALID_REGISTRATION', `${label} must not be blank`);
  return trimmed;
}

function normalizeRepo(repo) {
  const value = assertString(repo, 'repo');
  if (!/^[^/\s]+\/[^/\s]+$/.test(value)) fail('INVALID_REGISTRATION', 'repo must be in "owner/name" form');
  return value;
}

function normalizeFeatures(features) {
  const input = features && typeof features === 'object' && !Array.isArray(features) ? features : {};
  const out = {};
  for (const key of FEATURES) out[key] = input[key] === undefined || input[key] === null ? false : Boolean(input[key]);
  return out;
}

function normalizeCapabilities(capabilities) {
  if (capabilities === undefined || capabilities === null) return {};
  const out = {};
  if (Array.isArray(capabilities)) {
    for (const item of capabilities) out[assertString(item, 'capabilities[]')] = 'recorded';
    return out;
  }
  if (typeof capabilities !== 'object') fail('INVALID_REGISTRATION', 'capabilities must be an object or an array of strings');
  for (const key of Object.keys(capabilities)) {
    const name = assertString(key, 'capabilities key');
    const value = capabilities[key];
    const type = typeof value;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      fail('INVALID_REGISTRATION', `capabilities.${key} must be a scalar capability description`);
    }
    out[name] = assertString(String(value), `capabilities.${key}`);
  }
  return out;
}

function collectStrings(value, key, out) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') out.push(`${key}=${value}`);
  else if (Array.isArray(value)) value.forEach((item, i) => collectStrings(item, `${key}[${i}]`, out));
  else if (typeof value === 'object') for (const k of Object.keys(value)) collectStrings(value[k], k, out);
}

function assertNoCredentialMaterial(record) {
  const values = [];
  collectStrings(record, 'registration', values);
  for (const value of values) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        fail('CREDENTIAL_REJECTED', 'pr-autofix registrations record capabilities only; raw secrets/credentials are never stored');
      }
    }
  }
}

function buildRecord(input) {
  const record = {
    repo: normalizeRepo(input.repo),
    base_branch: input.base_branch === undefined || input.base_branch === null || input.base_branch === ''
      ? 'main'
      : assertString(input.base_branch, 'base_branch'),
    features: normalizeFeatures(input.features),
    autofix_ref: input.autofix_ref === undefined || input.autofix_ref === null || input.autofix_ref === ''
      ? 'v1'
      : assertString(input.autofix_ref, 'autofix_ref'),
    capabilities: normalizeCapabilities(input.capabilities),
  };
  assertNoCredentialMaterial(record);
  return record;
}

function bumpTimestamp(previous) {
  const now = Date.now();
  const prev = Date.parse(previous);
  const ms = Number.isFinite(prev) && now <= prev ? prev + 1 : now;
  return new Date(ms).toISOString();
}

function byRepo(a, b) {
  return a.repo.localeCompare(b.repo);
}

function registerAutofix({ profileId, root, registration } = {}) {
  if (!profileId) fail('INVALID_PROFILE', 'profileId is required');
  if (!registration || typeof registration !== 'object') fail('INVALID_REGISTRATION', 'registration is required');
  const file = registrationFile({ profileId, root });
  const data = readRegistry(file, profileId);
  const next = buildRecord(registration);
  const existing = data.registrations.find((entry) => entry.repo === next.repo);
  if (existing) {
    Object.assign(existing, next, {
      status: existing.status,
      created_at: existing.created_at,
      updated_at: bumpTimestamp(existing.updated_at),
    });
    writeRegistry(file, data);
    return { profileId: data.profileId, registration: existing, created: false };
  }
  const now = new Date().toISOString();
  const record = { ...next, status: 'registered', created_at: now, updated_at: now };
  data.registrations.push(record);
  data.registrations.sort(byRepo);
  writeRegistry(file, data);
  return { profileId: data.profileId, registration: record, created: true };
}

function statusAutofix({ profileId, root, repo } = {}) {
  if (!profileId) fail('INVALID_PROFILE', 'profileId is required');
  const data = readRegistry(registrationFile({ profileId, root }), profileId);
  if (repo !== undefined && repo !== null && repo !== '') {
    const wanted = normalizeRepo(repo);
    const registration = data.registrations.find((entry) => entry.repo === wanted) || null;
    return {
      profileId: data.profileId,
      count: registration ? 1 : 0,
      registrations: registration ? [registration] : [],
    };
  }
  const registrations = [...data.registrations].sort(byRepo);
  return { profileId: data.profileId, count: registrations.length, registrations };
}

function disableAutofix({ profileId, root, repo } = {}) {
  if (!profileId) fail('INVALID_PROFILE', 'profileId is required');
  const wanted = normalizeRepo(repo);
  const file = registrationFile({ profileId, root });
  const data = readRegistry(file, profileId);
  const record = data.registrations.find((entry) => entry.repo === wanted);
  if (!record) fail('NOT_FOUND', `no pr-autofix registration for ${wanted}`);
  const changed = record.status !== 'disabled';
  record.status = 'disabled';
  record.updated_at = bumpTimestamp(record.updated_at);
  writeRegistry(file, data);
  return { profileId: data.profileId, registration: record, changed };
}

module.exports = {
  SCHEMA_VERSION,
  STATUSES,
  RECORD_FIELDS,
  defaultRoot,
  registrationFile,
  registerAutofix,
  statusAutofix,
  disableAutofix,
};
