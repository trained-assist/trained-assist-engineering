'use strict';

const { registerAutofix, statusAutofix, disableAutofix } = require('../../pr-autofix');

// `profileId` is host-derived identity (USER_ID), never a tool-call argument —
// same rule as the workspace and qa-log tools, so an argument cannot redirect
// the registry to another profile. Root is optional host config for hermetic
// tests (ENGINEERING_PR_AUTOFIX_ROOT).
function context() {
  return {
    profileId: process.env.USER_ID || '',
    root: process.env.ENGINEERING_PR_AUTOFIX_ROOT || undefined,
  };
}

const register = {
  name: 'engineering_pr_autofix_register',
  description: 'Register a repository for the pr-autofix service: records base branch, enabled features (fix/cleanup/batch), the pinned pr-autofix ref and capability records. Idempotent upsert keyed by repo; it never stores credentials and never auto-enables autofix. This slice writes local engineering state only (no workflow install, no secret delivery); a later external-write slice will require approval.',
  inputSchema: {
    type: 'object',
    required: ['repo'],
    properties: {
      repo: { type: 'string', description: 'Target repository in "owner/name" form.' },
      base_branch: { type: 'string', description: 'Branch autofix works against. Defaults to "main".' },
      features: {
        type: 'object',
        properties: {
          fix: { type: 'boolean' },
          cleanup: { type: 'boolean' },
          batch: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      autofix_ref: { type: 'string', description: 'Pinned pr-autofix revision/tag. Defaults to "v1".' },
      capabilities: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Requested capabilities as name -> description (capability records only, never secrets).',
      },
    },
  },
  handler: async ({ repo, base_branch, features, autofix_ref, capabilities } = {}) => {
    const { profileId, root } = context();
    return registerAutofix({ profileId, root, registration: { repo, base_branch, features, autofix_ref, capabilities } });
  },
};

const status = {
  name: 'engineering_pr_autofix_status',
  description: 'Report pr-autofix registrations for the current profile and their lifecycle state, without mutating anything. Pass repo to narrow to one registration; omit it to list all.',
  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      repo: { type: 'string', description: 'Optional "owner/name" to report a single registration.' },
    },
  },
  handler: async ({ repo } = {}) => {
    const { profileId, root } = context();
    return statusAutofix({ profileId, root, repo });
  },
};

const disable = {
  name: 'engineering_pr_autofix_disable',
  description: 'Disable pr-autofix for a registered repository (kill-switch): sets its local state to disabled. Idempotent. This slice changes local state only; a later external-write slice that removes the installed workflow will require approval.',
  inputSchema: {
    type: 'object',
    required: ['repo'],
    properties: {
      repo: { type: 'string', description: 'Target repository in "owner/name" form.' },
    },
  },
  handler: async ({ repo } = {}) => {
    const { profileId, root } = context();
    return disableAutofix({ profileId, root, repo });
  },
};

module.exports = [register, status, disable];
