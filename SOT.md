# Cuckoo Clock — Source of Truth
_Last updated: 2026-08-05 by Craig, backend baseline committed before visual handoff_

## Current Status
Backend is finished and fully green (20/20 self test checks). The renderer is still a
throwaway probe placeholder. The visual layer is the only remaining work, and it is
handed off to Kimi via `~/Desktop/markdowns/cuckoo-clock-frontend-agent-prompt.md`.

## What Was Done This Session
- Verified the whole backend end to end: `20/20 checks passed`, zero renderer console errors
- Committed the first real baseline (`a03a6ba`) so the visual layer overwrite is recoverable
- Added `.gitignore` and pulled `node_modules`, `build`, and `assets/sounds/_candidates`
  back out of the index. Tracked files went from 7723 down to 26
- Wrote this SOT

## Active State
- **What works:** movement and offset sync, chime sequencer (hour, half hour, night lever,
  latch block, empty chain, rewind), tray, settings persistence, preload bridge, all 8
  sounds decode and play, self test harness with screenshots
- **What's broken / WIP:** `src/renderer/clock.css` and `src/renderer/clock.js` are the
  probe placeholder. There is no artwork yet
- **Blockers:** none

## Next Steps
1. Feed `~/Desktop/markdowns/cuckoo-clock-frontend-agent-prompt.md` to Kimi and let it
   write only `src/renderer/clock.css` and `src/renderer/clock.js`
2. Re-run the self test, confirm 20/20 still passes with the real visual layer mounted
3. Review `/tmp/cuckoo-shots/*.png` and push the carving quality until it reads as a real
   aged wooden object rather than a vector illustration

## Important Context
- Self test: `CUCKOO_SELFTEST=1 CUCKOO_SHOT_DIR=/tmp/cuckoo-shots ./node_modules/.bin/electron .`
  Normal run: `npm start`
- `index.html` carries a strict CSP and is locked. No network, no CDN fonts, no npm
  packages in the renderer. Plain ES2022 and plain CSS, loaded directly
- The window is frameless and transparent. Never paint a background on `html`, `body`,
  or `#stage`, or the desktop transparency dies
- The self test asserts `#stage` has at least one child, so the visual layer must mount
- Kimi does not read `~/.claude/CLAUDE.md`. House rules live in `~/.kimi-code/AGENTS.md`,
  and the prompt restates the important ones inline (no emojis, no dashes in prose, no
  grid backgrounds)
