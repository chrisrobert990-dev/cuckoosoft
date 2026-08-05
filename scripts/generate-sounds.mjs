#!/usr/bin/env node
/**
 * Generates the Cuckoo sound pack via the ElevenLabs text-to-sound-effects API.
 *
 * The API is non deterministic, so for every sound we render a few candidates,
 * measure them with ffmpeg, score them against what the sound is supposed to be,
 * and keep the winner. Losing candidates stay in assets/sounds/_candidates so a
 * human can audition them and promote a different take by hand.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=... node scripts/generate-sounds.mjs [name ...]
 *
 * The key is read from the env first, then from `craig-vault get ELEVENLABS_KEY`.
 * It is never written to disk or logged.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'sounds');
const CANDIDATES = path.join(OUT, '_candidates');

const API = 'https://api.elevenlabs.io/v1/sound-generation';

/**
 * scorer receives { duration, peakDb, meanDb, onsets, contentEnd, tailDb } and
 * returns a number. Higher is better. Returning -Infinity rejects the take
 * outright. contentEnd is the last moment the signal was above the silence
 * gate (== duration if it never goes silent); tailDb is the mean level of the
 * final 20% of the file. Both exist to catch takes that measure fine on peak
 * and onset count but are not actually the sound that was asked for: a blip
 * followed by dead air, or a "click" that never decays.
 */

/**
 * Shared scorer for every bird's tick and tock: a dry click has to actually
 * decay, the exact bug that shipped a buzzy tock originally (see
 * assets/sounds/manifest.json's tockFix note).
 *
 * Two separate decay checks, because they catch different failures. The
 * relative one (tailDb vs peakDb) catches a take that never really lets go
 * of its own loudness, a resonant buzz instead of a knock. It does NOT catch
 * a second failure mode found later (assets/sounds/manifest.json's
 * analogPass note): a take whose peak transient is fine but whose tail
 * plateaus at a persistent low-level hum/hiss bed instead of continuing down
 * toward true silence, quiet enough to pass the relative check (it is still
 * 20+dB under a loud peak) but nowhere near the -47 to -60dB true-silence
 * tail every clean shipped tick/tock actually measures at. Two takes shipped
 * with exactly this and were caught by ear, not by this scorer, hence the
 * absolute floor below. -40dB sits with real margin below every clean
 * reference and real margin above the ~-20 to -30dB the bad takes measured.
 */
const tickTockScore = ({ duration, onsets, peakDb, tailDb }) => {
  if (peakDb < -34) return -Infinity;
  if (tailDb > peakDb - 22) return -Infinity;
  if (tailDb > -40) return -Infinity;
  let s = 0;
  s += onsets === 1 ? 60 : 0;
  s += duration <= 0.25 ? 30 : duration <= 0.5 ? 15 : 0;
  return s;
};

/**
 * Shared scorer for every non-cuckoo bird call. Deliberately does not demand
 * an exact onset count the way the cuckoo's own scorer does: a cardinal's
 * "what-cheer" and a mourning dove's coo have different natural note
 * structure, so this only rewards a plausible range and otherwise leans on
 * the same guards that catch the blip-then-silence failure mode.
 */
const birdCallScore = ({ duration, onsets, peakDb, contentEnd }) => {
  if (peakDb < -30) return -Infinity;
  if (contentEnd < duration * 0.6) return -Infinity;
  let s = 0;
  s += onsets >= 1 && onsets <= 4 ? 30 : 10;
  s += duration <= 1.6 ? 30 : duration <= 2.0 ? 15 : 0;
  s += peakDb > -6 ? 10 : 0;
  return s;
};

const SOUNDS = [
  {
    name: 'cuckoo',
    takes: 4,
    duration: 2,
    influence: 0.8,
    // Target: the classic descending minor-third bellows call. Two hits, close together.
    text:
      'A single Black Forest cuckoo clock bird call. Two wooden bellows notes, a descending minor third, ' +
      'cuck-OO, hollow warm wooden whistle, mechanical bellows air, close microphone, dry, clean, ' +
      'no reverb, no music, no birdsong, no background ambience, silence before and after.',
    trimEnd: true,
    score: ({ duration, onsets, peakDb }) => {
      if (peakDb < -30) return -Infinity; // basically silent
      let s = 0;
      // Two onsets is the whole point of a cuckoo.
      s += onsets === 2 ? 60 : onsets === 3 ? 25 : onsets === 1 ? 5 : 0;
      // A real call is short. Anything over ~1.4s of content is a bird documentary.
      s += duration <= 1.4 ? 30 : duration <= 2.0 ? 15 : 0;
      s += peakDb > -6 ? 10 : 0;
      return s;
    },
  },
  {
    name: 'strike',
    takes: 3,
    duration: 3,
    influence: 0.7,
    text:
      'One single strike of a small coiled wire gong inside an antique wooden cuckoo clock, ' +
      'a soft metallic hammer hit with a warm decaying ring, close microphone, dry, ' +
      'no reverb, no music, silence after the ring decays.',
    trimEnd: true,
    score: ({ duration, onsets, peakDb }) => {
      if (peakDb < -30) return -Infinity;
      let s = 0;
      s += onsets === 1 ? 50 : onsets === 2 ? 15 : 0;
      s += duration >= 0.8 && duration <= 2.6 ? 30 : 10;
      s += peakDb > -8 ? 10 : 0;
      return s;
    },
  },
  {
    name: 'tick',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single mechanical tick of a wooden pendulum clock escapement, a crisp dry wooden click, ' +
      'very short, close microphone, no reverb, no music, no ticking loop, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },
  {
    name: 'tock',
    takes: 6,
    duration: 1,
    influence: 0.75,
    // Regenerated a 4th time. Round 2 asked for "natural room tone", which in
    // hindsight is quite literally a request for a persistent background
    // noise bed, and got one (Finder yellow flag). Round 3 fixed the hum but
    // the user then reported the result sounds like "hitting an 808 tom drum
    // sample", too bassy and too long, not organic. The prompt itself was the
    // problem: "deep dry wooden knock, darker and lower than a tick" is
    // pushing hard on low frequency and knock/drum framing, and "tock" as a
    // literal word may carry its own bell/gong-like connotation to the model.
    // User's fix: describe it with "clack" instead of "tock", and stop
    // emphasizing depth/darkness beyond "the lower counterpart to a tick".
    // Also tightened maxDuration 0.5 to 0.35 and bumped influence back up
    // from 0.7 to 0.75, since round 3's lower influence may have given the
    // model too much room to drift into an unrelated percussion instrument
    // rather than staying anchored to "clock escapement". This also finally
    // uses the shared tickTockScore (previously a stale hand copied inline
    // duplicate that predated it and never got the analogPassRound2 absolute
    // tail floor fix, a real bug: round 3's regeneration ran without that
    // guard active despite the code appearing to have it).
    text:
      'One single mechanical clack of a wooden pendulum clock escapement, the lower counterpart to ' +
      'a tick, a dry short wooden clack, crisp and brief, not deep, not bassy, not a drum hit, ' +
      'not a resonant boom, close microphone, no reverb, no music, no ticking loop, no hiss, no hum, ' +
      'no background noise, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.35,
    score: tickTockScore,
  },
  {
    name: 'door',
    takes: 3,
    duration: 1.5,
    influence: 0.8,
    text:
      'A tiny wooden door on a cuckoo clock swinging open, a small dry creak of old wood on a brass hinge ' +
      'ending in a soft wooden knock, very small and delicate, close microphone, no reverb, no music.',
    trimEnd: true,
    score: ({ duration, peakDb }) => {
      if (peakDb < -34) return -Infinity;
      return (duration <= 1.2 ? 40 : 15) + (peakDb > -12 ? 20 : 5);
    },
  },
  {
    name: 'latch',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'A small brass latch on a wooden clock case being flipped, one crisp metallic click with a tiny ' +
      'wooden resonance, very short, close microphone, dry, no reverb, no music.',
    trimEnd: true,
    maxDuration: 0.6,
    score: ({ duration, onsets, peakDb }) => {
      if (peakDb < -34) return -Infinity;
      return (onsets <= 2 ? 40 : 10) + (duration <= 0.4 ? 30 : 10) + (peakDb > -12 ? 10 : 0);
    },
  },
  {
    name: 'wind',
    takes: 4,
    duration: 4,
    influence: 0.75,
    text:
      'Pulling the weight chain of an antique cuckoo clock, a steady clicking brass ratchet running through ' +
      'a chain wheel with the rattle of small metal links, mechanical and rhythmic, close microphone, ' +
      'dry, no reverb, no music.',
    trimEnd: true,
    // Same failure mode as music turned up here too: a shipped take that was
    // a ~0.1s blip then true silence for the rest of the file, despite only
    // asking for 4s. All 3 original takes failed together, which looked
    // systemic but was not: a fresh single retry with this exact prompt came
    // back clean. Guard against a repeat with a content-coverage check rather
    // than just trusting file duration and onset count.
    score: ({ duration, peakDb, onsets, contentEnd }) => {
      if (peakDb < -34) return -Infinity;
      if (contentEnd < duration * 0.6) return -Infinity;
      return (duration >= 1.5 ? 30 : 5) + (onsets >= 4 ? 40 : 10);
    },
  },
  {
    name: 'music',
    takes: 5,
    duration: 10,
    influence: 0.55,
    // 14s was too long an ask: every take across 3 tries came back as a
    // fraction-of-a-second blip followed by true silence for the rest of the
    // file. Empirically, 10s is comfortably inside what the model can sustain
    // (tested up to 12s before it started trailing off early) so this asks
    // for a shorter, complete passage instead of a long broken one. Dropped
    // "slowing near the end" from the prompt too: that reads as a request to
    // trail into silence, which is exactly the failure mode being avoided.
    text:
      'A small antique music box cylinder playing a gentle Bavarian waltz melody in three four time, ' +
      'delicate plucked metal comb tines, close microphone, warm and nostalgic, continuous throughout ' +
      'with no silence, no drums, no vocals, no orchestra.',
    trimEnd: true,
    score: ({ duration, peakDb, contentEnd }) => {
      if (peakDb < -34) return -Infinity;
      // The real failure mode for this sound is a short blip then dead air:
      // reject anything where the actual content doesn't fill most of the
      // requested duration, regardless of how long the file itself is.
      if (contentEnd < duration * 0.6) return -Infinity;
      return (duration >= 8 ? 30 : 10) + (contentEnd >= duration * 0.85 ? 20 : 0);
    },
  },

  // --- Bird profiles -------------------------------------------------------
  // Alternate birds for the clock, each with its own call and its own
  // tick/tock pair so a chosen bird feels like a distinct little clock
  // rather than just a different call bolted onto the same escapement. Every
  // call keeps the "wooden bellows mechanism imitating a bird" framing the
  // default cuckoo call uses, not a real field recording, to stay consistent
  // with the rest of the sound pack. See src/renderer/audio.js's BIRDS map.

  {
    name: 'cardinalCall',
    takes: 4,
    duration: 2,
    influence: 0.8,
    text:
      'A single Black Forest style cuckoo clock bird call imitating a Northern Cardinal, ' +
      'two or three bright ascending wooden bellows whistle notes like a cardinal calling ' +
      '"what-cheer, what-cheer", hollow warm wooden whistle, mechanical bellows air, ' +
      'close microphone, dry, clean, no reverb, no music, no real birdsong, ' +
      'no background ambience, silence before and after.',
    trimEnd: true,
    score: birdCallScore,
  },
  {
    name: 'cardinalTick',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single mechanical tick of a wooden pendulum clock escapement, a bright crisp maple ' +
      'wood click, very short, close microphone, no reverb, no music, no ticking loop, ' +
      'complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },
  {
    name: 'cardinalTock',
    takes: 5,
    duration: 1,
    influence: 0.7,
    // Flagged by the user (Finder red tag) as too digital/clean sounding.
    text:
      'One single low mechanical tock of a wooden pendulum clock escapement, a bright maple wood ' +
      'knock, darker and lower than a tick, recorded on real tape with natural room tone and a ' +
      'touch of mechanical imperfection, organic and analog in character, distinctly not a ' +
      'synthesized or digital sounding tone, very short, close microphone, no reverb, no music, ' +
      'no ticking loop, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },

  {
    name: 'redwingCall',
    takes: 5,
    duration: 2,
    influence: 0.65,
    // Flagged by the user (Finder red tag) as too digital/clean sounding.
    text:
      'A single Black Forest style cuckoo clock bird call imitating a Red-winged Blackbird, ' +
      'one bright gurgling wooden bellows trill ending in a rising whistle like a blackbird ' +
      'calling "conk-la-ree", mechanical bellows air, analog tape character with natural ' +
      'imperfection, not synthesized or digital, close microphone, dry, no reverb, no music, ' +
      'no real birdsong, no background ambience, silence before and after.',
    trimEnd: true,
    score: birdCallScore,
  },
  {
    name: 'redwingTick',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single mechanical tick of a wooden pendulum clock escapement, a dark resonant walnut ' +
      'wood click, very short, close microphone, no reverb, no music, no ticking loop, ' +
      'complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },
  {
    name: 'redwingTock',
    takes: 5,
    duration: 1,
    influence: 0.7,
    // Flagged by the user (Finder red tag) as too digital/clean sounding.
    text:
      'One single low mechanical tock of a wooden pendulum clock escapement, a dark resonant ' +
      'walnut wood knock, darker and lower than a tick, recorded on real tape with natural room ' +
      'tone and a touch of mechanical imperfection, organic and analog in character, distinctly ' +
      'not a synthesized or digital sounding tone, very short, close microphone, ' +
      'no reverb, no music, no ticking loop, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },

  {
    name: 'robinCall',
    takes: 4,
    duration: 2,
    influence: 0.8,
    text:
      'A single Black Forest style cuckoo clock bird call imitating an American Robin, a cheerful ' +
      'short warbling run of wooden bellows notes like a robin singing "cheerily, cheer-up", ' +
      'hollow warm wooden whistle, mechanical bellows air, close microphone, dry, clean, ' +
      'no reverb, no music, no real birdsong, no background ambience, silence before and after.',
    trimEnd: true,
    score: birdCallScore,
  },
  {
    name: 'robinTick',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single mechanical tick of a wooden pendulum clock escapement, a warm cherry wood ' +
      'click, very short, close microphone, no reverb, no music, no ticking loop, ' +
      'complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },
  {
    name: 'robinTock',
    takes: 5,
    duration: 1,
    influence: 0.7,
    // Flagged by the user (Finder red tag) as too digital/clean sounding.
    text:
      'One single low mechanical tock of a wooden pendulum clock escapement, a warm cherry wood ' +
      'knock, darker and lower than a tick, recorded on real tape with natural room tone and a ' +
      'touch of mechanical imperfection, organic and analog in character, distinctly not a ' +
      'synthesized or digital sounding tone, very short, close microphone, no reverb, no music, ' +
      'no ticking loop, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },

  {
    name: 'chickadeeCall',
    takes: 5,
    duration: 2,
    influence: 0.65,
    // Flagged by the user (Finder red tag) as too digital/clean sounding.
    text:
      'A single Black Forest style cuckoo clock bird call imitating a Black-capped Chickadee, ' +
      'two clear wooden bellows whistle notes, the second lower, like a chickadee calling ' +
      '"fee-bee", mechanical bellows air, analog tape character with natural imperfection, ' +
      'not synthesized or digital, close microphone, dry, no reverb, no music, no real ' +
      'birdsong, no background ambience, silence before and after.',
    trimEnd: true,
    score: birdCallScore,
  },
  {
    name: 'chickadeeTick',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single mechanical tick of a wooden pendulum clock escapement, a light crisp birch ' +
      'wood click, very short, close microphone, no reverb, no music, no ticking loop, ' +
      'complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },
  {
    name: 'chickadeeTock',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single low mechanical tock of a wooden pendulum clock escapement, a light birch wood ' +
      'knock, darker and lower than a tick, very short, close microphone, no reverb, no music, ' +
      'no ticking loop, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },

  {
    name: 'doveCall',
    takes: 4,
    duration: 2,
    influence: 0.8,
    text:
      'A single Black Forest style cuckoo clock bird call imitating a Mourning Dove, a soft low ' +
      'mournful wooden bellows coo with a gentle rolling finish, hollow warm wooden whistle, ' +
      'mechanical bellows air, close microphone, dry, clean, no reverb, no music, ' +
      'no real birdsong, no background ambience, silence before and after.',
    trimEnd: true,
    score: birdCallScore,
  },
  {
    name: 'doveTick',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single mechanical tick of a wooden pendulum clock escapement, a soft muted cedar ' +
      'wood click, very short, close microphone, no reverb, no music, no ticking loop, ' +
      'complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },
  {
    name: 'doveTock',
    takes: 5,
    duration: 1,
    influence: 0.7,
    // Flagged by the user (Finder red tag) as too digital/clean sounding.
    text:
      'One single low mechanical tock of a wooden pendulum clock escapement, a soft muted cedar ' +
      'wood knock, darker and lower than a tick, recorded on real tape with natural room tone ' +
      'and a touch of mechanical imperfection, organic and analog in character, distinctly not ' +
      'a synthesized or digital sounding tone, very short, close microphone, no reverb, ' +
      'no music, no ticking loop, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: tickTockScore,
  },
];

async function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const { stdout } = await run('craig-vault', ['get', 'ELEVENLABS_KEY']);
  const key = stdout.trim();
  if (!key) throw new Error('No ElevenLabs key. Set ELEVENLABS_API_KEY or add ELEVENLABS_KEY to craig-vault.');
  return key;
}

async function render(key, sound, take) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: sound.text,
      duration_seconds: sound.duration,
      prompt_influence: sound.influence,
      output_format: 'mp3_44100_128',
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status} for ${sound.name} take ${take}: ${(await res.text()).slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Silence-trim, normalise to a consistent loudness, and re-encode. */
async function clean(src, dest, { trimEnd, maxDuration }) {
  const filters = [
    // Lead-in silence: the model loves to leave a beat of nothing at the front.
    'silenceremove=start_periods=1:start_silence=0.02:start_threshold=-45dB:detection=peak',
  ];
  if (trimEnd) {
    // Trim trailing silence by reversing, trimming the (now) start, reversing back.
    filters.push(
      'areverse',
      'silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB:detection=peak',
      'areverse',
    );
  }
  filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');

  const tmp = `${dest}.trim.wav`;
  const trimArgs = ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', filters.join(',')];
  if (maxDuration) trimArgs.push('-t', String(maxDuration));
  trimArgs.push('-ar', '44100', '-ac', '2', tmp);
  await run('ffmpeg', trimArgs);

  // afade's `st` is an absolute time from the start of the stream, not from
  // the end, so a fixed `st=0` fades the ENTIRE clip to silence starting
  // immediately rather than just its last 30ms (confirmed with a synthetic
  // tone: everything past st+d reads as true digital silence). The fade has
  // to start relative to how long this particular trimmed clip actually
  // turned out, which means probing it first.
  const { stdout: durOut } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', tmp,
  ]);
  const trimmedDuration = Number.parseFloat(durOut.trim()) || 0;
  const fadeDur = 0.03;
  const fadeStart = Math.max(0, trimmedDuration - fadeDur);

  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', tmp,
    '-af', `afade=t=out:st=${fadeStart}:d=${fadeDur}:curve=tri`,
    '-ar', '44100', '-ac', '2', '-b:a', '160k', dest,
  ]);
  await rm(tmp, { force: true });
}

/** Measure a rendered take so we can score it without ears. */
async function measure(file) {
  const { stdout: durOut } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file,
  ]);
  const duration = Number.parseFloat(durOut.trim()) || 0;

  const { stderr: volOut } = await run('ffmpeg', [
    '-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-',
  ]).catch((e) => ({ stderr: e.stderr || '' }));
  const peakDb = Number.parseFloat(/max_volume:\s*(-?[\d.]+) dB/.exec(volOut)?.[1] ?? '-99');
  const meanDb = Number.parseFloat(/mean_volume:\s*(-?[\d.]+) dB/.exec(volOut)?.[1] ?? '-99');

  // Onset count: how many times the signal rises out of silence. A cuckoo should
  // do this exactly twice, a gong strike once, a chain wind many times.
  const { stderr: silOut } = await run('ffmpeg', [
    '-hide_banner', '-i', file,
    '-af', 'silencedetect=noise=-32dB:d=0.06',
    '-f', 'null', '-',
  ]).catch((e) => ({ stderr: e.stderr || '' }));
  const silenceStartTimes = [...silOut.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const silenceEndTimes = [...silOut.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  // Every burst of sound is bounded by a silence_start after it (or the file end).
  const onsets = Math.max(silenceStartTimes.length, silenceEndTimes.length, peakDb > -32 ? 1 : 0);
  // How far real content actually reaches. Not just "was any gap ever
  // detected": a multi-onset sound (a ratchet's clicks) has gaps all through
  // it and the last one can sit mid-sequence, well before real audio actually
  // stops. What matters is whether the file *ends* in silence: ffmpeg reports
  // a silence_end at (approximately) the file's own duration when a trailing
  // silence runs to EOF. Only then does the take's last silence_start mark
  // where real content actually gave out; otherwise content reaches the end.
  const endsInSilence = silenceEndTimes.length > 0
    && Math.abs(silenceEndTimes[silenceEndTimes.length - 1] - duration) < 0.05;
  const contentEnd = endsInSilence && silenceStartTimes.length
    ? silenceStartTimes[silenceStartTimes.length - 1]
    : duration;

  // Tail density: mean level of the final slice of the file, to catch takes
  // that never actually decay (a click that is really a sustained buzz/drone
  // wearing a click's clothing at the very start). Final 40%, not 20%: a
  // narrower window can land on a quiet moment even within a take that has a
  // persistent low-level hum bed riding underneath, and averaging over more
  // of the tail is a more honest read of whether it is actually decaying
  // toward silence or just plateaued at a quiet-but-constant noise floor.
  const tailStart = Math.max(0, duration * 0.6);
  const { stderr: tailOut } = await run('ffmpeg', [
    '-hide_banner', '-i', file, '-af', `atrim=start=${tailStart},volumedetect`, '-f', 'null', '-',
  ]).catch((e) => ({ stderr: e.stderr || '' }));
  const tailDb = Number.parseFloat(/mean_volume:\s*(-?[\d.]+) dB/.exec(tailOut)?.[1] ?? peakDb);

  return { duration, peakDb, meanDb, onsets, contentEnd, tailDb };
}

async function buildSound(key, sound) {
  const results = [];
  for (let take = 1; take <= sound.takes; take += 1) {
    const rawPath = path.join(CANDIDATES, `${sound.name}-${take}.raw.mp3`);
    const outPath = path.join(CANDIDATES, `${sound.name}-${take}.mp3`);
    try {
      await writeFile(rawPath, await render(key, sound, take));
      await clean(rawPath, outPath, sound);
      await rm(rawPath, { force: true });
      const m = await measure(outPath);
      const score = sound.score(m);
      results.push({ take, outPath, m, score });
      console.log(
        `  take ${take}: ${m.duration.toFixed(2)}s  peak ${m.peakDb.toFixed(1)}dB  ` +
        `onsets ${m.onsets}  score ${score === -Infinity ? 'reject' : score}`,
      );
    } catch (err) {
      console.log(`  take ${take}: failed (${err.message.split('\n')[0]})`);
    }
  }

  const winner = results.filter((r) => r.score > -Infinity).sort((a, b) => b.score - a.score)[0];
  if (!winner) throw new Error(`every take of "${sound.name}" was rejected`);
  const finalPath = path.join(OUT, `${sound.name}.mp3`);
  await writeFile(finalPath, await readFile(winner.outPath));
  console.log(`  -> kept take ${winner.take} as assets/sounds/${sound.name}.mp3\n`);
  return { name: sound.name, take: winner.take, ...winner.m };
}

async function main() {
  const only = process.argv.slice(2);
  const wanted = only.length ? SOUNDS.filter((s) => only.includes(s.name)) : SOUNDS;
  if (!wanted.length) {
    console.error(`Unknown sound. Available: ${SOUNDS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  await mkdir(OUT, { recursive: true });
  await mkdir(CANDIDATES, { recursive: true });
  const key = await apiKey();

  const manifest = [];
  for (const sound of wanted) {
    console.log(`${sound.name} (${sound.takes} takes)`);
    manifest.push(await buildSound(key, sound));
  }

  const manifestPath = path.join(OUT, 'manifest.json');
  // Preserve the whole existing document, not just its `sounds` map: hand
  // written notes (normalization writeups, known-issue flags) live at the
  // top level and a run that only touches one or two sounds should not blow
  // those away.
  let existingDoc = { source: 'elevenlabs/sound-generation', sounds: {} };
  try {
    existingDoc = { ...existingDoc, ...JSON.parse(await readFile(manifestPath, 'utf8')) };
  } catch { /* first run */ }
  const sounds = { ...existingDoc.sounds };
  for (const entry of manifest) {
    sounds[entry.name] = {
      file: `${entry.name}.mp3`,
      durationSeconds: Number(entry.duration.toFixed(3)),
      peakDb: entry.peakDb,
      generatedAt: new Date().toISOString(),
    };
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({ ...existingDoc, sounds }, null, 2)}\n`,
  );

  for (const entry of manifest) {
    const { size } = await stat(path.join(OUT, `${entry.name}.mp3`));
    console.log(`${entry.name.padEnd(8)} ${entry.duration.toFixed(2)}s  ${(size / 1024).toFixed(0)}kb`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
