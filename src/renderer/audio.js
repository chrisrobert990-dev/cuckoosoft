'use strict';

/**
 * The bellows, the gong, the escapement and the music box.
 *
 * This file is the audio half of the backend that happens to have to live in
 * the renderer, because only a renderer process can make noise. The main
 * process decides *what* happens and *when*; everything here is about turning
 * those events into sound. The visual layer never has to touch it, but it can
 * trigger one off sounds through `window.cuckooAudio.play(name)`.
 */

const SOUNDS = ['cuckoo', 'strike', 'tick', 'tock', 'door', 'latch', 'wind', 'music'];

/** Per sound trim so one loud sample does not tower over the others. */
const GAIN = {
  cuckoo: 1,
  strike: 0.62,
  tick: 0.3,
  tock: 0.3,
  door: 0.45,
  latch: 0.6,
  wind: 0.55,
  music: 0.5,
};

/** Look far enough ahead that a busy frame cannot make the escapement stumble. */
const SCHEDULE_AHEAD = 0.3;
const SCHEDULER_INTERVAL = 60;

class CuckooAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.loaded = false;

    this.settings = { volume: 0.7, silent: false, tickSound: true };
    this.movement = { running: false, beatMs: 500, beatEpoch: Date.now() };

    this.nextBeatIndex = 0;
    this.schedulerTimer = null;
    this.musicSource = null;

    this.listeners = new Set();
  }

  // --- Setup -------------------------------------------------------------

  async init() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.volume;
    this.master.connect(this.ctx.destination);

    // Chromium can still park the context; nudge it on any sign of life.
    const resume = () => this.ctx?.state === 'suspended' && this.ctx.resume().catch(() => {});
    for (const evt of ['pointerdown', 'keydown', 'mousemove', 'focus']) {
      window.addEventListener(evt, resume, { passive: true });
    }
    document.addEventListener('visibilitychange', resume);
    setInterval(resume, 5000);
    resume();

    await this.loadAll();
    this.startScheduler();
  }

  async loadAll() {
    const base = window.cuckoo?.soundBase ?? '../../assets/sounds/';
    await Promise.all(SOUNDS.map(async (name) => {
      try {
        const res = await fetch(`${base}${name}.mp3`);
        if (!res.ok) throw new Error(`${res.status}`);
        this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      } catch (err) {
        // A missing sample must never stop the clock, it just goes quiet.
        console.warn(`[audio] could not load ${name}:`, err.message);
      }
    }));
    this.loaded = true;
    this.emit('loaded', [...this.buffers.keys()]);
  }

  // --- State from the main process ---------------------------------------

  applyState(state) {
    if (state?.settings) {
      this.settings = {
        volume: state.settings.volume,
        silent: state.settings.silent,
        tickSound: state.settings.tickSound,
      };
      if (this.master) {
        const target = this.settings.silent ? 0 : this.settings.volume;
        // A short ramp instead of a jump, so changing volume never clicks.
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
      }
      if (this.settings.silent) this.stopMusic();
    }
    if (state?.movement) this.applySync(state.movement);
  }

  applySync(snap) {
    if (!snap) return;
    const changed = snap.beatMs !== this.movement.beatMs
      || snap.beatEpoch !== this.movement.beatEpoch
      || snap.running !== this.movement.running;
    this.movement = {
      running: snap.running,
      beatMs: snap.beatMs,
      beatEpoch: snap.beatEpoch,
    };
    // Re-anchor the escapement whenever the pendulum is re-hung.
    if (changed) this.nextBeatIndex = this.beatIndexAt(Date.now() + 30);
  }

  // --- Playback ----------------------------------------------------------

  /**
   * @param {string} name
   * @param {{ at?: number, gain?: number, rate?: number, detune?: number }} [opts]
   *        `at` is an AudioContext timestamp; omit it to play immediately.
   */
  play(name, opts = {}) {
    const buffer = this.buffers.get(name);
    if (!buffer || !this.ctx || this.settings.silent) return null;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Every real call is a fraction different. A touch of jitter on rate stops
    // twelve o'clock sounding like the same file twelve times, which it is.
    const rate = opts.rate ?? 1;
    source.playbackRate.value = rate + (opts.detune ?? 0);

    const gain = this.ctx.createGain();
    gain.gain.value = (GAIN[name] ?? 1) * (opts.gain ?? 1);
    source.connect(gain).connect(this.master);
    source.start(opts.at ?? this.ctx.currentTime);
    return source;
  }

  /** Slight, natural variation for the bird. */
  playCall() {
    return this.play('cuckoo', { detune: (Math.random() - 0.5) * 0.035 });
  }

  playGong() {
    return this.play('strike', { detune: (Math.random() - 0.5) * 0.02 });
  }

  startMusic() {
    this.stopMusic();
    const buffer = this.buffers.get('music');
    if (!buffer || !this.ctx || this.settings.silent) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = GAIN.music;
    source.connect(gain).connect(this.master);
    source.start();
    this.musicSource = { source, gain };
  }

  stopMusic() {
    if (!this.musicSource) return;
    const { source, gain } = this.musicSource;
    this.musicSource = null;
    try {
      // Fade rather than cut, so latching mid waltz does not pop.
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      source.stop(this.ctx.currentTime + 0.4);
    } catch { /* already finished */ }
  }

  // --- Escapement --------------------------------------------------------

  /** Which half swing the pendulum is on at a given wall clock time. */
  beatIndexAt(wallMs) {
    return Math.ceil((wallMs - this.movement.beatEpoch) / this.movement.beatMs);
  }

  beatWallTime(index) {
    return this.movement.beatEpoch + index * this.movement.beatMs;
  }

  /**
   * Classic Web Audio lookahead scheduler. setInterval alone is far too jittery
   * for something the ear reads as a mechanism, so the interval only queues
   * beats and the audio clock does the actual timing.
   */
  startScheduler() {
    clearInterval(this.schedulerTimer);
    this.nextBeatIndex = this.beatIndexAt(Date.now());
    this.schedulerTimer = setInterval(() => this.scheduleBeats(), SCHEDULER_INTERVAL);
  }

  scheduleBeats() {
    if (!this.ctx || !this.movement.running) {
      // Keep the index current so restarting does not replay a backlog of ticks.
      this.nextBeatIndex = this.beatIndexAt(Date.now());
      return;
    }

    const wallNow = Date.now();
    const horizonWall = wallNow + SCHEDULE_AHEAD * 1000;

    // If we have fallen a long way behind (a sleep, a stalled tab) skip forward
    // rather than firing hundreds of ticks at once.
    if (this.beatWallTime(this.nextBeatIndex) < wallNow - 1000) {
      this.nextBeatIndex = this.beatIndexAt(wallNow);
    }

    while (this.beatWallTime(this.nextBeatIndex) < horizonWall) {
      const wallAt = this.beatWallTime(this.nextBeatIndex);
      const when = this.ctx.currentTime + Math.max(0, (wallAt - Date.now()) / 1000);
      const isTick = this.nextBeatIndex % 2 === 0;

      if (this.settings.tickSound && !this.settings.silent) {
        this.play(isTick ? 'tick' : 'tock', { at: when, detune: (Math.random() - 0.5) * 0.02 });
      }
      // The visual layer listens for this so the pendulum turns exactly on the beat.
      this.emit('beat', { index: this.nextBeatIndex, side: isTick ? 'tick' : 'tock', wallAt });
      this.nextBeatIndex += 1;
    }
  }

  // --- Chime events ------------------------------------------------------

  handleChime(event) {
    switch (event.type) {
      case 'door:open':
        this.play('door');
        break;
      case 'cuckoo':
        this.playCall();
        break;
      case 'gong':
        this.playGong();
        break;
      case 'door:close':
        this.play('door', { rate: 1.12, gain: 0.8 });
        break;
      case 'music:start':
        this.startMusic();
        break;
      case 'music:end':
      case 'chime:end':
        if (event.type === 'music:end' || event.aborted) this.stopMusic();
        break;
      case 'chime:blocked':
        // The train tried to run and the latch stopped it: a small mechanical
        // complaint, which is exactly what a real one does.
        if (event.reason === 'latched') this.play('latch', { gain: 0.35, rate: 1.3 });
        break;
      default:
        break;
    }
  }

  // --- Tiny event bus for the visual layer -------------------------------

  on(type, fn) {
    const entry = { type, fn };
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  emit(type, payload) {
    for (const l of this.listeners) if (l.type === type) l.fn(payload);
  }
}

// ---------------------------------------------------------------------------

const audio = new CuckooAudio();
window.cuckooAudio = audio;

async function boot() {
  if (!window.cuckoo) {
    console.error('[audio] preload bridge missing');
    return;
  }
  const state = await window.cuckoo.ready();
  audio.applyState(state);
  await audio.init();
  audio.applyState(state);

  window.cuckoo.on('state', (s) => audio.applyState(s));
  window.cuckoo.on('sync', (s) => audio.applySync(s));
  window.cuckoo.on('chime', (e) => audio.handleChime(e));
  window.cuckoo.on('wound', () => audio.play('wind'));

  audio.emit('ready', true);
  window.dispatchEvent(new CustomEvent('cuckoo-audio-ready'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
