# CuckooSoft — Source of Truth
_Last updated: 2026-08-05 by Opus 5, V3 front end built (patina, quirks, moon)_

## Current Status (read this first)
**V3 is now complete end to end.** The three character features (patina and
aging, rare quirks, moon phase) had working backends but no visuals at the
start of this session; all three are now built, gated by their toggles, and
verified in a live app. The popover has a new "Character" section with all
three toggles. Two extra visual changes were made at the user's direct
request mid session: **the dial now uses Arabic figures instead of Roman
numerals**, and **the pine cone weights were rebuilt from scratch** as real
fir cones. Self test is 47/48, the one failure being the same understood
time of day flake documented at the bottom of this file.

## What Was Done This Session (Opus 5, V3 front end)
All work in `src/renderer/clock.js`, `panel.html`, `panel.js`, `panel.css`.
Nothing in `src/main/**`, `src/preload/**`, `audio.js` or `assets/**` was
touched, per the standing division of labour.

- **Patina, feature 1.** A set of overlay layers that all start at zero
  opacity and are dialled in by a new `applyPatina()` from two saturating
  curves: `aged(days) = 1 - exp(-days/240)` off `settings.installedAt`, and
  `handled(n) = 1 - exp(-n/25)` off each stat counter. Repainted on every
  state push and on a 60 second timer, never per frame, so the animation
  loop is untouched. The model is deliberately physical: **age puts a
  tarnish film on all the brass, and handling rubs it back off the few
  parts that actually get handled.** Layers: `#patinaWood` (warmth into the
  panel and posts, dust into the recesses), `#patinaBrass` (tarnish over
  the static fittings), `#patinaFoxing` (asymmetric freckling on the dial),
  `#dialAged` (the existing `fAged` pass, opacity raised with age),
  `#patinaSession` (a warm glow that comes up over the first few hours of a
  run, off `appStartedAt`, the one thing that resets every launch),
  `#patinaLatch` plus `#latchTarnish`, `#patinaBob`, and per train
  `#patinaChain-*`, `#patinaPulley-*`, `#patinaHanger-*`
- **The per part reads are genuinely distinguishable**, verified with a
  scratch profile aged 1111 days with lopsided counters (68 latch, 41 bob,
  4/22/96 chain winds): chain polish came out 0.07 / 0.29 / 0.49 and hanger
  ring polish 0.11 / 0.34 / 0.73, visibly different on the three chains in
  a screenshot. With `patinaEnabled: false` every layer measured exactly 0
  and `latchTarnish`/`dialAged` returned to their unworn defaults
- **Quirks, feature 2.** `window.cuckoo.on('quirk', handleQuirk)`, plus
  `window.cuckooQuirk = handleQuirk` so a quirk can be previewed from
  devtools rather than waiting a day for one.
  - `peek`: **the first attempt failed and the fix is the interesting
    part.** The door only cracks to 42% (a real strike is 100%), and at that
    opening the door panel still covers the whole doorway, so the bird was
    invisible behind it. It now leans sideways (`PEEK.lean`, 46 units at
    full envelope) and cranes around the free edge of the ajar door, with a
    head turn left then right pivoted low at `rotate(look 0 20)` so the head
    travels and the perch does not. Reads far better than a straight push
    out would have. Layered additively over `anim.door`/`anim.bird` so the
    strike choreography's own springs are never written to, and a
    `door:open` event cancels an in flight peek
  - `stutter`: a phase lag and a slight amplitude pinch applied to the
    rendered bob only (`cos(phase*PI - phaseLag) * amp * ampScale`, both
    decaying to zero inside 1.6s). **The phase maths itself is untouched and
    `audio.js` was not opened**, so the audible tick cannot drift. Traced
    live over 2.2s: the bob pinches to about 7.2 degrees and is back at the
    full 8 by 1.8s
- **Moon phase, feature 3.** A brass bezelled aperture bored into the lower
  half of the dial at (230, 404), r 10.6. Night sky, hand pricked stars,
  a bone moon with seas, and the shadow drawn as one path whose terminator
  is an ellipse of half width `|cos(2*PI*phase)|`. Waning is the mirror of
  waxing so only `#moonShade` is flipped, which keeps the seas put and the
  moon showing the same face. Redrawn only when the quantised phase changes,
  not per frame. **The formula was checked against real reference dates**
  (2024-01-25 full, 2024-02-09 new, both landed correctly) and the render
  was checked by eye against today's real phase (waning gibbous, 55%, lit on
  the left, which is what it draws)
- **Popover "Character" section**, between Bird and the sliders, three
  `.trait` pills with custom SVG glyphs and a small pilot lamp so on and off
  never rests on tint alone. **Deliberately NOT added to the `.tiles` grid**:
  the self test hardcodes `tiles === 8 && chips === 5 && actions === 4` and
  that file is off limits, so a new class was the only safe route. It also
  reads better, since these three do not change what the clock does for you.
  Verified by real clicks through CDP: the pill writes through and the
  pushed state confirms rather than reverts. Panel height went 645px to
  725px, still inside the self test's 300 to 900 bound
- **`appStartedAt` captured in `boot()`**, directly off the `ready()`
  snapshot, because `applySnapshot(s)` only ever pulls `s.settings` and
  `s.movement` and would silently drop it
- **Arabic figures on the dial, at the user's request mid session.**
  `buildNumerals()` now emits 1 to 12 (and 1 to 24 in 24 hour mode) instead
  of Roman. The numeral ring moved out to r 48 and the size up to 16.5,
  which Roman numerals could not have carried: `VIII` is over twice the
  width of `8` and its corners were the binding constraint on the whole dial
  layout
- **The pine cone weights were rebuilt, at the user's request mid session**
  ("still dont look like real pinecones"). The old version was rounded petal
  shapes in straight alternating rows, which read as a blackberry. Now:
  a profile curve `17*sin(PI*t^0.78)^0.7` (narrow at the stalk, fullest a
  little under halfway down, long taper to a point), diamond shield scales
  with a raised umbo and a point at the tip, each row painted from the
  bottom up so every scale tucks under the one above, **rows offset by a
  constant 0.38 of a scale rather than merely alternating, which is what
  produces the intersecting spirals every real cone has**, horizontal
  foreshortening (`scale(fore 1)`, 0.42 at the rim) so scales round the far
  side read edge on, three new scale gradients for lit / square on / turned
  away, and a `gConeForm` shading pass over the finished cone so it reads as
  one round body. Two profile iterations were needed: the first was too
  blunt shouldered at the top and still read as a berry
- **Bonus carving pass, the parts that survived.** Shingle nail heads with a
  lit crown and one shingle in a dozen split up from its bottom edge;
  hand jitter on the dentils, base beads and dial ring bead and reel so no
  two repeat; twelve oak pegs through the case joints; directional gouge
  marks that follow each moulding's length rather than the turbulence
  filter's uniform axis; irregular plank seams with a lit arris; an engraved
  60 tick minute track with heavier quarter marks; per numeral tilt, weight
  and opacity jitter so the dial reads hand painted; extra covert scallops
  and a subtle per wing asymmetry on the crest
- **Bonus carving pass, what was tried and reverted, and why.** A full
  procedural feather system on the crest wings (individual primaries and
  secondaries with quills and barbs). It was built, screenshotted, judged a
  clear regression (spiky blades escaping the silhouette, the whole crest
  reading as a thistle), then rebuilt with an SVG clip to the wing mass,
  screenshotted again, and **still worse than the original: more detailed
  but plainly busier, which is exactly what the brief said not to do.**
  Reverted to the established crest form with only the light asymmetry and
  the extra coverts kept. `WING_MASS` is now a shared constant purely so
  both wings and the outline restatement use one source. Worth knowing next
  time someone is tempted: the crest's quality comes from its silhouette,
  and adding filled shapes inside it costs more than it pays

## Prior Context Below This Line
Fully working. **The project was renamed from "Cuckoo"/"cuckoo-clock" to
"CuckooSoft" this session and is now free and open source (MIT, see `LICENSE`),
with a real `README.md` for GitHub.** This is a rebrand, not a rewrite: internal
code identifiers (the `cuckoo:` IPC prefix, `window.cuckoo`, file names,
`CuckooAudio`, etc.) are all unchanged on purpose, only user facing strings
(window title, tray tooltip and menu labels, `package.json`) and the project's
own public identity changed. **A real settings migration runs on first launch
under the new name** (`migrateUserData()` in `main.js`): Electron's userData
folder is derived from the product name, so the rename alone would have
silently orphaned every existing user's saved preferences, install date, and
now the new lifetime stats, this copies the old `~/Library/Application
Support/Cuckoo/settings.json` over once, verified against real (not scratch
profile) data this session.

V2 (6 bird profiles) is feature complete end to end: backend by Claude, popover
UI by Kimi (`Bird` section in the quick settings popover, from
`~/Desktop/markdowns/cuckoo-clock-v2-bird-picker-kimi-prompt.md`), both surfaces
(popover and native tray menu) repaint from the same state push so they cannot
disagree.

**V3 is in progress: three new "character" features (patina and aging, rare
unscripted quirks, a moon phase ring on the dial), all three backend-complete
and self-test-verified this session, none of them have any visual
implementation yet.** Kimi hit a usage limit partway through this batch of
work; the handoff went to Opus 5 instead, with an explicit instruction to
match or exceed Kimi's established quality bar. Prompt waiting at
`~/Desktop/markdowns/cuckoosoft-v2-character-features-opus-prompt.md`.

**Division of labour, unchanged: Claude owns backend and audio
(`src/main/**`, `src/preload/**`, `src/renderer/audio.js`,
`scripts/generate-sounds.mjs`, `assets/sounds/**`), the front end
(`src/renderer/panel.*`, `src/renderer/clock.*`) is Kimi/Opus's.**

Audio mix rebalanced so the cuckoo chime clearly dominates the ticking;
`tock.mp3` alone went through 4 regeneration rounds this project and is now
user-confirmed by ear ("the new tock.mp3 is perfect"), `wind.mp3` confirmed by
ear, `music.mp3` and most of the 6 birds' sounds fixed but verified only by
measurement, not yet listened to (see Next Steps). Menu bar popover has a
one-click Restart app button, a Music box toggle, and a Quarter hour toggle.
Login item support (`launchAtLogin`) confirmed genuinely working against the
real macOS Login Items list this session, not just the stored preference.

## What Was Done This Session (Claude, CuckooSoft rebrand + V3 backend)
- **Renamed the project to CuckooSoft and open sourced it.** `package.json`:
  `name` to `cuckoosoft`, `productName` to `CuckooSoft`, `license` from
  `UNLICENSED` to `MIT`, `private` to `false`, `build.appId` to
  `com.maxzillion.cuckoosoft`. Added `LICENSE` (MIT, Max Zillion, 2026) and a
  real `README.md` (what it is, features, running/building/regenerating sounds,
  self test, project layout, contributing, license), plus `docs/screenshot-case.png`
  and `docs/screenshot-panel.png` for the README, both freshly captured from a
  real self test run this session, not stock/placeholder images. Window title
  and tray tooltip changed to `CuckooSoft`; tray menu status line, Quit, and
  Restart labels changed to `CuckooSoft` too, following standard macOS
  "Quit AppName" convention rather than the clock's own character name
- **Settings migration, and it was verified against real user data, not just
  reasoned about.** `migrateUserData()` in `main.js` runs before `Settings` is
  constructed: if the new `CuckooSoft` userData folder has no `settings.json`
  yet but the old `Cuckoo` one does, copies it over, once, never deletes the
  old folder. Verified end to end this session with a real (non scratch
  profile) launch: confirmed `launchAtLogin: true` (flipped for the user
  earlier this session) and all prior real settings carried over correctly
  into the new folder, and that the macOS Login Items registration still
  works post rename (shows as "Electron" in the actual Login Items list, not
  "CuckooSoft", since this is the unsigned dev binary, not a packaged build,
  cosmetic only, the registration itself is real)
- **V3 backend: patina/aging, rare quirks, and moon phase, all three
  request'ed by the user as "feature suggestions" and then greenlit with an
  explicit "on/off toggles" requirement.** New `settings.js` defaults, all
  default `true` (purely cosmetic, no functional downside, matches the "fun
  by default" ask):
  - `patinaEnabled`, `quirksEnabled`, `moonPhaseEnabled`: plain toggles,
    reachable now from a new "Character" submenu in the native tray menu
    (no popover UI yet, that is Opus's job)
  - `installedAt`: the clock's lifetime "birthday", set once on first ever
    load if not already present, survives `reset()` the same way `position`
    already did (a settings reset should not erase how long the clock has
    existed)
  - `stats: { latchTouches, bobTouches, chainWinds: { time, strike, music } }`:
    lifetime interaction counters. Deliberately NOT routed through the
    generic `settings.set()`/`coerce()` path a renderer could call arbitrarily,
    a new `Settings.bumpStat(key, sub)` method is the only way these change,
    called from `main.js`'s `cuckoo:toggle` handler (latch and pendulum bob
    toggles specifically) and `cuckoo:wind` handler (per chain, only on an
    actual successful wind, checked via the real return value, not assumed).
    `coerce()` still validates the shape defensively for whatever gets loaded
    from disk, just in case
  - A new `appStartedAt` (session start timestamp, resets every launch, NOT
    persisted) added to `stateSnapshot()`, a sibling of `settings` in the
    pushed state, not nested inside it, flagged explicitly in the Opus prompt
    since `clock.js`'s `applySnapshot(s)` currently only pulls `s.settings`
    and `s.movement`, it would silently drop this otherwise
  - A new low frequency "quirk" scheduler in `main.js` (`maybeFireQuirk`,
    checked every 10 minutes, roughly 1 in 144 chance per check, so about once
    a day when eligible): emits a new `quirk` event, `{ type: 'peek' |
    'stutter' }`, gated by `quirksEnabled`, never fires mid strike, only
    offers `peek` when the door could plausibly move (not latched, not night
    silenced, running) and only offers `stutter` when the pendulum is running.
    New `quirk` channel added to both `preload.js` and `panel-preload.js`'s
    `EVENTS` allowlists
  - Moon phase needed no new backend data at all: it is a pure function of
    the already-computed displayed date, so the Opus prompt hands over the
    formula directly (a standard synodic-month approximation) rather than
    backend plumbing
- **Self test: 6 new checks**, all passing (47/48 total, the 1 failure is the
  same pre-existing unrelated time-of-day flake): the three toggles default
  on and actually toggle, `installedAt` is a real timestamp, `appStartedAt`
  reaches the renderer, and both `latchTouches` and `chainWinds.strike`
  genuinely increment through the real `window.cuckoo.toggle()`/`wind()` IPC
  calls, not just by calling `settings.bumpStat()` directly, which would have
  proven far less
- Flipped `launchAtLogin` to `true` directly at the user's request, verified
  against the real macOS Login Items list (not just the stored setting)
- Gave the user a short, opinionated list of feature ideas when asked
  ("fun/exciting/interactive"): patina and aging, rare unscripted quirks, a
  moon phase ring, and (not built, user explicitly declined this one)
  discoverable birds unlocked through play instead of a plain picker menu

## What Was Done In The Previous Session (Kimi, V2 front end)
- **Pendulum bob enlarged and re-detailed** (user follow up: bob read as the same size
  as the fir cone weights). All the bob artwork in `src/renderer/clock.js` now sits
  inside a `scale(1.22)` group (visual radius 34 to 41, `L.pend.bobR` updated to
  match), and `leafBottom` moved 610 to 586 so the regulating leaf still clears the
  taller ferrule at its lowest stop. New carved detail, all plain strokes since the
  pendulum animates per frame and filters stay on static geometry: a beaded rim (the
  leaf outline restated twice just inside the edge, lit high and shadowed low), finer
  secondary veins between the existing mains (same dark cut plus lit edge technique),
  scalloped chisel gouge marks at the lobe sinuses, and long grain arcs following the
  leaf. Self test still 41/42 (same known flake), bob crop reviewed at full resolution
  in `01-idle.png`, clearly larger than the cones now
- **Bird picker added to the quick settings popover.** Only `src/renderer/panel.html`,
  `panel.js`, `panel.css` touched, no other files. A new `Bird` section sits between the
  tiles grid and the sliders: small caps label matching the `VOLUME`/`SIZE` treatment,
  then a 3 column x 2 row grid of pill buttons (`.birds`/`.bird`) reusing the size chip
  visual language (hairline brass border, soft brass tint plus faint glow on the active
  choice, same radii and transitions). All 6 birds from the backend contract: cuckoo,
  cardinal, redwing, robin, chickadee, dove
- Label is "Red winged Blackbird" with a space, not the hyphenated form, per the no
  dashes in prose house rule. The id passed to settings is exactly `redwing` as the
  backend expects. Buttons are `role="radio"` inside a `role="radiogroup"` with
  `aria-checked` mirroring the active state
- Wiring follows the existing tile/chip pattern exactly: delegated click handler on the
  grid paints the choice optimistically then calls `api.set({ birdProfile: id })`;
  `applyState` repaints the picker from `settings.birdProfile` (fallback `cuckoo`) on
  every pushed snapshot, so a change made from the native tray menu lights up in the
  popover and vice versa. Simple click to select, so no drag guard needed
- Verified: self test still 41/42 (only failure the known time of day flake, unrelated),
  zero renderer console errors, `05-panel.png` screenshot reviewed and the picker reads
  as native to the popover. The self test does not know the picker markup, so the wiring
  was additionally verified with a throwaway Electron harness (stub `window.cuckoo`,
  since deleted): all 6 buttons render with correct labels, clicking `redwing` fired
  `api.set({ birdProfile: 'redwing' })` and lit that chip, a pushed state with
  `birdProfile: 'dove'` repainted the picker to dove, and a bogus pushed id lit nothing
  without errors. Not verified by ear: actually hearing each bird's call after picking
  it, this environment cannot play audio. The backend half of that path (set reaching
  `audio.js`) is covered by the self test's `switching birdProfile reaches audio.js`
  check

## What Was Done In The Previous Session (Claude, audio and V2 backend)
- **Audio normalization and remix.** Root cause of "ticking is as loud as the chime": the
  raw ElevenLabs-generated clips in `assets/sounds/` had wildly inconsistent levels.
  Measured every clip with `ffmpeg -af volumedetect` (peak and mean/RMS), then
  peak-normalized all seven one-shot SFX (`cuckoo`, `strike`, `tick`, `tock`, `door`,
  `latch`, `wind`) to a common -1dBFS true peak with `ffmpeg -af volume=XdB -c:a
  libmp3lame -q:a 0`. `music.mp3` (the bed track) was loudness normalized instead via
  two-pass `loudnorm` to -23 LUFS / -1dBTP, the right metric for continuous audio rather
  than a one-shot. Rewrote `GAIN` in `src/renderer/audio.js` as an intentional mix rather
  than compensation for uneven source levels
- **tock.mp3 buzzing, two-pass fix.** Spectrogram analysis (`ffmpeg -lavfi
  showspectrumpic`) showed `tock.mp3`, unlike `tick.mp3`, is not a dry transient click: it
  only decays about 10dB across its full 500ms, a genuinely buzzy resonant tone baked in
  at generation. First pass just hard-trimmed it to 140ms, which shortened the buzz but
  the user listened and confirmed it still sounded like "a digital thump followed by a
  buzz, not a natural clock sound" — the *character* was wrong, not just the duration.
  Root cause found in `scripts/generate-sounds.mjs`: it renders several takes per sound
  into `assets/sounds/_candidates/` and scores them, but the `tock` scorer only checks
  peak/onset-count/duration, never whether the take actually decays, so it picked a bad
  take. `_candidates/tock-3.mp3` (one of the original 3 takes, previously passed over) is
  a genuinely clean transient matching `tick.mp3`'s decay profile. `tock.mp3` is now that
  take, peak-normalized with a light tail fade. `GAIN.tock` recalculated: 0.15
- **wind.mp3 trimmed.** Same defect pattern as tock, different shape: real content only
  in the first ~0.1s of a stated 3.886s file, true digital silence after, confirmed by the
  user on playback. First pass (this session) hard-trimmed the shipped file to 160ms as a
  stopgap, since nothing in code times off wind.mp3's length
- **Real root cause found for wind/music, and fixed at the source, not just patched.**
  Both `wind.mp3` and `music.mp3` originally shipped as a fraction-of-a-second blip
  followed by true digital silence for the rest of a much longer stated duration, and the
  user confirmed music by ear: "literally just a sine wave beep followed by silence." A
  first attempt to regenerate `wind` through `scripts/generate-sounds.mjs` (with API
  access this session via `craig-vault get ELEVENLABS_KEY`) produced 4 fresh takes that
  all failed the exact same way, which first looked like a systemic ElevenLabs limit, but
  a raw `curl` call with the identical prompt/duration succeeded cleanly. That pointed at
  the script's own post-processing, not the API. Root cause: `clean()`'s final filter was
  `afade=t=out:st=0:d=0.03`, meant as a tiny click-preventing fade at the very end of a
  clip, but `afade`'s `st` is an absolute time from the start of the stream, not from the
  end, so `st=0` fades the entire clip to silence starting at time zero and holds it there
  for everything after 30ms. Confirmed conclusively with a synthetic sine tone: content at
  1.0-1.5s measured true digital silence (-91dB) after this filter. Short one-shots (tick,
  cuckoo, strike, door, latch) survived unnoticed because their natural decay was already
  mostly over within that 30ms window; anything with real content lasting longer (a
  multi-second ratchet, a melody) was almost entirely erased. `clean()` now probes the
  trimmed clip's real duration first and computes the fade's start point from that instead
  of hardcoding 0
- **wind.mp3 and music.mp3 regenerated through the fixed pipeline, both good now.**
  `node scripts/generate-sounds.mjs wind music`: wind is a real 4-onset ratchet across the
  full 3.79s (verified by spectrogram), music has real melodic content across 9.14s with a
  natural tail-off in the last half second. Both peak-normalized to -1dBFS like the rest of
  the set. Also bumped `music`'s target ask from 14s to 10s in the script (the original 14s
  duration was never actually validated end-to-end before this session, since every past
  attempt at it hit the afade bug before anyone could tell if 14s itself was achievable;
  10s was empirically tested up to 12s working reliably, so it's a safety margin, not a
  proven hard limit) and increased `wind`/`music` takes for better odds. `musicMs` in
  `src/main/chime.js` updated from `14_000` to `9_000` to match the new file.
  `GAIN.music` raised from 0.5 to 0.75 since it now plays a real solo passage (door
  already shut, calls long over by the time it starts) rather than covering for a broken
  file. Also fixed while in there: the scorer for `tick`/`tock`/`latch` now rejects takes
  that don't decay (the same class of bug that let the bad tock take through originally),
  `wind`/`music` scorers now reject takes with real content covering less than 60% of the
  requested duration (catches a "blip then dead air" take even if peak/onset checks would
  have passed it), and the manifest-writing step at the end of the script now merges
  instead of overwriting, so hand-written notes at the top level survive a partial rerun.
  Full reasoning trail is in `assets/sounds/manifest.json`'s `tockFix` / `rootCauseFound` /
  `windFix` / `musicIssue` notes
- **Restart button.** One-click restart in the menu bar quick settings popover (fourth
  tile in `.actions`, next to Strike now / Pull chains / System time, in
  `src/renderer/panel.html`), and a matching `Restart Cuckoo` item in the native tray
  menu (`src/main/tray.js`) next to Quit, so the two surfaces agree per the panel's own
  design rule. Wired through `panel-preload.js` → `cuckoo:restart` IPC → `app.relaunch();
  app.quit();` in `src/main/main.js`, which goes through the existing `before-quit`
  handler so `settings.flush()` still runs before the relaunch (no dropped last-second
  slider changes)
- Verified: durations of every mp3 unchanged except tock's intentional trim, all
  post-normalization peaks confirmed at target, `node --check` passes on every touched
  `.js` file, `manifest.json` parses. Launched the real app (`electron .` in the
  background, `--user-data-dir` pointed at a scratch profile) and confirmed via
  screenshot that it boots clean with all these changes (window renders, no crash, tray
  and menu build without error). Could not click the actual tray icon or popover button
  from this shell (`osascript`/System Events has no Accessibility permission here, error
  -1728), and could not literally hear the audio fixes, so both are verified by
  code/measurement, not by a live interaction or listening pass
- **Music box toggle added to the popover.** User asked to be able to turn the music cue
  off, having never heard a real cuckoo clock do that. Turned out the setting already
  existed end to end (`musicBox` in `settings.js`, already gating playback in
  `movement.js`'s `fire()`, already a checkbox in the native tray menu), it just was not
  in the quick popover. Added as a 7th tile in `src/renderer/panel.html`/`panel.js`
  (`.tiles` grid widened from 3 to 4 columns to fit it without an orphaned row), with a
  new hand drawn note-glyph icon. No backend changes needed. Screenshot-verified via the
  self test
- **Full codebase quality scan** (the thing that surfaced the music toggle gap above).
  Read every file in `src/` and `scripts/` end to end: `movement.js`, `settings.js`,
  `main.js`, `preload.js`, `panel-preload.js`, `panel.js` (both the main-process window
  controller and the renderer), `tray.js`, `chime.js`, `audio.js`, `generate-sounds.mjs`,
  `selftest.js` in full; `clock.js`/`clock.css` by targeted grep since they were untouched
  this session and already had a documented, verified session of their own. Cross-checked
  every exposed preload API against every call site in both renderers (no orphaned calls,
  no dead exposed methods beyond a couple of deliberately-shared ones), swept for
  TODO/FIXME/debugger/stray console.log (none), confirmed every `.js` file passes `node
  --check`, confirmed CSS brace balance. Found and fixed:
  - `manifest.json`'s `cuckoo.durationSeconds` said 0.914s but the actual shipped
    `cuckoo.mp3` is 0.465s and matches none of its own `_candidates/cuckoo-*.mp3` takes
    either. Pre-existing since the very first commit, unrelated to anything touched this
    session, just wrong documentation (the audio file itself is fine, confirmed by
    listening and by this session's own spectrogram review). Corrected the number
  - The self test's tray-click-reopens-panel check flaked once under load: it only left
    50ms of margin above `panel.js`'s own 250ms re-open debounce (`wait(300)` after
    `hide()`). Widened to `wait(400)` for real margin
  - The self test's hardcoded tile/action counts needed updating for the two UI additions
    this session (Restart button, Music box toggle): now asserts 7 tiles, 4 actions
  - Re-ran the self test after each fix: 37/38 clean, only the pre-existing, understood
    time-of-day flake remains (see Important Context)
  - Nothing else found. `movement.js`'s weight/drift/scheduling math, `settings.js`'s
    coercion and debounced save, all the IPC wiring in `main.js`, and the tray menu build
    are all internally consistent with no dead code or unhandled edge cases spotted
- **V2 feature 1: 15 minute chime, backend complete.** New `quarterHourCall` setting
  (`settings.js`, default `false`, "a lot of cuckooing" otherwise). `movement.js`'s
  `nextBoundary()` now schedules every 15 minutes unconditionally (:00/:15/:30/:45)
  instead of just :00/:30; `fire()` decides per boundary whether the relevant setting
  actually allows it to ring, same pattern as the existing half-hour gate. Single call,
  same as half-hour, per the user's explicit choice when asked. Music never plays on a
  quarter (only `isHour`, or `isHalf` with `musicOnHalfHour`), that was a judgment call,
  not requested either way. Wired into the native tray menu (checkbox next to Call on the
  half hour) and, since it is boolean, straight into the popover as an 8th tile
  (`quarterHourCall`, new diagonal-hand icon distinct from the half-hour icon), which
  filled the tiles grid to a clean 4x2 with no empty slots. Self test: two new checks
  (off by default, fires one call when enabled), both going through `movement.fire()`
  directly since there is deliberately no manual "strike the quarter" trigger
- **V2 feature 2: 6 bird profiles, backend complete, no popover UI yet.** User's picks:
  Cardinal and Red-winged Blackbird as must-haves (Claude filled out the rest: American
  Robin, Chickadee, Mourning Dove, plus the original Cuckoo). Real scope, not a small
  addition: 15 new sound files (5 birds x call + tick + tock), a `birdProfile` setting,
  and `audio.js` reworked to load a sound set per bird instead of one fixed set.
  - Generated all 15 through `scripts/generate-sounds.mjs` in 3 batches (cardinal+redwing,
    robin+chickadee, dove), each call prompt keeps the "wooden bellows mechanism
    imitating a bird" framing the default cuckoo call uses (not a real field recording),
    each bird's tick/tock prompt varies the wood type/character (maple, walnut, cherry,
    birch, cedar) for a distinct personality per bird, not just a relabeled default click.
    `doveTock`'s own first take was auto-rejected by the tickTockScore decay check added
    earlier this session, the exact bug class that shipped the original bad tock, so that
    guard already proved itself on real new generations
  - All 15 peak-normalized to -1dBFS to match the rest of the set. `doveTock` needed a
    second, more conservative pass: naive normalization landed it at exactly 0.0dBFS after
    mp3 encoding despite measuring -1.0dB pre-encode, real inter-sample-peak clipping risk,
    now sits at -0.2dB with margin
  - `GAIN` entries for all 15 tuned the same measure-then-set-an-intentional-mix way as
    the original set, not copied numbers: every bird's call landed within 1.1dB of the
    default cuckoo call's effective loudness, every tick/tock within 0.7dB of the default
    tick's, so switching birds should not require re-touching the volume slider
  - Found and fixed a manifest bug of the same shape as the `cuckoo.durationSeconds` one:
    the generation script records `peakDb` from its own pre-normalization measurement,
    so all 15 entries were stale the moment the manual normalization pass ran on top.
    Corrected by re-measuring the actual shipped files, not the script's own log
  - `audio.js`: new `BIRDS` map (id to label/call/tick/tock file basenames), `SOUNDS` is
    now built from the union of every bird's files plus the 5 shared mechanism sounds
    (23 total, up from 8), new `bird()` helper resolves the active profile with a
    fallback to `cuckoo` if settings ever hold something stale, `playCall()` and the
    tick/tock scheduler both resolve through it instead of hardcoded names
  - `settings.js`: `birdProfile` defaults to `'cuckoo'`, validated against a
    `BIRD_PROFILES` allowlist (unknown values fall back rather than silently accepted,
    the one settings key that previously had zero validation). `BIRD_LABELS` exported
    alongside for the tray menu
  - `tray.js`: new "Bird" submenu, radio buttons, same pattern as the existing night
    start/end time pickers. This is what makes the feature functionally testable right
    now even with no popover UI
  - Self test: three new checks, all 23 sounds decode, every one of the 6 profiles
    resolves to buffers that actually loaded (catches a typo in `BIRDS` before it ships
    as a bird that plays nothing), and a real `settings.set({ birdProfile })` round trip
    through the actual IPC/state-push path reaches `audio.js`, not just a direct call
  - **What is NOT done:** any popover UI for picking a bird. Division of labour for this
    session onward is Claude on backend/audio, Kimi on front end, so the picker itself
    (`src/renderer/panel.*`) is Kimi's job. Full prompt with the exact API contract, the
    6 ids/labels, existing UI patterns to reuse (the Size chip row is the closest match),
    and constraints is written and waiting at
    `~/Desktop/markdowns/cuckoo-clock-v2-bird-picker-kimi-prompt.md`
  - `assets/sounds/manifest.json`'s `birdProfiles` note has the full reasoning trail
- **Analog regeneration pass on 7 flagged sounds.** The user marked 7 files red in Finder
  (readable via `xattr -p com.apple.metadata:_kMDItemUserTags <file>`, no Spotlight
  index needed, `mdls`/`mdfind` did not work in this environment but the raw xattr does):
  `tock`, `cardinalTock`, `redwingTock`, `redwingCall`, `robinTock`, `chickadeeCall`,
  `doveTock`. All 7 measured as clean, well-decayed transients, this was purely a timbral
  complaint ffmpeg measurement cannot catch: too digital/clean sounding, not analog or
  realistic. Real pattern in what got flagged: short, simple, low-complexity sounds (dry
  knocks, two-note calls) rather than the denser/longer takes (cuckoo call, strike, wind,
  music), consistent with a generator defaulting to a clean synth-like rendition when the
  ask is simple. Regenerated all 7 with two prompt changes: explicit "recorded on real
  tape... organic and analog in character, distinctly not a synthesized or digital
  sounding tone" framing, and lower `prompt_influence` (tick/tock 0.85 to 0.7, calls 0.8
  to 0.65, on the theory that high influence pushes toward a literal, idealized, more
  synthetic-sounding rendition). Takes bumped 3/4 to 5 for better odds. Two of the new
  call prompts (`redwingCall`, `chickadeeCall`) initially exceeded ElevenLabs' 450
  character limit once the analog framing was added and the whole batch call failed
  before reaching any of the later sounds in that run, caught immediately and fixed by
  trimming redundant descriptive phrases, no real cost beyond the one failed attempt.
  `tock`'s regeneration had 2 of 5 takes auto-rejected by the decay scorer again,
  `chickadeeCall` had 1 of 5 rejected, the guard added earlier this session keeps earning
  its keep. All 7 re-verified for decay, re-peak-normalized to -1dBFS, `GAIN` retuned to
  the same effective-loudness targets as the rest of the set. Cleared the red Finder tags
  on all 7 once done. **Whether these actually sound more analog is unverified**, same
  fundamental limitation as everything else audio this session: this environment can
  measure sound but never play it. Full reasoning trail, including what to try next if
  the user still flags these after listening, is in `manifest.json`'s `analogPass` note
- One close call worth flagging for future sessions: an exploratory
  `node -e "import('./scripts/generate-sounds.mjs')..."` (meant only to inspect prompt
  text, no CLI args passed) accidentally triggered the script's real, unconditional
  `main()`, which with no argv filter would regenerate all 23 sounds for real. Caught and
  verified no damage (manifest's `cuckoo` entry timestamp was unchanged, meaning the
  process exited before any file write), but the lesson is real: never `import()` this
  script for any reason, even read-only inspection, it has no `if (require.main)`-style
  guard and executing it always means real API calls against real assets. Inspect prompt
  text with `grep`/`python3` string parsing on the source file instead, never by loading it
- **Analog pass round 2: found a real scorer gap, not just bad luck.** 2 of the previous
  round's 7 fixes (`tock`, `robinTock`) came back Finder-tagged yellow: still too digital,
  now with an audible hum/buzz too. Root cause traced by spectrogram and by checking every
  candidate take, not just the shipped one, rather than assuming and re-rolling: round 1's
  prompt addition, "recorded on real tape with natural room tone", is quite literally a
  request for background noise, and the model took it that way for these two takes. Both
  had a fine transient but a tail that plateaued at -16 to -30dB instead of decaying
  toward real silence (every clean shipped tick/tock sits at -47 to -60dB), which read as
  a constant hum rather than a natural fade. This got past `tickTockScore`'s existing
  decay check because that check is relative to the take's own peak, and a quiet-but-flat
  hum can be 20+dB under a loud peak while never approaching true silence. **Fixed the
  scorer, not just the sounds:** `tickTockScore` now also has an absolute floor
  (`tailDb > -40` rejects), calibrated against every clean shipped tick/tock's real
  measured tail, and `measure()`'s tail window widened from the final 20% to the final
  40% of the file, since a narrow window can land on a quiet moment even inside a take
  that hums constantly. For the sounds themselves: dropped "room tone" from `tock`'s
  prompt, added explicit "no hiss, no hum, no background noise", bumped to 6 takes (3rd
  attempt); `robinTock` needed no new API call, one of its original 5 candidates
  (`_candidates/robinTock-4.mp3`, never chosen) was already clean and got swapped in
  directly, the same move that fixed the very first tock bug this session. Both
  re-verified by spectrogram, re-peak-normalized, `GAIN` retuned. Flagged at the time:
  `tock`'s tail only reached about -37dB by the end of its 500ms window, not as deep as
  `robinTock`'s -55dB, so it might come back again. Full trail in `manifest.json`'s
  `analogPassRound2` note. Yellow tags cleared on both files once done
- **`tock.mp3` round 4, and this time it's confirmed fixed by ear.** It did come back,
  exactly where flagged: the user reported it "sounds like hitting an 808 tom drum
  sample", too bassy and too long, not organic. Root cause was the prompt itself, not a
  scorer gap this time: round 3's text ("a deep dry wooden knock, darker and lower than a
  tick") pushes hard on depth/darkness/knock framing, which is precisely what a booming
  low-frequency drum hit is made of. The user's own diagnosis and fix: use "clack" instead
  of the literal word "tock" (which likely carries its own bell/gong connotation to the
  model) and stop emphasizing bass/depth. Rewrote the prompt around "a dry short wooden
  clack, crisp and brief, not deep, not bassy, not a drum hit, not a resonant boom",
  tightened `maxDuration` from 0.5 to 0.35 (the complaint was partly literal duration),
  raised `prompt_influence` back from 0.7 to 0.75. **Also found and fixed a real bug while
  in there:** `tick` and `tock` had never actually been migrated to the shared
  `tickTockScore` function when it was created earlier this session, they still had their
  own pre-refactor hand-written duplicate scorer, missing the round 2 absolute tail-floor
  fix entirely. Round 3's regeneration ran without that guard active despite the code
  appearing to have it. Both now reference `tickTockScore` directly like every bird
  tick/tock already did. New take: 0.20s (close to `tick`'s own natural length), tail
  decays to -58dB (matches or beats every clean reference), spectrogram shows energy
  concentrated in the 3.5-8kHz click range rather than low-frequency drum territory.
  Re-peak-normalized, `GAIN.tock` retuned to 0.25. **User confirmed by ear: "the new
  tock.mp3 is perfect."** First actual listening confirmation of any audio fix this
  session, everything else audio remains measurement-verified only. Full trail in
  `manifest.json`'s `analogPassRound3` note

## What Was Done In The Previous Session (weights, bob, chains, numerals)
- Desktop launcher: `~/Desktop/Cuckoo Clock.app`, a hand built bundle (Info.plist plus a
  bash `CFBundleExecutable` that runs `electron .` in the project). Custom icon at
  `Contents/Resources/CuckooClock.icns`, rendered from the `01-idle.png` screenshot
  (alpha threshold crop of the case, transparent padding, full iconset via iconutil).
  `LSUIElement` true so the launcher itself stays out of the dock. Verified: `open`
  launches the full Electron process tree
- Rebuilt the weights as real fir cones in `buildCone`: dark core silhouette, 9 staggered
  rows of petal scales following the cone profile, rim highlight and centre groove per
  scale, seeded variation per cone. Replaces the dot rows that read as grapes
- Rebuilt the pendulum bob as a carved oak leaf: `gBob` radial gradient, lobe chisel
  shadows, worn rim light, raised veins with lit edges, brass ferrule. The ghost double
  layer (opacity 0.55) is gone
- Chains are now solid interlocking brass links (alternating ellipse links, two stroke
  passes), trimmed per frame by a `clipPath` rect (`clipRect-{train}` height), replacing
  the see-through dashed strokes. This was the transparency the owner reported near the
  bottom of the case
- Roman numerals now dark chestnut (`#46290f`) on the yellowed face
- Self test run with `--user-data-dir=/tmp/cuckoo-test-profile` because a live owner
  instance was holding the single instance lock

## What Was Done In The Previous Session (menu bar and sizing)
- **Menu bar quick settings popover.** New `src/main/panel.js` plus
  `src/renderer/panel.{html,css,js}` and `src/preload/panel-preload.js`. A transparent
  frameless window that drops out of the tray icon: live time in colossal brass type, a
  pendulum bob sweeping in step with the real escapement, six toggle tiles (latch,
  silence, half hour, night off, on top, click through), volume and size sliders, S/M/L/XL
  and Fit chips, three actions (strike now, pull chains, system time), then links to the
  full native menu and quit
- Popover measures its own content and asks the main process for exactly that height.
  It draws its own shadow inside a 12px transparent gutter, because a native NSWindow
  shadow goes stale every time a transparent window changes height
- Tray behaviour changed: **left click opens the popover, right click opens the full
  native menu**. `setContextMenu` is deliberately not used, since attaching one makes
  macOS swallow the click event
- **Free resizing.** The clock window is now `resizable` with `setAspectRatio`, so any
  edge or corner drags it to any size in proportion. Scale range widened to 20% through
  600% in `settings.js`
- `enableLargerThanScreen: true` was required: macOS silently crops any *visible* window
  to the work area, which capped the case at the display height (this was a real failing
  check before the fix, 240% came back as 100%)
- A resize grip lives in the empty air at the bottom right of the case, invisible until
  the cursor finds it, then two brass rules. Driven from the main process like the
  existing window drag so it stays glued to the cursor mid strike
- Edge drags write straight into `settings.values.scale` and bypass the `onChange`
  listener, because `applyScale` would otherwise snap the window back every frame of the
  drag. A `settingBounds` flag stops our own `setBounds` calls being read back as user input
- Size slider is logarithmic (20% to 600% across the track) so 100% sits near the middle
- Tray menu gained: Quick settings, Bigger, Smaller, Fit the screen, Centre on screen,
  and a live size percentage in the Size label
- Self test extended from 20 to 38 checks: free resize at three scales, proportions,
  grip presence, popover build/open/height/controls/time, a tile click writing through to
  the real store, the slider moving the actual window, and the tray click open and close path

## What Was Done In The Previous Session (visual layer)
- Wrote the full visual layer in `src/renderer/clock.js` and `src/renderer/clock.css`
  (replaced the probe placeholder). No other files touched
- One SVG, viewBox `0 0 460 820`, fills `#stage`: gabled roof with varied hand cut
  shingles and carved bargeboards, spread wing bird crest, oak garland down both posts,
  carved dial ring with Roman numerals (IIII form), pierced spade and moon hands, arched
  bird door with brass latch and catch, night and mute wire levers, leaf bob pendulum
  with regulating leaf, three pine cone weights on dashed stroke link chains
- Carved depth via SVG filters in defs: `fCarved`/`fCarvedDeep` (feTurbulence bump into
  feDiffuseLighting, distant light upper left, multiplied over source), `fGrainV`/`fGrainH`
  (stretched turbulence grain clipped to the shape), `fAged` (dial blotching)
- One rAF loop drives everything: hands from `Date.now() + offsetMs`, pendulum from
  `beatEpoch`/`beatMs` phase maths (locked to the tick), weight easing plus continuous
  time train extrapolation, door/bird/beak/latch/lever springs, case sway as a spring
  rocked by chime events (applied as CSS transform on the svg element so filters do not
  re-rasterize)
- Front-facing carved cuckoo bird on a perch rod: scalloped breast plumage, folded wing
  feather rows, beaded eyes, beak splits open twice per call (mouth gapes, lower beak drops)
- All interactions wired: case drag, latch toggle (with `latch` sound), night and mute
  levers, chain pull to wind, minute hand drag with live preview and motion work,
  bob click toggles pendulum with decaying coast down, regulating leaf drag sets
  `pendulumLeaf`, dial double click resets hands, clickthrough drops hover affordances
- `chime:blocked` honored: latch shudders and door strains when latched, levers tremble
  for night and silent blocks
- Self test 20/20, three iterations on screenshots (`/tmp/cuckoo-shots`)

## Active State
- **What works:** everything above, verified by the self test (47/48, one known flake).
  All three V3 character features are built and verified in a live app, not just in the
  test harness: patina layers measured at a simulated 1111 day age with lopsided
  counters and confirmed to zero out when switched off, a peek driven and screenshotted
  frame by frame, a stutter traced over 2.2s of real pendulum angles, the moon checked
  against reference dates and against today's real phase, and all three popover pills
  clicked for real and confirmed to write through. Zero renderer and zero panel console
  errors. All 23 audio files still load and decode, every bird profile resolves
- **What's broken / WIP:** nothing known
- **Not verified by machine:** an actual OS-level click on the menu bar icon or a real
  cursor drag of the grip (Accessibility permission is not granted to this shell). Not
  verified by ear: `wind.mp3`, `music.mp3`, the cuckoo call itself, and most of the 6
  birds' sounds (`tock.mp3` is the one confirmed exception, user-confirmed "perfect"
  after 4 regeneration rounds), and the quiet `door` cue the peek plays at gain 0.22.
  **Not verifiable at all in a short session: patina at a real age.** Every reading was
  taken against a synthetic `installedAt`. On a genuinely fresh install it is invisible
  by design, which is the brief, but it means nobody has yet seen it arrive on its own
- **Blockers:** none

## Next Steps
1. `npm start` and live with it for a few days. Patina is the one thing that cannot be
   reviewed in a sitting. If it ever reads as too strong or too weak, the two curves to
   turn are `aged()` and `handled()` at the top of the patina block in `clock.js`, and
   the per layer multipliers are all in one place in `applyPatina()`
2. To see a quirk without waiting a day, open devtools on the clock window and call
   `window.cuckooQuirk({ type: 'peek' })` or `{ type: 'stutter' }`
3. `npm start`, open the popover, pick a few birds, and hit "Strike now" after each to
   confirm by ear that the chime actually changes character per bird. Nobody has heard
   any of the 6 birds' calls or tick/tocks yet, all bird audio is measurement verified
   only, except the default `tock.mp3` which is now user-confirmed. Priority listen:
   `cardinalTock`, `redwingTock`, `redwingCall`, `robinTock`, `chickadeeCall`, `doveTock`,
   the sounds from the same analog regeneration pass that took `tock` 4 rounds to land
   (see the `analogPass*` notes in `assets/sounds/manifest.json` for the playbook if any
   come back flagged)
4. Click the menu bar icon and confirm the Restart app tile, Music box tile, Quarter
   hour tile, the Bird picker, and the new Character pills all actually work in the real
   app, and that the equivalent items in the native tray menu do too
5. If actually publishing to GitHub: `package.json`/`README.md` have no `repository`,
   `homepage`, or `bugs` URL yet, there was no real repo URL to put there at the time.
   Worth adding once the repo exists. The hand built `~/Desktop/Cuckoo Clock.app`
   launcher (a separate bundle, not part of this repo) was also not renamed to match,
   left alone since it is a personal dev convenience, not the public project
6. Optional one liner: `LSUIElement: true` in `package.json` build config would drop the
   dock icon and make it a pure menu bar app. Left as is because it changes launch
   behaviour and was not asked for
7. Remaining polish candidates: more contrast in the folded wing feathers on the door
   bird, and a look at whether the moon aperture wants to sit somewhere the hands cross
   less often (it is at the traditional spot, but both hands do pass over it)

## Important Context
- Self test: `CUCKOO_SELFTEST=1 CUCKOO_SHOT_DIR=/tmp/cuckoo-shots ./node_modules/.bin/electron .`
  Normal run: `npm start`. Add `--user-data-dir=/tmp/cuckoo-test-profile` when a live
  instance is holding the single instance lock, otherwise the test exits silently
- The `night window detected` check is time-of-day dependent: it does `setHands(2, 0)`
  and `setHands` wraps offsets beyond plus or minus 6 hours, so between roughly 08:00
  and 20:00 local the displayed time lands near 14:00 and the check fails. Backend
  behaviour in `src/main`, not the visual layer
- Gotcha that cost an iteration: reusable leaf/acorn defs must use `fill="currentColor"`
  with a `color` attribute on the instancing group. `fill="inherit"` inherits the fill
  property (default black), not `color`, and every carving rendered as a black blob
- Expensive SVG filters live only on static geometry. Anything animated per frame
  (pendulum, weights, door, bird, hands) uses plain gradients and strokes only
- House rules enforced: no network, no emojis, no dashes in any prose including code
  comments, no grid backgrounds, plain ES2022 with no imports
- Backend contract details: `movement.snapshot()` gives `offsetMs`, `beatMs`, `beatEpoch`,
  `running`, `weights`. Chime timings in `src/main/chime.js` (first call at 340ms,
  1700ms per call, bird stays out 520ms)
- Sizing gotchas, all of them cost a debugging pass: macOS crops visible windows to the
  work area unless `enableLargerThanScreen` is set; `applyScale` fights a live edge drag
  unless the resize handler writes to `settings.values` directly; and `setBounds` lands
  asynchronously, so the `settingBounds` guard has to outlive the current tick
- The tray must NOT call `setContextMenu`. It swallows the left click that opens the
  popover. Right click pops the menu explicitly instead
- Both renderers share the same event channels. `send()` in `main.js` fans out to the
  clock window and the popover, so the case, the popover and the native menu can never
  disagree about state
- **Division of labour as of this session: Claude owns backend/audio, Kimi owns the front
  end.** Backend/audio = `src/main/**`, `src/preload/**`, `src/renderer/audio.js`,
  `scripts/generate-sounds.mjs`, `assets/sounds/**`. Front end = `src/renderer/panel.*`
  (the popover) and `src/renderer/clock.*` (the case artwork). If a future request touches
  UI, that is Kimi's file set now, write a prompt to `~/Desktop/markdowns/` rather than
  building it directly, same as `cuckoo-clock-frontend-agent-prompt.md` (the original
  visual layer) and `cuckoo-clock-v2-bird-picker-kimi-prompt.md` (the bird picker) did
- `scripts/generate-sounds.mjs`'s `clean()` step had a real bug (`afade=t=out:st=0`
  silencing everything past 30ms, see What Was Done This Session for the full story) that
  is now fixed. If sound generation is ever needed again, the pipeline can be trusted: it
  peak-normalizes nothing itself (that is a separate manual pass after generation, see the
  pattern used for every sound this session), but its scorer now actually rejects takes
  that do not decay (tick/tock/latch) or that are a blip followed by dead air
  (wind/music-shaped asks). Still worth spot checking a new sound's spectrogram before
  shipping it, the scorer is a safety net, not a guarantee
- Bird sound files are flat in `assets/sounds/`, not namespaced into subfolders
  (`cardinalCall.mp3`, not `birds/cardinal/call.mp3`), to keep `scripts/generate-sounds.mjs`
  and `audio.js`'s `SOUNDS`/loading logic simple. `audio.js`'s `BIRDS` map is the single
  source of truth for which files belong to which bird; `settings.js`'s `BIRD_PROFILES` /
  `BIRD_LABELS` are a separate, parallel list for validation and the tray menu and have to
  be kept in sync by hand, there is no shared import between main and renderer code here
