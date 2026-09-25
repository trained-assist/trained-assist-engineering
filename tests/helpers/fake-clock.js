'use strict';

// Fake timers for the replay gate: `delay_after_sec` is exercised against a
// clock we control, never wall time.

function createFakeClock(startMs = Date.parse('2026-01-01T00:00:00Z')) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms) => { now += ms; return now; },
    set: (ms) => { now = ms; return now; },
  };
}

module.exports = { createFakeClock };
