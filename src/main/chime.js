'use strict';

const EventEmitter = require('node:events');

/**
 * Timings lifted from how a real Black Forest striking train behaves. The bird
 * is shoved out by the same lever that squeezes the bellows, so the door and
 * the first note are nearly simultaneous, and the gong hammer falls in the gap
 * between calls rather than on top of them.
 */
const T = {
  doorOpen: 0,
  firstCall: 340,     // door swings, then the bird arrives
  callInterval: 1700, // one cuck-oo per bellows cycle
  gongOffset: 830,    // hammer falls between two calls
  birdOut: 520,       // how long the bird stays proud of the door
  doorClose: 900,     // after the last call finishes
  beforeMusic: 700,
  musicMs: 14_000,
};

/**
 * Runs one strike sequence as a chain of timers, emitting an event at each
 * moment the renderer needs to do something. Only one sequence runs at a time:
 * asking for another cancels the first, which is also what happens if you shove
 * the hands round a real clock while it is mid strike.
 */
class ChimeSequencer extends EventEmitter {
  constructor() {
    super();
    this.timers = [];
    this.active = null;
  }

  get busy() {
    return this.active !== null;
  }

  at(ms, fn) {
    const t = setTimeout(fn, ms);
    t.unref?.();
    this.timers.push(t);
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /**
   * @param {object} strike from Movement's `strike` event
   * @returns {boolean} whether the bird actually came out
   */
  run(strike) {
    this.cancel();

    if (strike.silencedBy) {
      // The door stays shut. Tell the renderer why so it can show the latch or
      // the night lever reacting instead of just doing nothing.
      this.emit('event', {
        type: 'chime:blocked',
        reason: strike.silencedBy,
        kind: strike.kind,
        calls: strike.calls,
      });
      return false;
    }

    const { calls, kind, gong, music, hour24 } = strike;
    this.active = { kind, calls };

    this.emit('event', { type: 'chime:start', kind, calls, gong, music, hour24 });
    this.at(T.doorOpen, () => this.emit('event', { type: 'door:open' }));

    for (let i = 0; i < calls; i += 1) {
      const callAt = T.firstCall + i * T.callInterval;
      this.at(callAt, () => {
        this.emit('event', { type: 'cuckoo', index: i + 1, total: calls });
      });
      this.at(callAt + T.birdOut, () => {
        this.emit('event', { type: 'bird:in', index: i + 1, total: calls });
      });
      // The gong keeps time with the bird but sits in the gap, and there is no
      // hammer fall after the final call: the train has already locked.
      if (gong && i < calls - 1) {
        this.at(callAt + T.gongOffset, () => {
          this.emit('event', { type: 'gong', index: i + 1, total: calls });
        });
      }
    }

    const lastCallEnds = T.firstCall + (calls - 1) * T.callInterval + T.birdOut;
    const closeAt = lastCallEnds + T.doorClose;
    this.at(closeAt, () => this.emit('event', { type: 'door:close' }));

    if (music) {
      const musicAt = closeAt + T.beforeMusic;
      this.at(musicAt, () => this.emit('event', { type: 'music:start' }));
      this.at(musicAt + T.musicMs, () => {
        this.emit('event', { type: 'music:end' });
        this.finish();
      });
    } else {
      this.at(closeAt + 400, () => this.finish());
    }

    return true;
  }

  finish() {
    const was = this.active;
    this.clearTimers();
    this.active = null;
    this.emit('event', { type: 'chime:end', kind: was?.kind ?? 'hour' });
  }

  /** Slam the door and stop, used when latching mid strike or on quit. */
  cancel() {
    if (!this.active) {
      this.clearTimers();
      return;
    }
    this.clearTimers();
    this.active = null;
    this.emit('event', { type: 'door:close' });
    this.emit('event', { type: 'music:end' });
    this.emit('event', { type: 'chime:end', aborted: true });
  }

  destroy() {
    this.clearTimers();
    this.active = null;
    this.removeAllListeners();
  }
}

module.exports = { ChimeSequencer, CHIME_TIMINGS: T };
