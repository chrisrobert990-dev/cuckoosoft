'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Bridge for the menu bar popover. Same shape as the clock's bridge so the two
 * renderers feel like one app, plus the few things only a panel needs: its own
 * height, dismissal, and the full native menu as an escape hatch.
 */

const EVENTS = [
  'state',        // { settings, movement, chiming, appStartedAt }
  'sync',         // movement snapshot
  'weights',      // { time, strike, music }
  'chime',        // sequencer events
  'quirk',        // { type: 'peek' | 'stutter' }, see settings.quirksEnabled
  'panel-open',   // the popover was just shown, refresh anything time based
];

function subscribe(event, callback) {
  if (!EVENTS.includes(event) || typeof callback !== 'function') return () => {};
  const channel = `cuckoo:${event}`;
  const handler = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('cuckoo', {
  ready: () => ipcRenderer.invoke('cuckoo:ready'),
  set: (patch) => ipcRenderer.invoke('cuckoo:set', patch),
  toggle: (key) => ipcRenderer.invoke('cuckoo:toggle', key),
  wind: (train) => ipcRenderer.invoke('cuckoo:wind', train),
  strike: (kind) => ipcRenderer.invoke('cuckoo:strike', kind),
  stopChime: () => ipcRenderer.invoke('cuckoo:stopChime'),
  resetHands: () => ipcRenderer.invoke('cuckoo:resetHands'),

  /** Sizing helpers the size slider and its presets need. */
  sizing: () => ipcRenderer.invoke('cuckoo:sizing'),
  fitHeight: () => ipcRenderer.invoke('cuckoo:fitHeight'),
  centreCase: () => ipcRenderer.invoke('cuckoo:centreCase'),

  /** Ask the main process to make this popover exactly `px` tall. */
  height: (px) => ipcRenderer.send('cuckoo:panelHeight', px),
  close: () => ipcRenderer.send('cuckoo:panelClose'),

  /** The exhaustive native menu, for everything this panel deliberately omits. */
  fullMenu: () => ipcRenderer.send('cuckoo:panelFullMenu'),
  quit: () => ipcRenderer.send('cuckoo:quit'),
  restart: () => ipcRenderer.send('cuckoo:restart'),

  on: subscribe,
  events: EVENTS,
});
