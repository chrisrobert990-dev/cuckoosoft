'use strict';

const {
  app, BrowserWindow, ipcMain, screen, shell, powerMonitor, nativeTheme, Menu,
} = require('electron');
const path = require('node:path');

const { Settings } = require('./settings');
const { Movement } = require('./movement');
const { ChimeSequencer } = require('./chime');
const { createTray, buildMenuTemplate } = require('./tray');

/** The case at scale 1. Tall, because the weights hang well below the movement. */
const BASE_SIZE = { width: 460, height: 820 };

const IS_DEV = process.env.CUCKOO_DEV === '1';

// Chromium refuses to play audio without a user gesture by default, which would
// mean the clock stays mute until you happen to click it. Not acceptable for
// something whose entire job is striking the hour on its own.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let tray = null;
let settings = null;
let movement = null;
let chime = null;

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function windowSize() {
  const scale = settings.get('scale');
  return {
    width: Math.round(BASE_SIZE.width * scale),
    height: Math.round(BASE_SIZE.height * scale),
  };
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
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    title: 'Cuckoo',
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

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
    applyAlwaysOnTop();
    applyClickThrough();
    if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' });
  });

  win.on('moved', () => {
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    settings.set({ position: { x, y } });
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
  win.setBounds({ x: clamped.x, y: clamped.y, width, height });
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
  };
}

/** Everything the tray and context menu need, in one bag. */
function ctx() {
  return {
    settings,
    movement,
    chime,
    getWindow: () => win,
    quit: () => { app.quit(); },
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

function registerIpc() {
  ipcMain.handle('cuckoo:ready', () => stateSnapshot());

  ipcMain.handle('cuckoo:set', (_e, patch) => {
    if (patch && typeof patch === 'object') settings.set(patch);
    return stateSnapshot();
  });

  ipcMain.handle('cuckoo:toggle', (_e, key) => {
    if (typeof key === 'string') settings.toggle(key);
    return stateSnapshot();
  });

  ipcMain.handle('cuckoo:wind', (_e, train) => {
    const ok = train === 'all' ? movement.windAll() : movement.wind(train);
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

  ipcMain.on('cuckoo:dragStart', beginDrag);
  ipcMain.on('cuckoo:dragEnd', endDrag);

  ipcMain.on('cuckoo:menu', () => {
    if (win && !win.isDestroyed()) {
      Menu.buildFromTemplate(buildMenuTemplate(ctx())).popup({ window: win });
    }
  });

  ipcMain.on('cuckoo:quit', () => app.quit());
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
    settings = new Settings();
    movement = new Movement(settings);
    chime = new ChimeSequencer();

    // Reflect the persisted preference in case it was changed elsewhere.
    setLoginItem(settings.get('launchAtLogin'));

    registerIpc();
    createWindow();
    wire();
    tray = createTray(ctx());
    movement.start();

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
    chime?.destroy();
    movement?.destroy();
    tray?.destroy();
    settings?.flush();
  });
}
