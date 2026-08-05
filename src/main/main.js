'use strict';

const {
  app, BrowserWindow, ipcMain, screen, shell, powerMonitor, nativeTheme, Menu,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { Settings } = require('./settings');
const { Movement } = require('./movement');
const { ChimeSequencer } = require('./chime');
const { createTray, buildMenuTemplate } = require('./tray');
const { Panel } = require('./panel');

/** The case at scale 1. Tall, because the weights hang well below the movement. */
const BASE_SIZE = { width: 460, height: 820 };
const ASPECT = BASE_SIZE.width / BASE_SIZE.height;

/** How small and how large the case may be dragged, as a multiple of BASE_SIZE. */
const SCALE_RANGE = { min: 0.2, max: 6 };

const IS_DEV = process.env.CUCKOO_DEV === '1';

// When this app was still called Cuckoo instead of CuckooSoft, so this is the
// old value of app.getName(), and so the old userData folder name.
const OLD_PRODUCT_NAME = 'Cuckoo';

// Chromium refuses to play audio without a user gesture by default, which would
// mean the clock stays mute until you happen to click it. Not acceptable for
// something whose entire job is striking the hour on its own.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/**
 * Electron derives the userData folder from the app/product name. Renaming
 * the app to CuckooSoft therefore points at a brand new, empty folder unless
 * this runs first: copy the old folder's settings.json over, once, so nobody
 * loses their preferences, install date, or lifetime stats just because the
 * app got a new name. Never deletes the old folder. Safe to call on every
 * launch, it is a no-op once the new file exists.
 */
function migrateUserData() {
  const newFile = path.join(app.getPath('userData'), 'settings.json');
  if (fs.existsSync(newFile)) return;
  const oldFile = path.join(app.getPath('appData'), OLD_PRODUCT_NAME, 'settings.json');
  if (!fs.existsSync(oldFile)) return;
  try {
    fs.mkdirSync(path.dirname(newFile), { recursive: true });
    fs.copyFileSync(oldFile, newFile);
  } catch (err) {
    console.warn('[migrate] could not carry over settings from the old Cuckoo folder:', err.message);
  }
}

// When this particular process started, for the "run this long uninterrupted"
// half of the patina effect. Deliberately not persisted: it resets every
// launch, unlike settings.installedAt which is the clock's lifetime age.
const APP_STARTED_AT = Date.now();

let win = null;
let tray = null;
let panel = null;
let settings = null;
let movement = null;
let chime = null;
let quirkTimer = null;

// True while we are the ones moving the window, so the resize listener does
// not read our own bounds change back in as a user resize.
let settingBounds = false;
let resizeSettle = null;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function windowSize(scale = settings.get('scale')) {
  return {
    width: Math.round(BASE_SIZE.width * scale),
    height: Math.round(BASE_SIZE.height * scale),
  };
}

/**
 * The largest the case can usefully get on the display it is currently on,
 * which is what "Fit" means: full working height, weights and all.
 */
function fitScale() {
  const point = win && !win.isDestroyed()
    ? { x: win.getBounds().x, y: win.getBounds().y }
    : screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(point).workArea;
  const byHeight = area.height / BASE_SIZE.height;
  const byWidth = area.width / BASE_SIZE.width;
  return Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, Math.min(byHeight, byWidth)));
}

/**
 * Puts the case back somewhere sensible. Sizing it up near a screen edge can
 * leave most of the carving off the display, and there is no title bar to grab
 * it back by.
 */
function centreCase() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getBounds();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  setBounds({
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + Math.max(0, (area.height - height) / 2)),
    width,
    height,
  });
  const { x, y } = win.getBounds();
  settings.values.position = { x, y };
  settings.save();
}

/** Sets window bounds without the resize listener treating it as user input. */
function setBounds(bounds) {
  if (!win || win.isDestroyed()) return;
  settingBounds = true;
  win.setBounds(bounds);
  // The bounds change lands asynchronously on macOS, so the flag has to
  // outlive this tick or the resize event still slips through.
  setTimeout(() => { settingBounds = false; }, 60);
}

/** Keeps the case on a real display, even if the saved position came from a monitor that is now gone. */
function clampToDisplay(x, y, width, height) {
  const nearest = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const area = nearest.workArea;
  return {
    x: Math.round(Math.min(Math.max(x, area.x - width * 0.35), area.x + area.width - width * 0.65)),
    y: Math.round(Math.min(Math.max(y, area.y), area.y + area.height - height * 0.4)),
  };
}

function defaultPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + area.width - width - 48),
    y: Math.round(area.y + 56),
  };
}

function createWindow() {
  const { width, height } = windowSize();
  const saved = settings.get('position');
  const pos = saved
    ? clampToDisplay(saved.x, saved.y, width, height)
    : defaultPosition(width, height);

  win = new BrowserWindow({
    width,
    height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    hasShadow: false,           // the case draws its own shadow, so the window must not add a rectangle
    // Drag any edge or corner to size the case freely. The aspect ratio below
    // keeps the carving from ever stretching out of proportion.
    resizable: true,
    // Without this macOS silently crops any visible window to the work area,
    // so "as big as I want" would stop dead at the height of the display.
    enableLargerThanScreen: true,
    minWidth: Math.round(BASE_SIZE.width * SCALE_RANGE.min),
    minHeight: Math.round(BASE_SIZE.height * SCALE_RANGE.min),
    maxWidth: Math.round(BASE_SIZE.width * SCALE_RANGE.max),
    maxHeight: Math.round(BASE_SIZE.height * SCALE_RANGE.max),
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: 'CuckooSoft',
    acceptFirstMouse: true,     // first click on an unfocused clock should still flip the latch
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Without this Chromium throttles timers when the window is behind
      // something else, and the pendulum stutters or the chime arrives late.
      backgroundThrottling: false,
    },
  });

  win.setAspectRatio(ASPECT);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    applyAlwaysOnTop();
    applyClickThrough();
    if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('moved', () => {
    if (!win || win.isDestroyed() || settingBounds) return;
    const [x, y] = win.getPosition();
    settings.set({ position: { x, y } });
  });

  // Dragging an edge is just another way of setting the scale, so it writes
  // back into the same preference the menu and the panel slider use. Without
  // this the size would be forgotten on the next launch.
  win.on('resize', () => {
    if (!win || win.isDestroyed() || settingBounds) return;
    const { width, height, x, y } = win.getBounds();
    const scale = width / BASE_SIZE.width;
    // Written straight in, bypassing the onChange handler's applyScale, which
    // would fight the live drag by snapping the window back each frame.
    settings.values.scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, scale));
    settings.values.position = { x, y };
    settings.save();
    send('scale', settings.values.scale);
    panel?.send('state', stateSnapshot());
    if (Math.abs(height - width / ASPECT) > 2) {
      // A display corner can force a size the ratio does not allow; correct it
      // once the drag settles rather than fighting it mid gesture.
      clearTimeout(resizeSettle);
      resizeSettle = setTimeout(() => applyScale(), 220);
    }
  });

  win.on('closed', () => { win = null; });

  // A frameless transparent window has nowhere to right click but the artwork.
  win.webContents.on('context-menu', () => {
    Menu.buildFromTemplate(buildMenuTemplate(ctx())).popup({ window: win });
  });

  // Keep the app self contained: anything link shaped opens in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function applyAlwaysOnTop() {
  if (!win || win.isDestroyed()) return;
  const on = settings.get('alwaysOnTop');
  // 'floating' sits above normal windows without fighting menus and popovers.
  win.setAlwaysOnTop(on, on ? 'floating' : 'normal');
  win.setVisibleOnAllWorkspaces(on, { visibleOnFullScreen: on });
}

function applyClickThrough() {
  if (!win || win.isDestroyed()) return;
  const on = settings.get('clickThrough');
  // `forward` keeps hover events arriving so the clock still reacts to the
  // cursor passing over it, it just cannot be clicked or dragged.
  win.setIgnoreMouseEvents(on, { forward: true });
  send('clickthrough', on);
}

function applyScale() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = windowSize();
  const [x, y] = win.getPosition();
  const clamped = clampToDisplay(x, y, width, height);
  setBounds({ x: clamped.x, y: clamped.y, width, height });
  send('scale', settings.get('scale'));
}

// ---------------------------------------------------------------------------
// Renderer messaging
// ---------------------------------------------------------------------------

/**
 * macOS refuses this outright for an unsigned binary run straight out of
 * node_modules, which is exactly how the app runs in development. The
 * preference is still worth honouring in a packaged build, so try it and
 * carry on rather than logging a scary error on every launch.
 */
function setLoginItem(openAtLogin) {
  if (!openAtLogin && !app.getLoginItemSettings().openAtLogin) return;
  try {
    app.setLoginItemSettings({ openAtLogin, openAsHidden: false });
  } catch (err) {
    console.warn('[login item] not permitted:', err.message);
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(`cuckoo:${channel}`, payload);
  }
  // The popover listens to the same channels, so both surfaces always agree.
  panel?.send(channel, payload);
}

function pushState() {
  send('state', stateSnapshot());
  tray?.refresh();
}

function stateSnapshot() {
  return {
    settings: settings.all(),
    movement: movement.snapshot(),
    chiming: chime.busy,
    appStartedAt: APP_STARTED_AT,
  };
}

/** Everything the tray and context menu need, in one bag. */
function ctx() {
  return {
    settings,
    movement,
    chime,
    getWindow: () => win,
    isDev: () => IS_DEV,
    getPanel: () => panel,
    togglePanel: (bounds) => panel?.toggle(bounds || tray?.bounds()),
    showPanel: (bounds) => panel?.show(bounds || tray?.bounds()),
    fitScale: () => {
      const scale = fitScale();
      settings.set({ scale });
      centreCase();
      return scale;
    },
    centreCase,
    quit: () => { app.quit(); },
    restart: () => { app.relaunch(); app.quit(); },
    testStrike: (kind) => movement.strikeNow(kind),
    windAll: () => movement.windAll(),
    resetHands: () => movement.resetHands(),
    openSounds: () => shell.openPath(path.join(app.getAppPath(), 'assets', 'sounds')),
    openSettingsFile: () => shell.showItemInFolder(
      path.join(app.getPath('userData'), 'settings.json'),
    ),
    reset: () => { settings.reset(); },
  };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wire() {
  settings.onChange((changed) => {
    if ('alwaysOnTop' in changed) applyAlwaysOnTop();
    if ('clickThrough' in changed) applyClickThrough();
    if ('scale' in changed) applyScale();
    if ('launchAtLogin' in changed) setLoginItem(changed.launchAtLogin);
    // Latching or muting mid strike should shut the door immediately, the way
    // pushing the wire lever over does on a real clock.
    if ((changed.latched === true || changed.silent === true) && chime.busy) chime.cancel();
    pushState();
  });

  movement.on('strike', (strike) => {
    const struck = chime.run(strike);
    if (struck) {
      movement.spendStrike(strike.calls);
      if (strike.music) movement.spendMusic();
    }
    pushState();
  });

  movement.on('sync', (snap) => send('sync', snap));
  movement.on('weights', (weights) => send('weights', weights));
  movement.on('wound', (train) => send('wound', train));
  movement.on('stopped', () => {
    // The going train hit the floor. Everything stops until a chain is pulled.
    chime.cancel();
    pushState();
  });

  chime.on('event', (event) => {
    send('chime', event);
    if (event.type === 'chime:start' || event.type === 'chime:end') tray?.refresh();
  });

  // Sleep, wake, and timezone changes all invalidate our idea of "now".
  powerMonitor.on('resume', () => movement.resync());
  powerMonitor.on('unlock-screen', () => movement.resync());
  nativeTheme.on('updated', () => send('theme', { dark: nativeTheme.shouldUseDarkColors }));

  screen.on('display-metrics-changed', () => applyScale());
}

// ---------------------------------------------------------------------------
// Quirks: rare, unscripted little moments (the bird glancing out between
// calls just to look around, the pendulum catching a tiny stutter before
// settling back into rhythm). Purely cosmetic, purely visual, the main
// process only decides *whether* one is allowed to happen right now and
// picks which kind; src/renderer/clock.js owns what it actually looks like.
// Deliberately a low-frequency dice roll rather than a scheduled beat: the
// charm is that it is a surprise, not a second animation loop ticking away.
// ---------------------------------------------------------------------------

const QUIRK_CHECK_MS = 10 * 60 * 1000; // how often we roll the dice
const QUIRK_CHANCE = 0.007; // roughly once a day at that cadence, when eligible

function maybeFireQuirk() {
  if (!settings.get('quirksEnabled')) return;
  if (chime.busy) return; // never step on a real strike
  if (Math.random() >= QUIRK_CHANCE) return;

  const candidates = [];
  // A peek needs the door to actually be able to move: not latched, not
  // night silenced, not muted, and the going train still running.
  if (movement.running && !movement.silenceReason()) candidates.push('peek');
  // A stutter is just the pendulum, it only needs to be swinging.
  if (movement.running) candidates.push('stutter');
  if (!candidates.length) return;

  send('quirk', { type: candidates[Math.floor(Math.random() * candidates.length)] });
}

function startQuirks() {
  clearInterval(quirkTimer);
  quirkTimer = setInterval(maybeFireQuirk, QUIRK_CHECK_MS);
  quirkTimer.unref?.();
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

let dragTimer = null;
let dragAnchor = null;

function beginDrag() {
  if (!win || win.isDestroyed()) return;
  endDrag();
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  dragAnchor = { dx: cursor.x - wx, dy: cursor.y - wy };
  // Following the cursor from the main process keeps the case glued to the
  // pointer even when the renderer is busy animating a twelve o'clock strike.
  dragTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !dragAnchor) return endDrag();
    const p = screen.getCursorScreenPoint();
    win.setPosition(p.x - dragAnchor.dx, p.y - dragAnchor.dy);
  }, 16);
}

function endDrag() {
  clearInterval(dragTimer);
  dragTimer = null;
  if (dragAnchor && win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    settings.set({ position: { x, y } });
  }
  dragAnchor = null;
}

let resizeTimer = null;
let resizeAnchor = null;

/**
 * The grip in the corner of the artwork. A frameless transparent window does
 * have live native edges, but they are a two pixel target on a shape that is
 * mostly empty air, so the case offers a proper handle of its own. Driven from
 * the main process for the same reason dragging is: it stays glued to the
 * cursor even mid strike.
 */
function beginResize(corner = 'se') {
  if (!win || win.isDestroyed()) return;
  endResize();
  const cursor = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  resizeAnchor = { corner, cursor, bounds };

  resizeTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !resizeAnchor) return endResize();
    const p = screen.getCursorScreenPoint();
    const { bounds: b, corner: c } = resizeAnchor;
    const dx = c.includes('w') ? resizeAnchor.cursor.x - p.x : p.x - resizeAnchor.cursor.x;
    const dy = c.includes('n') ? resizeAnchor.cursor.y - p.y : p.y - resizeAnchor.cursor.y;

    // Follow whichever axis the cursor committed to hardest, then derive the
    // other from the aspect ratio so the carving never distorts.
    const wanted = Math.abs(dx) > Math.abs(dy * ASPECT) ? b.width + dx : (b.height + dy) * ASPECT;
    const width = Math.round(Math.min(
      BASE_SIZE.width * SCALE_RANGE.max,
      Math.max(BASE_SIZE.width * SCALE_RANGE.min, wanted),
    ));
    const height = Math.round(width / ASPECT);

    win.setBounds({
      x: c.includes('w') ? b.x + b.width - width : b.x,
      y: c.includes('n') ? b.y + b.height - height : b.y,
      width,
      height,
    });
  }, 16);
}

function endResize() {
  clearInterval(resizeTimer);
  resizeTimer = null;
  resizeAnchor = null;
}

function registerIpc() {
  ipcMain.handle('cuckoo:ready', () => stateSnapshot());

  ipcMain.handle('cuckoo:set', (_e, patch) => {
    if (patch && typeof patch === 'object') settings.set(patch);
    return stateSnapshot();
  });

  ipcMain.handle('cuckoo:toggle', (_e, key) => {
    if (typeof key === 'string') settings.toggle(key);
    // Patina tracking: the latch and the pendulum bob are the two toggles
    // that correspond to something the owner physically touched on a real
    // clock, not just a preference flipped in a menu.
    if (key === 'latched') settings.bumpStat('latchTouches');
    if (key === 'pendulumRunning') settings.bumpStat('bobTouches');
    return stateSnapshot();
  });

  ipcMain.handle('cuckoo:wind', (_e, train) => {
    const ok = train === 'all' ? movement.windAll() : movement.wind(train);
    if (ok) {
      for (const t of train === 'all' ? ['time', 'strike', 'music'] : [train]) {
        if (['time', 'strike', 'music'].includes(t)) settings.bumpStat('chainWinds', t);
      }
    }
    pushState();
    return ok;
  });

  ipcMain.handle('cuckoo:setHands', (_e, { hours, minutes } = {}) => {
    const offset = movement.setHands(hours, minutes);
    pushState();
    return offset;
  });

  ipcMain.handle('cuckoo:resetHands', () => {
    movement.resetHands();
    pushState();
    return true;
  });

  ipcMain.handle('cuckoo:strike', (_e, kind) => {
    movement.strikeNow(kind === 'half' ? 'half' : 'hour');
    return true;
  });

  ipcMain.handle('cuckoo:stopChime', () => {
    chime.cancel();
    pushState();
    return true;
  });

  // What the size slider needs to know about the limits, in percent.
  ipcMain.handle('cuckoo:sizing', () => ({
    min: Math.round(SCALE_RANGE.min * 100),
    max: Math.round(SCALE_RANGE.max * 100),
    fit: Math.round(fitScale() * 100),
  }));

  ipcMain.handle('cuckoo:fitHeight', () => ctx().fitScale());

  ipcMain.handle('cuckoo:centreCase', () => { centreCase(); return true; });

  ipcMain.on('cuckoo:dragStart', beginDrag);
  ipcMain.on('cuckoo:dragEnd', endDrag);

  ipcMain.on('cuckoo:resizeStart', (_e, corner) => beginResize(corner));
  ipcMain.on('cuckoo:resizeEnd', endResize);

  ipcMain.on('cuckoo:panelHeight', (_e, px) => panel?.setHeight(px));
  ipcMain.on('cuckoo:panelClose', () => panel?.hide());
  ipcMain.on('cuckoo:panelFullMenu', () => {
    panel?.hide();
    Menu.buildFromTemplate(buildMenuTemplate(ctx())).popup();
  });

  ipcMain.on('cuckoo:menu', () => {
    if (win && !win.isDestroyed()) {
      Menu.buildFromTemplate(buildMenuTemplate(ctx())).popup({ window: win });
    }
  });

  ipcMain.on('cuckoo:quit', () => app.quit());
  ipcMain.on('cuckoo:restart', () => { app.relaunch(); app.quit(); });
  ipcMain.on('cuckoo:openSounds', () => ctx().openSounds());
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    migrateUserData();
    settings = new Settings();
    movement = new Movement(settings);
    chime = new ChimeSequencer();

    // Reflect the persisted preference in case it was changed elsewhere.
    setLoginItem(settings.get('launchAtLogin'));

    registerIpc();
    createWindow();
    wire();
    panel = new Panel(ctx());
    panel.create();
    tray = createTray(ctx());
    movement.start();
    startQuirks();

    if (process.env.CUCKOO_SELFTEST) {
      const { runSelfTest } = require('./selftest');
      win.webContents.once('did-finish-load', () => {
        runSelfTest(ctx(), win, chime).catch((err) => {
          console.error('selftest crashed:', err);
          app.exit(1);
        });
      });
    }

    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
      else win?.show();
    });
  });

  // The clock is the whole app, but it lives in the tray too, so closing the
  // last window should not quit on macOS.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    endDrag();
    endResize();
    clearInterval(quirkTimer);
    panel?.destroy();
    chime?.destroy();
    movement?.destroy();
    tray?.destroy();
    settings?.flush();
  });
}
