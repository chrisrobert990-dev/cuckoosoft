'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('node:path');

/**
 * The menu bar popover.
 *
 * The native tray menu already exposes every single control, which is thorough
 * and completely joyless. This is the fast lane: the handful of things you
 * actually reach for during a day, laid out as real UI you can slide and tap,
 * dropping out of the menu bar icon like a system popover.
 *
 * It is a separate window so the clock itself stays a transparent frameless
 * case with no chrome anywhere near it.
 */

// The window is wider and taller than the visible card: the renderer keeps a
// transparent margin all round so it can draw its own soft shadow. A native
// NSWindow shadow would go stale every time the popover changes height.
const WIDTH = 360;
const START_HEIGHT = 540;
const GAP = 0;          // the card's own margin is the breathing room
const EDGE_MARGIN = 4;  // never let the panel touch the screen edge

class Panel {
  constructor(ctx) {
    this.ctx = ctx;
    this.win = null;
    this.hiddenAt = 0;
    this.anchor = null; // last known tray icon bounds
  }

  /**
   * Built once and kept alive hidden, because a popover that has to boot a
   * renderer before it appears feels broken no matter how fast it is.
   */
  create() {
    if (this.win && !this.win.isDestroyed()) return this.win;

    this.win = new BrowserWindow({
      width: WIDTH,
      height: START_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      acceptFirstMouse: true,
      title: 'Cuckoo settings',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'panel-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });

    // Above everything including full screen apps, the way a real menu bar
    // popover behaves. 'pop-up-menu' sits higher than the clock's 'floating'.
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this.win.loadFile(path.join(__dirname, '..', 'renderer', 'panel.html'));

    // Click anywhere else and it goes away. Stamp the time so the tray click
    // that caused the blur is not read as a fresh request to open it again.
    this.win.on('blur', () => {
      if (this.ctx.isDev?.()) return; // devtools steal focus constantly
      this.hide();
    });

    this.win.on('closed', () => { this.win = null; });

    return this.win;
  }

  get visible() {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible());
  }

  /** Places the popover under the menu bar icon, clamped onto the display. */
  position(height) {
    if (!this.win || this.win.isDestroyed()) return;
    const b = this.anchor;
    const point = b
      ? { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height) }
      : screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(point).workArea;

    const x = Math.round(Math.min(
      Math.max(point.x - WIDTH / 2, area.x + EDGE_MARGIN),
      area.x + area.width - WIDTH - EDGE_MARGIN,
    ));
    const y = Math.round(Math.min(
      Math.max(point.y + GAP, area.y + GAP),
      area.y + area.height - height - EDGE_MARGIN,
    ));

    this.win.setBounds({ x, y, width: WIDTH, height });
  }

  /** @param {Electron.Rectangle} [bounds] the tray icon's bounds */
  show(bounds) {
    if (bounds) this.anchor = bounds;
    const win = this.create();
    const height = win.getBounds().height || START_HEIGHT;
    this.position(height);
    win.showInactive();  // no window activation flash under the menu bar
    win.focus();         // but it does need key focus so blur can dismiss it
    win.webContents.send('cuckoo:panel-open');
  }

  hide() {
    if (!this.visible) return;
    this.hiddenAt = Date.now();
    this.win.hide();
  }

  /** Tray click handler. The blur that a tray click causes already closed it. */
  toggle(bounds) {
    if (this.visible || Date.now() - this.hiddenAt < 250) {
      this.hide();
      return;
    }
    this.show(bounds);
  }

  /** The renderer measures its own content and asks for exactly that height. */
  setHeight(height) {
    if (!this.win || this.win.isDestroyed()) return;
    const h = Math.max(200, Math.min(1200, Math.round(height)));
    if (Math.abs(this.win.getBounds().height - h) < 2) return;
    if (this.visible) this.position(h);
    else this.win.setBounds({ ...this.win.getBounds(), height: h });
  }

  send(channel, payload) {
    if (this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed()) {
      this.win.webContents.send(`cuckoo:${channel}`, payload);
    }
  }

  destroy() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

module.exports = { Panel, PANEL_WIDTH: WIDTH };
