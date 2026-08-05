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
 * scorer receives { duration, peakDb, meanDb, onsets } and returns a number.
 * Higher is better. Returning -Infinity rejects the take outright.
 */
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
    score: ({ duration, onsets, peakDb }) => {
      if (peakDb < -34) return -Infinity;
      let s = 0;
      s += onsets === 1 ? 60 : 0;
      s += duration <= 0.25 ? 30 : duration <= 0.5 ? 15 : 0;
      return s;
    },
  },
  {
    name: 'tock',
    takes: 3,
    duration: 1,
    influence: 0.85,
    text:
      'One single low mechanical tock of a wooden pendulum clock escapement, a deep dry wooden knock, ' +
      'darker and lower than a tick, very short, close microphone, no reverb, no music, ' +
      'no ticking loop, complete silence around it.',
    trimEnd: true,
    maxDuration: 0.5,
    score: ({ duration, onsets, peakDb }) => {
      if (peakDb < -34) return -Infinity;
      let s = 0;
      s += onsets === 1 ? 60 : 0;
      s += duration <= 0.25 ? 30 : duration <= 0.5 ? 15 : 0;
      return s;
    },
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
    takes: 3,
    duration: 4,
    influence: 0.75,
    text:
      'Pulling the weight chain of an antique cuckoo clock, a steady clicking brass ratchet running through ' +
      'a chain wheel with the rattle of small metal links, mechanical and rhythmic, close microphone, ' +
      'dry, no reverb, no music.',
    trimEnd: true,
    score: ({ duration, peakDb, onsets }) => {
      if (peakDb < -34) return -Infinity;
      return (duration >= 1.5 ? 30 : 5) + (onsets >= 4 ? 40 : 10);
    },
  },
  {
    name: 'music',
    takes: 3,
    duration: 14,
    influence: 0.55,
    text:
      'A small antique music box cylinder playing a gentle Bavarian waltz melody in three four time, ' +
      'delicate plucked metal comb tines, slightly out of tune and slowing near the end, ' +
      'close microphone, warm and nostalgic, no drums, no vocals, no orchestra.',
    trimEnd: true,
    score: ({ duration, peakDb }) => {
      if (peakDb < -34) return -Infinity;
      return duration >= 8 ? 50 : 10;
    },
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
  filters.push('loudnorm=I=-16:TP=-1.5:LRA=11', 'afade=t=out:st=0:d=0.03:curve=nofade');
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', filters.join(',')];
  if (maxDuration) args.push('-t', String(maxDuration));
  args.push('-ar', '44100', '-ac', '2', '-b:a', '160k', dest);
  await run('ffmpeg', args);
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
  const silenceStarts = [...silOut.matchAll(/silence_start:\s*(-?[\d.]+)/g)].length;
  const silenceEnds = [...silOut.matchAll(/silence_end:\s*(-?[\d.]+)/g)].length;
  // Every burst of sound is bounded by a silence_start after it (or the file end).
  const onsets = Math.max(silenceStarts, silenceEnds ? silenceEnds : 0, peakDb > -32 ? 1 : 0);

  return { duration, peakDb, meanDb, onsets };
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
  let existing = {};
  try {
    existing = JSON.parse(await readFile(manifestPath, 'utf8')).sounds ?? {};
  } catch { /* first run */ }
  for (const entry of manifest) {
    existing[entry.name] = {
      file: `${entry.name}.mp3`,
      durationSeconds: Number(entry.duration.toFixed(3)),
      peakDb: entry.peakDb,
      generatedAt: new Date().toISOString(),
    };
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({ source: 'elevenlabs/sound-generation', sounds: existing }, null, 2)}\n`,
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
