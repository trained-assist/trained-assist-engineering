'use strict';

// Deterministic identity of the deployable artifact for this skill source: the
// provider manifest plus the shipped MCP server code under src/. Used by the L1
// contract test to recompute `artifactDigest`, and by scripts/build-mcp-manifest.js
// to materialize mcp.manifest.json. No production dependency, no network.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const INCLUDED = ['provider-manifest.json', 'src'];
const MANIFEST_PATH = 'provider-manifest.json';
const ENTRYPOINT = 'src/mcp-skills/index.js';
const REPOSITORY = 'trained-assist/trained-assist-engineering';

function walk(root, rel) {
  const abs = path.join(root, rel);
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [rel];
  const out = [];
  for (const name of fs.readdirSync(abs).sort()) out.push(...walk(root, path.posix.join(rel, name)));
  return out;
}

function artifactFiles(root = REPO_ROOT) {
  const files = [];
  for (const entry of INCLUDED) files.push(...walk(root, entry));
  return [...new Set(files)].sort();
}

function artifactDigest(root = REPO_ROOT) {
  const hash = crypto.createHash('sha256');
  for (const rel of artifactFiles(root)) {
    const bytes = fs.readFileSync(path.join(root, rel));
    hash.update(JSON.stringify([rel, bytes.length]));
    hash.update(bytes);
  }
  return hash.digest('hex');
}

function buildSource({ revision, root = REPO_ROOT } = {}) {
  const approvedManifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), 'utf8'));
  return {
    id: 'engineering',
    providerId: approvedManifest.providerId,
    mcpServerId: 'engineering',
    repository: REPOSITORY,
    revision,
    manifestVersion: approvedManifest.version,
    artifactDir: '.',
    entrypoint: ENTRYPOINT,
    manifest: MANIFEST_PATH,
    artifactDigest: artifactDigest(root),
    approvedManifest,
    enabled: true,
    profiles: ['engineering'],
  };
}

function buildConfig({ revision, root = REPO_ROOT } = {}) {
  return { version: 1, sources: [buildSource({ revision, root })] };
}

module.exports = { REPO_ROOT, MANIFEST_PATH, ENTRYPOINT, REPOSITORY, artifactFiles, artifactDigest, buildSource, buildConfig };
