'use strict';

/**
 * Transport-neutral credential broker port.
 *
 * ZeroCreds is the intended first implementation. The core engineering layer
 * asks for logical capabilities and receives an opaque binding/reference.
 * Raw credentials must not be returned to coding-model prompts.
 */
class CredentialBroker {
  async requestCredential(_request) {
    throw new Error('CredentialBroker.requestCredential adapter is not configured');
  }

  async probeCapabilities(_binding, _request) {
    throw new Error('CredentialBroker.probeCapabilities adapter is not configured');
  }
}

module.exports = { CredentialBroker };
