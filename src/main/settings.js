'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Every persisted preference, with the value a fresh install starts on.
 *
 * The defaults are deliberately "a clock that just works": it keeps perfect
 * time, it never runs out of weight, and it stays quiet overnight. The
 * fussier authentic behaviours (real 30 hour weights, pendulum drift) are
 * opt in, because they are charming right up until they wake you at 3am or
 * silently stop the clock while you are in a meeting.
 */
const DEFAULTS = {
  // --- Bird and strike ---------------------------------------------------
  latched: false,          // brass latch across the bird door: locks it shut, silences the cuckoo
  silent: false,           // master mute, including the tick
  halfHourCall: true,      // single call on the half hour
  gong: true,              // wire gong strikes alongside the calls
  musicBox: true,          // music box waltz after the hour
  musicOnHalfHour: false,  // musical models usually only play on the hour
  strikeCount24h: false,   // strike 13..24 through the night instead of 1..12

  // --- Night shut off ----------------------------------------------------
  nightSilence: true,
  nightStart: '22:00',
  nightEnd: '07:30',

  // --- Movement ----------------------------------------------------------
  pendulumRunning: true,
  pendulumLeaf: 0.5,       // regulating leaf on the rod: 0 = top (fast), 1 = bottom (slow)
  tickSound: true,
  authenticDrift: false,   // let the leaf position actually gain or lose time
  autoWind: true,          // false = real 30 hour weights that stop when they hit the floor
  runtimeHours: 30,        // how long a full wind lasts on the time train

  // --- Presentation ------------------------------------------------------
  volume: 0.7,
  scale: 1,
  alwaysOnTop: true,
  clickThrough: false,
  showSeconds: false,      // most cuckoo clocks have no second hand
  twentyFourHour: false,
  launchAtLogin: false,
  position: null,          // { x, y }, remembered between launches
  handOffsetMs: 0,         // accumulated drift plus any hand setting the user has done
};

/** Settings that only make sense inside a range, and how to coerce them. */
const CLAMPS = {
  volume: [0, 1],
  scale: [0.55, 1.8],
  pendulumLeaf: [0, 1],
  runtimeHours: [4, 192],
  handOffsetMs: [-43200000, 43200000], // never more than 12 hours out
};

const TIME_KEYS = ['nightStart', 'nightEnd'];

function coerce(key, value) {
  const fallback = DEFAULTS[key];
  if (fallback === undefined) return undefined; // unknown key, ignore

  if (typeof fallback === 'boolean') return Boolean(value);

  if (typeof fallback === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const clamp = CLAMPS[key];
    return clamp ? Math.min(clamp[1], Math.max(clamp[0], n)) : n;
  }

  if (TIME_KEYS.includes(key)) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)) ? String(value) : fallback;
  }

  if (key === 'position') {
    if (!value || typeof value !== 'object') return null;
    const { x, y } = value;
    return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x), y: Math.round(y) } : null;
  }

  return value;
}

class Settings {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'settings.json');
    this.values = { ...DEFAULTS };
    this.listeners = new Set();
    this.writeTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [key, value] of Object.entries(raw)) {
        const clean = coerce(key, value);
        if (clean !== undefined) this.values[key] = clean;
      }
    } catch {
      // No file yet, or it is corrupt. Either way, defaults are a fine answer.
    }
  }

  /** Debounced so that dragging a volume slider does not hammer the disk. */
  save() {
    clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, `${JSON.stringify(this.values, null, 2)}\n`);
      } catch (err) {
        console.error('[settings] could not save:', err.message);
      }
    }, 400);
    this.writeTimer.unref?.();
  }

  get(key) {
    return this.values[key];
  }

  all() {
    return { ...this.values };
  }

  /**
   * Applies a patch and notifies listeners with only the keys that actually
   * changed, so nothing downstream has to diff the whole object.
   */
  set(patch) {
    const changed = {};
    for (const [key, value] of Object.entries(patch)) {
      const clean = coerce(key, value);
      if (clean === undefined) continue;
      const before = this.values[key];
      const same = key === 'position'
        ? JSON.stringify(before) === JSON.stringify(clean)
        : before === clean;
      if (same) continue;
      this.values[key] = clean;
      changed[key] = clean;
    }
    if (!Object.keys(changed).length) return changed;
    this.save();
    for (const fn of this.listeners) fn(changed, this.values);
    return changed;
  }

  toggle(key) {
    return this.set({ [key]: !this.values[key] });
  }

  reset() {
    const keep = this.values.position;
    this.values = { ...DEFAULTS, position: keep };
    this.save();
    for (const fn of this.listeners) fn(this.values, this.values);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Flush immediately, for use on app quit where the debounce would be lost. */
  flush() {
    clearTimeout(this.writeTimer);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify(this.values, null, 2)}\n`);
    } catch { /* quitting anyway */ }
  }
}

module.exports = { Settings, DEFAULTS };
