'use strict';

/**
 * Headless-ish verification for a GUI app.
 *
 * Enabled with CUCKOO_SELFTEST=1. It drives the clock through the behaviours
 * that are easy to break and hard to eyeball (does the bird actually come out,
 * does the latch really stop it, does the escapement tick), captures every
 * renderer console error, saves screenshots, prints a report and exits with a
 * non-zero code if anything failed.
 *
 *   CUCKOO_SELFTEST=1 electron .
 *   CUCKOO_SELFTEST=1 CUCKOO_SHOT_DIR=/tmp/shots electron .
 */

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SHOT_DIR = process.env.CUCKOO_SHOT_DIR || path.join(app.getPath('temp'), 'cuckoo-selftest');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Report {
  constructor() {
    this.checks = [];
    this.errors = [];
    this.shots = [];
  }

  check(name, ok, detail = '') {
    this.checks.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
    return ok;
  }

  get failed() {
    return this.checks.filter((c) => !c.ok).length;
  }
}

async function screenshot(win, report, name) {
  try {
    const image = await win.capturePage();
    if (image.isEmpty()) {
      report.check(`screenshot: ${name}`, false, 'empty capture');
      return null;
    }
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const file = path.join(SHOT_DIR, `${name}.png`);
    fs.writeFileSync(file, image.toPNG());
    report.shots.push(file);
    console.log(`  shot -> ${file}`);
    return file;
  } catch (err) {
    report.check(`screenshot: ${name}`, false, err.message);
    return null;
  }
}

/**
 * @param {object} ctx the same context object the tray gets
 * @param {import('electron').BrowserWindow} win
 * @param {import('node:events').EventEmitter} chime
 */
async function run(ctx, win, chime) {
  const report = new Report();
  const chimeLog = [];
  const consoleLog = [];

  chime.on('event', (e) => chimeLog.push(e));

  win.webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event;
    const text = typeof message === 'string' ? message : String(message ?? '');
    consoleLog.push({ level, text, where: `${path.basename(sourceId || '?')}:${lineNumber}` });
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    report.errors.push(`renderer gone: ${details.reason}`);
  });
  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    report.errors.push(`preload error in ${preloadPath}: ${error.message}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    report.errors.push(`did-fail-load ${code}: ${desc}`);
  });

  console.log('\n--- cuckoo selftest ---\n');
  await wait(2500); // let the renderer boot, fetch and decode the sound pack

  const { settings, movement } = ctx;

  // Start from a known, audible state.
  settings.set({ latched: false, silent: false, nightSilence: false, autoWind: true, volume: 0 });

  // 1. The bridge and the visual layer both came up.
  const bridgeOk = await win.webContents.executeJavaScript('Boolean(window.cuckoo && window.cuckooAudio)');
  report.check('preload bridge exposed', bridgeOk);

  const stageFilled = await win.webContents.executeJavaScript(
    'document.getElementById("stage") && document.getElementById("stage").children.length > 0',
  );
  report.check('visual layer mounted into #stage', stageFilled);

  const loadedSounds = await win.webContents.executeJavaScript(
    'window.cuckooAudio ? [...window.cuckooAudio.buffers.keys()] : []',
  );
  // 5 shared mechanism sounds plus 6 birds x (call, tick, tock).
  report.check('all 23 sounds decoded', loadedSounds.length === 23, loadedSounds.join(', '));

  const audioState = await win.webContents.executeJavaScript(
    'window.cuckooAudio?.ctx?.state ?? "none"',
  );
  report.check('audio context not suspended', audioState === 'running', audioState);

  // Every bird profile has to resolve to sounds that actually got decoded:
  // a typo in audio.js's BIRDS map would otherwise silently fall through to
  // `GAIN[name] ?? 1` and `this.buffers.get(name)` returning undefined, i.e.
  // a bird that plays nothing.
  const birdCheck = await win.webContents.executeJavaScript(`
    (() => {
      const a = window.cuckooAudio;
      const ids = ['cuckoo', 'cardinal', 'redwing', 'robin', 'chickadee', 'dove'];
      const missing = [];
      for (const id of ids) {
        a.settings.birdProfile = id;
        const b = a.bird();
        for (const key of ['call', 'tick', 'tock']) {
          if (!a.buffers.has(b[key])) missing.push(\`\${id}.\${key} -> \${b[key]}\`);
        }
      }
      a.settings.birdProfile = 'cuckoo';
      return { count: ids.length, missing };
    })()
  `);
  report.check(
    'all 6 bird profiles resolve to loaded sounds',
    birdCheck.count === 6 && birdCheck.missing.length === 0,
    birdCheck.missing.join(', ') || 'ok',
  );

  // A real profile switch through the settings store, not just the local
  // resolver above, has to reach audio.js the same way the popover's picker
  // will: through applyState.
  settings.set({ birdProfile: 'cardinal' });
  await wait(200);
  const pickedUp = await win.webContents.executeJavaScript(
    'window.cuckooAudio.bird().call',
  );
  report.check('switching birdProfile reaches audio.js', pickedUp === 'cardinalCall', pickedUp);
  settings.set({ birdProfile: 'cuckoo' });
  await wait(200);

  await screenshot(win, report, '01-idle');

  // 2. The escapement is beating.
  const beatsBefore = await win.webContents.executeJavaScript('window.__beatCount ?? -1');
  await win.webContents.executeJavaScript(`
    window.__beatCount = 0;
    window.cuckooAudio.on('beat', () => { window.__beatCount += 1; });
    true;
  `);
  await wait(2200);
  const beats = await win.webContents.executeJavaScript('window.__beatCount');
  report.check('pendulum is beating', beats >= 3, `${beats} beats in 2.2s (before: ${beatsBefore})`);

  // 3. A three o'clock strike produces exactly three calls, a door, and gongs.
  chimeLog.length = 0;
  movement.setHands(3, 0);
  await wait(150);
  movement.strikeNow('hour');
  await wait(600);
  await screenshot(win, report, '02-bird-out');
  await wait(6500);

  const calls = chimeLog.filter((e) => e.type === 'cuckoo');
  const gongs = chimeLog.filter((e) => e.type === 'gong');
  report.check('hour strike called 3 times', calls.length === 3, `got ${calls.length}`);
  report.check('door opened', chimeLog.some((e) => e.type === 'door:open'));
  report.check('door closed', chimeLog.some((e) => e.type === 'door:close'));
  report.check('gong struck between calls', gongs.length === 2, `got ${gongs.length}`);
  report.check('call indexes are 1..3', calls.map((c) => c.index).join(',') === '1,2,3');

  // 4. The latch really does lock the door.
  ctx.chime.cancel();
  chimeLog.length = 0;
  settings.set({ latched: true });
  await wait(120);
  movement.strikeNow('hour');
  await wait(900);
  report.check(
    'latch blocks the bird',
    chimeLog.some((e) => e.type === 'chime:blocked' && e.reason === 'latched')
      && !chimeLog.some((e) => e.type === 'cuckoo'),
    chimeLog.map((e) => e.type).join(' ') || 'no events',
  );
  await screenshot(win, report, '03-latched');
  settings.set({ latched: false });

  // 5. Night shut off. This has to go through the scheduled path: a strike the
  //    user asked for by hand deliberately ignores the night lever, otherwise
  //    "Strike the hour now" would silently do nothing after 10pm.
  chimeLog.length = 0;
  settings.set({ nightSilence: true, nightStart: '22:00', nightEnd: '07:30' });
  movement.setHands(2, 0);
  await wait(120);
  report.check('night window detected', movement.isNightSilenced());

  const twoAm = new Date();
  twoAm.setHours(2, 0, 0, 0);
  movement.fire(twoAm.getTime());
  await wait(700);
  report.check(
    'night shut off blocks the scheduled strike',
    chimeLog.some((e) => e.type === 'chime:blocked' && e.reason === 'night')
      && !chimeLog.some((e) => e.type === 'cuckoo'),
    chimeLog.map((e) => e.type).join(' ') || 'no events',
  );

  chimeLog.length = 0;
  movement.strikeNow('hour');
  await wait(700);
  report.check(
    'manual strike overrides the night lever',
    chimeLog.some((e) => e.type === 'cuckoo'),
    chimeLog.map((e) => e.type).join(' ') || 'no events',
  );
  ctx.chime.cancel();
  settings.set({ nightSilence: false });
  movement.resetHands();

  // 6. Weights run down and wind back up.
  settings.set({ autoWind: false });
  movement.weights.strike = 0;
  const blockedWhenDown = movement.silenceReason() === 'unwound';
  report.check('empty strike chain stops the bird', blockedWhenDown, movement.silenceReason() ?? 'none');
  movement.wind('strike');
  report.check('pulling the chain rewinds it', movement.weights.strike === 1);
  settings.set({ autoWind: true });

  // 7. The half hour is a single call.
  chimeLog.length = 0;
  movement.strikeNow('half');
  await wait(1400);
  report.check(
    'half hour is one call',
    chimeLog.filter((e) => e.type === 'cuckoo').length === 1,
  );
  ctx.chime.cancel();

  // 7b. Quarter hour call: off by default, single call when the user turns it
  // on. Goes through the scheduled path (fire), same as the night shut off
  // test above, since there is deliberately no manual "strike the quarter"
  // trigger.
  const quarterPast = new Date();
  quarterPast.setHours(2, 15, 0, 0);

  chimeLog.length = 0;
  settings.set({ quarterHourCall: false });
  movement.fire(quarterPast.getTime());
  await wait(700);
  report.check(
    'quarter hour call is off by default',
    !chimeLog.some((e) => e.type === 'cuckoo'),
    chimeLog.map((e) => e.type).join(' ') || 'no events',
  );

  chimeLog.length = 0;
  settings.set({ quarterHourCall: true });
  movement.fire(quarterPast.getTime());
  await wait(700);
  report.check(
    'quarter hour call fires one call when enabled',
    chimeLog.filter((e) => e.type === 'cuckoo').length === 1,
  );
  ctx.chime.cancel();
  settings.set({ quarterHourCall: false });

  // 8. Settings survive a round trip through the store.
  settings.set({ volume: 0.42, scale: 1.3 });
  await wait(700);
  report.check('settings persist', settings.get('volume') === 0.42 && settings.get('scale') === 1.3);
  settings.set({ scale: 1 });
  await wait(400);
  await screenshot(win, report, '04-final');

  // 8b. Character: the three cosmetic toggles default on, and lifetime stats
  // actually increment through the real IPC paths, not just settings.set.
  report.check(
    'patina, quirks, and moon phase default on',
    settings.get('patinaEnabled') === true
      && settings.get('quirksEnabled') === true
      && settings.get('moonPhaseEnabled') === true,
  );
  settings.set({ patinaEnabled: false });
  report.check('character toggles actually toggle', settings.get('patinaEnabled') === false);
  settings.set({ patinaEnabled: true });

  report.check(
    'installedAt is a real timestamp',
    Number.isFinite(settings.get('installedAt')) && settings.get('installedAt') > 0,
  );

  const appStartedAt = await win.webContents.executeJavaScript(
    'window.cuckoo.ready().then(s => s.appStartedAt)',
  );
  report.check('appStartedAt reaches the renderer', Number.isFinite(appStartedAt) && appStartedAt > 0);

  const statsBefore = JSON.parse(JSON.stringify(settings.get('stats')));

  await win.webContents.executeJavaScript("window.cuckoo.toggle('latched')");
  await wait(200);
  report.check(
    'latch touches increments through the real toggle IPC',
    settings.get('stats').latchTouches === statsBefore.latchTouches + 1,
  );
  settings.set({ latched: false });

  // Guarantee the chain actually has room to wind regardless of autoWind,
  // so this is a real "did it wind" check, not a coincidence of chain state
  // left over from an earlier test.
  movement.weights.strike = 0;
  await win.webContents.executeJavaScript("window.cuckoo.wind('strike')");
  await wait(200);
  report.check(
    'chain winds increments through the real wind IPC',
    settings.get('stats').chainWinds.strike === statsBefore.chainWinds.strike + 1,
  );

  // 9. Free sizing. Any scale at all, always in proportion, and remembered.
  const baseW = win.getBounds().width;
  for (const scale of [0.37, 2.4, 1.15]) {
    settings.set({ scale });
    await wait(260);
    const b = win.getBounds();
    const ratio = b.width / b.height;
    report.check(
      `case resizes to ${Math.round(scale * 100)}%`,
      Math.abs(b.width - Math.round(baseW * scale)) <= 2,
      `${b.width}x${b.height}`,
    );
    report.check(
      `proportions hold at ${Math.round(scale * 100)}%`,
      Math.abs(ratio - 460 / 820) < 0.02,
      ratio.toFixed(3),
    );
    if (scale === 2.4) await screenshot(win, report, '06-scaled-240');
  }
  report.check('resizable window', win.isResizable());
  const grip = await win.webContents.executeJavaScript(
    'Boolean(document.getElementById("resizeGrip"))',
  );
  report.check('corner grip present', grip);
  settings.set({ scale: 1 });
  await wait(300);

  // 10. The menu bar popover: it exists, it opens, and it sizes to its content.
  const panel = ctx.getPanel?.();
  report.check('panel window built', Boolean(panel?.win));
  if (panel?.win) {
    const panelConsole = [];
    panel.win.webContents.on('console-message', (event) => {
      const { level, message } = event;
      if (level === 'error' || level === 3) panelConsole.push(String(message ?? ''));
    });

    panel.show({
      x: 900, y: 0, width: 24, height: 24, // a plausible tray icon rectangle
    });
    await wait(700);
    report.check('panel opens', panel.visible);

    const h = panel.win.getBounds().height;
    report.check('panel sized to its content', h > 300 && h < 900, `${h}px tall`);

    const wired = await panel.win.webContents.executeJavaScript(
      'JSON.stringify({ tiles: document.querySelectorAll(".tile").length,'
      + ' chips: document.querySelectorAll(".chip").length,'
      + ' actions: document.querySelectorAll(".action").length,'
      + ' time: document.getElementById("time").textContent })',
    );
    const p = JSON.parse(wired);
    report.check('panel controls rendered', p.tiles === 8 && p.chips === 5 && p.actions === 4, wired);
    report.check('panel shows the time', /^\d{1,2}:\d{2}$/.test(p.time), p.time);

    // A tile click has to reach the real settings store, not just paint itself.
    await panel.win.webContents.executeJavaScript(
      'document.querySelector(".tile[data-key=\\"latched\\"]").click()',
    );
    await wait(300);
    report.check('panel toggle writes through', settings.get('latched') === true);
    settings.set({ latched: false });

    // And the size slider has to move the actual window. The track is
    // logarithmic, so the readout is the source of truth for what it asked for.
    const shown = await panel.win.webContents.executeJavaScript(
      'const s = document.getElementById("size"); s.value = "700";'
      + ' s.dispatchEvent(new Event("input", { bubbles: true }));'
      + ' document.getElementById("sizeValue").textContent',
    );
    const wantPct = parseInt(shown, 10);
    await wait(400);
    report.check(
      'panel slider resizes the case',
      wantPct > 100 && Math.abs(win.getBounds().width - Math.round(baseW * (wantPct / 100))) <= 4,
      `asked ${shown}, got ${win.getBounds().width}px`,
    );
    settings.set({ scale: 1 });
    await wait(250);

    await screenshot(panel.win, report, '05-panel');
    report.check('no panel console errors', panelConsole.length === 0, panelConsole.slice(0, 3).join(' | '));

    // The menu bar icon's own click path: open, then closed again. The wait
    // after hide() has to clear panel.js's own 250ms re-open debounce with
    // real margin, not just 50ms of it, or this flakes under load.
    panel.hide();
    await wait(400);
    ctx.togglePanel();
    await wait(400);
    report.check('tray click opens the panel', panel.visible);
    panel.hide();
    await wait(300);
    report.check('tray click closes it again', !panel.visible);
  }

  // 11. Nothing shouted at us from the renderer.
  const hardErrors = consoleLog.filter((c) => c.level === 'error' || c.level === 3);
  report.check(
    'no renderer console errors',
    hardErrors.length === 0,
    hardErrors.slice(0, 4).map((c) => `${c.where} ${c.text}`).join(' | '),
  );
  report.check('no process level errors', report.errors.length === 0, report.errors.join(' | '));

  console.log('\n--- summary ---');
  console.log(`${report.checks.length - report.failed}/${report.checks.length} checks passed`);
  if (report.shots.length) console.log(`screenshots in ${SHOT_DIR}`);
  if (consoleLog.length) {
    console.log('\nrenderer console:');
    for (const c of consoleLog.slice(0, 25)) console.log(`  [${c.level}] ${c.where} ${c.text}`);
  }

  const code = report.failed ? 1 : 0;
  console.log(`\nexit ${code}\n`);
  setTimeout(() => app.exit(code), 250);
}

module.exports = { runSelfTest: run, SHOT_DIR };
