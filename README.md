# CuckooSoft

A hand carved, fully working Black Forest cuckoo clock that lives on your macOS
desktop. Real pendulum physics, real weight driven chains, an hourly cuckoo
call with a genuine bellows sound, and a menu bar popover for everything else.
Free and open source, MIT licensed.

<p align="center">
  <img src="docs/screenshot-case.png" alt="CuckooSoft case" width="360">
  <img src="docs/screenshot-panel.png" alt="CuckooSoft quick settings popover" width="360">
</p>

## What it is

CuckooSoft is not a clock face, it is a small simulation. The pendulum swing,
the tick and tock, the weight driven chains, the cuckoo call, the bird door
and its brass latch, the night silence lever, all of it runs on real timing
and real state, not a looping animation. It sits as a transparent, frameless,
always on top window, and lives in the menu bar the rest of the time.

## Features

- **Real movement.** Pendulum with a regulating leaf, three weighted chains
  (time, strike, music) that visibly descend and can be wound by hand, an
  authentic drift mode for anyone who wants their clock to genuinely run fast
  or slow like the real thing.
- **A proper strike train.** Hour, half hour, and quarter hour calls (each
  independently toggleable), a wire gong, a music box waltz after the hour,
  a brass latch that physically silences the bird, and a night shut off
  window.
- **Six selectable birds.** The classic cuckoo, plus Cardinal, Red winged
  Blackbird, American Robin, Chickadee, and Mourning Dove, each with its own
  call and its own tick/tock pair.
- **Character.** Patina that builds with handling and age, rare unscripted
  little moments (a curious peek between calls, a caught breath in the
  pendulum), and a small moon phase ring on the dial, all independently
  toggleable.
- **A menu bar popover** for the controls worth reaching for in a hurry, and
  an exhaustive native menu for everything else.

## Running it

```bash
npm install
npm start
```

`npm run dev` runs the same thing with devtools open. There is no build step
for day to day development, the renderer is plain ES2022 loaded directly.

### Building a distributable

```bash
npm run dist   # unpacked app, for local testing
npm run pack   # packaged .app
```

Both use `electron-builder` and are macOS only for now.

### Regenerating the sound pack

The clock's sounds were generated with the ElevenLabs sound effects API, not
recorded. `scripts/generate-sounds.mjs` renders several takes per sound,
scores them automatically (does it actually decay to silence, does it fill
the requested duration, does it sound the way it was asked to), and keeps the
best one. Requires an `ELEVENLABS_API_KEY`:

```bash
ELEVENLABS_API_KEY=... node scripts/generate-sounds.mjs        # everything
ELEVENLABS_API_KEY=... node scripts/generate-sounds.mjs tock   # just one sound
```

## Verifying a change

There is a self test harness that boots the real app, drives the mechanism
(does the bird actually come out, does the latch really stop it, does the
escapement tick, does every setting actually take effect), captures every
renderer console error, and screenshots the result:

```bash
CUCKOO_SELFTEST=1 CUCKOO_SHOT_DIR=/tmp/cuckoo-shots ./node_modules/.bin/electron .
```

## Project layout

```
src/main/       the going train: settings, movement, chime sequencer, tray,
                the menu bar popover window, the self test harness
src/preload/    the whole surface the renderer is allowed to touch
src/renderer/   clock.js/clock.css draw and animate the case, audio.js is the
                bellows and the escapement, panel.js/html/css are the popover
scripts/        the sound generation pipeline
assets/sounds/  the generated sound pack and its manifest
```

## Contributing

Issues and pull requests are welcome. If you touch anything in `src/main` or
`src/renderer/audio.js`, run the self test before opening a PR. If you touch
the visual layer (`src/renderer/clock.*`, `src/renderer/panel.*`), a
screenshot in the PR description goes a long way, this is a project where the
craft is the whole point.

## License

MIT, see [LICENSE](LICENSE).
