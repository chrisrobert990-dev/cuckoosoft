'use strict';

/**
 * Menu bar popover logic.
 *
 * Deliberately a short list. This is the handful of controls worth reaching
 * for in a hurry; the exhaustive list stays in the native menu behind the
 * "All settings" link. Every control writes straight through to the main
 * process and every control repaints from pushed state, so the panel, the
 * clock's own levers and the native menu can never disagree.
 */

(() => {
  const api = window.cuckoo;
  const $ = (id) => document.getElementById(id);

  const el = {
    panel: $('panel'),
    time: $('time'),
    meridiem: $('meridiem'),
    status: $('status'),
    beat: $('beat'),
    tiles: $('tiles'),
    volume: $('volume'),
    volumeValue: $('volumeValue'),
    size: $('size'),
    sizeValue: $('sizeValue'),
    chips: $('sizeChips'),
    birds: $('birds'),
    traits: $('traits'),
  };

  let settings = {};
  let movement = { offsetMs: 0, beatMs: 500, beatEpoch: Date.now(), running: true };
  let sizing = { min: 20, max: 400, fit: 100 };
  let dragging = null; // 'volume' | 'size' while a slider is held

  // ---------------------------------------------------------------------
  // Toggle tiles
  // ---------------------------------------------------------------------

  /** Custom line icons. No emojis anywhere in the product. */
  const ICONS = {
    latch: '<path d="M5.4 7.6V5.9a2.6 2.6 0 0 1 5.2 0v1.7"/><rect x="3.4" y="7.6" width="9.2" height="6.6" rx="1.6"/><path d="M8 10.2v1.6"/>',
    mute: '<path d="M3.2 6.4h2.3L8.8 3.6v8.8L5.5 9.6H3.2z"/><path d="M11 6.2 14 9.4M14 6.2 11 9.4"/>',
    half: '<circle cx="8" cy="8" r="5.6"/><path d="M8 4.6V8h3"/>',
    quarter: '<circle cx="8" cy="8" r="5.6"/><path d="M8 8 11.75 4.25"/>',
    night: '<path d="M12.6 9.7A4.9 4.9 0 0 1 6.3 3.4a5.2 5.2 0 1 0 6.3 6.3Z"/>',
    top: '<path d="M8 12.6V4.2"/><path d="M4.9 7.1 8 4 11.1 7.1"/><path d="M3.6 13.8h8.8"/>',
    through: '<path d="M6.2 3.6v6.9l1.7-1.5 1.2 3 1.5-.7-1.2-2.9h2.3z"/><path d="M13.2 12.4 3.4 3.2" opacity="0.55"/>',
    music: '<circle cx="5.3" cy="12.1" r="1.9"/><path d="M7.2 12.1V3.4L12.6 2v2.4"/><path d="M7.2 6.4 12.6 5"/>',
    // Character glyphs. Aged grain for patina, an off beat spark for the
    // quirks, and a gibbous disc for the moon, kept clearly apart from the
    // solid crescent the night toggle already uses.
    patina: '<rect x="2.7" y="3.5" width="10.6" height="9" rx="2.2"/><path d="M4.7 6.5c1.3-.9 2.5.8 3.8 0s2.3.6 2.9.2"/><path d="M4.7 9.5c1.3-.9 2.5.8 3.8 0s2.2.5 2.6.2"/>',
    quirk: '<path d="M7.6 3 8.8 6.4 12.2 7.6 8.8 8.8 7.6 12.2 6.4 8.8 3 7.6 6.4 6.4Z"/><path d="M12.3 3.1v1.8M11.4 4h1.8"/>',
    moon: '<circle cx="8" cy="8" r="5.4"/><path d="M8 2.6a3.9 5.4 0 0 0 0 10.8"/>',
  };

  const TILES = [
    { key: 'latched', label: 'Latch door', icon: 'latch' },
    { key: 'silent', label: 'Silence', icon: 'mute' },
    { key: 'halfHourCall', label: 'Half hour', icon: 'half' },
    { key: 'quarterHourCall', label: 'Quarter hour', icon: 'quarter' },
    { key: 'musicBox', label: 'Music box', icon: 'music' },
    { key: 'nightSilence', label: 'Night off', icon: 'night' },
    { key: 'alwaysOnTop', label: 'On top', icon: 'top' },
    { key: 'clickThrough', label: 'Click thru', icon: 'through' },
  ];

  el.tiles.innerHTML = TILES.map((t) => `
    <button class="tile" type="button" data-key="${t.key}" aria-pressed="false">
      <svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[t.icon]}</svg>
      <span>${t.label}</span>
    </button>`).join('');

  el.tiles.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    // Paint immediately so the tile never feels like it lagged the click, then
    // let the state push confirm it a frame later.
    const next = !tile.classList.contains('on');
    tile.classList.toggle('on', next);
    tile.setAttribute('aria-pressed', String(next));
    api.toggle(tile.dataset.key);
  });

  // ---------------------------------------------------------------------
  // Bird picker
  // ---------------------------------------------------------------------

  // One active voice out of six, the same shape of choice as the size chips.
  // The ids are the exact strings settings.birdProfile accepts.
  const BIRDS = [
    { id: 'cuckoo', label: 'Classic Cuckoo' },
    { id: 'cardinal', label: 'Cardinal' },
    { id: 'redwing', label: 'Red winged Blackbird' },
    { id: 'robin', label: 'American Robin' },
    { id: 'chickadee', label: 'Chickadee' },
    { id: 'dove', label: 'Mourning Dove' },
  ];

  el.birds.innerHTML = BIRDS.map((b) => `
    <button class="bird" type="button" role="radio" data-id="${b.id}" aria-checked="false">${b.label}</button>`).join('');

  function paintBirds(activeId) {
    for (const btn of el.birds.children) {
      const on = btn.dataset.id === activeId;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-checked', String(on));
    }
  }

  el.birds.addEventListener('click', (e) => {
    const btn = e.target.closest('.bird');
    if (!btn) return;
    // Paint on click, the pushed state confirms it a frame later.
    paintBirds(btn.dataset.id);
    api.set({ birdProfile: btn.dataset.id });
  });

  // ---------------------------------------------------------------------
  // Character
  // ---------------------------------------------------------------------

  // Three things the clock does on its own rather than three things it does
  // for you, which is why they sit in their own quiet section instead of
  // among the tiles: nothing here changes what the clock is for.
  const TRAITS = [
    { key: 'patinaEnabled', label: 'Patina', icon: 'patina' },
    { key: 'quirksEnabled', label: 'Quirks', icon: 'quirk' },
    { key: 'moonPhaseEnabled', label: 'Moon phase', icon: 'moon' },
  ];

  el.traits.innerHTML = TRAITS.map((t) => `
    <button class="trait" type="button" data-key="${t.key}" aria-pressed="false">
      <svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[t.icon]}</svg>
      <span>${t.label}</span>
      <i class="lamp" aria-hidden="true"></i>
    </button>`).join('');

  el.traits.addEventListener('click', (e) => {
    const trait = e.target.closest('.trait');
    if (!trait) return;
    const next = !trait.classList.contains('on');
    trait.classList.toggle('on', next);
    trait.setAttribute('aria-pressed', String(next));
    api.toggle(trait.dataset.key);
  });

  // ---------------------------------------------------------------------
  // Size chips
  // ---------------------------------------------------------------------

  const CHIPS = [
    { label: 'S', pct: 60 },
    { label: 'M', pct: 100 },
    { label: 'L', pct: 150 },
    { label: 'XL', pct: 220 },
    { label: 'Fit', pct: null },  // as tall as the display allows
  ];

  el.chips.innerHTML = CHIPS.map((c, i) => `
    <button class="chip" type="button" data-i="${i}">${c.label}</button>`).join('');

  el.chips.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const spec = CHIPS[Number(chip.dataset.i)];
    if (spec.pct === null) {
      const scale = await api.fitHeight();
      if (Number.isFinite(scale)) setSizeUI(scale * 100);
    } else {
      api.set({ scale: spec.pct / 100 });
      setSizeUI(spec.pct);
    }
  });

  // ---------------------------------------------------------------------
  // Sliders
  // ---------------------------------------------------------------------

  function paintRange(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  }

  /**
   * The size range spans 20% to 600%, and spreading that linearly would bury
   * every size anyone actually wants in the first sixth of the track. Mapping
   * it logarithmically puts 100% near the middle and gives the small end the
   * room it needs, exactly like a zoom control.
   */
  const TRACK = 1000;
  const toPct = (v) => sizing.min * ((sizing.max / sizing.min) ** (v / TRACK));
  const toTrack = (pct) => (
    TRACK * (Math.log(pct / sizing.min) / Math.log(sizing.max / sizing.min))
  );

  function setSizeUI(pct) {
    const clamped = Math.round(Math.min(sizing.max, Math.max(sizing.min, pct)));
    if (dragging !== 'size') el.size.value = String(Math.round(toTrack(clamped)));
    el.sizeValue.textContent = `${clamped}%`;
    paintRange(el.size);
    for (const chip of el.chips.children) {
      const spec = CHIPS[Number(chip.dataset.i)];
      chip.classList.toggle('on', spec.pct !== null && Math.abs(spec.pct - clamped) < 2);
    }
  }

  el.volume.addEventListener('pointerdown', () => { dragging = 'volume'; });
  el.size.addEventListener('pointerdown', () => { dragging = 'size'; });
  window.addEventListener('pointerup', () => { dragging = null; });

  el.volume.addEventListener('input', () => {
    const v = Number(el.volume.value);
    el.volumeValue.textContent = `${v}%`;
    paintRange(el.volume);
    api.set({ volume: v / 100 });
  });

  el.size.addEventListener('input', () => {
    const pct = toPct(Number(el.size.value));
    setSizeUI(pct);
    api.set({ scale: pct / 100 });
  });

  // Wheel over the size row nudges it, which is how you actually want to
  // fine tune a window you are watching change behind the popover.
  el.size.addEventListener('wheel', (e) => {
    e.preventDefault();
    const next = Number(el.size.value) + (e.deltaY < 0 ? 12 : -12);
    el.size.value = String(Math.min(TRACK, Math.max(0, next)));
    const pct = toPct(Number(el.size.value));
    setSizeUI(pct);
    api.set({ scale: pct / 100 });
  }, { passive: false });

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  document.querySelector('.actions').addEventListener('click', (e) => {
    const btn = e.target.closest('.action');
    if (!btn) return;
    const { action } = btn.dataset;
    if (action === 'strike') api.strike('hour');
    if (action === 'wind') api.wind('all');
    if (action === 'settime') api.resetHands();
    if (action === 'restart') api.restart();
    btn.classList.add('fired');
    setTimeout(() => btn.classList.remove('fired'), 320);
  });

  $('close').addEventListener('click', () => api.close());
  $('fullMenu').addEventListener('click', () => api.fullMenu());
  $('quit').addEventListener('click', () => api.quit());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') api.close();
  });

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------

  const STATUS = {
    silent: 'Silenced',
    latched: 'Door latched',
    night: 'Night shut off',
    unwound: 'Strike weight down',
  };

  function applyState(state) {
    if (!state) return;
    settings = state.settings || settings;
    movement = state.movement || movement;

    for (const tile of el.tiles.children) {
      const on = Boolean(settings[tile.dataset.key]);
      tile.classList.toggle('on', on);
      tile.setAttribute('aria-pressed', String(on));
    }

    paintBirds(settings.birdProfile || 'cuckoo');

    for (const trait of el.traits.children) {
      // These three default on in the backend, so an absent value means the
      // state has simply not landed yet, not that the trait is switched off.
      const on = settings[trait.dataset.key] !== false;
      trait.classList.toggle('on', on);
      trait.setAttribute('aria-pressed', String(on));
    }

    if (dragging !== 'volume') {
      const v = Math.round((settings.volume ?? 0.7) * 100);
      el.volume.value = String(v);
      el.volumeValue.textContent = `${v}%`;
      paintRange(el.volume);
    }
    if (dragging !== 'size') setSizeUI((settings.scale ?? 1) * 100);

    const reason = movement.silencedBy;
    const label = state.chiming ? 'Striking'
      : !movement.running ? 'Stopped'
        : STATUS[reason] || 'Running';
    el.status.textContent = label;
    el.status.classList.toggle('warn', Boolean(reason) || state.chiming || !movement.running);

    paintTime();
  }

  function paintTime() {
    const d = new Date(Date.now() + (movement.offsetMs || 0));
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    if (settings.twentyFourHour) {
      el.time.textContent = `${String(h).padStart(2, '0')}:${m}`;
      el.meridiem.textContent = '24H';
    } else {
      const pm = h >= 12;
      h = h % 12 || 12;
      el.time.textContent = `${h}:${m}`;
      el.meridiem.textContent = pm ? 'PM' : 'AM';
    }
  }

  // The bob tracks the real escapement phase, so the panel and the case are
  // swinging in step rather than merely near each other.
  function paintBeat() {
    if (document.visibilityState !== 'visible') return;
    const width = el.beat.parentElement.clientWidth - el.beat.offsetWidth;
    if (!movement.running) {
      el.beat.style.transform = `translateX(${width / 2}px)`;
      el.beat.style.opacity = '0.25';
      return;
    }
    const beat = movement.beatMs || 500;
    const phase = ((Date.now() - (movement.beatEpoch || 0)) / beat) % 2;
    const t = (1 - Math.cos(phase * Math.PI)) / 2;
    el.beat.style.transform = `translateX(${t * width}px)`;
    el.beat.style.opacity = '0.75';
  }

  function frame() {
    paintBeat();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------
  // Height, so the window is always exactly as tall as the card
  // ---------------------------------------------------------------------

  function reportHeight() {
    const style = getComputedStyle(document.body);
    const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    api.height(Math.ceil(el.panel.getBoundingClientRect().height + pad));
  }

  new ResizeObserver(reportHeight).observe(el.panel);

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  api.on('state', applyState);
  api.on('sync', (snap) => { if (snap) { movement = snap; paintTime(); } });
  api.on('chime', () => { /* status arrives with the state push that follows */ });
  api.on('panel-open', async () => {
    paintTime();
    sizing = await api.sizing();
    applyState(await api.ready());
    reportHeight();
  });

  (async () => {
    sizing = await api.sizing();
    el.size.min = '0';
    el.size.max = String(TRACK);
    applyState(await api.ready());
    reportHeight();
    setInterval(paintTime, 1000);
    requestAnimationFrame(frame);
  })();
})();
