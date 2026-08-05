'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The whole surface the renderer is allowed to touch. The main process owns
 * time, weights, and when the bird comes out; the renderer owns how any of it
 * looks. Anything the artwork needs to know arrives as an event, so the clock
 * face never has to poll.
 */
const EVENTS = [
  'state',        // full snapshot: { settings, movement, chiming }
  'sync',         // movement snapshot: offsetMs, serverNow, beatMs, beatEpoch, running, weights...
  'weights',      // { time, strike, music } each 0..1
  'wound',        // 'time' | 'strike' | 'music', a chain was just pulled
  'chime',        // sequencer events, see below
  'scale',        // number, the case was resized
  'clickthrough', // boolean
  'theme',        // { dark: boolean }
];

/**
 * Chime event shapes, in the order they arrive during an hour strike:
 *   { type: 'chime:start', kind, calls, gong, music, hour24 }
 *   { type: 'door:open' }
 *   { type: 'cuckoo', index, total }      bird thrusts out, play the call
 *   { type: 'bird:in', index, total }     bird withdraws
 *   { type: 'gong', index, total }        hammer falls on the wire gong
 *   { type: 'door:close' }
 *   { type: 'music:start' } / { type: 'music:end' }
 *   { type: 'chime:end', aborted? }
 *   { type: 'chime:blocked', reason: 'latched'|'night'|'silent'|'unwound', kind, calls }
 */

function subscribe(event, callback) {
  if (!EVENTS.includes(event) || typeof callback !== 'function') return () => {};
  const channel = `cuckoo:${event}`;
  const handler = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('cuckoo', {
  /** Resolves with the full state snapshot. Call once on load. */
  ready: () => ipcRenderer.invoke('cuckoo:ready'),

  /** Patch one or more settings, e.g. set({ volume: 0.4 }). Resolves with new state. */
  set: (patch) => ipcRenderer.invoke('cuckoo:set', patch),

  /** Flip a boolean setting, e.g. toggle('latched'). */
  toggle: (key) => ipcRenderer.invoke('cuckoo:toggle', key),

  /** Pull a weight chain: 'time' | 'strike' | 'music' | 'all'. */
  wind: (train) => ipcRenderer.invoke('cuckoo:wind', train),

  /** Move the hands, as you would by turning the minute hand. */
  setHands: (hours, minutes) => ipcRenderer.invoke('cuckoo:setHands', { hours, minutes }),
  resetHands: () => ipcRenderer.invoke('cuckoo:resetHands'),

  /** Make it strike right now: 'hour' or 'half'. */
  strike: (kind) => ipcRenderer.invoke('cuckoo:strike', kind),
  stopChime: () => ipcRenderer.invoke('cuckoo:stopChime'),

  /**
   * Dragging the case. Call start() on mousedown over a draggable part of the
   * woodwork and end() on mouseup; the main process follows the cursor itself,
   * so no mousemove handler is needed.
   */
  drag: {
    start: () => ipcRenderer.send('cuckoo:dragStart'),
    end: () => ipcRenderer.send('cuckoo:dragEnd'),
  },

  /** Pop the full native menu, which mirrors the tray menu exactly. */
  menu: () => ipcRenderer.send('cuckoo:menu'),
  quit: () => ipcRenderer.send('cuckoo:quit'),
  openSounds: () => ipcRenderer.send('cuckoo:openSounds'),

  /**
   * on('chime', fn) etc. Returns an unsubscribe function.
   * Valid events: state, sync, weights, wound, chime, scale, clickthrough, theme.
   */
  on: subscribe,

  /** Where the generated sound files live, relative to index.html. */
  soundBase: '../../assets/sounds/',

  events: EVENTS,
});
