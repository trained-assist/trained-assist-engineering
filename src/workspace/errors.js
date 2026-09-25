'use strict';

class WorkspaceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new WorkspaceError(code, message, details);
}

module.exports = { WorkspaceError, fail };
