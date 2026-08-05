'use strict';

const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('node:path');

const SCALES = [
  ['Small', 0.7],
  ['Normal', 1],
  ['Large', 1.3],
  ['Enormous', 1.6],
];

const NIGHT_STARTS = ['20:00', '21:00', '22:00', '23:00', '00:00'];
const NIGHT_ENDS = ['06:00', '06:30', '07:00', '07:30', '08:00', '09:00'];

function pct(v) {
  return `${Math.round(v * 100)}%`;
}

/**
 * A single menu template shared by the tray and by right clicking the case, so
 * there is no way to end up with a control that only exists in one of them.
 * Everything the clock can do is reachable from here even if the artwork's own
 * levers are hidden behind click through mode.
 */
function buildMenuTemplate(ctx) {
  const { settings, movement, chime } = ctx;
  const s = settings.all();
  const silencedBy = movement.silenceReason();

  const status = silencedBy === 'silent' ? 'Muted'
    : silencedBy === 'latched' ? 'Bird door latched'
      : silencedBy === 'night' ? 'Night shut off'
        : silencedBy === 'unwound' ? 'Strike weight down'
          : chime.busy ? 'Striking' : 'Running';

  const weightPct = (t) => pct(movement.weights[t]);

  return [
    { label: `Cuckoo — ${status}`, enabled: false },
    { type: 'separator' },

    {
      label: 'Latch the bird door',
      type: 'checkbox',
      checked: s.latched,
      accelerator: 'CommandOrControl+Shift+L',
      click: () => settings.toggle('latched'),
    },
    {
      label: 'Silence everything',
      type: 'checkbox',
      checked: s.silent,
      click: () => settings.toggle('silent'),
    },
    { type: 'separator' },

    {
      label: 'Strike',
      submenu: [
        { label: 'Strike the hour now', click: () => ctx.testStrike('hour') },
        { label: 'Single call', click: () => ctx.testStrike('half') },
        {
          label: 'Stop striking',
          enabled: chime.busy,
          click: () => chime.cancel(),
        },
        { type: 'separator' },
        {
          label: 'Call on the half hour',
          type: 'checkbox',
          checked: s.halfHourCall,
          click: () => settings.toggle('halfHourCall'),
        },
        {
          label: 'Wire gong',
          type: 'checkbox',
          checked: s.gong,
          click: () => settings.toggle('gong'),
        },
        {
          label: 'Music box after the hour',
          type: 'checkbox',
          checked: s.musicBox,
          click: () => settings.toggle('musicBox'),
        },
        {
          label: 'Music on the half hour too',
          type: 'checkbox',
          checked: s.musicOnHalfHour,
          enabled: s.musicBox,
          click: () => settings.toggle('musicOnHalfHour'),
        },
        {
          label: 'Strike 13 to 24 overnight',
          type: 'checkbox',
          checked: s.strikeCount24h,
          click: () => settings.toggle('strikeCount24h'),
        },
      ],
    },

    {
      label: 'Night shut off',
      submenu: [
        {
          label: 'Enabled',
          type: 'checkbox',
          checked: s.nightSilence,
          click: () => settings.toggle('nightSilence'),
        },
        { type: 'separator' },
        {
          label: 'Quiet from',
          submenu: NIGHT_STARTS.map((t) => ({
            label: t,
            type: 'radio',
            checked: s.nightStart === t,
            click: () => settings.set({ nightStart: t }),
          })),
        },
        {
          label: 'Quiet until',
          submenu: NIGHT_ENDS.map((t) => ({
            label: t,
            type: 'radio',
            checked: s.nightEnd === t,
            click: () => settings.set({ nightEnd: t }),
          })),
        },
      ],
    },

    {
      label: 'Movement',
      submenu: [
        {
          label: s.pendulumRunning ? 'Stop the pendulum' : 'Start the pendulum',
          click: () => settings.toggle('pendulumRunning'),
        },
        {
          label: 'Audible tick',
          type: 'checkbox',
          checked: s.tickSound,
          click: () => settings.toggle('tickSound'),
        },
        { type: 'separator' },
        {
          label: 'Regulating leaf',
          submenu: [
            { label: 'Raise (runs faster)', click: () => settings.set({ pendulumLeaf: s.pendulumLeaf - 0.1 }) },
            { label: 'Lower (runs slower)', click: () => settings.set({ pendulumLeaf: s.pendulumLeaf + 0.1 }) },
            { label: 'Centre', click: () => settings.set({ pendulumLeaf: 0.5 }) },
          ],
        },
        { type: 'separator' },
        { label: `Time chain: ${weightPct('time')}`, enabled: false },
        { label: `Strike chain: ${weightPct('strike')}`, enabled: false },
        { label: `Music chain: ${weightPct('music')}`, enabled: false },
        { label: 'Pull all chains', click: () => ctx.windAll() },
        {
          label: 'Weights never run out',
          type: 'checkbox',
          checked: s.autoWind,
          click: () => settings.toggle('autoWind'),
        },
        {
          label: 'Let the leaf gain and lose time',
          type: 'checkbox',
          checked: s.authenticDrift,
          click: () => settings.toggle('authenticDrift'),
        },
        { type: 'separator' },
        { label: 'Set hands to system time', click: () => ctx.resetHands() },
      ],
    },

    { type: 'separator' },

    {
      label: 'Volume',
      submenu: [0.15, 0.3, 0.5, 0.7, 0.85, 1].map((v) => ({
        label: pct(v),
        type: 'radio',
        checked: Math.abs(s.volume - v) < 0.02,
        click: () => settings.set({ volume: v }),
      })),
    },
    {
      label: 'Size',
      submenu: SCALES.map(([label, v]) => ({
        label,
        type: 'radio',
        checked: Math.abs(s.scale - v) < 0.02,
        click: () => settings.set({ scale: v }),
      })),
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Always on top',
          type: 'checkbox',
          checked: s.alwaysOnTop,
          click: () => settings.toggle('alwaysOnTop'),
        },
        {
          label: 'Click through',
          type: 'checkbox',
          checked: s.clickThrough,
          click: () => settings.toggle('clickThrough'),
        },
        {
          label: 'Second hand',
          type: 'checkbox',
          checked: s.showSeconds,
          click: () => settings.toggle('showSeconds'),
        },
        {
          label: '24 hour dial',
          type: 'checkbox',
          checked: s.twentyFourHour,
          click: () => settings.toggle('twentyFourHour'),
        },
      ],
    },
    {
      label: 'Open at login',
      type: 'checkbox',
      checked: s.launchAtLogin,
      click: () => settings.toggle('launchAtLogin'),
    },

    { type: 'separator' },
    { label: 'Show sound files', click: () => ctx.openSounds() },
    { label: 'Reset everything', click: () => ctx.reset() },
    { type: 'separator' },
    { label: 'Quit Cuckoo', accelerator: 'Command+Q', click: () => ctx.quit() },
  ];
}

function createTray(ctx) {
  const iconPath = path.join(app.getAppPath(), 'assets', 'icons', 'trayTemplate.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // Never let a missing icon take the whole menu bar entry down with it.
    image = nativeImage.createEmpty();
  } else {
    image.setTemplateImage(true);
  }

  const tray = new Tray(image);
  tray.setToolTip('Cuckoo');

  const refresh = () => {
    if (tray.isDestroyed()) return;
    tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate(ctx)));
  };
  refresh();

  // Clicking the menu bar icon brings the case back if it wandered off screen.
  tray.on('double-click', () => {
    const win = ctx.getWindow();
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  return {
    refresh,
    destroy: () => { if (!tray.isDestroyed()) tray.destroy(); },
  };
}

module.exports = { createTray, buildMenuTemplate };
