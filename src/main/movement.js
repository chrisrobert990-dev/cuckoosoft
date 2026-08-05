'use strict';

const EventEmitter = require('node:events');

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Half period of the pendulum, in ms, at the two extremes of the regulating leaf. */
const BEAT_FAST_MS = 380;   // leaf at the top of the rod
const BEAT_SLOW_MS = 640;   // leaf at the bottom

/** How far off a full day the movement runs when the leaf is fully up or down. */
const MAX_DRIFT_PER_DAY_MS = 150_000;

/** Fraction of the strike weight consumed by one cuckoo call, and by one music play. */
const STRIKE_COST_PER_CALL = 1 / 200;
const MUSIC_COST_PER_PLAY = 1 / 40;

/** A chime that we discover more than this late (usually after a laptop sleep) is skipped. */
const MISSED_CHIME_GRACE_MS = 75_000;

function parseHm(value, fallbackMinutes) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''));
  if (!m) return fallbackMinutes;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * The going train: it owns what time the hands show, whether the pendulum is
 * swinging, how much weight is left on each chain, and when the clock is due
 * to strike. It does not make any sound itself; it emits `strike` and lets the
 * chime sequencer take over.
 */
class Movement extends EventEmitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.timer = null;
    this.stopped = false;

    // Weight remaining on each chain, 1 = freshly wound, 0 = pine cone on the floor.
    this.weights = { time: 1, strike: 1, music: 1 };
    this.lastDrain = Date.now();

    // Anchors the pendulum swing so the renderer can animate in phase with us.
    this.beatEpoch = Date.now();

    this.unsubscribe = settings.onChange((changed) => {
      if ('pendulumLeaf' in changed) {
        // Re-anchor so the swing changes speed without visually jumping.
        this.beatEpoch = Date.now();
        this.emit('sync', this.snapshot());
      }
      if ('pendulumRunning' in changed) {
        this.beatEpoch = Date.now();
        this.emit('sync', this.snapshot());
      }
      if ('handOffsetMs' in changed || 'autoWind' in changed) {
        this.emit('sync', this.snapshot());
        this.schedule();
      }
      if ('nightSilence' in changed || 'nightStart' in changed || 'nightEnd' in changed) {
        this.emit('sync', this.snapshot());
      }
    });
  }

  // --- Time --------------------------------------------------------------

  /** Wall clock plus whatever the hands have been set to, in ms. */
  displayedNow() {
    return Date.now() + this.settings.get('handOffsetMs');
  }

  /** Half period of the pendulum for the current leaf position. */
  beatMs() {
    const leaf = this.settings.get('pendulumLeaf');
    return Math.round(BEAT_FAST_MS + (BEAT_SLOW_MS - BEAT_FAST_MS) * leaf);
  }

  /** True while the going train has weight left to run on. */
  get running() {
    return this.settings.get('pendulumRunning') && (this.settings.get('autoWind') || this.weights.time > 0);
  }

  /** True while the striking train can still lift the bellows. */
  get canStrike() {
    return this.settings.get('autoWind') || this.weights.strike > 0;
  }

  get canPlayMusic() {
    return this.settings.get('autoWind') || this.weights.music > 0;
  }

  // --- Night shut off ----------------------------------------------------

  /**
   * Real clocks have a lever that trips a shutter over the bellows overnight.
   * Windows that wrap past midnight (the normal case) are handled by testing
   * "after start OR before end" instead of a simple range.
   */
  isNightSilenced(at = this.displayedNow()) {
    if (!this.settings.get('nightSilence')) return false;
    const d = new Date(at);
    const minutes = d.getHours() * 60 + d.getMinutes();
    const start = parseHm(this.settings.get('nightStart'), 22 * 60);
    const end = parseHm(this.settings.get('nightEnd'), 7 * 60 + 30);
    if (start === end) return false;
    return start < end
      ? minutes >= start && minutes < end
      : minutes >= start || minutes < end;
  }

  /** Everything that would stop the bird coming out, in the order a user would notice it. */
  silenceReason(at = this.displayedNow()) {
    if (this.settings.get('silent')) return 'silent';
    if (this.settings.get('latched')) return 'latched';
    if (this.isNightSilenced(at)) return 'night';
    if (!this.canStrike) return 'unwound';
    return null;
  }

  // --- Weights -----------------------------------------------------------

  /** Lets the chains down by however much real time has passed since the last call. */
  drainWeights() {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.lastDrain);
    this.lastDrain = now;
    if (!elapsed) return;

    const runtimeMs = Math.max(1, this.settings.get('runtimeHours')) * HOUR;
    const before = { ...this.weights };

    if (this.settings.get('pendulumRunning')) {
      this.weights.time = Math.max(0, this.weights.time - elapsed / runtimeMs);
    }

    if (this.settings.get('autoWind')) {
      // The clock quietly winds itself back up as each chain reaches the floor,
      // so the weights still visibly travel but the movement never stops.
      for (const train of ['time', 'strike', 'music']) {
        if (this.weights[train] <= 0.02) this.weights[train] = 1;
      }
    } else if (before.time > 0 && this.weights.time === 0) {
      // The going train just ran out. The pendulum coasts to a halt.
      this.emit('stopped');
    }

    const moved = ['time', 'strike', 'music'].some(
      (t) => Math.abs(before[t] - this.weights[t]) > 0.0005,
    );
    if (moved) this.emit('weights', { ...this.weights });
  }

  /** Pull a chain. Returns true if there was anything to wind. */
  wind(train = 'time') {
    const key = ['time', 'strike', 'music'].includes(train) ? train : 'time';
    if (this.weights[key] >= 0.999) return false;
    this.weights[key] = 1;
    this.emit('weights', { ...this.weights });
    this.emit('wound', key);
    if (key === 'time' && this.settings.get('pendulumRunning')) {
      this.beatEpoch = Date.now();
      this.emit('sync', this.snapshot());
      this.schedule();
    }
    return true;
  }

  windAll() {
    let any = false;
    for (const train of ['time', 'strike', 'music']) any = this.wind(train) || any;
    return any;
  }

  spendStrike(calls) {
    if (this.settings.get('autoWind')) return;
    this.weights.strike = Math.max(0, this.weights.strike - calls * STRIKE_COST_PER_CALL);
    this.emit('weights', { ...this.weights });
  }

  spendMusic() {
    if (this.settings.get('autoWind')) return;
    this.weights.music = Math.max(0, this.weights.music - MUSIC_COST_PER_PLAY);
    this.emit('weights', { ...this.weights });
  }

  // --- Hands -------------------------------------------------------------

  /** Move the hands to a wall clock hour and minute, the way you would by hand. */
  setHands(hours, minutes) {
    const target = new Date();
    target.setHours(Number(hours) || 0, Number(minutes) || 0, 0, 0);
    let offset = target.getTime() - Date.now();
    // Choose the representation nearest zero so setting 11:59 at 12:01 does not
    // record an eleven hour, fifty eight minute offset.
    while (offset > 6 * HOUR) offset -= 12 * HOUR;
    while (offset < -6 * HOUR) offset += 12 * HOUR;
    this.settings.set({ handOffsetMs: offset });
    return offset;
  }

  /** Put the hands back on the system clock. */
  resetHands() {
    this.settings.set({ handOffsetMs: 0 });
  }

  // --- Drift -------------------------------------------------------------

  /**
   * With authentic drift on, the leaf position slowly gains or loses time,
   * exactly like a real pendulum that needs regulating. Called once a minute.
   */
  applyDrift(elapsedMs) {
    if (!this.settings.get('authenticDrift') || !this.running) return;
    const leaf = this.settings.get('pendulumLeaf');
    // Leaf up shortens the pendulum and gains time, leaf down loses it.
    const perDay = (0.5 - leaf) * 2 * MAX_DRIFT_PER_DAY_MS;
    const delta = (perDay * elapsedMs) / (24 * HOUR);
    if (Math.abs(delta) < 1) return;
    this.settings.set({ handOffsetMs: this.settings.get('handOffsetMs') + delta });
  }

  // --- Strike scheduling -------------------------------------------------

  /**
   * The next quarter-hour boundary (:00, :15, :30, :45) strictly after `from`,
   * in displayed time. Scheduling always works in quarters regardless of which
   * of those the user actually has switched on: `fire()` is what decides
   * whether a given boundary is worth ringing for.
   */
  nextBoundary(from = this.displayedNow()) {
    const d = new Date(from);
    const at = new Date(d);
    at.setSeconds(0, 0);
    const nextQuarter = Math.floor(d.getMinutes() / 15) * 15 + 15;
    if (nextQuarter >= 60) {
      at.setMinutes(0);
      at.setTime(at.getTime() + HOUR);
    } else {
      at.setMinutes(nextQuarter);
    }
    return at.getTime();
  }

  /**
   * Arms a timer for the next boundary. Deliberately re-arms in chunks of at
   * most a minute: a laptop that sleeps through a long setTimeout wakes up with
   * a wildly late timer, and short hops let us notice and resync instead.
   */
  schedule() {
    clearTimeout(this.timer);
    if (this.stopped) return;

    const now = this.displayedNow();
    const target = this.pendingBoundary && this.pendingBoundary > now - MISSED_CHIME_GRACE_MS
      ? this.pendingBoundary
      : this.nextBoundary(now);
    this.pendingBoundary = target;

    const wait = Math.min(target - now, MINUTE);
    this.timer = setTimeout(() => this.onTimer(), Math.max(20, wait));
    this.timer.unref?.();
  }

  onTimer() {
    if (this.stopped) return;
    const now = this.displayedNow();
    this.drainWeights();
    this.applyDrift(Date.now() - (this.lastDriftAt ?? Date.now()));
    this.lastDriftAt = Date.now();

    const target = this.pendingBoundary ?? this.nextBoundary(now);
    const lateBy = now - target;

    if (lateBy >= 0) {
      this.pendingBoundary = null;
      if (lateBy <= MISSED_CHIME_GRACE_MS) this.fire(target);
      // Otherwise the machine was asleep. A real clock would have struck to an
      // empty room; catching up with eleven chimes at once is not charming.
      this.pendingBoundary = this.nextBoundary(this.displayedNow());
    }

    this.emit('sync', this.snapshot());
    this.schedule();
  }

  /** Works out what the clock owes at this boundary and asks for it. */
  fire(at) {
    if (!this.running) return;

    const d = new Date(at);
    const minutes = d.getMinutes();
    const isHour = minutes === 0;
    const isHalf = minutes === 30;
    const isQuarter = minutes === 15 || minutes === 45;
    const hour24 = d.getHours();

    if (isHalf && !this.settings.get('halfHourCall')) return;
    if (isQuarter && !this.settings.get('quarterHourCall')) return;

    let calls;
    if (isHour) {
      calls = this.settings.get('strikeCount24h')
        ? (hour24 === 0 ? 24 : hour24)
        : (hour24 % 12 === 0 ? 12 : hour24 % 12);
    } else {
      calls = 1;
    }

    const reason = this.silenceReason(at);
    this.emit('strike', {
      at,
      kind: isHour ? 'hour' : isHalf ? 'half' : 'quarter',
      calls,
      hour24,
      gong: this.settings.get('gong'),
      // The music box has always been an hour (and optionally half-hour)
      // treat, not a quarter-hour one: four minutes of waltz an hour is
      // plenty without stacking it onto the quarters too.
      music: this.settings.get('musicBox')
        && this.canPlayMusic
        && (isHour || (isHalf && this.settings.get('musicOnHalfHour'))),
      silencedBy: reason,
    });
  }

  /** Ask for a strike right now, ignoring the schedule. Used by the tray and test button. */
  strikeNow(kind = 'hour') {
    const now = this.displayedNow();
    const d = new Date(now);
    const hour24 = d.getHours();
    const calls = kind === 'half'
      ? 1
      : (this.settings.get('strikeCount24h')
        ? (hour24 === 0 ? 24 : hour24)
        : (hour24 % 12 === 0 ? 12 : hour24 % 12));
    this.emit('strike', {
      at: now,
      kind,
      calls,
      hour24,
      gong: this.settings.get('gong'),
      music: this.settings.get('musicBox') && this.canPlayMusic && kind === 'hour',
      // A manual strike ignores the night lever, but still respects the latch and mute.
      silencedBy: this.settings.get('silent')
        ? 'silent'
        : this.settings.get('latched')
          ? 'latched'
          : !this.canStrike ? 'unwound' : null,
      manual: true,
    });
  }

  // --- Lifecycle ---------------------------------------------------------

  start() {
    this.stopped = false;
    this.lastDrain = Date.now();
    this.lastDriftAt = Date.now();
    this.pendingBoundary = this.nextBoundary();
    this.schedule();
    this.emit('sync', this.snapshot());
  }

  /** Called on wake from sleep and on clock changes, to re-anchor everything. */
  resync() {
    this.lastDrain = Date.now();
    this.lastDriftAt = Date.now();
    this.beatEpoch = Date.now();
    this.pendingBoundary = this.nextBoundary();
    this.emit('sync', this.snapshot());
    this.schedule();
  }

  destroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.removeAllListeners();
  }

  /** Everything the renderer needs to draw a frame without asking again. */
  snapshot() {
    const nowWall = Date.now();
    return {
      // The renderer adds its own Date.now() to offsetMs each frame, so the
      // hands stay smooth between syncs without us pushing 60 messages a second.
      offsetMs: this.settings.get('handOffsetMs'),
      serverNow: nowWall,
      running: this.running,
      beatMs: this.beatMs(),
      beatEpoch: this.beatEpoch,
      weights: { ...this.weights },
      silencedBy: this.silenceReason(),
      nightSilenced: this.isNightSilenced(),
      canStrike: this.canStrike,
      canPlayMusic: this.canPlayMusic,
    };
  }
}

module.exports = { Movement, STRIKE_COST_PER_CALL };
