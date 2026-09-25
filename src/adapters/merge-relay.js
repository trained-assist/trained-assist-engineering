'use strict';

/**
 * Port for the independently deployed Merge Relay API.
 *
 * The concrete HTTP contract is intentionally not frozen yet. Engineering owns
 * policy/onboarding; Merge Relay owns queue mutation and GitHub-side execution.
 */
class MergeRelay {
  async registerRepository(_input) {
    throw new Error('MergeRelay.registerRepository adapter is not configured');
  }

  async getRepositoryState(_repository) {
    throw new Error('MergeRelay.getRepositoryState adapter is not configured');
  }

  async advanceQueue(_repository) {
    throw new Error('MergeRelay.advanceQueue adapter is not configured');
  }

  async getBlocker(_repository, _pr) {
    throw new Error('MergeRelay.getBlocker adapter is not configured');
  }
}

module.exports = { MergeRelay };
