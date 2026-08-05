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
  report.check('all 8 sounds decoded', loadedSounds.length === 8, loadedSounds.join(', '));

  const audioState = await win.webContents.executeJavaScript(
    'window.cuckooAudio?.ctx?.state ?? "none"',
  );
  report.check('audio context not suspended', audioState === 'running', audioState);

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

  // 8. Settings survive a round trip through the store.
  settings.set({ volume: 0.42, scale: 1.3 });
  await wait(700);
  report.check('settings persist', settings.get('volume') === 0.42 && settings.get('scale') === 1.3);
  settings.set({ scale: 1 });
  await wait(400);
  await screenshot(win, report, '04-final');

  // 9. Nothing shouted at us from the renderer.
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
