'use strict';

/**
 * The visual layer: the whole carved case, the dial, the bird, the pendulum
 * and the weights, built as one SVG so the window can scale freely.
 *
 * The backend owns time and sound. This file owns everything the eye sees and
 * every pointer interaction on the case. Nothing here touches the network,
 * and nothing here is allowed to paint a page background: the window is
 * frameless and transparent, so only the clock itself is visible.
 */
(() => {
  const NS = 'http://www.w3.org/2000/svg';

  // A seeded generator keeps the shingles and garland organic but stable
  // between launches, so the clock always looks like the same object.
  let seed = 1887;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const range = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const fmt = (n) => Math.round(n * 100) / 100;

  // Aged walnut palette. The recesses carry the dark stain, the raised edges
  // carry the worn lighter tone where a century of hands has polished it.
  const C = {
    woodDeep: '#2a130a',
    woodDark: '#43200f',
    wood: '#6b3a1e',
    woodMid: '#7d4926',
    woodLight: '#9c6134',
    woodEdge: '#c08a4d',
    bone: '#ecdfc0',
    boneDim: '#cdbb93',
    brass: '#d9b25f',
    brassDark: '#7c5a24',
    tarnish: '#66713d',
    ink: '#241608',
  };

  // ------------------------------------------------------------------
  // Layout, all in viewBox units. The window is 460 by 820 at scale 1.
  // ------------------------------------------------------------------
  const L = {
    // The numeral ring is pulled in from the face edge to leave a clear band
    // for the engraved minute track, the way a real dial is laid out.
    dial: { cx: 230, cy: 380, ring: 80, face: 64, numeral: 48 },
    door: { x: 192, w: 76, bottom: 288, archCy: 250, archR: 38 },
    pend: { px: 230, py: 438, bobY: 662, bobR: 41, leafTop: 500, leafBottom: 586 },
    chains: [
      { train: 'time', x: 122, top: 512 },
      { train: 'music', x: 230, top: 500 },
      { train: 'strike', x: 338, top: 538 },
    ],
    chainBottom: 706,
    latch: { px: 178, py: 240, len: 104 },
    nightLever: { px: 80, py: 318 },
    muteLever: { px: 380, py: 318 },
  };

  // ------------------------------------------------------------------
  // Gilt fittings.
  //
  // Everything below is a turned, cast or drawn piece of gold applied to the
  // case, and every one of them obeys the same rule the carved woodwork
  // does: draw the section once in the gilt gradient, then restate it as a
  // lit run through the upper left and a burnt run through the lower right.
  // That is the pendulum bob's beaded rim again, in metal. Gold shades to
  // burnt amber rather than to black, which is the one place the gilt parts
  // depart from the wood.
  // ------------------------------------------------------------------
  const polar = (cx, cy, r, deg) => [
    fmt(cx + r * Math.cos((deg * Math.PI) / 180)),
    fmt(cy + r * Math.sin((deg * Math.PI) / 180)),
  ];
  const arcPath = (cx, cy, r, a0, a1) => {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    return `M ${x0} ${y0} A ${fmt(r)} ${fmt(r)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  /** A turned gilt ring seated in the case: an astragal seen face on. */
  const goldRing = (cx, cy, r, w) => `
    <circle cx="${cx}" cy="${cy}" r="${fmt(r)}" fill="none" stroke="url(#gGold)" stroke-width="${fmt(w)}"/>
    <path d="${arcPath(cx, cy, r - w * 0.2, 168, 330)}" fill="none" stroke="#fff3cd"
          stroke-width="${fmt(w * 0.3)}" opacity="0.62" stroke-linecap="round"/>
    <path d="${arcPath(cx, cy, r + w * 0.2, 14, 152)}" fill="none" stroke="#241601"
          stroke-width="${fmt(w * 0.34)}" opacity="0.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${fmt(r - w * 0.5)}" fill="none" stroke="#301e03"
            stroke-width="0.45" opacity="0.55"/>
    <circle cx="${cx}" cy="${cy}" r="${fmt(r + w * 0.5)}" fill="none" stroke="#301e03"
            stroke-width="0.45" opacity="0.55"/>`;

  /** A ring of cast gilt beads, the cheapest luxury there is and the oldest. */
  const goldBeads = (cx, cy, r, br, n) => {
    let out = '';
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const x = fmt(cx + Math.cos(a) * r);
      const y = fmt(cy + Math.sin(a) * r);
      out += `<circle cx="${x}" cy="${y}" r="${fmt(br)}" fill="url(#gGoldBoss)"/>
        <circle cx="${fmt(Number(x) - br * 0.3)}" cy="${fmt(Number(y) - br * 0.34)}" r="${fmt(br * 0.34)}"
                fill="#fff3cd" opacity="0.55"/>`;
    }
    return out;
  };

  /**
   * A gilt fillet: a drawn band of gold laid along the case, lit on its top
   * arris and shadowed under its bottom one. Used wherever two members of
   * the carcase meet and a real cabinetmaker would have run a bead of metal
   * into the joint to catch the light.
   */
  const goldFillet = (x, y, w, h, r = 1.2) => `
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(r)}"
          fill="url(#gGoldV)"/>
    <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(r)}"
          fill="url(#gGiltForm)" opacity="0.5"/>
    <path d="M ${fmt(x + 0.6)} ${fmt(y + 0.5)} L ${fmt(x + w - 0.6)} ${fmt(y + 0.5)}"
          stroke="#fff3cd" stroke-width="${fmt(Math.min(0.7, h * 0.22))}" opacity="0.62"/>
    <path d="M ${fmt(x + 0.6)} ${fmt(y + h - 0.4)} L ${fmt(x + w - 0.6)} ${fmt(y + h - 0.4)}"
          stroke="#241601" stroke-width="${fmt(Math.min(0.8, h * 0.26))}" opacity="0.5"/>`;

  /** A cast gilt rosette, the paterae dropped into a panel corner. */
  const goldRosette = (cx, cy, r, petals = 8) => {
    let p = '';
    for (let i = 0; i < petals; i += 1) {
      const a = (i / petals) * 360;
      const [x1, y1] = polar(cx, cy, r * 0.42, a);
      p += `<ellipse cx="${x1}" cy="${y1}" rx="${fmt(r * 0.46)}" ry="${fmt(r * 0.3)}"
             transform="rotate(${fmt(a)} ${x1} ${y1})" fill="url(#gGoldBoss)"
             stroke="#3a2605" stroke-width="0.3"/>`;
    }
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="${fmt(r * 1.02)}" fill="#241601" opacity="0.35"
              transform="translate(0.8 1)"/>
      ${p}
      <circle cx="${cx}" cy="${cy}" r="${fmt(r * 0.34)}" fill="url(#gGoldBoss)"
              stroke="#3a2605" stroke-width="0.35"/>
      <circle cx="${fmt(cx - r * 0.12)}" cy="${fmt(cy - r * 0.14)}" r="${fmt(r * 0.12)}"
              fill="#fff3cd" opacity="0.6"/>
    </g>`;
  };

  /**
   * Stringing: the hairline of gold let into the surface of the wood. Two
   * passes, the cut and then the metal sitting a fraction proud of it, which
   * is the only way an inlay ever reads as inlaid rather than drawn on.
   */
  const goldString = (d, w = 0.9, o = 0.9) => `
    <path d="${d}" fill="none" stroke="#20120500" stroke-width="${fmt(w + 1)}"/>
    <path d="${d}" fill="none" stroke="#160b02" stroke-width="${fmt(w + 0.7)}" opacity="0.5"
          transform="translate(0.5 0.6)"/>
    <path d="${d}" fill="none" stroke="url(#gGoldH)" stroke-width="${fmt(w)}" opacity="${o}"/>
    <path d="${d}" fill="none" stroke="#fff3cd" stroke-width="${fmt(w * 0.34)}" opacity="0.45"
          transform="translate(-0.3 -0.35)"/>`;

  // The blocked out crest wing: the silhouette the carver saws before any
  // feather is cut into it. Shared by both wings, which then differ only in
  // how they are hung and how heavily they are worked.
  const WING_MASS = `M 4 -34 C 26 -46 52 -50 74 -44 C 60 -38 56 -34 52 -30
     C 66 -30 78 -26 86 -18 C 70 -16 62 -13 56 -9
     C 66 -6 74 0 78 8 C 64 8 54 6 46 2
     C 40 8 30 10 22 6 C 12 0 6 -12 4 -34 Z`;

  // ------------------------------------------------------------------
  // Reusable defs: gradients, grain and carving filters, leaf geometry.
  // ------------------------------------------------------------------
  const defs = `
  <defs>
    <linearGradient id="gWoodV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#84502a"/>
      <stop offset="0.45" stop-color="#5c2f16"/>
      <stop offset="1" stop-color="#2e150a"/>
    </linearGradient>
    <linearGradient id="gWoodPost" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#a56c3c"/>
      <stop offset="0.35" stop-color="#6b3a1e"/>
      <stop offset="1" stop-color="#2c1409"/>
    </linearGradient>
    <linearGradient id="gWoodPostR" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#a56c3c"/>
      <stop offset="0.35" stop-color="#6b3a1e"/>
      <stop offset="1" stop-color="#2c1409"/>
    </linearGradient>
    <linearGradient id="gRoof" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b3d1e"/>
      <stop offset="1" stop-color="#27110a"/>
    </linearGradient>
    <linearGradient id="gBarge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9a6236"/>
      <stop offset="1" stop-color="#3c1c0d"/>
    </linearGradient>
    <radialGradient id="gRing" cx="0.38" cy="0.32" r="0.95">
      <stop offset="0" stop-color="#a06b3c"/>
      <stop offset="0.6" stop-color="#68371c"/>
      <stop offset="1" stop-color="#31160b"/>
    </radialGradient>
    <radialGradient id="gFace" cx="0.46" cy="0.4" r="0.75">
      <stop offset="0" stop-color="#ecdcae"/>
      <stop offset="0.62" stop-color="#dcc793"/>
      <stop offset="0.88" stop-color="#c2a873"/>
      <stop offset="1" stop-color="#a68c5a"/>
    </radialGradient>
    <linearGradient id="gBrass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a6428"/>
      <stop offset="0.42" stop-color="#d9b25f"/>
      <stop offset="0.55" stop-color="#f4dc96"/>
      <stop offset="0.68" stop-color="#c49b47"/>
      <stop offset="1" stop-color="#6e4e1e"/>
    </linearGradient>
    <linearGradient id="gBrassV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0d389"/>
      <stop offset="0.5" stop-color="#c49b47"/>
      <stop offset="1" stop-color="#6e4e1e"/>
    </linearGradient>

    <!-- Fire gilt, which is not brass with the saturation turned up. Brass
         is one broad sheen; gilding over a burnished ground is a narrow hot
         specular with deep burnt shadow either side of it, and that gap
         between the two is the whole difference between a workshop clock
         and a commissioned one. Diagonal, so the band crosses every gilt
         edge at the same angle the light comes in at. -->
    <linearGradient id="gGold" x1="0.05" y1="0" x2="0.95" y2="1">
      <stop offset="0" stop-color="#4a3208"/>
      <stop offset="0.17" stop-color="#946d1d"/>
      <stop offset="0.34" stop-color="#dfbb5c"/>
      <stop offset="0.46" stop-color="#fff2c2"/>
      <stop offset="0.56" stop-color="#f4d478"/>
      <stop offset="0.74" stop-color="#a97d27"/>
      <stop offset="1" stop-color="#54390b"/>
    </linearGradient>
    <linearGradient id="gGoldV" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffeeb6"/>
      <stop offset="0.24" stop-color="#eccb72"/>
      <stop offset="0.62" stop-color="#b28a30"/>
      <stop offset="1" stop-color="#4e3509"/>
    </linearGradient>
    <linearGradient id="gGoldH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5e420e"/>
      <stop offset="0.3" stop-color="#d8b358"/>
      <stop offset="0.44" stop-color="#fff0bb"/>
      <stop offset="0.62" stop-color="#c69c3c"/>
      <stop offset="1" stop-color="#503608"/>
    </linearGradient>
    <radialGradient id="gGoldBoss" cx="0.34" cy="0.26" r="0.92">
      <stop offset="0" stop-color="#fff3c8"/>
      <stop offset="0.34" stop-color="#e8c66c"/>
      <stop offset="0.72" stop-color="#a87d27"/>
      <stop offset="1" stop-color="#4a3208"/>
    </radialGradient>
    <!-- Laid over a gilt surface once it is drawn: gold does not shade to
         black, it shades to burnt amber, and the highlight is warmer than
         anything else on the case. -->
    <linearGradient id="gGiltForm" x1="0.08" y1="0" x2="0.92" y2="1">
      <stop offset="0" stop-color="#fff6d8" stop-opacity="0.4"/>
      <stop offset="0.32" stop-color="#fff6d8" stop-opacity="0"/>
      <stop offset="0.6" stop-color="#2c1a03" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#2c1a03" stop-opacity="0.55"/>
    </linearGradient>
    <radialGradient id="gCone" cx="0.4" cy="0.28" r="0.95">
      <stop offset="0" stop-color="#7d5024"/>
      <stop offset="0.55" stop-color="#5a3716"/>
      <stop offset="1" stop-color="#311c09"/>
    </radialGradient>
    <!-- A cone scale is not lit like a pebble. Its head is buried in the
         shadow of the scale above, the shield across its middle catches the
         light, and the very tip turns away again into a dark rim. Three
         versions of that, for scales facing into the light, square on, and
         away from it round the far side of the cone. -->
    <linearGradient id="gScaleLit" x1="0" y1="0" x2="0.18" y2="1">
      <stop offset="0" stop-color="#402511"/>
      <stop offset="0.28" stop-color="#d9a761"/>
      <stop offset="0.62" stop-color="#a06a30"/>
      <stop offset="1" stop-color="#341d0a"/>
    </linearGradient>
    <linearGradient id="gScaleMid" x1="0" y1="0" x2="0.18" y2="1">
      <stop offset="0" stop-color="#331d0c"/>
      <stop offset="0.3" stop-color="#a97442"/>
      <stop offset="0.62" stop-color="#7c5326"/>
      <stop offset="1" stop-color="#281506"/>
    </linearGradient>
    <linearGradient id="gScaleDark" x1="0" y1="0" x2="0.18" y2="1">
      <stop offset="0" stop-color="#26150708"/>
      <stop offset="0.3" stop-color="#7a5026"/>
      <stop offset="0.62" stop-color="#573719"/>
      <stop offset="1" stop-color="#1d0f04"/>
    </linearGradient>
    <!-- Form shading laid over the finished cone, so the whole thing reads
         as one round body rather than a flat field of scales. -->
    <linearGradient id="gConeForm" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" stop-color="#ffe6b8" stop-opacity="0.32"/>
      <stop offset="0.34" stop-color="#ffd9a0" stop-opacity="0"/>
      <stop offset="0.66" stop-color="#000000" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.5"/>
    </linearGradient>
    <radialGradient id="gBob" cx="0.38" cy="0.28" r="0.95">
      <stop offset="0" stop-color="#ffeeb6"/>
      <stop offset="0.3" stop-color="#dcb75c"/>
      <stop offset="0.68" stop-color="#a17924"/>
      <stop offset="1" stop-color="#4a3208"/>
    </radialGradient>
    <linearGradient id="gRod" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4e3509"/>
      <stop offset="0.4" stop-color="#f4dc96"/>
      <stop offset="0.52" stop-color="#fff3cd"/>
      <stop offset="1" stop-color="#6b4a12"/>
    </linearGradient>
    <!-- Form washes for the bird. Each one is laid over a part after its own
         colour and its own carving, so the middle of the mass turns away
         from the light the way a turned or whittled surface does. They carry
         no colour of their own, only a warm highlight and a cool shadow, so
         all six species reuse the same four. -->
    <linearGradient id="gFormBody" x1="0.06" y1="0" x2="0.92" y2="1">
      <stop offset="0" stop-color="#ffe8c4" stop-opacity="0.3"/>
      <stop offset="0.34" stop-color="#ffe8c4" stop-opacity="0"/>
      <stop offset="0.6" stop-color="#1a0e05" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#1a0e05" stop-opacity="0.42"/>
    </linearGradient>
    <radialGradient id="gFormOrb" cx="0.31" cy="0.22" r="0.88">
      <stop offset="0" stop-color="#fff1d6" stop-opacity="0.34"/>
      <stop offset="0.4" stop-color="#fff1d6" stop-opacity="0"/>
      <stop offset="0.72" stop-color="#1a0e05" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#1a0e05" stop-opacity="0.44"/>
    </radialGradient>
    <!-- The near wing takes the light square on; the far one has already
         turned out of it and keeps only a thin edge. -->
    <linearGradient id="gFormWingN" x1="0.08" y1="0.05" x2="0.95" y2="0.95">
      <stop offset="0" stop-color="#ffeccd" stop-opacity="0.36"/>
      <stop offset="0.3" stop-color="#ffeccd" stop-opacity="0"/>
      <stop offset="0.58" stop-color="#1a0e05" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#1a0e05" stop-opacity="0.42"/>
    </linearGradient>
    <linearGradient id="gFormWingF" x1="0.05" y1="0.08" x2="0.98" y2="0.92">
      <stop offset="0" stop-color="#ffeccd" stop-opacity="0.16"/>
      <stop offset="0.22" stop-color="#ffeccd" stop-opacity="0"/>
      <stop offset="0.46" stop-color="#1a0e05" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#1a0e05" stop-opacity="0.52"/>
    </linearGradient>
    <radialGradient id="gInterior" cx="0.5" cy="0.35" r="0.9">
      <stop offset="0" stop-color="#241608"/>
      <stop offset="1" stop-color="#0b0502"/>
    </radialGradient>
    <radialGradient id="gShadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.42"/>
      <stop offset="0.7" stop-color="#000000" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <!-- The moon aperture: a night sky behind the dial and the moon itself,
         kept bone coloured so it belongs to the same painted face rather
         than glowing like a screen. -->
    <radialGradient id="gNight" cx="0.4" cy="0.28" r="0.9">
      <stop offset="0" stop-color="#262234"/>
      <stop offset="0.65" stop-color="#141020"/>
      <stop offset="1" stop-color="#08060e"/>
    </radialGradient>
    <radialGradient id="gMoon" cx="0.36" cy="0.3" r="0.82">
      <stop offset="0" stop-color="#f7eed6"/>
      <stop offset="0.66" stop-color="#e3d3ae"/>
      <stop offset="1" stop-color="#bfa87e"/>
    </radialGradient>

    <!-- Handled brass: the soft bloom left where a thumb has rubbed the
         tarnish back off. Only ever shown through the patina layer. -->
    <radialGradient id="gWorn" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f6dda8" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="#dcb373" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#c99a5c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gSessionWarm" cx="0.5" cy="0.08" r="0.95">
      <stop offset="0" stop-color="#ffcf8a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffcf8a" stop-opacity="0"/>
    </radialGradient>

    <!-- Grain that follows the plank direction: turbulence stretched along
         one axis, clipped to whatever shape carries the filter. -->
    <filter id="fGrainV" x="-2%" y="-2%" width="104%" height="104%">
      <feTurbulence type="fractalNoise" baseFrequency="0.62 0.03" numOctaves="5" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 0.10  0 0 0 0 0.06  0 0 0 0 0.02  2.3 2.3 2.3 0 -3.1" result="s"/>
      <feComposite in="s" in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="fGrainH" x="-2%" y="-2%" width="104%" height="104%">
      <feTurbulence type="fractalNoise" baseFrequency="0.03 0.58" numOctaves="5" seed="23" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 0.10  0 0 0 0 0.06  0 0 0 0 0.02  2.3 2.3 2.3 0 -3.1" result="s"/>
      <feComposite in="s" in2="SourceGraphic" operator="in"/>
    </filter>

    <!-- The carving light: a turbulence bump map lit from the upper left and
         multiplied over the source, so raised edges catch a warm highlight
         and the chisel cuts fall into shadow. -->
    <filter id="fCarved" x="-6%" y="-6%" width="112%" height="112%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="4" seed="4" result="bump"/>
      <feDiffuseLighting in="bump" surfaceScale="1.7" diffuseConstant="1.08"
                         lighting-color="#ffdfae" result="lit">
        <feDistantLight azimuth="235" elevation="52"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" in2="lit" operator="arithmetic"
                   k1="0.85" k2="0" k3="0" k4="0" result="shaded"/>
      <feComposite in="shaded" in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="fCarvedDeep" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="5" seed="9" result="bump"/>
      <feDiffuseLighting in="bump" surfaceScale="2.6" diffuseConstant="1.1"
                         lighting-color="#ffe3b4" result="lit">
        <feDistantLight azimuth="235" elevation="48"/>
      </feDiffuseLighting>
      <feComposite in="SourceGraphic" in2="lit" operator="arithmetic"
                   k1="0.9" k2="0" k3="0" k4="0" result="shaded"/>
      <feComposite in="shaded" in2="SourceGraphic" operator="in"/>
    </filter>

    <!-- Uneven age on the dial face: very low frequency blotching. -->
    <filter id="fAged" x="-2%" y="-2%" width="104%" height="104%">
      <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="4" seed="31" result="n"/>
      <feColorMatrix in="n" type="matrix"
        values="0 0 0 0 0.42  0 0 0 0 0.33  0 0 0 0 0.18  0.7 0.7 0.7 0 -1.15" result="s"/>
      <feComposite in="s" in2="SourceGraphic" operator="in"/>
    </filter>

    <filter id="fBlur3" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
    <filter id="fBlur7" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
    <filter id="fBlur16" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>

    <clipPath id="clipRoof">
      <path d="M 230 34 L 22 172 L 438 172 Z"/>
    </clipPath>

    <!-- Two oak leaf variants and an acorn, instanced with varied transforms
         so the garland never reads as a mirrored copy. -->
    <!-- The garland leaves are carved in the round and then parcel gilt: the
         blade is wood, the ribs are gold let into it. Each one gets the
         treatment every carved mass on this case gets, the silhouette
         restated inside itself lit above and shadowed below, and a form
         wash last so a leaf turns away from the light instead of lying flat
         against the case. -->
    <g id="leafA">
      <path id="leafAd" d="M 0 -21 C 3 -19 4 -16 3 -13 C 8 -15 12 -13 11 -8 C 16 -10 19 -6 16 -1
               C 21 0 22 6 17 8 C 20 13 16 17 11 15 C 12 21 6 23 3 19 C 1 24 -3 24 -5 19
               C -8 23 -14 21 -13 15 C -18 17 -22 13 -19 8 C -24 6 -23 0 -18 -1
               C -21 -6 -18 -10 -13 -8 C -14 -13 -10 -15 -5 -13 C -6 -16 -3 -19 0 -21 Z"
            fill="currentColor"/>
      <use href="#leafAd" transform="translate(-0.7 -1.1) scale(0.9)" fill="none"
           stroke="#d8a463" stroke-width="1" opacity="0.5"/>
      <use href="#leafAd" transform="translate(0.7 1.1) scale(0.9)" fill="none"
           stroke="#1a0c04" stroke-width="1.1" opacity="0.45"/>
      <path d="M 0 -21 L 0 20 M 0 -8 L 8 -12 M 0 -8 L -8 -12 M 0 2 L 10 -2 M 0 2 L -10 -2
               M 0 11 L 7 8 M 0 11 L -7 8"
            stroke="#2a1409" stroke-width="1.5" fill="none" opacity="0.6"/>
      <path d="M 0 -21 L 0 20 M 0 -8 L 8 -12 M 0 -8 L -8 -12 M 0 2 L 10 -2 M 0 2 L -10 -2
               M 0 11 L 7 8 M 0 11 L -7 8"
            stroke="url(#gGoldV)" stroke-width="0.8" fill="none" opacity="0.85"/>
      <path d="M 0 -21 L 0 20 M 0 -8 L 8 -12 M 0 2 L 10 -2"
            stroke="#fff3cd" stroke-width="0.3" fill="none" opacity="0.4"
            transform="translate(-0.35 -0.4)"/>
      <use href="#leafAd" fill="url(#gFormBody)" opacity="0.5"/>
      <path d="M 0 19 C 1 24 1 27 0 30" stroke="currentColor" stroke-width="2.4" fill="none"/>
    </g>
    <g id="leafB">
      <path id="leafBd" d="M 0 -19 C 4 -17 3 -13 2 -11 C 7 -13 11 -10 9 -5 C 15 -6 17 -1 13 3
               C 18 5 17 11 12 11 C 14 17 8 19 4 15 C 3 21 -3 21 -4 15 C -8 19 -14 17 -12 11
               C -17 11 -18 5 -13 3 C -17 -1 -15 -6 -9 -5 C -11 -10 -7 -13 -2 -11
               C -3 -13 -4 -17 0 -19 Z"
            fill="currentColor"/>
      <use href="#leafBd" transform="translate(-0.7 -1) scale(0.9)" fill="none"
           stroke="#d8a463" stroke-width="0.95" opacity="0.5"/>
      <use href="#leafBd" transform="translate(0.7 1) scale(0.9)" fill="none"
           stroke="#1a0c04" stroke-width="1" opacity="0.45"/>
      <path d="M 0 -19 L 0 17 M 0 -6 L 7 -9 M 0 -6 L -7 -9 M 0 4 L 8 1 M 0 4 L -8 1"
            stroke="#2a1409" stroke-width="1.4" fill="none" opacity="0.55"/>
      <path d="M 0 -19 L 0 17 M 0 -6 L 7 -9 M 0 -6 L -7 -9 M 0 4 L 8 1 M 0 4 L -8 1"
            stroke="url(#gGoldV)" stroke-width="0.75" fill="none" opacity="0.85"/>
      <use href="#leafBd" fill="url(#gFormBody)" opacity="0.5"/>
      <path d="M 0 16 C 1 21 0 24 -1 27" stroke="currentColor" stroke-width="2.2" fill="none"/>
    </g>
    <!-- The acorns are turned solid and gilded whole: a small hard glint in
         among the foliage, which is what stops a garland reading as a mat. -->
    <g id="acorn">
      <path d="M -5 0 C -6 7 -3 12 0 13 C 3 12 6 7 5 0 Z" fill="url(#gGoldBoss)"
            stroke="#3a2605" stroke-width="0.4"/>
      <path d="M -5 0 C -6 7 -3 12 0 13 C 3 12 6 7 5 0 Z" fill="url(#gGiltForm)" opacity="0.75"/>
      <path d="M -3.6 1.4 C -4.2 6 -2.4 9.6 -0.4 10.8" fill="none" stroke="#fff3cd"
            stroke-width="0.6" opacity="0.55"/>
      <path d="M -6.5 0 C -6 -4.5 6 -4.5 6.5 0 C 4 2.6 -4 2.6 -6.5 0 Z" fill="#3d250e"/>
      <path d="M -5.6 -1.4 C -4.4 -3.4 4.4 -3.4 5.6 -1.4" fill="none" stroke="#8a5a2c"
            stroke-width="0.6" opacity="0.6"/>
      <path d="M 0 -3.6 C 0.6 -6 2 -7.4 3.4 -7.8" stroke="#3d250e" stroke-width="1.6" fill="none"/>
    </g>
  </defs>`;

  // ------------------------------------------------------------------
  // Fragment builders. Each returns an SVG markup string, assembled below.
  // ------------------------------------------------------------------

  // Hand cut shingles: every one differs in width, height, tilt and tone,
  // with a rounded lower edge, laid in staggered rows up the roof triangle.
  // Each carries its own grain streaks and a worn lower edge that catches
  // the light where weather and hands have polished it.
  function buildShingles() {
    const tones = ['#6e4225', '#5a3319', '#7a4a2a', '#4e2b14', '#65391e'];
    const strokes = '#2a180b';
    let out = '';
    const rowH = 17;
    for (let row = 0; row < 10; row += 1) {
      const y = 168 - row * rowH + range(-2, 2);
      // The triangle narrows toward the peak: the roof edge at this row.
      const halfW = ((y - 34) / (172 - 34)) * 208;
      let x = 230 - halfW - range(4, 14);
      const xEnd = 230 + halfW + 6;
      while (x < xEnd) {
        const w = range(22, 34);
        const h = rowH + range(3, 9);
        const tilt = range(-2.4, 2.4);
        const tone = pick(tones);
        // Rounded bottom edge, slightly irregular.
        const r = w * range(0.32, 0.44);
        const dip = range(-1.5, 2.5);
        const tr = `translate(${fmt(x)} ${fmt(y - h + rowH - 2)}) rotate(${fmt(tilt)} ${fmt(w / 2)} ${fmt(h / 2)})`;
        out += `<path d="M 0 0 L ${fmt(w)} 0 L ${fmt(w)} ${fmt(h - r)}
                 Q ${fmt(w)} ${fmt(h + dip)} ${fmt(w / 2)} ${fmt(h + dip)}
                 Q 0 ${fmt(h + dip)} 0 ${fmt(h - r)} Z"
                 transform="${tr}"
                 fill="${tone}" stroke="${strokes}" stroke-width="0.8"/>`;
        // two grain streaks running with the split of the wood
        out += `<path d="M ${fmt(w * 0.3)} 3 L ${fmt(w * 0.3 + range(-1.4, 1.4))} ${fmt(h - r - 1)}
                 M ${fmt(w * 0.66)} 2 L ${fmt(w * 0.66 + range(-1.4, 1.4))} ${fmt(h - r - 2)}"
                 transform="${tr}" stroke="#2a180b" stroke-width="0.55" fill="none" opacity="0.5"/>`;
        // the worn lower edge, a lighter arc just above the bottom curve
        out += `<path d="M ${fmt(r * 0.5)} ${fmt(h + dip - r * 0.62)}
                 Q ${fmt(w / 2)} ${fmt(h + dip + 1)} ${fmt(w - r * 0.5)} ${fmt(h + dip - r * 0.62)}"
                 transform="${tr}" stroke="#8a6238" stroke-width="0.85" fill="none" opacity="0.5"/>`;
        // the nail that holds it: a hammered head sunk just proud of the
        // wood, with a lit crown and the dark dimple the hammer left
        const nx = w * range(0.42, 0.58);
        const ny = range(3.4, 5.6);
        out += `<circle cx="${fmt(nx)}" cy="${fmt(ny)}" r="1.25" fill="#2a1a0c"
                 transform="${tr}" opacity="0.85"/>
                <path d="M ${fmt(nx - 0.9)} ${fmt(ny - 0.5)} a 1.05 1.05 0 0 1 1.5 -0.35"
                 transform="${tr}" stroke="#9c7442" stroke-width="0.55" fill="none" opacity="0.75"/>`;
        // one shingle in a dozen has split up from its bottom edge, the way
        // cedar always does after a few winters
        if (rnd() < 0.08) {
          const sx = w * range(0.3, 0.7);
          const top = h * range(0.45, 0.65);
          out += `<path d="M ${fmt(sx)} ${fmt(h + dip - 1)} L ${fmt(sx + range(-1.2, 1.2))} ${fmt(top)}"
                   transform="${tr}" stroke="#1d1006" stroke-width="0.85" fill="none" opacity="0.6"/>
                  <path d="M ${fmt(sx + 0.55)} ${fmt(h + dip - 2)} L ${fmt(sx + 0.55 + range(-1, 1))} ${fmt(top + 1)}"
                   transform="${tr}" stroke="#8a6238" stroke-width="0.4" fill="none" opacity="0.35"/>`;
        }
        x += w * range(0.82, 0.95);
      }
    }
    return `<g clip-path="url(#clipRoof)">${out}</g>`;
  }

  // Carved bargeboards down both slopes: a timber band with a running bead
  // and reel carving, catching the light filter like the rest of the case.
  function buildBargeboards() {
    const slope = (x0, y0, x1, y1) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      let beads = '';
      const n = Math.floor(len / 14);
      for (let i = 1; i < n; i += 1) {
        const bx = i * 14;
        if (i % 2 === 1) {
          beads += `<circle cx="${bx}" cy="0.7" r="3.1" fill="#1c0d05" opacity="0.4"/>
                    <circle cx="${bx}" cy="0" r="3.1" fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.4"/>
                    <circle cx="${bx - 1}" cy="-1" r="0.95" fill="#fff3cd" opacity="0.6"/>
                    <circle cx="${bx}" cy="0" r="1.2" fill="#2e1c03" opacity="0.6"/>`;
        } else {
          // the reel between the beads, an elongated lozenge with a lit arris
          beads += `<ellipse cx="${bx}" cy="0" rx="4.7" ry="2.3" fill="#7d4926"
                     stroke="#2a1409" stroke-width="0.7"/>
                    <path d="M ${bx - 2.7} -0.9 L ${bx + 2.7} -0.9"
                     stroke="#c08a4d" stroke-width="0.7" fill="none" opacity="0.7"/>`;
        }
      }
      return `<g transform="translate(${x0} ${y0}) rotate(${fmt(ang)})">
        <rect x="0" y="-7.5" width="${fmt(len)}" height="15" rx="4" fill="url(#gBarge)"
              stroke="#241608" stroke-width="1"/>
        <rect x="0" y="-7.5" width="${fmt(len)}" height="15" rx="4" fill="url(#gFormBody)"
              opacity="0.4"/>
        ${goldFillet(2, -7.1, len - 4, 1.8, 0.8)}
        ${goldFillet(2, 5.4, len - 4, 1.6, 0.8)}
        ${beads}
      </g>`;
    };
    // Spiral curl finials at the eave ends, the bargeboard rolling into a
    // carved volute instead of stopping dead.
    const curl = (cx, mirror) => `
      <g transform="translate(${cx} 176) scale(${mirror} 1)">
        <circle r="10" fill="url(#gBarge)" stroke="#241608" stroke-width="1"/>
        <path d="M 0 -8.2 A 8.2 8.2 0 1 0 8.2 0 M -1.6 -5.4 A 5.6 5.6 0 1 1 4 -4
                 M -0.6 -2.6 A 2.7 2.7 0 1 0 2 1.6"
              fill="none" stroke="#33200f" stroke-width="1.2"/>
        <path d="M 0 -8.2 A 8.2 8.2 0 0 1 8.2 0" transform="translate(-0.8 -0.8)"
              fill="none" stroke="#a97f4e" stroke-width="0.7" opacity="0.6"/>
        <circle cx="1.4" cy="0.6" r="2.4" fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.4"/>
        <circle cx="0.7" cy="-0.1" r="0.8" fill="#fff3cd" opacity="0.6"/>
      </g>`;
    // Slightly proud of the shingle field, with the curls at both ends.
    return `<g filter="url(#fCarved)">
      ${slope(230, 26, 12, 176)}
      ${slope(230, 26, 448, 176)}
      ${curl(12, 1)}
      ${curl(448, -1)}
    </g>`;
  }

  // The crest: a carved bird with spread wings amongst oak leaves, the most
  // detailed carving on the piece, standing proud of the gable peak.
  function buildCrest() {
    // Two wings carved by the same hand on the same afternoon, which is
    // exactly why they do not match: the master roughs one out and then
    // eyes the second against it. Sweep, lift and the weight of every cut
    // differ a little, and that is the whole difference between a carving
    // and a stamping.
    const wing = (dir, v) => `
      <g transform="scale(${dir} 1) rotate(${fmt(v.rot)} 10 -18) translate(0 ${fmt(v.lift)})">
        <path d="${WING_MASS}" fill="${v.tone}" stroke="#3a2605" stroke-width="1.1"/>
        <path d="${WING_MASS}" fill="url(#gGiltForm)" opacity="0.62"/>
        <path d="M 14 -28 C 30 -36 48 -40 62 -37 M 18 -16 C 36 -22 52 -22 64 -18
                 M 20 -4 C 34 -6 48 -4 58 1"
              stroke="#3a2605" stroke-width="${fmt(v.cut)}" fill="none" opacity="0.7"/>
        <!-- lit edges on the feather rows, the cut catching the sky -->
        <path d="M 14 -28 C 30 -36 48 -40 62 -37 M 18 -16 C 36 -22 52 -22 64 -18
                 M 20 -4 C 34 -6 48 -4 58 1"
              stroke="#fff3cd" stroke-width="0.55" fill="none" opacity="${fmt(v.lit)}"
              transform="translate(-0.8 -0.9)"/>
        <!-- individual flight feather separations along the trailing edge -->
        <path d="M 74 -44 C 70 -40 66 -37 62 -35 M 86 -18 C 81 -16 76 -15 71 -14
                 M 78 8 C 73 7 68 6 63 5 M 52 -30 C 49 -27 47 -25 45 -23
                 M 56 -9 C 53 -6 51 -4 49 -2 M 46 2 C 43 4 41 5 38 6"
              stroke="#2e1c0e" stroke-width="0.9" fill="none" opacity="0.75"/>
        <!-- coverts, the small scalloped feathers at the wing root, three
             rows of them and every scallop taken at its own width -->
        ${(() => {
    let d = '';
    for (let r = 0; r < 4; r += 1) {
      const y = -26 + r * 9.6;
      for (let i = 0; i < 3; i += 1) {
        const x = 9 + i * 6.4 + r * 1.5;
        d += `M ${fmt(x)} ${fmt(y + range(-0.7, 0.7))}
              q ${fmt(range(2.4, 3.3))} ${fmt(range(1.7, 2.6))} ${fmt(range(5.4, 6.6))} ${fmt(range(-0.5, 0.5))} `;
      }
    }
    return `<path d="${d}" stroke="#33200f" stroke-width="0.75" fill="none" opacity="0.62"/>
            <path d="${d}" stroke="#a97f4e" stroke-width="0.38" fill="none" opacity="0.4"
                  transform="translate(-0.5 -0.7)"/>`;
  })()}
      </g>`;

    // Oak spray behind the bird, placed by hand rather than mirrored: the
    // left side is carried a little further than the right, the way a
    // carver drifts when they are working to a drawing and not a template.
    const spray = [
      { leaf: 'leafA', x: -58, y: 17, r: -52, s: 1.18 },
      { leaf: 'leafB', x: 57, y: 21, r: 46, s: 1.14 },
      { leaf: 'leafA', x: -76, y: 33, r: -88, s: 0.98 },
      { leaf: 'leafB', x: 75, y: 37, r: 80, s: 0.88 },
      { leaf: 'leafA', x: -36, y: 5, r: -30, s: 0.6 },
      { leaf: 'leafB', x: 38, y: 8, r: 26, s: 0.56 },
    ].map((p) => `<use href="#${p.leaf}" transform="translate(${p.x} ${p.y}) rotate(${p.r})
                   scale(${fmt(p.s * (rnd() < 0.5 ? -1 : 1))} ${p.s})"/>`).join('');

    return `<g transform="translate(230 64)">
      <!-- oak leaves flanking the bird, carved in the solid -->
      <g color="#7a4522">
        ${spray}
        <use href="#acorn" transform="translate(-41 34) rotate(-18) scale(1.08)"/>
        <use href="#acorn" transform="translate(-31 40) rotate(-4) scale(0.8)"/>
        <use href="#acorn" transform="translate(43 36) rotate(14) scale(0.94)"/>
      </g>
      ${wing(-1, { rot: -3.2, lift: -1.1, tone: 'url(#gGold)', cut: 1.35, lit: 0.62 })}
      ${wing(1, { rot: 1.6, lift: 0.8, tone: 'url(#gGoldH)', cut: 1.2, lit: 0.5 })}
      <!-- body, head and tail -->
      <path d="M -12 30 C -16 8 -12 -14 0 -20 C 12 -14 16 8 12 30 C 6 36 -6 36 -12 30 Z"
            fill="url(#gGoldV)" stroke="#3a2605" stroke-width="1.1"/>
      <path d="M -12 30 C -16 8 -12 -14 0 -20 C 12 -14 16 8 12 30 C 6 36 -6 36 -12 30 Z"
            fill="url(#gGiltForm)" opacity="0.7"/>
      <!-- scalloped breast plumage, carved rows with lit edges -->
      <path d="M -8 -12 C -4 -10 4 -10 8 -12 M -10 -4 C -5 -2 5 -2 10 -4
               M -11 4 C -5 6 5 6 11 4 M -10 12 C -5 14 5 14 10 12
               M -8 20 C -4 22 4 22 8 20 M -6 27 C -3 29 3 29 6 27"
            stroke="#3a2605" stroke-width="0.9" fill="none" opacity="0.65"/>
      <path d="M -8 -12 C -4 -10 4 -10 8 -12 M -10 -4 C -5 -2 5 -2 10 -4
               M -11 4 C -5 6 5 6 11 4 M -10 12 C -5 14 5 14 10 12"
            stroke="#fff3cd" stroke-width="0.45" fill="none" opacity="0.6"
            transform="translate(-0.6 -0.8)"/>
      <path d="M 0 -20 C -7 -26 -8 -36 0 -42 C 8 -36 7 -26 0 -20 Z"
            fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="1"/>
      <path d="M -5.6 -24 C -7.4 -29 -6.8 -35.4 -1.6 -40.2" fill="none"
            stroke="#fff3cd" stroke-width="0.8" opacity="0.6"/>
      <!-- crown feather lines and a brow ridge over the eye -->
      <path d="M -5 -27 C -2 -25.6 2 -25.6 5 -27 M -6.4 -31.6 C -3 -30.4 3 -30.4 6.4 -31.6"
            stroke="#33200f" stroke-width="0.7" fill="none" opacity="0.7"/>
      <path d="M -5.6 -36.4 C -3.4 -37.6 -0.6 -37.8 1.4 -37"
            stroke="#33200f" stroke-width="0.8" fill="none" opacity="0.8"/>
      <path d="M 0 -40 L 4.4 -33.6 L 0 -31.6 Z" fill="url(#gGoldV)" stroke="#3a2605"
            stroke-width="0.4"/>
      <circle cx="-2.4" cy="-35" r="1.5" fill="#1c0f05"/>
      <circle cx="-2.9" cy="-35.5" r="0.45" fill="#e8d9b4" opacity="0.9"/>
      <path d="M -9 30 L -14 48 L -5 44 L 0 52 L 5 44 L 14 48 L 9 30 Z"
            fill="url(#gGold)" stroke="#3a2605" stroke-width="1"/>
      <path d="M -9 30 L -14 48 L -5 44 L 0 52 L 5 44 L 14 48 L 9 30 Z"
            fill="url(#gGiltForm)" opacity="0.6"/>
      <!-- tail feather grooves running into the fan, no two the same depth -->
      <path d="M -8 32 L -11.5 45 M -2.6 33 L -3.4 47 M 2.6 33 L 3.4 47 M 8 32 L 11.5 45"
            stroke="#2e1c0e" stroke-width="0.9" fill="none" opacity="0.75"/>
      <path d="M -6.2 34 L -8.6 44 M 5.4 34.5 L 7.4 44.5"
            stroke="#2e1c0e" stroke-width="0.6" fill="none" opacity="0.5"/>
      <path d="M -7 -8 C -3 0 -3 12 -6 22 M 7 -8 C 3 0 3 12 6 22"
            stroke="#33200f" stroke-width="1.1" fill="none" opacity="0.7"/>
    </g>`;
  }

  // Oak leaf and acorn garland flowing down both case posts and round the
  // dial. Placement is seeded and asymmetric on purpose.
  function buildGarland() {
    const spots = [];
    // Left post, top to bottom.
    for (let i = 0; i < 8; i += 1) {
      spots.push({ x: range(82, 100), y: 196 + i * 34 + range(-8, 8), r: range(-70, 70), s: range(0.8, 1.1) });
    }
    // Right post, different rhythm.
    for (let i = 0; i < 8; i += 1) {
      spots.push({ x: range(360, 380), y: 206 + i * 32 + range(-9, 9), r: range(-70, 70), s: range(0.75, 1.15) });
    }
    // Around the dial ring, a looser scatter.
    const dialSpots = [
      { a: -128, d: 84 }, { a: -68, d: 86 }, { a: 62, d: 85 }, { a: 126, d: 84 },
      { a: 176, d: 86 }, { a: -178, d: 85 },
    ];
    for (const { a, d } of dialSpots) {
      const rad = (a * Math.PI) / 180;
      spots.push({
        x: L.dial.cx + Math.sin(rad) * d + range(-4, 4),
        y: L.dial.cy - Math.cos(rad) * d + range(-4, 4),
        r: a + range(-30, 30),
        s: range(0.7, 1),
      });
    }
    // Over the bird door arch.
    spots.push({ x: 188, y: 210, r: -58, s: 0.85 });
    spots.push({ x: 272, y: 206, r: 44, s: 0.9 });
    spots.push({ x: 230, y: 196, r: 6, s: 0.75 });

    let out = '';
    for (const p of spots) {
      const leaf = rnd() < 0.5 ? 'leafA' : 'leafB';
      const flip = rnd() < 0.5 ? -1 : 1;
      const tone = pick(['#8a5028', '#9c5c2e', '#7a4522', '#8f5527']);
      out += `<g transform="translate(${fmt(p.x)} ${fmt(p.y)}) rotate(${fmt(p.r)}) scale(${fmt(p.s * flip)} ${fmt(p.s)})"
               color="${tone}"><use href="#${leaf}"/></g>`;
      if (rnd() < 0.4) {
        out += `<g transform="translate(${fmt(p.x + range(-10, 10))} ${fmt(p.y + range(8, 16))}) rotate(${fmt(range(-40, 40))}) scale(${fmt(range(0.8, 1.1))})"
                 color="#8a5028"><use href="#acorn"/></g>`;
      }
    }
    // Carved stems winding down both posts, tying the leaves into one vine.
    // Dark cut with a worn lit edge, drawn first so the leaves sit on it.
    const stems = `
      <path d="M 91 186 C 84 236 97 282 89 332 C 83 376 95 420 88 472"
            stroke="#2a1409" stroke-width="2.4" fill="none" opacity="0.85"/>
      <path d="M 91 186 C 84 236 97 282 89 332 C 83 376 95 420 88 472"
            stroke="#c08a4d" stroke-width="0.9" fill="none" opacity="0.55"
            transform="translate(-0.9 -0.9)"/>
      <path d="M 369 196 C 376 244 363 288 371 336 C 377 378 365 424 372 472"
            stroke="#2a1409" stroke-width="2.4" fill="none" opacity="0.85"/>
      <path d="M 369 196 C 376 244 363 288 371 336 C 377 378 365 424 372 472"
            stroke="#c08a4d" stroke-width="0.9" fill="none" opacity="0.55"
            transform="translate(-0.9 -0.9)"/>`;
    return `<g>${stems}${out}</g>`;
  }

  // Bead and reel carving round the dial ring: round beads alternating with
  // elongated reels set tangent to the circle, each reel carrying a lit arris.
  function buildRingCarving() {
    const { cx, cy, ring } = L.dial;
    let out = '';
    const n = 30;
    for (let i = 0; i < n; i += 1) {
      // Struck round the ring by eye, not stepped off with dividers: the
      // spacing wanders by a fraction of a degree and no two beads match.
      const a = ((i + range(-0.11, 0.11)) / n) * Math.PI * 2;
      const deg = (a * 180) / Math.PI;
      const x = cx + Math.sin(a) * (ring - 5 + range(-0.5, 0.5));
      const y = cy - Math.cos(a) * (ring - 5 + range(-0.5, 0.5));
      if (i % 2 === 0) {
        const r = range(2.7, 3.3);
        out += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="${pick(['#8a6238', '#7f5931', '#916a3d'])}"/>
                <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r * 0.4)}" fill="#33200f"/>
                <path d="M ${fmt(x - r * 0.6)} ${fmt(y - r * 0.5)} a ${fmt(r * 0.8)} ${fmt(r * 0.8)} 0 0 1 ${fmt(r * 1.1)} -0.2"
                      stroke="#c39a63" stroke-width="0.5" fill="none" opacity="0.55"/>`;
      } else {
        out += `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(deg + 90 + range(-3, 3))})">
                  <ellipse rx="${fmt(range(4.1, 4.8))}" ry="${fmt(range(1.9, 2.3))}"
                           fill="${pick(['#6f4c2b', '#664426', '#775330'])}" stroke="#33200f" stroke-width="0.7"/>
                  <path d="M ${fmt(range(-2.7, -2.3))} -0.8 L ${fmt(range(2.3, 2.7))} -0.8"
                        stroke="#a97f4e" stroke-width="0.65" fill="none" opacity="0.7"/>
                </g>`;
      }
    }
    return out;
  }

  // The engraved minute track: a fine ring of ticks just inside the numerals,
  // every fifth one cut longer and heavier the way a dial engraver marks the
  // quarters. Struck by hand, so the weight is never quite even.
  function buildMinuteTrack() {
    const { cx, cy } = L.dial;
    const rOut = 63.4;
    let out = '';
    for (let i = 0; i < 60; i += 1) {
      const a = (i / 60) * Math.PI * 2 + range(-0.0045, 0.0045);
      const five = i % 5 === 0;
      const len = five ? range(3.3, 3.9) : range(2.1, 2.7);
      const s = Math.sin(a);
      const c = Math.cos(a);
      out += `<path d="M ${fmt(cx + s * rOut)} ${fmt(cy - c * rOut)}
                       L ${fmt(cx + s * (rOut - len))} ${fmt(cy - c * (rOut - len))}"
               stroke="#4a2c11" stroke-width="${fmt(five ? range(1.05, 1.3) : range(0.5, 0.7))}"
               stroke-linecap="round" opacity="${fmt(range(0.55, 0.82))}"/>`;
    }
    // The guide circle the engraver struck the ticks off, still faintly there.
    return `<circle cx="${cx}" cy="${cy}" r="60.6" fill="none" stroke="#4a2c11"
             stroke-width="0.4" opacity="0.32"/>${out}`;
  }

  // Figures rather than Roman numerals. They read at a glance at every one
  // of the sizes this case can be dragged to, and they leave the dial far
  // more air than XVIII ever could.
  function buildNumerals(mode) {
    const { cx, cy, numeral } = L.dial;
    const count = mode === 24 ? 24 : 12;
    const figures = Array.from({ length: count }, (_, i) => String(i + 1));
    const size = mode === 24 ? 9.5 : 16.5;
    let out = '';
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      // Index zero sits at the top, numbering runs clockwise from there.
      const label = figures[(i + count - 1) % count];
      const x = cx + Math.sin(a) * numeral + range(-0.5, 0.5);
      const y = cy - Math.cos(a) * numeral + range(-0.5, 0.5);
      // Laid on with a brush, one at a time, by someone who had been at it
      // since morning: each sits a hair off true and carries its own weight.
      const tilt = range(-1.8, 1.8);
      const wear = range(0.74, 0.94);
      // Applied gilt figures, not painted ones: each is a cut numeral pinned
      // to the dial, so it throws a shadow of its own onto the bone before
      // the gold goes down over it.
      const attrs = `text-anchor="middle" dominant-baseline="central"
               font-size="${fmt(size * range(0.97, 1.03))}" font-weight="bold"`;
      out += `<text x="${fmt(x + 0.7)}" y="${fmt(y + 0.9)}" ${attrs}
               transform="rotate(${fmt(tilt)} ${fmt(x)} ${fmt(y)})"
               fill="#2a1608" opacity="0.34">${label}</text>
              <text x="${fmt(x)}" y="${fmt(y)}" ${attrs}
               transform="rotate(${fmt(tilt)} ${fmt(x)} ${fmt(y)})"
               fill="url(#gGoldV)" stroke="#3f2b06"
               stroke-width="${fmt(range(0.4, 0.6))}" opacity="${fmt(wear + 0.06)}"
               paint-order="stroke">${label}</text>`;
    }
    return out;
  }

  // A real fir cone. The body is a long ovoid; the scales are woody diamond
  // shields with a raised umbo and a point at the tip, and each one tucks
  // its head under the scale above the way roof tiles do. Rows are offset by
  // a constant fraction of a scale rather than merely alternating, which is
  // what sets the ranks running diagonally: every cone in the world carries
  // those intersecting spirals, and nothing else reads as a cone without
  // them. Seeded jitter makes all three cones on the case different.
  function buildCone(id, train) {
    const cx = 18;
    const top = 3;
    const bot = 70;
    const rows = 13;
    const fat = range(0.93, 1.07);
    const lean = range(-0.7, 0.7);
    // Narrow at the stalk, shouldering out to its fullest a little under
    // halfway down, then a long taper to a point. Getting this curve wrong
    // is the whole difference between a fir cone and a blackberry.
    const profile = (t) => Math.max(1.8,
      17 * fat * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t, 0, 1), 0.78)), 0.7));
    const axis = (t) => cx + lean * Math.sin(Math.PI * t);

    // The body the scales sit on, so every gap between them reads as depth
    // rather than as a hole in the artwork.
    const edge = [];
    for (let i = 0; i <= 26; i += 1) {
      const t = i / 26;
      edge.push([axis(t) - profile(t), lerp(top, bot, t)]);
    }
    for (let i = 26; i >= 0; i -= 1) {
      const t = i / 26;
      edge.push([axis(t) + profile(t), lerp(top, bot, t)]);
    }
    const core = `M ${edge.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L ')} Z`;

    let scales = '';
    for (let r = rows - 1; r >= 0; r -= 1) {
      const t = (r + 0.5) / rows;
      const y = lerp(top, bot, t) + range(-0.5, 0.5);
      const halfW = profile(t);
      const ax = axis(t);
      const s = 0.52 + 0.58 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.55);
      const w = 4.3 * s;
      const h = 5.5 * s;
      const n = Math.max(1, Math.round((halfW * 2) / (w * 1.6)));
      const span = (halfW * 2) / n;
      const spiral = ((r * 0.38) % 1) - 0.5;
      for (let i = 0; i < n; i += 1) {
        const x = ax - halfW + (i + 0.5 + spiral * 0.9) * span + range(-0.4, 0.4);
        const u = clamp((x - ax) / Math.max(1, halfW), -1, 1);
        // Round the far side of the cone a scale is seen edge on, so it
        // reads narrow without actually being any smaller, and it tips
        // away from the axis as the body curves out from under it.
        const fore = fmt(0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - u * u)));
        const rot = fmt(u * 13 + range(-4, 4));
        const tone = u < -0.3 ? 'gScaleLit' : (u < 0.32 ? 'gScaleMid' : 'gScaleDark');
        const umbo = `M ${fmt(-w * 0.42)} ${fmt(h * 0.04)} Q 0 ${fmt(h * 0.5)} ${fmt(w * 0.42)} ${fmt(h * 0.04)}`;
        scales += `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${rot}) scale(${fore} 1)">
          <path d="M ${fmt(-w)} ${fmt(-h * 0.12)}
                   C ${fmt(-w)} ${fmt(-h * 0.76)} ${fmt(-w * 0.5)} ${fmt(-h * 1.04)} 0 ${fmt(-h)}
                   C ${fmt(w * 0.5)} ${fmt(-h * 1.04)} ${fmt(w)} ${fmt(-h * 0.76)} ${fmt(w)} ${fmt(-h * 0.12)}
                   C ${fmt(w * 0.82)} ${fmt(h * 0.54)} ${fmt(w * 0.36)} ${fmt(h * 0.88)} 0 ${fmt(h)}
                   C ${fmt(-w * 0.36)} ${fmt(h * 0.88)} ${fmt(-w * 0.82)} ${fmt(h * 0.54)} ${fmt(-w)} ${fmt(-h * 0.12)} Z"
                fill="url(#${tone})" stroke="#1c0e03" stroke-width="0.62"/>
          <!-- the umbo: the raised boss across the shield, cut in and lit -->
          <path d="${umbo}" stroke="#2a1607" stroke-width="0.62" fill="none" opacity="0.75"/>
          <path d="${umbo}" stroke="#f0c583" stroke-width="0.42" fill="none" opacity="0.55"
                transform="translate(-0.3 -0.6)"/>
          <path d="M 0 ${fmt(h * 0.36)} L 0 ${fmt(h * 0.9)}" stroke="#20110a"
                stroke-width="0.55" opacity="0.5"/>
          <!-- the arris the light runs along, upper left as everywhere else -->
          <path d="M ${fmt(-w * 0.9)} ${fmt(-h * 0.3)}
                   C ${fmt(-w * 0.86)} ${fmt(-h * 0.82)} ${fmt(-w * 0.44)} ${fmt(-h * 0.98)} 0 ${fmt(-h * 0.94)}"
                stroke="#f0c583" stroke-width="0.5" fill="none" opacity="0.6"/>
        </g>`;
      }
    }

    return `<g id="${id}">
      <path d="M ${cx} -7 L ${cx} 6" stroke="url(#gGoldV)" stroke-width="3.2"/>
      <circle cx="${cx}" cy="-8" r="4" fill="none" stroke="url(#gGold)" stroke-width="2.8"/>
      <!-- the gilt cap the cone is hung from: a turned collar over the stalk
           with a beaded lip, so the weight reads as a mounted piece rather
           than a fir cone somebody tied a chain to -->
      <path d="M ${cx - 7.6} 4 L ${cx + 7.6} 4 L ${cx + 6.2} 12.5 L ${cx - 6.2} 12.5 Z"
            fill="url(#gGold)" stroke="#3a2605" stroke-width="0.6"/>
      <path d="M ${cx - 6.6} 5.6 L ${cx + 6.6} 5.6" stroke="#fff3cd" stroke-width="0.8" opacity="0.6"/>
      <path d="M ${cx - 6.3} 11.2 L ${cx + 6.3} 11.2" stroke="#241601" stroke-width="0.9" opacity="0.5"/>
      ${[-5, -1.7, 1.7, 5].map((o) => `<circle cx="${fmt(cx + o)}" cy="13.6" r="1.5"
          fill="url(#gGoldBoss)"/>`).join('')}
      <!-- the hanger ring, which only ever gets touched by pulling on it -->
      <g id="patinaHanger-${train}" opacity="0" pointer-events="none">
        <circle cx="${cx}" cy="-8" r="4" fill="none" stroke="#f6dfa4" stroke-width="1.3"/>
        <ellipse cx="${cx}" cy="-8" rx="7" ry="7" fill="url(#gWorn)" opacity="0.55"/>
      </g>
      <!-- the dark body the scales grow out of, seen in every gap -->
      <path d="${core}" fill="#1d0f04"/>
      ${scales}
      <!-- form shading over the finished cone, so it reads as one round
           body and not as a flat field of scales -->
      <path d="${core}" fill="url(#gConeForm)" pointer-events="none"/>
    </g>`;
  }

  // ------------------------------------------------------------------
  // Static case assembly.
  // ------------------------------------------------------------------
  const D = L.door;
  const dial = L.dial;

  // The case shadow is part of the artwork: the window itself casts none.
  const shadows = `
    <ellipse cx="236" cy="794" rx="158" ry="15" fill="url(#gShadow)"/>
    <rect x="86" y="176" width="312" height="312" rx="18" fill="#000000"
          opacity="0.34" filter="url(#fBlur16)" transform="translate(7 12)"/>
    <path d="M 230 30 L 12 178 L 448 178 Z" fill="#000000" opacity="0.3"
          filter="url(#fBlur16)" transform="translate(6 10)"/>`;

  const roof = `
    <g class="ck-case">
      <path d="M 230 30 L 14 176 L 446 176 Z" fill="url(#gRoof)"/>
      ${buildShingles()}
      <!-- The roof is two planes, not one field of tiles. The left slope
           takes the light square on and the right slope has already turned
           out of it, so each gets its own wash over the finished shingles,
           the same way the pine cones are washed over their scales. -->
      <path d="M 230 30 L 14 176 L 230 176 Z" fill="url(#gFormWingN)" opacity="0.55"
            pointer-events="none"/>
      <path d="M 230 30 L 446 176 L 230 176 Z" fill="url(#gFormWingF)" opacity="0.62"
            pointer-events="none"/>
      <!-- eave boards and the shadow the overhang throws on the case front -->
      <rect x="16" y="168" width="428" height="14" rx="5" fill="url(#gBarge)"
            stroke="#241608" stroke-width="1" filter="url(#fCarved)"/>
      <!-- a gilt band run the full width of the eave, and a drop of gilt
           cresting hung off it at every second rafter end -->
      ${goldFillet(18, 169, 424, 2.4, 1)}
      ${goldFillet(18, 178.4, 424, 2, 1)}
      ${[26, 40, 54, 406, 420, 434].map((cx) => `
        <path d="M ${cx} 181 L ${cx - 3.4} 187 L ${cx} 193.5 L ${cx + 3.4} 187 Z"
              fill="url(#gGoldV)" stroke="#3a2605" stroke-width="0.35"/>
        <path d="M ${cx - 1.2} 183.4 L ${cx - 1.2} 190" stroke="#fff3cd"
              stroke-width="0.45" opacity="0.5"/>
        <circle cx="${cx}" cy="195.6" r="1.5" fill="url(#gGoldBoss)"/>`).join('')}
      <rect x="52" y="184" width="356" height="22" fill="#000000" opacity="0.42"
            filter="url(#fBlur7)"/>
      ${buildBargeboards()}
    </g>
    ${buildCrest()}`;

  // Dentil row under the cornice: the little square teeth of classical
  // joinery, sawn one at a time off a strip, so the widths and the gaps
  // wander and one or two sit a whisker low.
  const dentils = Array.from({ length: 22 }, (_, i) => {
    const x = 82 + i * 14 + range(-0.5, 0.5);
    const y = 191 + range(-0.4, 0.4);
    const w = range(6.4, 7.5);
    const h = range(6, 7);
    const gilt = i % 2 === 1;
    return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"
             fill="${gilt ? 'url(#gGoldV)' : pick(['#43200f', '#4a2614', '#3c1c0e'])}"
             stroke="${gilt ? '#3a2605' : '#241608'}" stroke-width="0.6"/>
            <path d="M ${fmt(x + 0.8)} ${fmt(y + 0.9)} L ${fmt(x + w - 0.8)} ${fmt(y + 0.9)}"
             stroke="${gilt ? '#fff3cd' : '#c08a4d'}" stroke-width="0.6" fill="none"
             opacity="${fmt(range(0.35, 0.6) + (gilt ? 0.2 : 0))}"/>
            ${gilt ? `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"
             fill="url(#gGiltForm)" opacity="0.45"/>` : ''}`;
  }).join('');

  // Bead row running along the base moulding, turned by hand off the same
  // gouge, which is to say near enough identical and not quite.
  const baseBeads = Array.from({ length: 23 }, (_, i) => {
    const x = 84 + i * 13 + range(-0.4, 0.4);
    const y = 465 + range(-0.3, 0.3);
    const r = range(2.3, 2.85);
    return `<circle cx="${fmt(x + 0.6)}" cy="${fmt(y + 0.8)}" r="${fmt(r)}" fill="#1c0d05" opacity="0.4"/>
            <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r)}" fill="url(#gGoldBoss)"
             stroke="#3a2605" stroke-width="0.4"/>
            <circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r * 0.36)}" fill="#2e1c03" opacity="0.7"/>
            <path d="M ${fmt(x - r * 0.55)} ${fmt(y - r * 0.5)} a ${fmt(r * 0.75)} ${fmt(r * 0.75)} 0 0 1 ${fmt(r * 1.05)} -0.2"
             stroke="#fff3cd" stroke-width="0.5" fill="none" opacity="0.62"/>`;
  }).join('');

  // Joinery: the oak pegs that actually hold the case together, driven
  // through the stiles into the tenons and sanded back nearly flush. Each
  // one is a slightly out of round end grain plug with its own tone.
  const peg = (x, y, r = 2.4) => {
    const rr = r * range(0.9, 1.1);
    return `<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(rr)}" ry="${fmt(rr * range(0.88, 1.02))}"
             fill="${pick(['#7a5227', '#6d4720', '#835a2d'])}" stroke="#2a180b" stroke-width="0.55"/>
            <path d="M ${fmt(x - rr * 0.5)} ${fmt(y - rr * 0.45)} a ${fmt(rr * 0.7)} ${fmt(rr * 0.7)} 0 0 1 ${fmt(rr)} -0.2"
             stroke="#b58a55" stroke-width="0.45" fill="none" opacity="0.55"/>
            <path d="M ${fmt(x - rr * 0.55)} ${fmt(y + rr * 0.2)} q ${fmt(rr * 0.55)} ${fmt(-rr * 0.35)} ${fmt(rr * 1.1)} 0"
             stroke="#2a180b" stroke-width="0.35" fill="none" opacity="0.4"/>`;
  };

  const pegs = [
    // the front panel pinned to its stiles at the four corners, clear of
    // the dentil row above and the base moulding below
    [108, 207], [352, 206], [108, 441], [352, 442],
    // and to the rails at the head and foot of each plank seam
    [165, 206], [295, 207], [165, 442], [295, 441],
    // the side posts pegged through to the carcase, top and bottom
    [100, 246], [100, 404], [360, 244], [360, 406],
  ].map(([x, y]) => peg(x, y)).join('');

  // Directional tool marks: the shallow scallops a gouge leaves as it is
  // walked along a moulding. They run with the length of each member rather
  // than in the turbulence filter's uniform axis, which is what separates a
  // worked surface from a textured one.
  const gouge = (x0, y0, x1, y1, step, depth, opacity = 0.4) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    let dark = '';
    let lit = '';
    for (let d = step * 0.5; d < len; d += step * range(0.82, 1.18)) {
      const w = step * range(0.55, 0.85);
      const h = depth * range(0.7, 1.15);
      const ax = x0 + ux * d;
      const ay = y0 + uy * d;
      const bx = ax + ux * w;
      const by = ay + uy * w;
      const cx2 = ax + ux * (w / 2) + nx * h;
      const cy2 = ay + uy * (w / 2) + ny * h;
      dark += `M ${fmt(ax)} ${fmt(ay)} Q ${fmt(cx2)} ${fmt(cy2)} ${fmt(bx)} ${fmt(by)} `;
      lit += `M ${fmt(ax - nx * 0.7)} ${fmt(ay - ny * 0.7)} Q ${fmt(cx2 - nx * 0.7)} ${fmt(cy2 - ny * 0.7)} ${fmt(bx - nx * 0.7)} ${fmt(by - ny * 0.7)} `;
    }
    return `<path d="${dark}" stroke="#2a180b" stroke-width="0.6" fill="none" opacity="${opacity}"/>
            <path d="${lit}" stroke="#a97f4e" stroke-width="0.4" fill="none" opacity="${fmt(opacity * 0.7)}"/>`;
  };

  const toolMarks = `
    ${gouge(74, 179, 386, 179, 11, 2.4, 0.38)}
    ${gouge(74, 472, 386, 472, 12, 2.6, 0.3)}
    ${gouge(80, 188, 380, 188, 9, -1.8, 0.26)}
    ${gouge(101, 480, 359, 480, 10, 2.2, 0.3)}`;

  // ------------------------------------------------------------------
  // Patina. Every layer here starts at zero and is dialled in by
  // applyPatina() from the clock's own age and the parts that have actually
  // been touched. On the day it is installed, and whenever the setting is
  // off, none of it shows at all: this is meant to be something you notice
  // one evening months from now, not an effect.
  // ------------------------------------------------------------------
  const patinaWood = `
    <g id="patinaWood" opacity="0" pointer-events="none">
      <!-- oil, hands and window light have brought the red up in the wood -->
      <rect x="100" y="184" width="260" height="274" fill="#7d4a1c" opacity="0.55"/>
      <rect x="76" y="168" width="28" height="310" rx="6" fill="#7d4a1c" opacity="0.42"/>
      <rect x="356" y="168" width="28" height="310" rx="6" fill="#7d4a1c" opacity="0.42"/>
      <rect x="68" y="168" width="324" height="22" rx="7" fill="#8a5a26" opacity="0.5"/>
      <rect x="68" y="452" width="324" height="26" rx="7" fill="#8a5a26" opacity="0.5"/>
      <!-- and the dust that never does come back out of a moulding has
           settled into every recess under an overhang -->
      <rect x="100" y="184" width="260" height="15" fill="#1c1006" opacity="0.5"/>
      <rect x="100" y="444" width="260" height="14" fill="#1c1006" opacity="0.34"/>
      <rect x="100" y="184" width="9" height="274" fill="#1c1006" opacity="0.3"/>
      <rect x="351" y="184" width="9" height="274" fill="#1c1006" opacity="0.3"/>
    </g>
    <g id="patinaSession" opacity="0" pointer-events="none">
      <rect x="68" y="168" width="324" height="320" fill="url(#gSessionWarm)"/>
    </g>`;

  // A tarnish film over the brass that nobody has cause to touch. It is the
  // counterpart to the polished layers: age puts this on everything, and
  // handling takes it back off the few parts that get handled.
  const patinaBrass = `
    <g id="patinaBrass" opacity="0" pointer-events="none" fill="${C.tarnish}">
      <rect x="280" y="232" width="10" height="16" opacity="0.5"/>
      <circle cx="178" cy="240" r="7.6" opacity="0.42"/>
      <circle cx="80" cy="318" r="6" opacity="0.45"/>
      <circle cx="380" cy="318" r="6" opacity="0.45"/>
      <circle cx="230" cy="438" r="6" opacity="0.4"/>
      <circle cx="230" cy="380" r="5.2" opacity="0.34"/>
      ${L.chains.map((c) => `<circle cx="${c.x}" cy="479" r="4.6" fill="none"
        stroke="${C.tarnish}" stroke-width="2.4" opacity="0.45"/>`).join('')}
    </g>`;

  const caseBody = `
    <g class="ck-case">
      <!-- side posts with vertical grain -->
      <rect x="76" y="168" width="28" height="310" rx="6" fill="url(#gWoodPost)"/>
      <rect x="76" y="168" width="28" height="310" rx="6" filter="url(#fGrainV)" opacity="0.8"/>
      <rect x="356" y="168" width="28" height="310" rx="6" fill="url(#gWoodPostR)"/>
      <rect x="356" y="168" width="28" height="310" rx="6" filter="url(#fGrainV)" opacity="0.8"/>
      ${goldFillet(77.4, 172, 1.8, 302, 0.7)}
      ${goldFillet(380.8, 172, 1.8, 302, 0.7)}
      <!-- fluting on the posts: vertical grooves, dark cut with a lit edge -->
      <path d="M 84 178 L 84 470 M 90 178 L 90 470 M 96 178 L 96 470"
            stroke="#2e1c0e" stroke-width="1" fill="none" opacity="0.45"/>
      <path d="M 85.1 178 L 85.1 470 M 91.1 178 L 91.1 470 M 97.1 178 L 97.1 470"
            stroke="#a97f4e" stroke-width="0.5" fill="none" opacity="0.4"/>
      <path d="M 364 178 L 364 470 M 370 178 L 370 470 M 376 178 L 376 470"
            stroke="#2e1c0e" stroke-width="1" fill="none" opacity="0.45"/>
      <path d="M 365.1 178 L 365.1 470 M 371.1 178 L 371.1 470 M 377.1 178 L 377.1 470"
            stroke="#a97f4e" stroke-width="0.5" fill="none" opacity="0.4"/>
      <!-- front panel, plank grain running vertically -->
      <rect x="100" y="184" width="260" height="274" fill="url(#gWoodV)"/>
      <rect x="100" y="184" width="260" height="274" filter="url(#fGrainV)" opacity="0.62"/>
      <!-- The panel is fielded, not flat: the ground is worked back from a
           raised border, so a bevel runs all the way round it. The two
           bevels the light reaches are lit, the two facing away from it are
           in shadow, and that alone gives the front of the case a thickness
           it never had as a plain board. -->
      <path d="M 100 184 L 360 184 L 344 200 L 116 200 Z" fill="#c08a4d" opacity="0.3"/>
      <path d="M 100 184 L 116 200 L 116 442 L 100 458 Z" fill="#c08a4d" opacity="0.22"/>
      <path d="M 360 184 L 360 458 L 344 442 L 344 200 Z" fill="#1c0d05" opacity="0.42"/>
      <path d="M 100 458 L 116 442 L 344 442 L 360 458 Z" fill="#1c0d05" opacity="0.5"/>
      <path d="M 116 200 L 344 200 L 344 442 L 116 442 Z" fill="url(#gWoodV)" opacity="0.5"/>
      <path d="M 116 200 L 344 200 L 344 442 L 116 442 Z" fill="none" stroke="#1c0d05"
            stroke-width="0.8" opacity="0.5"/>
      <!-- gilt stringing let into the field, with a cast rosette dropped
           into each corner where the two runs meet -->
      ${goldString('M 126 210 L 334 210 L 334 432 L 126 432 Z', 0.85, 0.85)}
      ${goldString('M 131 215 L 329 215 L 329 427 L 131 427 Z', 0.45, 0.5)}
      ${[[126, 210], [334, 210], [126, 432], [334, 432]]
    .map(([rx, ry]) => goldRosette(rx, ry, 4.6)).join('')}
      <!-- three plank seams, and no plank was ever jointed dead straight:
           each wanders by a fraction of a millimetre down its length and
           carries a lit arris where the two boards do not sit quite flush -->
      ${[165, 230, 295].map((sx) => {
    const pts = [184, 252, 320, 390, 458].map((y, i) => (
      i === 0 || i === 4 ? `${sx} ${y}` : `${fmt(sx + range(-0.9, 0.9))} ${y}`
    ));
    const d = `M ${pts[0]} L ${pts[1]} L ${pts[2]} L ${pts[3]} L ${pts[4]}`;
    return `<path d="${d}" stroke="#2e1c0e" stroke-width="1" fill="none" opacity="0.38"/>
            <path d="${d}" stroke="#a97f4e" stroke-width="0.45" fill="none" opacity="0.3"
                  transform="translate(-0.8 0)"/>`;
  }).join('')}
      <!-- cornice under the roof and the base moulding -->
      <rect x="68" y="168" width="324" height="22" rx="7" fill="url(#gWoodV)"
            stroke="#241608" stroke-width="1" filter="url(#fCarved)"/>
      <!-- A drawn gilt fillet run into the joint at the head and the foot of
           the carcase. On a real case this is a strip of metal let into the
           moulding so that the eye is given a hard bright line exactly where
           two members meet, and it is the single cheapest way to make
           joinery look expensive. -->
      ${goldFillet(70, 169.2, 320, 2.6, 1.2)}
      ${goldFillet(70, 186.4, 320, 2.2, 1)}
      ${dentils}
      <rect x="68" y="452" width="324" height="26" rx="7" fill="url(#gWoodV)"
            stroke="#241608" stroke-width="1" filter="url(#fCarved)"/>
      ${goldFillet(70, 453.4, 320, 2.6, 1.2)}
      ${goldFillet(70, 473.6, 320, 2.4, 1)}
      ${baseBeads}
      <rect x="78" y="444" width="304" height="12" rx="5" fill="#33200f"/>
      ${goldFillet(80, 445.4, 300, 1.8, 0.8)}
      <!-- serpentine apron below the base: a carved valance with scroll
           incisions and a small leaf drop at each dip, the chains and the
           pendulum rod emerging from behind it -->
      <!-- The valance is narrower than the moulding above it, so the flat
           top corners are widened out to the moulding's own edges first:
           otherwise the case has two unpainted notches under its own
           cornice, the case reads as hollow there instead of solid wood. -->
      <path d="M 68 474 L 392 474 L 392 484 L 364 484 L 364 486
               C 344 490 332 503 312 499 C 288 494 262 490 230 497
               C 198 490 172 494 148 499 C 128 503 116 490 96 486
               L 96 484 L 68 484 Z"
            fill="url(#gWoodV)" stroke="#241608" stroke-width="1" filter="url(#fCarved)"/>
      <path d="M 128 482 C 158 491 196 485 224 489 M 332 482 C 302 491 264 485 236 489"
            stroke="#2e1c0e" stroke-width="1" fill="none" opacity="0.55"/>
      <path d="M 128 482 C 158 491 196 485 224 489 M 332 482 C 302 491 264 485 236 489"
            stroke="#c08a4d" stroke-width="0.5" fill="none" opacity="0.45"
            transform="translate(-0.7 -0.8)"/>
      ${goldString(`M 96 486.4 C 116 490.4 128 503.4 148 499.4 C 172 494.4 198 490.4 230 497.4
                    C 262 490.4 288 494.4 312 499.4 C 332 503.4 344 490.4 364 486.4`, 0.9, 0.85)}
      <g transform="translate(150 497) scale(0.45)" color="#54371f"><use href="#leafB"/></g>
      <g transform="translate(310 497) scale(0.45)" color="#54371f"><use href="#leafB"/></g>
      ${toolMarks}
      ${pegs}
      <!-- post edge wear: lighter tone where hands have polished the arris -->
      <path id="arrisL" d="M 79 172 L 79 474" stroke="#a97f4e" stroke-width="1.6" opacity="0.6"/>
      <path id="arrisR" d="M 359 172 L 359 474" stroke="#a97f4e" stroke-width="1.4" opacity="0.5"/>
      ${patinaWood}
    </g>
    ${buildGarland()}`;

  // ------------------------------------------------------------------
  // The bird behind the door: carved and painted, facing forward the way a
  // real cuckoo does, perched on a turned rod at the sill. The lower beak
  // drops on each note of the call.
  //
  // One armature carries all six species. The blocking, the perch, the
  // hinged beak and the motion wiring are shared; the palette, the plumage
  // detail and a handful of species-only accents are what change.
  //
  // The depth is hand built, not filtered. fCarved's turbulence bump map
  // carves the case beautifully, but it was tuned for slab sized surfaces
  // like the panels and the moulding, and at the sixty units this bird spans
  // the same turbulence reads as dirt rather than as form. The bird is also
  // the only carved thing on the clock that moves, and a filter on it would
  // be re-run every frame of every strike. So each mass is built the way the
  // pendulum bob and the pine cones are built instead: the local colour and
  // its detail first, then the rim restated just inside the silhouette
  // twice, lifted toward the light and dropped away from it so the edge
  // reads as a rounded carved lip, then one directional wash over the whole
  // form. The light is upper left here as it is everywhere else on the case.
  // ------------------------------------------------------------------

  /**
   * What every bird shares. A skin below only states where it differs, so
   * the diff between two species is readable as the difference between two
   * actual birds rather than as two walls of hex.
   *
   * Colour triples run light to dark and are fed to a radial gradient whose
   * hot spot is pushed up and to the left, which is the single trick that
   * makes a flat SVG shape read as a lit, rounded mass.
   */
  const BIRD_BASE = {
    cut: '#1d1007',       // the chisel line and the silhouette stroke
    lit: '#d3a165',       // rim light along the top of every carved edge
    shade: '#120a03',     // rim shadow along the bottom of it
    foot: '#6a4e2e',
    claw: '#241505',
    eye: { iris: '#140b04', ring: '#2a180a', glint: '#f2e5c4', r: 1.62 },
    fan: { len: 25, spread: 18, n: 5, w: 3, taper: 0.13 },
    // The gape line sits at y -9 because the frame loop hinges the mouth
    // there. Everything else about the beak is the species' own.
    beak: { w: 3.2, base: -12.1, tip: -5.7, lowW: 2.5, lowTip: -6.1 },
    build: { bodyW: 1, bodyH: 1, head: 1 },
    formO: { body: 1, wing: 1, head: 1, breast: 0.85 },
    plumeO: 0.72,
  };

  const BIRD_SKINS = {
    // The house bird, and the only one that is a piece of stained woodwork
    // first and a species second: warm walnut over a cream barred breast.
    cuckoo: {
      body: ['#c2884a', '#8a5426', '#452810'],
      wing: ['#a96a33', '#6a3f1c', '#33200c'],
      head: ['#cc9354', '#8f5a2a', '#4a2c12'],
      breast: ['#f2e2b8', '#d6bf90', '#94794c'],
      tail: ['#b47a3a', '#633916'],
      beakU: ['#efc463', '#b8862e'],
      beakL: ['#d8ab48', '#8f6a22'],
      plume: '#a5854e',
      quill: '#8a6134',
      throat: { c: '#b06a3a', o: 0.5 },
    },
    // Red right through, with the pointed crest doing most of the work: it
    // is the one thing that says cardinal from across a room.
    cardinal: {
      body: ['#ee5c39', '#c62a15', '#66110a'],
      wing: ['#cf3a1f', '#8e1a0d', '#440906'],
      head: ['#ff7452', '#d63018', '#701208'],
      breast: ['#ff8a66', '#e03a24', '#8a1a0d'],
      tail: ['#a02010', '#460a04'],
      beakU: ['#ff8c3a', '#bf4914'],
      beakL: ['#f07c2e', '#a83e10'],
      cut: '#2c0703',
      lit: '#ff9d78',
      shade: '#340602',
      foot: '#8a6a52',
      eye: { iris: '#180705', ring: '#340a04', glint: '#ffd9c4' },
      plume: '#96200f',
      quill: '#7a150a',
      crest: true,
      mask: '#150c0a',
      beak: { w: 3.7, base: -12.3, tip: -5.1, lowW: 3, lowTip: -5.5 },
      fan: { len: 27, spread: 15, n: 5, w: 3.1, taper: 0.1 },
    },
    // Glossy black is a trap: paint it flat and it is a hole in the door.
    // The sheen highlights are cool and blue, which is what actually reads
    // as gloss, and the epaulette is the only warm thing on the bird.
    redwing: {
      body: ['#585966', '#1b1c21', '#07070a'],
      wing: ['#494a55', '#141519', '#050507'],
      head: ['#60616e', '#1e1f25', '#08080b'],
      breast: ['#4d4e59', '#17181c', '#060608'],
      tail: ['#26272c', '#08080a'],
      beakU: ['#575862', '#151519'],
      beakL: ['#4a4b55', '#0f0f12'],
      cut: '#050506',
      lit: '#9aa4ba',
      shade: '#000000',
      foot: '#2a2b30',
      eye: { iris: '#0b0b0d', ring: '#26272c', glint: '#d4dbea' },
      plume: '#3d3e48',
      quill: '#41424d',
      fan: { len: 24, spread: 18, n: 5, w: 3, taper: 0.14 },
      epaulette: { red: '#cf2418', redHi: '#f2543c', buff: '#e8bf52', buffHi: '#f7dd92' },
      formO: { body: 1, wing: 1, head: 1, breast: 0.7 },
    },
    // The breast is the whole bird. Keep it brick and warm, never tan, and
    // let the head go properly dark so the orange has something to sit on.
    robin: {
      body: ['#ab9c87', '#776b5c', '#453e35'],
      wing: ['#9c8e77', '#685d50', '#3c362e'],
      head: ['#867b6d', '#4f473e', '#2a2621'],
      breast: ['#ffa451', '#d8632a', '#8a3411'],
      tail: ['#3f3a33', '#1a1815'],
      beakU: ['#f0cb5e', '#bf9329'],
      beakL: ['#dcb54a', '#9e7720'],
      cut: '#191612',
      lit: '#dcc7a4',
      shade: '#0d0b09',
      foot: '#5e5145',
      eye: { iris: '#0f0c0a', ring: '#241f1a', glint: '#f0e8d6' },
      plume: '#8a3612',
      quill: '#8f8474',
      eyeRing: '#ddd2bb',
      throatStreaks: '#f2ebdd',
      formO: { body: 0.85, wing: 0.9, head: 0.85, breast: 0.62 },
      fan: { len: 24, spread: 17, n: 5, w: 3, taper: 0.14 },
      build: { bodyW: 1.04, bodyH: 1.02, head: 1.01 },
    },
    // Small and dainty on purpose: the body comes in, the head stays big,
    // and the cap, bib and white cheek do the identifying.
    chickadee: {
      body: ['#b4aa99', '#79746a', '#3e3b36'],
      wing: ['#a89e8e', '#6c6860', '#37342e'],
      head: ['#b8ae9d', '#7d786d', '#413e38'],
      breast: ['#f8f2e4', '#e0d8c6', '#a09781'],
      tail: ['#6e6a62', '#312f2b'],
      beakU: ['#6e665a', '#232019'],
      beakL: ['#5e574d', '#191612'],
      cut: '#2a2723',
      lit: '#efe6d2',
      shade: '#141210',
      foot: '#4a453e',
      eye: { iris: '#0c0b0a', ring: '#1e1c19', glint: '#ffffff', r: 1.52 },
      plume: '#b9b0a0',
      quill: '#8d887e',
      cap: '#181715',
      bib: '#181715',
      flank: '#cfa878',
      formO: { body: 0.9, wing: 0.95, head: 0.5, breast: 0.6 },
      beak: { w: 2.6, base: -11.7, tip: -6.4, lowW: 2.1, lowTip: -6.7 },
      fan: { len: 22, spread: 19, n: 5, w: 2.7, taper: 0.15 },
      build: { bodyW: 0.9, bodyH: 0.94, head: 1.06 },
    },
    // Quiet next to the rest, and it has to stay quiet: the moment the fawn
    // goes saturated it stops being a dove. Long pointed tail, small head.
    dove: {
      body: ['#e3c9a7', '#a68d6e', '#5d4c38'],
      wing: ['#d6bc9c', '#96805f', '#4d4030'],
      head: ['#e5cdac', '#ab9174', '#5e4b36'],
      breast: ['#f0d0b4', '#c9a184', '#75593f'],
      tail: ['#9a8168', '#413528'],
      beakU: ['#4c433a', '#201b16'],
      beakL: ['#443c34', '#1a1612'],
      cut: '#33291f',
      lit: '#f0dcc2',
      shade: '#1e1810',
      foot: '#9b7d70',
      eye: { iris: '#100c09', ring: '#3a3128', glint: '#e8dccb', r: 1.56 },
      plume: '#a48d76',
      quill: '#a48d76',
      cheekSpot: '#33291f',
      beak: { w: 2.5, base: -11.9, tip: -6, lowW: 2, lowTip: -6.3 },
      fan: { len: 29, spread: 12, n: 5, w: 2.8, taper: 0.24 },
      build: { bodyW: 0.94, bodyH: 1.01, head: 0.9 },
      formO: { body: 0.85, wing: 0.9, head: 0.85, breast: 0.7 },
    },
  };

  /** A skin resolved against the shared base, one level deep. */
  function birdSkin(profile) {
    const name = BIRD_SKINS[profile] ? profile : 'cuckoo';
    const own = BIRD_SKINS[name];
    const out = { ...BIRD_BASE, ...own, name };
    for (const k of ['eye', 'fan', 'beak', 'build', 'formO']) {
      out[k] = { ...BIRD_BASE[k], ...(own[k] || {}) };
    }
    return out;
  }

  /**
   * The whole inside of the bird group for one species, ready to be dropped
   * into #bird. Everything the frame loop touches keeps its id: #birdTilt,
   * #beakLower and #beakMouth are part of the contract, not the paint job.
   */
  function buildBird(profile) {
    const s = birdSkin(profile);

    // Its own generator, reseeded from the species name, so a bird always
    // comes out of the door with exactly the same hand cut irregularities
    // however many times the paint job is swapped.
    let bs = 7919;
    for (const ch of s.name) bs = (bs * 33 + ch.charCodeAt(0)) >>> 0;
    const brnd = () => { bs = (bs * 1664525 + 1013904223) >>> 0; return bs / 4294967296; };
    const jit = (a) => fmt((brnd() * 2 - 1) * a);

    // --- the two primitives everything below is made of ------------------

    // One carved mass. The path is drawn around its own local origin, which
    // is what lets the rim be restated by simply scaling it in a little.
    const carved = (d, o) => {
      const g = o.gap ?? 1.05;
      const k = o.inset ?? 0.9;
      return `<path d="${d}" fill="${o.fill}" stroke="${o.cut ?? s.cut}" stroke-width="${o.cutW ?? 0.8}"/>
        <path d="${d}" transform="translate(${fmt(-g * 0.5)} ${fmt(-g)}) scale(${k})" fill="none"
              stroke="${o.lit ?? s.lit}" stroke-width="${o.litW ?? 0.75}" opacity="${o.litO ?? 0.55}"/>
        <path d="${d}" transform="translate(${fmt(g * 0.5)} ${fmt(g)}) scale(${k})" fill="none"
              stroke="${o.shade ?? s.shade}" stroke-width="${o.shadeW ?? 0.85}" opacity="${o.shadeO ?? 0.45}"/>
        ${o.form ? `<path d="${d}" fill="url(#${o.form})" opacity="${o.formO ?? 1}" pointer-events="none"/>` : ''}`;
    };

    // A soft contact shadow with no filter behind it: the same outline
    // restated three times at falling opacity and widening stroke, offset
    // away from the light. This is what makes a wing sit on a body instead
    // of next to it, and it is cheap enough to ride on something that moves.
    const contact = (d, dx, dy, o = 1) => [[4.4, 0.07], [2.8, 0.1], [1.5, 0.13]]
      .map(([w, a]) => `<path d="${d}" fill="none" stroke="#000000" stroke-width="${w}"
            opacity="${fmt(a * o)}" transform="translate(${fmt(dx)} ${fmt(dy)})"
            pointer-events="none"/>`).join('');

    // A cut line and the lit arris just above it: the pair used everywhere
    // on this clock where a chisel has been through wood.
    const incise = (d, cutO = 0.62, litO = 0.4, w = 0.75) => `
      <path d="${d}" stroke="${s.cut}" stroke-width="${w}" fill="none" opacity="${cutO}"/>
      <path d="${d}" stroke="${s.lit}" stroke-width="${fmt(w * 0.5)}" fill="none" opacity="${litO}"
            transform="translate(-0.45 -0.6)"/>`;

    // --- gradients, mixed fresh for this species -------------------------
    const orb = (id, c, cx, cy) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="0.95">
        <stop offset="0" stop-color="${c[0]}"/>
        <stop offset="0.64" stop-color="${c[1]}"/>
        <stop offset="1" stop-color="${c[2]}"/>
      </radialGradient>`;
    const soft = (id, c) => `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="${c}" stop-opacity="1"/>
        <stop offset="0.7" stop-color="${c}" stop-opacity="0.94"/>
        <stop offset="1" stop-color="${c}" stop-opacity="0"/>
      </radialGradient>`;

    const gradients = `<defs>
      ${orb('bdBody', s.body, 0.33, 0.22)}
      ${orb('bdBreast', s.breast, 0.36, 0.24)}
      ${orb('bdHead', s.head, 0.32, 0.2)}
      ${orb('bdWingN', s.wing, 0.28, 0.18)}
      ${orb('bdWingF', s.wing, 0.66, 0.22)}
      <linearGradient id="bdTail" x1="0.15" y1="0" x2="0.85" y2="0.9">
        <stop offset="0" stop-color="${s.tail[0]}"/>
        <stop offset="1" stop-color="${s.tail[1]}"/>
      </linearGradient>
      <linearGradient id="bdBeakU" x1="0.12" y1="0" x2="0.9" y2="0.85">
        <stop offset="0" stop-color="${s.beakU[0]}"/>
        <stop offset="1" stop-color="${s.beakU[1]}"/>
      </linearGradient>
      <linearGradient id="bdBeakL" x1="0.12" y1="0" x2="0.9" y2="0.85">
        <stop offset="0" stop-color="${s.beakL[0]}"/>
        <stop offset="1" stop-color="${s.beakL[1]}"/>
      </linearGradient>
      <radialGradient id="bdMouth" cx="0.5" cy="0.1" r="0.9">
        <stop offset="0" stop-color="#4a1a0c"/>
        <stop offset="1" stop-color="#150602"/>
      </radialGradient>
      ${s.mask ? soft('bdMask', s.mask) : ''}
      ${s.cap ? soft('bdCap', s.cap) : ''}
      ${s.flank ? `<linearGradient id="bdFlank" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${s.flank}" stop-opacity="0.75"/>
        <stop offset="1" stop-color="${s.flank}" stop-opacity="0"/>
      </linearGradient>` : ''}
      ${s.epaulette ? `<linearGradient id="bdEpR" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stop-color="${s.epaulette.redHi}"/>
        <stop offset="1" stop-color="${s.epaulette.red}"/>
      </linearGradient>
      <linearGradient id="bdEpB" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" stop-color="${s.epaulette.buffHi}"/>
        <stop offset="1" stop-color="${s.epaulette.buff}"/>
      </linearGradient>` : ''}
      ${s.crest ? `<linearGradient id="bdCrest" x1="0.1" y1="0.1" x2="0.9" y2="0.9">
        <stop offset="0" stop-color="${s.head[0]}"/>
        <stop offset="0.55" stop-color="${s.body[1]}"/>
        <stop offset="1" stop-color="${s.wing[2]}"/>
      </linearGradient>` : ''}
    </defs>`;

    // --- blocking --------------------------------------------------------
    // Every mass is drawn around its own origin and then hung where it goes.
    const BODY = `M 0 -19.4 C 8.6 -19.6 14.4 -12.6 15.4 -4.4
       C 16.4 4.2 13.4 14 6.4 18.6 C 2.4 21.2 -3.2 21.2 -7.2 18.4
       C -14 13.8 -16.6 3.8 -15.6 -4.8 C -14.6 -13 -8.4 -19.2 0 -19.4 Z`;
    const BREAST = `M 0 -12.6 C 6.4 -12.6 10.2 -6.6 10 0.6
       C 9.8 7.8 5.6 13.4 0 13.4 C -5.6 13.4 -9.8 7.8 -10 0.6
       C -10.2 -6.6 -6.4 -12.6 0 -12.6 Z`;
    const HEAD = `M 0 -9.6 C 4.8 -9.8 8.3 -6.3 8.8 -1.7
       C 9.2 3 6.3 7.3 1.6 8.1 C -0.9 8.5 -3.2 8.3 -4.9 7.3
       C -8 5.5 -9.2 1.7 -8.8 -2 C -8.4 -6.5 -4.9 -9.5 0 -9.6 Z`;
    // The folded wing: broad over the shoulder, then closing to a point that
    // drifts back in toward the tail the way a real folded wing does.
    const WING = `M -1.4 -12.4 C 1.9 -12.8 3.9 -9.2 4.7 -3.8
       C 5.5 1.6 4.6 7.6 1.6 12.6 C 0.4 14.6 -1.5 14.3 -2.1 12.1
       C -3.7 6.9 -4.7 1 -4.5 -4.2 C -4.3 -9 -3.4 -12 -1.4 -12.4 Z`;

    const bw = s.build.bodyW;
    const bh = s.build.bodyH;

    // --- tail ------------------------------------------------------------
    // Drawn root first from the outside in, so the centre feather finishes
    // on top of the fan the way the real thing overlaps.
    const tail = (() => {
      const f = s.fan;
      const idx = [...Array(f.n).keys()]
        .sort((a, b) => Math.abs(b - (f.n - 1) / 2) - Math.abs(a - (f.n - 1) / 2));
      return idx.map((i) => {
        const u = f.n === 1 ? 0 : (i / (f.n - 1)) * 2 - 1;
        const rot = fmt(u * f.spread + jit(1.4));
        const len = fmt(f.len * (1 - f.taper * Math.abs(u)) + jit(0.7));
        const w = f.w * (1 - 0.16 * Math.abs(u));
        const d = `M ${fmt(-w)} 1 C ${fmt(-w * 1.08)} ${fmt(len * 0.45)}
           ${fmt(-w * 0.86)} ${fmt(len * 0.86)} ${fmt(-w * 0.4)} ${len}
           L ${fmt(w * 0.4)} ${len} C ${fmt(w * 0.86)} ${fmt(len * 0.86)}
           ${fmt(w * 1.08)} ${fmt(len * 0.45)} ${fmt(w)} 1 Z`;
        // Barbs run out and back from the shaft, closer together toward the
        // tip, which is what stops a feather reading as a painted stick.
        let barbs = '';
        for (let t = 0.22; t < 0.94; t += 0.16) {
          const y = fmt(len * t);
          const bwid = fmt(w * (1 - t * 0.35));
          barbs += `M 0 ${y} L ${bwid} ${fmt(len * (t + 0.06))} M 0 ${y} L ${fmt(-bwid)} ${fmt(len * (t + 0.06))} `;
        }
        return `<g transform="rotate(${rot} 0 3)">
          <path d="${d}" fill="url(#bdTail)" stroke="${s.cut}" stroke-width="0.55"/>
          <path d="${barbs}" stroke="${s.quill}" stroke-width="0.4" fill="none" opacity="0.3"/>
          <path d="M 0 2 L 0 ${fmt(len - 1)}" stroke="${s.shade}" stroke-width="0.7" opacity="0.4"/>
          <path d="M -0.5 2 L -0.5 ${fmt(len - 2)}" stroke="${s.lit}" stroke-width="0.45" opacity="0.42"/>
          <!-- the lit edge down the vane the light actually reaches, which is
               the only thing that separates one dark feather from the next -->
          <path d="M ${fmt(-w * 0.98)} 3 C ${fmt(-w * 1.04)} ${fmt(len * 0.5)}
                   ${fmt(-w * 0.84)} ${fmt(len * 0.84)} ${fmt(-w * 0.42)} ${fmt(len - 1)}"
                fill="none" stroke="${s.lit}" stroke-width="0.5" opacity="0.45"/>
          <path d="${d}" fill="url(#gFormBody)" opacity="0.24" pointer-events="none"/>
        </g>`;
      }).join('');
    })();

    // --- one folded wing --------------------------------------------------
    // near = the left one as seen, which is the side the light is on.
    const wing = (dir, near) => {
      const g = near ? 'gFormWingN' : 'gFormWingF';
      // Coverts: two ragged rows of scallops over the shoulder, above where
      // the flight feathers start.
      let cov = '';
      for (let r = 0; r < 2; r += 1) {
        const y = -9.4 + r * 2.9;
        for (let i = 0; i < 2; i += 1) {
          const x = -3.4 + i * 3.1 + r * 0.5 + jit(0.3);
          cov += `M ${fmt(x)} ${fmt(y + jit(0.4))} q ${fmt(1.5 + jit(0.2))} ${fmt(1.4 + jit(0.3))} ${fmt(3 + jit(0.3))} ${jit(0.4)} `;
        }
      }
      // The flight feathers, five of them, each one its own carved blade
      // stepping down and in toward the tail. Broad and few beats thin and
      // many at this size: three hairlines read as scratches, five blades
      // with a dark cut between them read as a wing that was chiselled.
      let quills = '';
      for (let i = 0; i < 5; i += 1) {
        const x0 = 3.5 - i * 0.5 + jit(0.15);
        const y0 = -5 + i * 2.55;
        const len = 8.2 + i * 1.35;
        const wd = 3.5 - i * 0.32;
        const qd = `M ${fmt(x0)} ${fmt(y0)}
           C ${fmt(x0 + wd * 0.5)} ${fmt(y0 + len * 0.36)} ${fmt(x0 + wd * 0.26)} ${fmt(y0 + len * 0.8)} ${fmt(x0 - wd * 0.5)} ${fmt(y0 + len)}
           C ${fmt(x0 - wd * 1.12)} ${fmt(y0 + len * 0.74)} ${fmt(x0 - wd * 1.28)} ${fmt(y0 + len * 0.34)} ${fmt(x0 - wd)} ${fmt(y0)}
           C ${fmt(x0 - wd * 0.62)} ${fmt(y0 - 1.3)} ${fmt(x0 - wd * 0.2)} ${fmt(y0 - 1.3)} ${fmt(x0)} ${fmt(y0)} Z`;
        quills += `<path d="${qd}" fill="url(#bd${near ? 'WingN' : 'WingF'})" stroke="${s.cut}"
                     stroke-width="0.55"/>
          <path d="${qd}" fill="none" stroke="${s.lit}" stroke-width="0.45" opacity="${near ? 0.45 : 0.24}"
                transform="translate(-0.5 -0.6)"/>
          <path d="M ${fmt(x0 - wd * 0.5)} ${fmt(y0 + 0.4)} C ${fmt(x0 - wd * 0.42)} ${fmt(y0 + len * 0.45)}
                   ${fmt(x0 - wd * 0.46)} ${fmt(y0 + len * 0.78)} ${fmt(x0 - wd * 0.5)} ${fmt(y0 + len - 0.8)}"
                fill="none" stroke="${s.quill}" stroke-width="0.35" opacity="0.3"/>
          <path d="${qd}" fill="url(#${g})" opacity="${fmt(0.42 + i * 0.05)}" pointer-events="none"/>`;
      }
      const prim = quills;
      return `<g transform="translate(${fmt(dir * 10 * bw)} ${fmt(0.4 * bh)}) scale(${dir} 1)">
        ${contact(WING, 1.5, 1.9, near ? 0.9 : 1.15)}
        ${carved(WING, {
    fill: `url(#bd${near ? 'WingN' : 'WingF'})`,
    form: g,
    formO: s.formO.wing,
    litO: near ? 0.62 : 0.32,
    shadeO: near ? 0.4 : 0.55,
  })}
        ${prim}
        ${incise(cov, 0.55, near ? 0.42 : 0.24, 0.65)}
        <!-- the shoulder arris, where the folded wing turns over its own bend -->
        ${incise(`M -3.2 -9.6 C -1 -11.4 1.8 -10.6 3.2 -7.4`, 0.5, near ? 0.5 : 0.28, 0.7)}
        ${s.epaulette ? `
        <!-- the epaulette at the bend of the wing: a red shield with a buff
             band under it, the one mark that has to read at any size -->
        <path d="M -3 -7.4 C -0.6 -8.8 2 -8.2 3.2 -5.8 C 3.6 -3.6 2.6 -2 0.4 -1.4
                 C -1.8 -1 -3.4 -2.2 -3.7 -4.4 Z"
              fill="url(#bdEpR)" stroke="#4a0a05" stroke-width="0.45"/>
        <path d="M -3 -7.4 C -0.6 -8.8 2 -8.2 3.2 -5.8" fill="none"
              stroke="#ff8a72" stroke-width="0.5" opacity="0.55" transform="translate(-0.3 -0.4)"/>
        <path d="M -3.6 -2.2 C -1.4 -0.6 1.2 -0.8 2.8 -2.4 C 3 -0.8 2 0.6 0 1.1
                 C -1.9 1.5 -3.3 0.6 -3.7 -1 Z"
              fill="url(#bdEpB)" stroke="#6d4c10" stroke-width="0.42"/>
        ${contact('M -3.6 -2.2 C -1.4 -0.6 1.2 -0.8 2.8 -2.4', 0.5, 0.7, 0.8)}` : ''}
      </g>`;
    };

    // --- leg and foot -----------------------------------------------------
    // Short and thick, and gripping: the tarsus barely clears the belly
    // feathers before the toes close over the rod. Long thin legs read as
    // scratches at this size, not as a bird holding on to something.
    const leg = (dir) => `<g transform="translate(${fmt(dir * 4.9)} 0) scale(${dir} 1)">
      <path d="M -1.7 15 C -2 18.4 -1.6 21 -1.1 23.2 L 1.3 23.2
               C 1.4 20.6 1.6 17.8 1.8 15 Z" fill="${s.foot}" stroke="${s.claw}" stroke-width="0.5"/>
      <path d="M -1.3 16 C -1.6 19 -1.3 21.4 -0.9 22.9" stroke="${s.lit}" stroke-width="0.5"
            fill="none" opacity="0.5"/>
      <path d="M -1.4 17.4 L 1.6 17.2 M -1.4 19.4 L 1.4 19.2 M -1.3 21.4 L 1.3 21.2"
            stroke="${s.claw}" stroke-width="0.35" opacity="0.45"/>
      <!-- three toes closed over the rod, each finishing in a horn claw -->
      <g stroke-linecap="round" fill="none">
        <path d="M -1.7 22.8 C -3.1 24.4 -3.7 26.2 -3.5 27.6 M 0.2 23.2 C 0.2 25 0.4 26.8 0.8 27.9
                 M 2 22.8 C 3.1 24.3 3.6 25.9 3.5 27.4"
              stroke="${s.foot}" stroke-width="1.8"/>
        <path d="M -2.1 22.9 C -3.4 24.4 -4 26 -3.8 27.3 M -0.2 23.3 C -0.2 25 0 26.6 0.4 27.6
                 M 1.6 22.9 C 2.7 24.3 3.2 25.7 3.1 27.1"
              stroke="${s.lit}" stroke-width="0.5" opacity="0.42"/>
        <path d="M -3.5 27.6 L -3.9 28.7 M 0.8 27.9 L 1 29 M 3.5 27.4 L 4 28.5"
              stroke="${s.claw}" stroke-width="0.8"/>
      </g>
    </g>`;

    // --- eye ---------------------------------------------------------------
    // A bead sunk into a socket. The socket is not a ring: a ring turns the
    // bird into an owl. It is an arc of shadow under the low side and an arc
    // of light over the high one, exactly the pair the bob's beaded rim uses,
    // and then the bead, a hot glint up toward the light, and a far weaker
    // bounce opposite it.
    const eye = (dir) => {
      const r = s.eye.r;
      const ex = dir * 5.9;
      const x = fmt(ex);
      const arc = (rr, sweep, from, to) => `M ${fmt(ex + rr * Math.cos(from))} ${fmt(-2.2 + rr * Math.sin(from))}
        A ${fmt(rr)} ${fmt(rr)} 0 0 ${sweep} ${fmt(ex + rr * Math.cos(to))} ${fmt(-2.2 + rr * Math.sin(to))}`;
      return `<g>
        <path d="${arc(r + 0.7, 1, -0.35, 2.5)}" fill="none" stroke="${s.shade}"
              stroke-width="0.9" opacity="0.5" stroke-linecap="round"/>
        <path d="${arc(r + 0.6, 0, 3.5, 6.1)}" fill="none" stroke="${s.lit}"
              stroke-width="0.65" opacity="0.55" stroke-linecap="round"/>
        ${s.eyeRing ? `<path d="${arc(r + 0.55, 0, 3.4, 5.6)} ${arc(r + 0.55, 0, 0.3, 2.3)}"
              fill="none" stroke="${s.eyeRing}" stroke-width="0.55" opacity="0.62"
              stroke-linecap="round"/>` : ''}
        <circle cx="${x}" cy="-2.2" r="${fmt(r)}" fill="${s.eye.ring}"/>
        <circle cx="${x}" cy="-2.2" r="${fmt(r * 0.76)}" fill="${s.eye.iris}"/>
        <circle cx="${fmt(ex - 0.52)}" cy="-2.85" r="${fmt(r * 0.3)}" fill="${s.eye.glint}"/>
        <circle cx="${fmt(ex + 0.62)}" cy="-1.3" r="${fmt(r * 0.18)}" fill="${s.eye.glint}"
                opacity="0.32"/>
      </g>`;
    };

    // --- beak --------------------------------------------------------------
    // The gape line is fixed at y -9: the frame loop hinges the mouth there
    // and drops #beakLower from it, so only the width and the reach change
    // per species. The culmen down the middle is lit on the near side and
    // shadowed on the far one, which is what keeps it from reading as a
    // flat triangle stuck on the face.
    const b = s.beak;
    const beak = `
      <!-- the shadow the beak's own root throws back onto the face -->
      ${contact(`M ${fmt(-b.w - 0.3)} ${fmt(b.base)} L ${fmt(b.w + 0.3)} ${fmt(b.base)} L 0 ${fmt(b.tip)} Z`, 0.7, 0.9, 0.9)}
      <path id="beakMouth" d="M ${fmt(-b.lowW - 0.2)} -9 L ${fmt(b.lowW + 0.2)} -9 L 0 ${fmt(b.lowTip + 1.1)} Z"
            fill="url(#bdMouth)" transform="translate(0 -9) scale(1 0.02) translate(0 9)"/>
      <g id="beakLower">
        <path d="M ${fmt(-b.lowW)} -9 L ${fmt(b.lowW)} -9 L 0 ${fmt(b.lowTip)} Z"
              fill="url(#bdBeakL)" stroke="${s.cut}" stroke-width="0.45"/>
        <path d="M ${fmt(-b.lowW + 0.5)} -8.7 L 0 ${fmt(b.lowTip - 0.4)}"
              stroke="${s.lit}" stroke-width="0.4" fill="none" opacity="0.45"/>
      </g>
      <path d="M ${fmt(-b.w)} ${fmt(b.base)} C ${fmt(-b.w * 0.5)} ${fmt(b.base - 0.5)}
               ${fmt(b.w * 0.5)} ${fmt(b.base - 0.5)} ${fmt(b.w)} ${fmt(b.base)}
               C ${fmt(b.w * 0.62)} ${fmt(b.tip * 0.62 + b.base * 0.38)} ${fmt(b.w * 0.3)} ${fmt(b.tip)} 0 ${fmt(b.tip)}
               C ${fmt(-b.w * 0.3)} ${fmt(b.tip)} ${fmt(-b.w * 0.62)} ${fmt(b.tip * 0.62 + b.base * 0.38)} ${fmt(-b.w)} ${fmt(b.base)} Z"
            fill="url(#bdBeakU)" stroke="${s.cut}" stroke-width="0.55"/>
      <path d="M 0 ${fmt(b.base + 0.2)} L 0 ${fmt(b.tip - 0.3)}" stroke="${s.shade}"
            stroke-width="0.6" opacity="0.35"/>
      <path d="M -0.55 ${fmt(b.base + 0.4)} L -0.5 ${fmt(b.tip - 0.6)}" stroke="${s.lit}"
            stroke-width="0.5" opacity="0.5"/>
      <path d="M ${fmt(-b.w + 0.4)} ${fmt(b.base + 0.5)} C ${fmt(-b.w * 0.6)} ${fmt(b.base + 0.4)} -0.6 ${fmt(b.base + 0.9)} -0.2 ${fmt(b.base + 1.4)}"
            stroke="${s.lit}" stroke-width="0.45" fill="none" opacity="0.4"/>
      <circle cx="${fmt(-b.w * 0.42)}" cy="${fmt(b.base + 1.5)}" r="0.35" fill="${s.cut}" opacity="0.7"/>
      <circle cx="${fmt(b.w * 0.42)}" cy="${fmt(b.base + 1.5)}" r="0.35" fill="${s.cut}" opacity="0.7"/>`;

    // --- breast plumage ----------------------------------------------------
    // Rows of scallops that narrow with the breast, every scallop taken at
    // its own width the way the crest coverts are.
    const scallops = (() => {
      let d = '';
      for (let r = 0; r < 5; r += 1) {
        const y = -8.6 + r * 4.5;
        const half = 8.8 * Math.sqrt(Math.max(0.06, 1 - ((y - 0.6) / 13.2) ** 2));
        const n = Math.max(2, Math.round(half / 2.3));
        for (let i = 0; i < n; i += 1) {
          const x = -half + ((i + 0.5) / n) * half * 2;
          const w = (half * 2) / n * 0.94;
          d += `M ${fmt(x - w / 2)} ${fmt(y + jit(0.45))} q ${fmt(w / 2)} ${fmt(w * 0.5)} ${fmt(w)} ${jit(0.3)} `;
        }
      }
      return `<path d="${d}" stroke="${s.plume}" stroke-width="0.55" fill="none" opacity="${s.plumeO}"/>
        <path d="${d}" stroke="${s.lit}" stroke-width="0.32" fill="none" opacity="0.3"
              transform="translate(-0.4 -0.55)"/>`;
    })();

    return `
      <g id="birdTilt">
        ${gradients}
        <!-- Tail first of everything: it hangs down the far side of the
             perch, so the rod crosses in front of it and the feet close
             round the front of the rod in turn. That stack is the whole
             reason the bird reads as sitting on the perch rather than
             floating at it. -->
        <g transform="translate(0 ${fmt(6 * bh)})">${tail}</g>

        <!-- perch rod the bird grips, turned brass with a lit crown -->
        <path d="M -21 26 L 21 26" stroke="url(#gGoldV)" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M -19 24.9 L 19 24.9" stroke="#f2d78f" stroke-width="0.7" opacity="0.5"/>
        <path d="M -19 27.4 L 19 27.4" stroke="#2a1c06" stroke-width="0.8" opacity="0.45"/>
        <circle cx="-22.4" cy="26" r="2.6" fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.6"/>
        <circle cx="22.4" cy="26" r="2.6" fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.6"/>

        <!-- legs, in front of the rod and under the belly feathers -->
        ${leg(-1)}${leg(1)}

        <!-- the body: one round mass, lit up the left flank -->
        <g transform="translate(0 ${fmt(-2 * bh)}) scale(${fmt(bw)} ${fmt(bh)})">
          ${carved(BODY, {
    fill: 'url(#bdBody)',
    form: 'gFormBody',
    formO: s.formO.body,
    cutW: 0.95,
    gap: 1.2,
    inset: 0.92,
  })}
          <!-- mantle: two carved rows over the shoulders, which is where a
               folded bird's back actually catches the light -->
          ${incise(`M -9.6 -14.6 C -5 -17 5 -17 9.6 -14.6 M -12 -9.8 C -6 -12.4 6 -12.4 12 -9.8`, 0.5, 0.42, 0.8)}
        </g>

        <!-- the breast, a second mass standing proud of the body -->
        <g transform="translate(0 ${fmt(3 * bh)}) scale(${fmt(bw)} ${fmt(bh)})">
          ${contact(BREAST, -0.4, -1.4, 0.5)}
          ${carved(BREAST, {
    fill: 'url(#bdBreast)',
    form: 'gFormOrb',
    formO: s.formO.breast,
    cutW: 0.5,
    litO: 0.4,
    shadeO: 0.3,
  })}
          ${scallops}
          ${s.flank ? `<path d="${BREAST}" fill="url(#bdFlank)" opacity="0.55"
                transform="translate(-9.4 0) scale(0.92)" pointer-events="none"/>
          <path d="${BREAST}" fill="url(#bdFlank)" opacity="0.4"
                transform="translate(9.4 0) scale(-0.92 0.92)" pointer-events="none"/>` : ''}
          ${s.throat ? `<path d="M 0 -12.4 C 4.6 -12.4 6.6 -9.6 6.2 -6.4
                   C 3.6 -4.8 -3.6 -4.8 -6.2 -6.4 C -6.6 -9.6 -4.6 -12.4 0 -12.4 Z"
                fill="${s.throat.c}" opacity="${s.throat.o}"/>` : ''}
        </g>

        <!-- the folded wings, each its own carved mass sitting on the body -->
        ${wing(-1, true)}${wing(1, false)}

        <!-- the shadow the head throws down onto the breast, which is what
             tells the eye the head stands in front of the body -->
        <ellipse cx="1.2" cy="-8.4" rx="8.4" ry="4" fill="url(#gShadow)" opacity="0.8"
                 pointer-events="none"/>

        <!-- the head, a small sphere with its own light -->
        <g transform="translate(0 -17.4) scale(${fmt(s.build.head)})">
          ${s.crest ? `
          <!-- The crest, raised and swept back to a point. The cardinal's
               whole silhouette lives here, so it is carved as its own mass:
               a lit leading edge up the front, the cut lines of the crest
               feathers behind it, and the far side dropping into shadow. -->
          <path d="M -6.2 -4.2 C -6 -11 -3.4 -18.6 0.6 -23.6
                   C 1.6 -18.4 3.4 -13.8 6.2 -10 C 7.6 -7.6 8.2 -5.4 7.8 -3 Z"
                fill="url(#bdCrest)" stroke="${s.cut}" stroke-width="0.65"/>
          <path d="M -5.8 -4.6 C -5.6 -10.8 -3.2 -17.8 0.4 -22.6" fill="none"
                stroke="${s.lit}" stroke-width="0.7" opacity="0.72"/>
          <path d="M -2.6 -6.4 C -2 -12.2 -0.4 -16.8 1.6 -20.8
                   M 1.4 -6.4 C 2.4 -11 3.8 -14.4 5.6 -17.2
                   M 4.6 -5.4 C 5.6 -8.2 6.6 -10 7.4 -11.4"
                stroke="${s.shade}" stroke-width="0.55" fill="none" opacity="0.5"/>
          <path d="M -2.9 -7 C -2.3 -12.6 -0.7 -17.2 1.3 -21.2
                   M 1.1 -7 C 2.1 -11.4 3.5 -14.8 5.3 -17.6"
                stroke="${s.lit}" stroke-width="0.35" fill="none" opacity="0.35"/>` : ''}
          ${carved(HEAD, {
    fill: 'url(#bdHead)',
    cutW: 0.75,
    gap: 1,
    inset: 0.9,
    litO: 0.6,
  })}
          ${s.cap ? `
          <!-- black cap, over the crown and down through the eye -->
          <path d="M 0 -9.7 C 5 -9.9 8.5 -6.4 8.9 -1.2
                   C 6.6 0 3.6 0.6 0 0.6 C -3.6 0.6 -6.6 0 -8.9 -1.2
                   C -8.5 -6.4 -5 -9.9 0 -9.7 Z"
                fill="${s.cap}"/>
          <path d="M 0 -10.3 C 5.4 -10.5 9 -6.8 9.4 -1.4
                   C 6.9 0.4 3.7 1.1 0 1.1 C -3.7 1.1 -6.9 0.4 -9.4 -1.4
                   C -9 -6.8 -5.4 -10.5 0 -10.3 Z"
                fill="url(#bdCap)" opacity="0.5"/>
          <path d="M -7.4 -4.6 C -4.2 -6.8 4.2 -6.8 7.4 -4.6" fill="none" stroke="#57544e"
                stroke-width="0.5" opacity="0.55" transform="translate(-0.3 -0.5)"/>` : ''}
          ${s.mask ? `
          <!-- The mask: around the bill, over the chin and back just far
               enough to take in both eyes. It stops well short of the crown,
               or the bird stops being a cardinal and turns into a hood. -->
          <path d="M 0 -5.2 C 4.6 -5.2 7.2 -3.4 7.4 -0.8 C 7.6 2.4 4.8 5.8 0 7
                   C -4.8 5.8 -7.6 2.4 -7.4 -0.8 C -7.2 -3.4 -4.6 -5.2 0 -5.2 Z"
                fill="${s.mask}" opacity="0.9"/>
          <!-- the mask's own edge is feathers, not a cut line, so it is
               softened back into the red rather than outlined -->
          <path d="M 0 -6.2 C 5.2 -6.2 8.2 -4 8.4 -0.8 C 8.6 2.8 5.4 6.6 0 8
                   C -5.4 6.6 -8.6 2.8 -8.4 -0.8 C -8.2 -4 -5.2 -6.2 0 -6.2 Z"
                fill="url(#bdMask)" opacity="0.45"/>` : ''}
          ${s.cap ? `
          <!-- The white cheek: a broad patch on the side of the face under
               the cap, following the jaw round and stopping short of the
               chin so the bib has room. It is the brightest thing on the
               bird, so it is broken by a feather cut rather than left as a
               flat chip of white. -->
          <path d="M -8.9 -1 C -7 0.4 -5 1.1 -3.4 1.3 C -3.6 3.8 -4.8 5.8 -6.2 6.8
                   C -7.8 5.4 -8.7 3 -8.9 -1 Z" fill="#f7f3e8"/>
          <path d="M 8.9 -1 C 7 0.4 5 1.1 3.4 1.3 C 3.6 3.8 4.8 5.8 6.2 6.8
                   C 7.8 5.4 8.7 3 8.9 -1 Z" fill="#e4ded0"/>
          <path d="M -7.9 1.8 C -6.6 2.8 -5.2 3.3 -4 3.5 M 7.9 1.8 C 6.6 2.8 5.2 3.3 4 3.5"
                fill="none" stroke="#b9b2a0" stroke-width="0.4" opacity="0.6"/>` : ''}
          ${s.cheekSpot ? `
          <!-- the dove's ear spot, a small dark crescent low on the cheek -->
          <path d="M -7.4 1.2 C -6.2 0.4 -5 0.7 -4.7 2 C -5.1 3.3 -6.5 3.5 -7.5 2.6 Z"
                fill="${s.cheekSpot}" opacity="0.9"/>
          <path d="M 7.4 1.2 C 6.2 0.4 5 0.7 4.7 2 C 5.1 3.3 6.5 3.5 7.5 2.6 Z"
                fill="${s.cheekSpot}" opacity="0.75"/>` : ''}
          <!-- The form wash goes on last, over the paint rather than under
               it: a black mask or a white cheek has to turn away from the
               light with the skull it is painted on, or it reads as a hole
               cut in the head instead of feathers lying on it. -->
          <path d="${HEAD}" fill="url(#gFormOrb)" opacity="${s.formO.head}" pointer-events="none"/>
          <!-- crown and cheek feather cuts, so the sphere is carved and not blown -->
          ${incise(`M -5.4 -7.6 C -2.6 -8.8 2.6 -8.8 5.4 -7.6
                    M -7.8 -4.6 C -4 -6 4 -6 7.8 -4.6`, 0.35, 0.34, 0.6)}
          ${incise(`M -9.4 0.4 C -8 2.4 -6.2 3.6 -4.4 4 M 9.4 0.4 C 8 2.4 6.2 3.6 4.4 4`,
    0.3, 0.3, 0.55)}
          ${eye(-1)}${eye(1)}
        </g>

        ${s.bib ? `
        <!-- the bib: under the chin only, clear of the beak, closing to a
             soft point where it runs onto the breast -->
        <path d="M -4.4 -9.6 C -2 -10.4 2 -10.4 4.4 -9.6 C 4.7 -6.4 3.4 -2.8 0 -0.2
                 C -3.4 -2.8 -4.7 -6.4 -4.4 -9.6 Z"
              fill="${s.bib}"/>
        <path d="M -3.4 -6.4 C -1.6 -5.2 1.6 -5.2 3.4 -6.4" fill="none" stroke="#57544e"
              stroke-width="0.45" opacity="0.55" transform="translate(-0.3 -0.5)"/>` : ''}
        ${s.throatStreaks ? `
        <!-- white streaks under the chin, the robin's quiet tell -->
        <path d="M -3.9 -6.6 L -4.2 -4.6 M -2 -6.9 L -2.1 -4.6 M 2 -6.9 L 2.1 -4.6
                 M 3.9 -6.6 L 4.2 -4.6"
              stroke="${s.throatStreaks}" stroke-width="0.6" opacity="0.6" stroke-linecap="round"/>` : ''}
        ${beak}
      </g>`;
  }

  const bird = `
    <g id="bird" transform="translate(230 252)" opacity="0">
      ${buildBird('cuckoo')}
    </g>`;

  // Door, surround, dark interior, bird, latch. The door hinges on the left
  // and swings outward toward the viewer.
  const doorAssembly = `
    <!-- carved surround -->
    <path d="M 180 300 L 180 250 A 50 50 0 0 1 280 250 L 280 300 Z
             M 192 288 L 192 250 A 38 38 0 0 1 268 250 L 268 288 Z"
          fill-rule="evenodd" fill="url(#gWoodV)" stroke="#241608" stroke-width="1"
          filter="url(#fCarved)"/>
    <!-- The escutcheon: a gilt architrave round the bird's doorway, beaded
         on the outside and strung on the inside, with a cast rosette at each
         springing point where the arch takes off from the jamb. The bird is
         the piece everyone watches for, so its opening is the one part of
         the case allowed to be openly ornamental. -->
    ${goldString('M 183.4 300 L 183.4 250 A 46.6 46.6 0 0 1 276.6 250 L 276.6 300', 1.5, 0.95)}
    ${goldString('M 188.6 300 L 188.6 250 A 41.4 41.4 0 0 1 271.4 250 L 271.4 300', 0.7, 0.6)}
    ${(() => {
    // beads run round the outer arris of the architrave, spaced by arc
    // length so the run does not bunch up where the arch turns over
    let out = '';
    for (let i = 0; i <= 26; i += 1) {
      const a = 180 + (i / 26) * 180;
      const [bx, by] = polar(230, 250, 49.6, a);
      out += `<circle cx="${bx}" cy="${by}" r="1.5" fill="url(#gGoldBoss)"/>
        <circle cx="${fmt(Number(bx) - 0.45)}" cy="${fmt(Number(by) - 0.5)}" r="0.5"
                fill="#fff3cd" opacity="0.6"/>`;
    }
    for (let y = 256; y <= 296; y += 6.6) {
      for (const bx of [180.4, 279.6]) {
        out += `<circle cx="${bx}" cy="${fmt(y)}" r="1.5" fill="url(#gGoldBoss)"/>
          <circle cx="${fmt(bx - 0.45)}" cy="${fmt(y - 0.5)}" r="0.5" fill="#fff3cd" opacity="0.6"/>`;
      }
    }
    return out;
  })()}
    ${goldRosette(183.4, 250, 5.4)}${goldRosette(276.6, 250, 5.4)}
    <!-- the dark interior of the case behind the door -->
    <path id="doorHole" d="M ${D.x} ${D.bottom} L ${D.x} ${D.archCy}
          A ${D.archR} ${D.archR} 0 0 1 ${D.x + D.w} ${D.archCy} L ${D.x + D.w} ${D.bottom} Z"
          fill="url(#gInterior)"/>
    <path d="M ${D.x} ${D.bottom} L ${D.x} ${D.archCy} A ${D.archR} ${D.archR} 0 0 1 ${D.x + D.w} ${D.archCy}
             L ${D.x + D.w} ${D.bottom} Z" fill="#000000" opacity="0.5" filter="url(#fBlur3)"/>
    ${bird}
    <!-- the door itself -->
    <g id="door">
      <path d="M ${D.x} ${D.bottom} L ${D.x} ${D.archCy}
               A ${D.archR} ${D.archR} 0 0 1 ${D.x + D.w} ${D.archCy} L ${D.x + D.w} ${D.bottom} Z"
            fill="url(#gWoodV)" stroke="#241608" stroke-width="1.1"/>
      <path d="M ${D.x + 7} ${D.bottom - 6} L ${D.x + 7} ${D.archCy}
               A ${D.archR - 7} ${D.archR - 7} 0 0 1 ${D.x + D.w - 7} ${D.archCy} L ${D.x + D.w - 7} ${D.bottom - 6} Z"
            fill="none" stroke="#2e1c0e" stroke-width="1.4" opacity="0.65"/>
      <path d="M ${D.x + 7} ${D.bottom - 6} L ${D.x + 7} ${D.archCy}
               A ${D.archR - 7} ${D.archR - 7} 0 0 1 ${D.x + D.w - 7} ${D.archCy} L ${D.x + D.w - 7} ${D.bottom - 6} Z"
            fill="none" stroke="#a97f4e" stroke-width="0.7" opacity="0.5"
            transform="translate(0.8 -0.8)"/>
      ${goldString(`M ${D.x + 11} ${D.bottom - 9} L ${D.x + 11} ${D.archCy}
               A ${D.archR - 11} ${D.archR - 11} 0 0 1 ${D.x + D.w - 11} ${D.archCy} L ${D.x + D.w - 11} ${D.bottom - 9}`, 0.75, 0.8)}
      <g transform="translate(230 250) scale(0.62)" color="#54371f"><use href="#leafA"/></g>
      <!-- carved fan motifs tucked into the lower corners of the panel -->
      <path d="M 201 280 L 201 272 M 201 280 L 207 274.5 M 201 280 L 209.5 280
               M 201 272 Q 210 273 209.5 280"
            stroke="#2e1c0e" stroke-width="0.9" fill="none" opacity="0.6"/>
      <path d="M 259 280 L 259 272 M 259 280 L 253 274.5 M 259 280 L 250.5 280
               M 259 272 Q 250 273 250.5 280"
            stroke="#2e1c0e" stroke-width="0.9" fill="none" opacity="0.6"/>
      <circle cx="${D.x + D.w - 12}" cy="267" r="3.4" fill="#1c0d05" opacity="0.4"/>
      <circle cx="${D.x + D.w - 12}" cy="266" r="3.2" fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.6"/>
      <circle cx="${D.x + D.w - 13}" cy="265" r="1" fill="#fff3cd" opacity="0.6"/>
      <!-- hinge knuckles on the left stile -->
      <rect x="${D.x - 4}" y="224" width="6" height="12" rx="2.5" fill="url(#gGoldV)" stroke="#3a2605" stroke-width="0.6"/>
      <rect x="${D.x - 4}" y="260" width="6" height="12" rx="2.5" fill="url(#gGoldV)" stroke="#3a2605" stroke-width="0.6"/>
      <rect id="doorShade" x="${D.x}" y="212" width="${D.w}" height="${D.bottom - 212}"
            fill="#000000" opacity="0"/>
    </g>
    <!-- The shadow the open door throws. The door hinges on the left and
         swings out toward the viewer, so with the light coming over the left
         shoulder the shadow falls onto the case front on the far side of the
         opening. It used to be cast across the doorway itself, which put a
         third of a stop of grey over the bird every time it came out and was
         quietly flattening the one thing everybody looks at. -->
    <rect id="doorShadow" x="${D.x + D.w - 2}" y="224" width="66" height="74" fill="#000000"
          opacity="0" filter="url(#fBlur7)"/>
    <!-- the catch on the right jamb -->
    <path d="M 280 232 L 290 232 L 290 248 L 280 248 Z" fill="url(#gGoldV)" stroke="#3a2605" stroke-width="0.8"/>
    <circle cx="285" cy="240" r="2" fill="#2e1c03"/>
    <!-- the latch: a pivoting brass bar that swings across the door -->
    <g id="latch" class="ck-click" data-act="latch">
      <g id="latchBar">
        <rect x="${L.latch.px - 4}" y="${L.latch.py - 6}" width="${L.latch.len}" height="12" rx="6"
              fill="url(#gGold)" stroke="#3a2605" stroke-width="0.9"/>
        <path d="M ${L.latch.px} ${L.latch.py - 3.4} L ${L.latch.px + L.latch.len - 8} ${L.latch.py - 3.4}"
              stroke="#fff3cd" stroke-width="1" opacity="0.55" stroke-linecap="round"/>
        <path d="M ${L.latch.px} ${L.latch.py + 3.6} L ${L.latch.px + L.latch.len - 8} ${L.latch.py + 3.6}"
              stroke="#241601" stroke-width="1.1" opacity="0.45" stroke-linecap="round"/>
        <circle cx="${L.latch.px + L.latch.len - 14}" cy="${L.latch.py}" r="8.6"
                fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.9"/>
        <circle cx="${L.latch.px + L.latch.len - 14}" cy="${L.latch.py}" r="3" fill="#3d2a0e" opacity="0.55"/>
        <g id="latchTarnish">
          <ellipse cx="${L.latch.px + 30}" cy="${L.latch.py - 2}" rx="9" ry="3.4" fill="${C.tarnish}" opacity="0.35"/>
          <ellipse cx="${L.latch.px + 66}" cy="${L.latch.py + 2}" rx="7" ry="2.8" fill="${C.tarnish}" opacity="0.3"/>
        </g>
        <rect x="${L.latch.px - 1}" y="${L.latch.py - 4.4}" width="${L.latch.len - 8}" height="2"
              rx="1" fill="#f8e6ae" opacity="0.65"/>
        <!-- Where a thumb actually lands: the knob end and the last third of
             the bar, rubbed back to bright metal. Only shown once this
             particular latch has been flipped enough times to earn it. -->
        <g id="patinaLatch" opacity="0" pointer-events="none">
          <ellipse cx="${L.latch.px + L.latch.len - 14}" cy="${L.latch.py}" rx="9.4" ry="9.4"
                   fill="url(#gWorn)"/>
          <circle cx="${L.latch.px + L.latch.len - 14}" cy="${L.latch.py}" r="6.6" fill="none"
                  stroke="#fbeec2" stroke-width="1.3" opacity="0.5"/>
          <rect x="${L.latch.px + 52}" y="${L.latch.py - 4.8}" width="34" height="3.2"
                rx="1.6" fill="#fbeec2" opacity="0.5"/>
          <ellipse cx="${L.latch.px + 62}" cy="${L.latch.py + 1}" rx="18" ry="4.6"
                   fill="url(#gWorn)" opacity="0.7"/>
        </g>
      </g>
      <circle cx="${L.latch.px}" cy="${L.latch.py}" r="7.6" fill="url(#gBrass)" stroke="#3d2a0e" stroke-width="1"/>
      <circle cx="${L.latch.px}" cy="${L.latch.py}" r="2.4" fill="#3d2a0e"/>
      <rect x="160" y="206" width="140" height="70" fill="#000000" fill-opacity="0" pointer-events="all"/>
    </g>`;

  // Pierced hands in the spade and moon style, drawn pointing to twelve.
  // Pierced and gilded hands. The old bone hands were painted; these are cut
  // from sheet, fire gilt, and burnished, so each one carries the specular
  // band down its length and drops its own shadow on the dial a hair below
  // and right of itself. The pierced rings stay pierced: the dial has to
  // show through them or the gilding reads as a solid brass paddle.
  const handShadow = (d) => `<path d="${d}" fill="#2a1608" opacity="0.28"
        transform="translate(1.5 2)" pointer-events="none"/>`;
  const HAND_HOUR = `M 0 12 L -3 7 L -3 -16 C -9 -20 -10 -29 0 -38 C 10 -29 9 -20 3 -16 L 3 7 Z
           M 0 -31.6 A 3.6 3.6 0 1 0 0.01 -31.6 Z`;
  const HAND_MIN = `M 0 14 L -2.4 7 L -2.4 -28 C -8 -32 -8 -43 0 -52 C 8 -43 8 -32 2.4 -28 L 2.4 7 Z
           M 0 -45.5 A 3.1 3.1 0 1 0 0.01 -45.5 Z
           M 0 -37 A 2.3 2.3 0 1 0 0.01 -37 Z`;
  const hands = `
    <g id="handHour" transform="translate(${dial.cx} ${dial.cy})">
      ${handShadow(HAND_HOUR)}
      <path fill-rule="evenodd" fill="url(#gGoldV)" stroke="#3d2a06" stroke-width="0.9"
        d="${HAND_HOUR}"/>
      <path d="M -1.4 6.8 L -1.4 -16.6 M -1.4 -16.6 C -6.4 -20.4 -7.2 -27.6 -0.8 -35.4"
            fill="none" stroke="#fff3cd" stroke-width="0.7" opacity="0.62"/>
      <path d="M 1.6 6.8 L 1.6 -16.2" fill="none" stroke="#2e1f04" stroke-width="0.6" opacity="0.5"/>
      <circle cx="0" cy="9" r="4.4" fill="url(#gGoldBoss)" stroke="#3d2a06" stroke-width="0.8"/>
    </g>
    <g id="handMin" transform="translate(${dial.cx} ${dial.cy})">
      ${handShadow(HAND_MIN)}
      <path class="ck-grab" data-act="minute" fill-rule="evenodd" fill="url(#gGoldV)"
        stroke="#3d2a06" stroke-width="0.9" d="${HAND_MIN}"/>
      <path d="M -1 6.8 L -1 -28.4 M -1 -28.4 C -5.6 -32.4 -5.8 -41.4 -0.8 -48.6"
            fill="none" stroke="#fff3cd" stroke-width="0.7" opacity="0.62"/>
      <path d="M 1.2 6.8 L 1.2 -28" fill="none" stroke="#2e1f04" stroke-width="0.6" opacity="0.5"/>
      <path data-act="minute" class="ck-grab" d="M 0 12 L 0 -50" stroke="#000000"
            stroke-opacity="0" stroke-width="16" fill="none" pointer-events="stroke"/>
      <circle cx="0" cy="10" r="3.8" fill="url(#gGoldBoss)" stroke="#3d2a06" stroke-width="0.8"/>
    </g>
    <g id="handSec" transform="translate(${dial.cx} ${dial.cy})" display="none">
      <path d="M -1 16 L -0.5 -46 L 0 -58 L 0.5 -46 L 1 16 Z" fill="#2f343b"
            transform="translate(1.2 1.6)" opacity="0.3"/>
      <path d="M -1 16 L -0.5 -46 L 0 -58 L 0.5 -46 L 1 16 Z" fill="#8f2f1c"/>
      <circle cx="0" cy="-38" r="2.6" fill="none" stroke="#8f2f1c" stroke-width="1.6"/>
      <circle cx="0" cy="12" r="3.4" fill="#8f2f1c"/>
    </g>
    <!-- the collet: a turned gilt boss over the arbor, with the burnished
         ring the hand nut has worn into it -->
    <circle cx="${dial.cx}" cy="${dial.cy}" r="6" fill="url(#gGoldBoss)" stroke="#3d2a06" stroke-width="0.9"/>
    <circle cx="${dial.cx}" cy="${dial.cy}" r="4.1" fill="none" stroke="#5e420e" stroke-width="0.7" opacity="0.7"/>
    <circle cx="${fmt(dial.cx - 0.5)}" cy="${fmt(dial.cy - 0.6)}" r="3.9" fill="none"
            stroke="#fff3cd" stroke-width="0.55" opacity="0.55"/>
    <circle cx="${dial.cx}" cy="${dial.cy}" r="1.7" fill="#2e1f04"/>`;

  // ------------------------------------------------------------------
  // The moon aperture. A phase indicator on the dial is genuine Black
  // Forest practice, so it is cut into the face like the real thing: a bore
  // through the dial plate, a night behind it, a brass bezel over it.
  // ------------------------------------------------------------------
  const MOON = { cx: 230, cy: 404, r: 10.6, disc: 8.6 };

  /**
   * Fraction of the synodic month elapsed, 0 at new moon, 0.5 at full.
   * The standard approximation, well under a day out, which is plenty for
   * something the size of a fingernail.
   */
  function moonPhase(date) {
    const synodicMonth = 29.53058867; // days
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14); // a real new moon
    const days = (date.getTime() - knownNewMoon) / 86400000;
    let phase = (days % synodicMonth) / synodicMonth;
    if (phase < 0) phase += 1;
    return phase;
  }

  /**
   * The unlit part of the disc, as one path. The terminator is the moon's
   * own circle seen edge on, so it is an ellipse whose half width is the
   * cosine of the phase angle: full width at new and full, flat at the
   * quarters. Waning is the mirror of waxing, so this always draws the
   * waxing case and the caller flips the group after half.
   */
  function moonShadowPath(phase, r) {
    const c = Math.cos(phase * Math.PI * 2);
    const rx = Math.abs(c) * r;
    // Sweep 0 carries the terminator to the right of the axis, sweep 1 to
    // the left: toward the lit limb while a crescent, away once gibbous.
    const sweep = c > 0 ? 0 : 1;
    return `M 0 ${fmt(-r)} A ${fmt(r)} ${fmt(r)} 0 0 0 0 ${fmt(r)}`
      + ` A ${fmt(rx)} ${fmt(r)} 0 0 ${sweep} 0 ${fmt(-r)} Z`;
  }

  const moonAperture = `
    <g id="moonRing" opacity="0" pointer-events="none">
      <!-- the bore through the dial plate: a dark wall, then the night -->
      <circle cx="${MOON.cx}" cy="${MOON.cy}" r="${fmt(MOON.r + 2.4)}" fill="#3a240f" opacity="0.4"/>
      <circle cx="${MOON.cx}" cy="${MOON.cy}" r="${fmt(MOON.r + 1.1)}" fill="#1d1207"/>
      <circle cx="${MOON.cx}" cy="${MOON.cy}" r="${MOON.r}" fill="url(#gNight)"/>
      <!-- stars, pricked through the backing plate by hand and so unevenly -->
      <circle cx="${fmt(MOON.cx - 6.3)}" cy="${fmt(MOON.cy - 5.8)}" r="0.55" fill="#efe3c4" opacity="0.7"/>
      <circle cx="${fmt(MOON.cx + 5.9)}" cy="${fmt(MOON.cy - 6.9)}" r="0.4" fill="#efe3c4" opacity="0.48"/>
      <circle cx="${fmt(MOON.cx + 7.3)}" cy="${fmt(MOON.cy + 3.7)}" r="0.48" fill="#efe3c4" opacity="0.58"/>
      <circle cx="${fmt(MOON.cx - 6.8)}" cy="${fmt(MOON.cy + 5.2)}" r="0.36" fill="#efe3c4" opacity="0.42"/>
      <g transform="translate(${MOON.cx} ${MOON.cy})">
        <circle r="${MOON.disc}" fill="url(#gMoon)"/>
        <!-- the seas, painted the same bone as the dial only greyer -->
        <g fill="#b7a682">
          <ellipse cx="-2.6" cy="-3.1" rx="2.5" ry="1.9" opacity="0.34"
                   transform="rotate(-24 -2.6 -3.1)"/>
          <ellipse cx="2.4" cy="-1.4" rx="1.7" ry="2.2" opacity="0.26"/>
          <ellipse cx="-1.1" cy="3.4" rx="3.1" ry="1.6" opacity="0.3"
                   transform="rotate(12 -1.1 3.4)"/>
          <ellipse cx="4.1" cy="4.2" rx="1.4" ry="1.1" opacity="0.22"/>
          <circle cx="-4.8" cy="2.2" r="0.75" opacity="0.28"/>
        </g>
        <!-- the shadowed part, left a shade short of opaque so the dark limb
             keeps the faint earthshine a real moon has -->
        <g id="moonShade">
          <path id="moonDark" d="" fill="url(#gNight)" opacity="0.92"/>
        </g>
        <circle r="${MOON.disc}" fill="none" stroke="#6f6248" stroke-width="0.45" opacity="0.55"/>
      </g>
      <!-- the bezel: a turned brass ring seated in the face, lit upper left -->
      ${goldRing(MOON.cx, MOON.cy, MOON.r + 1.1, 2.4)}
      <circle cx="${MOON.cx}" cy="${MOON.cy}" r="${fmt(MOON.r + 2.3)}" fill="none"
              stroke="#3d2a0e" stroke-width="0.6" opacity="0.75"/>
      ${goldBeads(MOON.cx, MOON.cy, MOON.r + 3.6, 0.95, 18)}
      <path d="M ${fmt(MOON.cx - 3.4)} ${fmt(MOON.cy + 11.4)}
               A ${fmt(MOON.r + 1.1)} ${fmt(MOON.r + 1.1)} 0 0 1 ${fmt(MOON.cx + 8.2)} ${fmt(MOON.cy + 7.8)}"
            stroke="#4a3312" stroke-width="0.8" fill="none" opacity="0.55"/>
    </g>`;

  // Foxing: the freckling that comes up through an old painted dial. Placed
  // off centre and unevenly, because damp never spreads evenly.
  const foxing = `
    <g id="patinaFoxing" opacity="0" pointer-events="none">
      ${[
    [206, 350, 5.4, 3.1, -22, 0.5], [258, 344, 3.6, 2.4, 14, 0.38],
    [270, 402, 6.2, 3.4, 38, 0.42], [200, 414, 4.1, 2.6, -8, 0.34],
    [238, 336, 2.6, 1.8, 4, 0.3], [188, 382, 3.2, 4.4, 62, 0.36],
    [284, 372, 2.4, 1.6, -40, 0.28], [214, 430, 3.8, 2.1, 18, 0.3],
  ].map(([x, y, rx, ry, rot, op]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"
        transform="rotate(${rot} ${x} ${y})" fill="#8a6a3a" opacity="${op}"/>`).join('')}
    </g>`;

  const dialAssembly = `
    <!-- occlusion shadow under the ring -->
    <circle cx="${dial.cx + 4}" cy="${dial.cy + 7}" r="${dial.ring}" fill="#000000"
            opacity="0.4" filter="url(#fBlur7)"/>
    <g filter="url(#fCarved)">
      <circle cx="${dial.cx}" cy="${dial.cy}" r="${dial.ring}" fill="url(#gRing)"
              stroke="#241608" stroke-width="1.2"/>
      ${buildRingCarving()}
      <!-- rope twist border where the ring meets the face: two interleaved
           dashed runs, dark strand over a lit one -->
      <circle cx="${dial.cx}" cy="${dial.cy}" r="${dial.face + 3}" fill="none"
              stroke="#a97f4e" stroke-width="1.1" stroke-dasharray="4.4 3.2"
              stroke-dashoffset="3.6" opacity="0.55"/>
      <circle cx="${dial.cx}" cy="${dial.cy}" r="${dial.face + 3}" fill="none"
              stroke="#2e1c0e" stroke-width="2.3" stroke-dasharray="4.4 3.2"/>
    </g>
    <!-- The gilt bezel: an outer astragal round the rim of the ring, and a
         seated fillet where the ring meets the dial plate. Both are turned
         mouldings, so each gets the treatment every turned edge on this
         case gets: the section restated lit above and shadowed below. -->
    ${goldRing(dial.cx, dial.cy, dial.ring - 2.6, 3.4)}
    ${goldRing(dial.cx, dial.cy, dial.face + 1.4, 2.6)}
    ${goldBeads(dial.cx, dial.cy, dial.ring - 7.4, 1.35, 60)}
    <circle cx="${dial.cx}" cy="${dial.cy}" r="${dial.face}" fill="url(#gFace)"/>
    <!-- the shadow the bezel throws inward across the dial plate -->
    <circle cx="${dial.cx}" cy="${dial.cy}" r="${fmt(dial.face - 1.4)}" fill="none"
            stroke="#5c3a16" stroke-width="3.2" opacity="0.2"/>
    <circle cx="${dial.cx}" cy="${dial.cy}" r="${fmt(dial.face - 0.4)}" fill="none"
            stroke="#3a2109" stroke-width="1.1" opacity="0.28"/>
    <circle id="dialAged" cx="${dial.cx}" cy="${dial.cy}" r="${dial.face}"
            filter="url(#fAged)" opacity="0.65"/>
    ${foxing}
    <g id="minuteTrack">${buildMinuteTrack()}</g>

    <g id="numerals12">${buildNumerals(12)}</g>
    <g id="numerals24" display="none">${buildNumerals(24)}</g>
    ${moonAperture}
    <circle id="hitDial" class="ck-case" data-act="dial" cx="${dial.cx}" cy="${dial.cy}"
            r="${dial.face - 6}" fill="#000000" fill-opacity="0"/>
    ${hands}`;

  // Night silence lever on the left side, mute lever on the right. Both are
  // thrown down when active, the way the wire levers on a real case work.
  const lever = (id, act, px, py, dir) => `
    <g id="${id}" class="ck-click" data-act="${act}">
      <g id="${id}Arm">
        <path d="M 0 0 C ${12 * dir} 3 ${26 * dir} 4 ${36 * dir} -2
                 C ${44 * dir} -7 ${42 * dir} -16 ${34 * dir} -14"
              fill="none" stroke="#7a5a16" stroke-width="3.6" stroke-linecap="round"/>
        <path d="M 0 0 C ${12 * dir} 3 ${26 * dir} 4 ${36 * dir} -2"
              fill="none" stroke="#ffedb4" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>
        <circle cx="${34 * dir}" cy="-14" r="4.6" fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.8"/>
        <circle cx="${34 * dir - 1.4}" cy="-15.4" r="1.4" fill="#fff3cd" opacity="0.6"/>
      </g>
      <circle cx="0" cy="0" r="6.4" fill="url(#gGoldBoss)" stroke="#3a2605" stroke-width="0.9"/>
      <circle cx="0" cy="0" r="2" fill="#2e1c03"/>
      <circle cx="-1.6" cy="-1.8" r="1.5" fill="#fff3cd" opacity="0.5"/>
      <rect x="${dir > 0 ? -6 : -54}" y="-30" width="60" height="60"
            fill="#000000" fill-opacity="0" pointer-events="all"/>
    </g>`;

  const levers = `
    <g transform="translate(${L.nightLever.px} ${L.nightLever.py})">
      ${lever('nightLever', 'night', 0, 0, -1)}
    </g>
    <g transform="translate(${L.muteLever.px} ${L.muteLever.py})">
      ${lever('muteLever', 'mute', 0, 0, 1)}
    </g>`;

  // Pendulum: brass rod, carved oak leaf bob, sliding regulating leaf.
  const pendulum = `
    <g id="pendulum">
      <path d="M ${L.pend.px} ${L.pend.py} L ${L.pend.px} ${L.pend.bobY}"
            stroke="url(#gRod)" stroke-width="6.4" stroke-linecap="round"/>
      <path d="M ${L.pend.px - 1.4} ${L.pend.py} L ${L.pend.px - 1.4} ${L.pend.bobY}"
            stroke="#f4dc96" stroke-width="1.1" opacity="0.6"/>
      <circle cx="${L.pend.px}" cy="${L.pend.py}" r="6" fill="url(#gBrass)" stroke="#3d2a0e" stroke-width="0.9"/>
      <!-- turned collars on the rod, a lathed spindle detail below the pivot -->
      <rect x="${L.pend.px - 4.8}" y="450" width="9.6" height="7" rx="3.2"
            fill="url(#gBrassV)" stroke="#3d2a0e" stroke-width="0.7"/>
      <rect x="${L.pend.px - 4.1}" y="461.5" width="8.2" height="5.4" rx="2.5"
            fill="url(#gBrassV)" stroke="#3d2a0e" stroke-width="0.6"/>
      <g id="regLeaf" class="ck-grab" data-act="leaf" transform="translate(${L.pend.px} 555)">
        <g transform="scale(0.55)" color="#7d5831"><use href="#leafB"/></g>
        <rect x="-16" y="-16" width="32" height="34" fill="#000000" fill-opacity="0" pointer-events="all"/>
      </g>
      <g id="bob" class="ck-click" data-act="bob"
         transform="translate(${L.pend.px} ${L.pend.bobY})">
        <g transform="scale(1.22)">
        <!-- A cast and chased gilt oak leaf: deep lobes, raised veins, and
             the burnish worn back to a hot line on the rim by however many
             thousand times a thumb has stopped this pendulum. -->
        <path d="M 0 -38 C 9 -37 13 -31 11 -25 C 19 -27 25 -21 21 -13
                 C 29 -13 31 -3 23 1 C 29 7 25 17 15 15 C 17 25 7 31 0 27
                 C -7 31 -17 25 -15 15 C -25 17 -29 7 -23 1 C -31 -3 -29 -13 -21 -13
                 C -25 -21 -19 -27 -11 -25 C -13 -31 -9 -37 0 -38 Z"
              fill="url(#gBob)" stroke="#3a2605" stroke-width="1.2"/>
        <!-- beaded rim: the outline restated just inside the edge, lit high,
             shadowed low, so the edge reads as a rounded carved bead -->
        <path d="M 0 -38 C 9 -37 13 -31 11 -25 C 19 -27 25 -21 21 -13
                 C 29 -13 31 -3 23 1 C 29 7 25 17 15 15 C 17 25 7 31 0 27
                 C -7 31 -17 25 -15 15 C -25 17 -29 7 -23 1 C -31 -3 -29 -13 -21 -13
                 C -25 -21 -19 -27 -11 -25 C -13 -31 -9 -37 0 -38 Z"
              transform="translate(0 -1.6) scale(0.9)"
              fill="none" stroke="#fff3cd" stroke-width="0.9" opacity="0.55"/>
        <path d="M 0 -38 C 9 -37 13 -31 11 -25 C 19 -27 25 -21 21 -13
                 C 29 -13 31 -3 23 1 C 29 7 25 17 15 15 C 17 25 7 31 0 27
                 C -7 31 -17 25 -15 15 C -25 17 -29 7 -23 1 C -31 -3 -29 -13 -21 -13
                 C -25 -21 -19 -27 -11 -25 C -13 -31 -9 -37 0 -38 Z"
              transform="translate(0 1.4) scale(0.9)"
              fill="none" stroke="#241601" stroke-width="1" opacity="0.5"/>
        <!-- chisel shadow inside each lobe, then the worn highlight on the rim -->
        <path d="M 0 -34 C 7 -33 10 -29 9 -25 M 15 -19 C 18 -16 18 -13 16 -11
                 M 20 -3 C 22 0 21 3 18 5 M 14 13 C 14 17 11 20 8 20
                 M -9 -25 C -10 -29 -7 -33 0 -34 M -16 -11 C -18 -13 -18 -16 -15 -19
                 M -18 5 C -21 3 -22 0 -20 -3 M -8 20 C -11 20 -14 17 -14 13"
              stroke="#3a2605" stroke-width="1.1" fill="none" opacity="0.65"/>
        <path d="M -11 -32 C -17 -28 -21 -21 -20 -13 M -24 -5 C -25 -1 -24 3 -21 6
                 M -16 12 C -15 16 -12 19 -8 20"
              stroke="#fff3cd" stroke-width="1.1" fill="none" opacity="0.6"/>
        <!-- scalloped gouge marks at the lobe sinuses, the chisel's signature -->
        <path d="M 11.5 -28.5 q 3.5 -1.5 5.5 1.5 M 24.5 -16 q 3.5 0.5 4 4
                 M 26.5 4.5 q 3 2 1.5 5.5 M 17 18.5 q 1.5 3.5 -1.5 5.5
                 M -11.5 -28.5 q -3.5 -1.5 -5.5 1.5 M -24.5 -16 q -3.5 0.5 -4 4
                 M -26.5 4.5 q -3 2 -1.5 5.5 M -17 18.5 q -1.5 3.5 1.5 5.5"
              stroke="#241206" stroke-width="0.9" fill="none" opacity="0.55"/>
        <!-- raised central and side veins, dark cut with a lit edge -->
        <path d="M 0 -36 L 0 27 M 0 -18 L 12 -24 M 0 -18 L -12 -24
                 M 0 -4 L 17 -8 M 0 -4 L -17 -8 M 0 10 L 11 14 M 0 10 L -11 14"
              stroke="#3a2605" stroke-width="1.5" fill="none"/>
        <path d="M 0 -36 L 0 27 M 0 -18 L 12 -24 M 0 -18 L -12 -24
                 M 0 -4 L 17 -8 M 0 -4 L -17 -8 M 0 10 L 11 14 M 0 10 L -11 14"
              stroke="#ffedb4" stroke-width="0.6" fill="none" opacity="0.75"
              transform="translate(-0.7 -0.7)"/>
        <!-- finer secondary veins between the mains -->
        <path d="M 0 -27 L 9 -32 M 0 -27 L -9 -32 M 0 3 L 14.5 0.5 M 0 3 L -14.5 0.5
                 M 0 18 L 8 23 M 0 18 L -8 23"
              stroke="#3a2605" stroke-width="0.85" fill="none" opacity="0.8"/>
        <path d="M 0 -27 L 9 -32 M 0 -27 L -9 -32 M 0 3 L 14.5 0.5 M 0 3 L -14.5 0.5
                 M 0 18 L 8 23 M 0 18 L -8 23"
              stroke="#ffedb4" stroke-width="0.4" fill="none" opacity="0.65"
              transform="translate(-0.5 -0.5)"/>
        <!-- long grain arcs following the leaf, drawn by hand because the
             pendulum animates and filters stay on static geometry only -->
        <path d="M -6 -30 C -10 -12 -10 8 -5 24 M 7 -28 C 11 -10 10 10 4 25"
              stroke="#2e1c0e" stroke-width="0.7" fill="none" opacity="0.35"/>
        <path d="M -3 -33 C -5 -14 -5 10 -2 26 M 10 -24 C 13 -8 12 8 7 21"
              stroke="#a9804d" stroke-width="0.5" fill="none" opacity="0.3"/>
        <!-- brass ferrule where the rod enters the leaf -->
        <path d="M -3.4 -44 L 3.4 -44 L 2.6 -32 L -2.6 -32 Z" fill="url(#gGoldV)" stroke="#3a2605" stroke-width="0.7"/>
        <!-- Stopping and starting a clock means catching the bob, and it is
             always caught in the same place: the finish goes off the high
             ground of the veins first, then the whole middle of the leaf. -->
        <g id="patinaBob" opacity="0" pointer-events="none">
          <ellipse cx="0" cy="-3" rx="17" ry="19" fill="url(#gWorn)" opacity="0.7"/>
          <path d="M 0 -36 L 0 27 M 0 -18 L 12 -24 M 0 -18 L -12 -24
                   M 0 -4 L 17 -8 M 0 -4 L -17 -8 M 0 10 L 11 14 M 0 10 L -11 14"
                stroke="#e8c88b" stroke-width="0.85" fill="none" opacity="0.5"
                transform="translate(-0.7 -0.7)"/>
          <path d="M -3.4 -44 L 3.4 -44 L 2.6 -32 L -2.6 -32 Z" fill="#f6dfa4" opacity="0.4"/>
        </g>
        <rect x="-38" y="-48" width="76" height="88" fill="#000000" fill-opacity="0" pointer-events="all"/>
        </g>
      </g>
    </g>`;

  // Weights: three chains and three fir cones at staggered heights. Each
  // chain is drawn as real interlocking brass links, solid all the way, and
  // a clip rect trims it to the cone as the weight travels.
  const chainLinks = (c) => {
    let links = '';
    for (let y = 481; y < 724; y += 5.4) {
      const alt = Math.round((y - 481) / 5.4) % 2 === 1;
      links += `<ellipse cx="${c.x}" cy="${fmt(y)}" rx="${alt ? 3.8 : 2.4}" ry="${alt ? 2.4 : 3.8}"
                 fill="none" stroke="#8a6428" stroke-width="2.5"/>
                <ellipse cx="${c.x}" cy="${fmt(y)}" rx="${alt ? 3.8 : 2.4}" ry="${alt ? 2.4 : 3.8}"
                 fill="none" stroke="#d9b25f" stroke-width="0.9"/>`;
    }
    return links;
  };

  // The same links restated in bright metal. A chain that gets pulled loses
  // its tarnish link by link, so this rides on top of the dull run and is
  // faded in per train: three chains on one clock, worn three different
  // amounts, is exactly the tell that says someone lives with this thing.
  const chainPolish = (c) => {
    let links = '';
    for (let y = 481; y < 724; y += 5.4) {
      const alt = Math.round((y - 481) / 5.4) % 2 === 1;
      links += `<ellipse cx="${c.x}" cy="${fmt(y)}" rx="${alt ? 3.8 : 2.4}" ry="${alt ? 2.4 : 3.8}"
                 fill="none" stroke="#f2d68f" stroke-width="1.1"/>`;
    }
    return links;
  };

  const chainMarkup = L.chains.map((c) => `
    <clipPath id="clipChain-${c.train}">
      <rect id="clipRect-${c.train}" x="${c.x - 5}" y="478" width="10" height="34"/>
    </clipPath>
    <g clip-path="url(#clipChain-${c.train})">
      ${chainLinks(c)}
      <g id="patinaChain-${c.train}" opacity="0" pointer-events="none">${chainPolish(c)}</g>
    </g>
    <circle cx="${c.x}" cy="479" r="4" fill="none" stroke="url(#gBrass)" stroke-width="2.2"/>
    <circle id="patinaPulley-${c.train}" cx="${c.x}" cy="479" r="4" fill="none"
            stroke="#f6dfa4" stroke-width="1.2" opacity="0" pointer-events="none"/>`).join('');

  const weights = `
    <g id="weights">
      ${chainMarkup}
      ${L.chains.map((c) => `
        <g id="cone-${c.train}" class="ck-grab" data-act="chain" data-train="${c.train}"
           transform="translate(${c.x - 18} ${c.top})">
          ${buildCone(`coneBody-${c.train}`, c.train)}
        </g>`).join('')}
    </g>`;

  // A resize handle in the empty air at the bottom right of the case. The
  // window's own edges are live, but they are a thin target on a shape that is
  // mostly transparent, so the case offers a proper corner. Invisible until
  // the cursor is near it, because the clock is the point, not its chrome.
  const grip = `
    <g id="resizeGrip" class="ck-resize" data-act="resize">
      <rect x="386" y="750" width="70" height="68" fill="#000000" fill-opacity="0" pointer-events="all"/>
      <g class="ck-grip-marks" stroke="#caa059" stroke-width="3.6" stroke-linecap="round" fill="none">
        <path d="M427 809 L447 789"/>
        <path d="M411 809 L447 773"/>
      </g>
    </g>`;

  // ------------------------------------------------------------------
  // Mount the case.
  // ------------------------------------------------------------------
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'cuckoo-clock';
  svg.setAttribute('viewBox', '0 0 460 820');
  svg.innerHTML = defs + shadows + weights + pendulum + roof + caseBody
    + dialAssembly + doorAssembly + levers + patinaBrass + grip;
  document.getElementById('stage').appendChild(svg);

  const $ = (sel) => svg.querySelector(sel);
  const el = {
    pendulum: $('#pendulum'),
    regLeaf: $('#regLeaf'),
    door: $('#door'),
    doorShade: $('#doorShade'),
    doorShadow: $('#doorShadow'),
    bird: $('#bird'),
    birdTilt: $('#birdTilt'),
    beakLower: $('#beakLower'),
    beakMouth: $('#beakMouth'),
    latchBar: $('#latchBar'),
    nightArm: $('#nightLeverArm'),
    muteArm: $('#muteLeverArm'),
    handHour: $('#handHour'),
    handMin: $('#handMin'),
    handSec: $('#handSec'),
    numerals12: $('#numerals12'),
    numerals24: $('#numerals24'),
    chains: Object.fromEntries(L.chains.map((c) => [c.train, $(`#clipRect-${c.train}`)])),
    cones: Object.fromEntries(L.chains.map((c) => [c.train, $(`#cone-${c.train}`)])),
    moonRing: $('#moonRing'),
    moonDark: $('#moonDark'),
    moonShade: $('#moonShade'),
    patina: {
      wood: $('#patinaWood'),
      session: $('#patinaSession'),
      brass: $('#patinaBrass'),
      foxing: $('#patinaFoxing'),
      dialAged: $('#dialAged'),
      latch: $('#patinaLatch'),
      latchTarnish: $('#latchTarnish'),
      bob: $('#patinaBob'),
      arrisL: $('#arrisL'),
      arrisR: $('#arrisR'),
      chain: Object.fromEntries(L.chains.map((c) => [c.train, $(`#patinaChain-${c.train}`)])),
      pulley: Object.fromEntries(L.chains.map((c) => [c.train, $(`#patinaPulley-${c.train}`)])),
      hanger: Object.fromEntries(L.chains.map((c) => [c.train, $(`#patinaHanger-${c.train}`)])),
    },
  };

  // ------------------------------------------------------------------
  // Live state, fed by the backend.
  // ------------------------------------------------------------------
  let settings = {
    showSeconds: false, twentyFourHour: false, silent: false, latched: false,
    nightSilence: false, pendulumLeaf: 0.5, pendulumRunning: true, runtimeHours: 30,
    birdProfile: 'cuckoo',
  };
  let movement = {
    offsetMs: 0, running: true, beatMs: 500, beatEpoch: Date.now(),
    weights: { time: 1, strike: 1, music: 1 },
  };

  const MAX_ANGLE = 8; // pendulum swing, degrees

  let appStartedAt = Date.now(); // this run's start, captured once in boot()

  const anim = {
    door: 0, doorTarget: 0, strainT0: -1e9,
    bird: 0, birdVel: 0, birdTarget: 0,
    beakT0: -1e9,
    latch: 0, latchTarget: 0, shakeT0: -1e9,
    night: 0, nightTarget: 0, nightTrembleT0: -1e9,
    mute: 0, muteTarget: 0, muteTrembleT0: -1e9,
    swayA: 0, swayV: 0,
    pendAmp: MAX_ANGLE,
    stop: null, // { t, phase, amp, beatMs } while the pendulum is coasting down
    frozenMs: null,
    peekT0: -1e9,     // a rare curious look out of the door
    stutterT0: -1e9,  // a rare caught breath in the escapement
    look: null,       // last head angle written, so the attribute is not rewritten
  };

  // Smooth weight positions. Targets arrive over IPC; shown values ease
  // toward them, and the time train is extrapolated between updates so the
  // cone slides continuously all day rather than stepping once a minute.
  const wTarget = { time: 1, strike: 1, music: 1 };
  const wShown = { time: 1, strike: 1, music: 1 };
  const pull = { time: 0, strike: 0, music: 0 }; // px of downward chain pull
  const pullTarget = { time: 0, strike: 0, music: 0 };

  let previewMs = null; // hand drag preview, in displayed ms
  let handDragging = false;

  const displayedNowMs = () => previewMs ?? (anim.frozenMs ?? Date.now() + movement.offsetMs);

  // ------------------------------------------------------------------
  // Backend state application.
  // ------------------------------------------------------------------
  function applyRunning(prevRunning) {
    const running = Boolean(movement.running);
    if (prevRunning === running) return;
    if (!running) {
      anim.frozenMs = Date.now() + movement.offsetMs;
      const phase = ((Date.now() - movement.beatEpoch) / movement.beatMs) % 2;
      anim.stop = {
        t: Date.now(), phase: phase * Math.PI, amp: anim.pendAmp, beatMs: movement.beatMs,
      };
    } else {
      anim.frozenMs = null;
      anim.stop = null;
    }
  }

  // ------------------------------------------------------------------
  // Patina. Two clocks: the lifetime one from installedAt, which decides how
  // far the wood and the brass have gone, and the session one from
  // appStartedAt, which is just the room warming back up around it. On top
  // of both, the parts this owner has actually put a hand on.
  // ------------------------------------------------------------------
  const DAY = 86400000;

  // Saturating curves. Both are deliberately slow: a third of the way in at
  // three months, and never quite arriving, because nothing real does.
  const aged = (days) => 1 - Math.exp(-Math.max(0, days) / 240);
  const handled = (n) => 1 - Math.exp(-Math.max(0, n || 0) / 25);

  const setOpacity = (node, v) => node?.setAttribute('opacity', fmt(clamp(v, 0, 1)));

  function applyPatina() {
    const on = settings.patinaEnabled !== false;
    const stats = settings.stats || {};
    const winds = stats.chainWinds || {};

    // Flipping the switch has to read immediately, months before the slow
    // curves below have anything to show for themselves, or it looks broken.
    // This floors every on-gated term at 12% presence the instant it's
    // enabled, then lets the real curve carry it the rest of the way to 100%.
    const presence = (v) => 0.12 + v * 0.88;

    // Age is only ever measured from a timestamp the backend actually set.
    // A missing installedAt means a clock with no history, not an old one.
    const age = on && settings.installedAt
      ? presence(aged((Date.now() - settings.installedAt) / DAY)) : 0;
    const session = on
      ? 1 - Math.exp(-Math.max(0, Date.now() - appStartedAt) / (DAY / 6)) : 0;

    setOpacity(el.patina.wood, age * 0.16);
    setOpacity(el.patina.brass, age * 0.42);
    setOpacity(el.patina.foxing, age * 0.36);
    // Dial and arris shading have a natural-material baseline even with the
    // system off, but it has to visibly step down, not stay put, so the
    // toggle itself is never a no-op.
    setOpacity(el.patina.dialAged, on ? 0.65 + age * 0.14 : 0.5);
    // The case only really settles into the room over the first few hours of
    // a run, so a fresh launch sits a shade cooler than one left alone all day.
    setOpacity(el.patina.session, session * 0.1);
    // The arrises are the one thing hands find without meaning to.
    setOpacity(el.patina.arrisL, on ? 0.6 + age * 0.16 : 0.44);
    setOpacity(el.patina.arrisR, on ? 0.5 + age * 0.16 : 0.34);

    const latch = on ? presence(handled(stats.latchTouches)) : 0;
    setOpacity(el.patina.latch, latch * 0.85);
    // Handling takes the tarnish back off the same brass age is putting it on.
    setOpacity(el.patina.latchTarnish, 1 - latch * 0.7);

    setOpacity(el.patina.bob, (on ? presence(handled(stats.bobTouches)) : 0) * 0.6);

    for (const c of L.chains) {
      const w = on ? presence(handled(winds[c.train])) : 0;
      setOpacity(el.patina.chain[c.train], w * 0.5);
      setOpacity(el.patina.pulley[c.train], w * 0.6);
      setOpacity(el.patina.hanger[c.train], w * 0.75);
    }
  }

  function applySettings() {
    el.handSec.setAttribute('display', settings.showSeconds ? 'inline' : 'none');
    el.numerals12.setAttribute('display', settings.twentyFourHour ? 'none' : 'inline');
    el.numerals24.setAttribute('display', settings.twentyFourHour ? 'inline' : 'none');
    anim.latchTarget = settings.latched ? 1 : 0;
    anim.nightTarget = settings.nightSilence ? 1 : 0;
    anim.muteTarget = settings.silent ? 1 : 0;
    // Left hidden until the real setting arrives, so someone who keeps the
    // moon switched off never sees it flash up on launch.
    if (settings.moonPhaseEnabled !== undefined) {
      setOpacity(el.moonRing, settings.moonPhaseEnabled ? 1 : 0);
    }
    applyBirdProfile();
    applyPatina();
  }

  // Which species is currently painted on the armature. Repainting is a
  // whole new bird's worth of markup, so it only ever happens when the
  // profile actually changes, never on a settings push that left it alone
  // and never per frame: the frame loop drives whatever paint job is there.
  let paintedBird = 'cuckoo';

  function applyBirdProfile() {
    const next = BIRD_SKINS[settings.birdProfile] ? settings.birdProfile : 'cuckoo';
    if (next === paintedBird) return;
    paintedBird = next;
    el.bird.innerHTML = buildBird(next);
    // The armature is rebuilt, so the handles the frame loop holds onto are
    // stale. Everything outside #bird, including #bird itself, is untouched.
    el.birdTilt = $('#birdTilt');
    el.beakLower = $('#beakLower');
    el.beakMouth = $('#beakMouth');
    // The craning transform is only written when it changes, and the fresh
    // group has none, so the cached value has to be dropped or a repaint
    // mid peek would leave the new bird staring straight ahead.
    anim.look = null;
  }

  // Patina drifts on a scale of hours, so it is repainted on a slow timer
  // and on every state push, never per frame.
  setInterval(applyPatina, 60000);

  function applySnapshot(s) {
    if (s?.settings) settings = { ...settings, ...s.settings };
    if (s?.movement) {
      const prevRunning = Boolean(movement.running);
      movement = { ...movement, ...s.movement };
      if (s.movement.weights) Object.assign(wTarget, s.movement.weights);
      applyRunning(prevRunning);
    }
    if (!handDragging) previewMs = null;
    applySettings();
  }

  function applySync(s) {
    if (!s) return;
    const prevRunning = Boolean(movement.running);
    movement = { ...movement, ...s };
    if (s.weights) Object.assign(wTarget, s.weights);
    applyRunning(prevRunning);
    if (!handDragging) previewMs = null;
  }

  // ------------------------------------------------------------------
  // Chime choreography. Sound is the backend's job; this is purely visual.
  // ------------------------------------------------------------------
  function handleChime(ev) {
    const now = Date.now();
    switch (ev.type) {
      case 'door:open':
        // A real strike outranks a quirk that happened to be mid look.
        anim.peekT0 = -1e9;
        anim.doorTarget = 1;
        anim.swayV += 0.07;
        break;
      case 'cuckoo':
        anim.birdTarget = 1;
        anim.beakT0 = now;
        anim.swayV += ev.index % 2 ? 0.13 : -0.13;
        break;
      case 'bird:in':
        anim.birdTarget = 0;
        break;
      case 'gong':
        anim.swayV += 0.09;
        break;
      case 'door:close':
        anim.birdTarget = 0;
        anim.doorTarget = 0;
        break;
      case 'chime:end':
        if (ev.aborted) {
          anim.birdTarget = 0;
          anim.doorTarget = 0;
        }
        break;
      case 'chime:blocked':
        // The train tried to run into a locked door: the latch shudders and
        // the door strains against it, which is what the mechanism really does.
        if (ev.reason === 'latched') {
          anim.shakeT0 = now;
          anim.strainT0 = now;
        } else if (ev.reason === 'night') {
          anim.nightTrembleT0 = now;
        } else if (ev.reason === 'silent') {
          anim.muteTrembleT0 = now;
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Quirks. About once a day, and never on a schedule this file knows
  // about: the backend rolls the dice and only tells us it happened.
  // ------------------------------------------------------------------
  // The door only comes off its stop, nowhere near the full swing of a
  // strike, so the bird cannot come straight out through it. It leans
  // around the free edge instead, which is the whole charm of the thing.
  const PEEK = { doorMax: 0.42, birdMax: 0.4, dur: 3000, lean: 46 };

  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  /**
   * The peek, as three overlapping moves: the door comes off its stop, the
   * bird noses into the gap, and then a look to one side and back before it
   * thinks better of the whole thing. Nothing here opens the door fully or
   * pushes the bird right out, because this is not a strike.
   */
  function peekEnvelope(u) {
    const seg = (a, b) => smooth((u - a) / (b - a));
    return {
      door: seg(0, 320) - seg(2360, 2920),
      bird: seg(230, 720) - seg(1980, 2400),
      look: -8.4 * (seg(680, 1060) - seg(1180, 1520))
        + 7 * (seg(1560, 1900) - seg(2020, 2320)),
    };
  }

  /**
   * Named, and hung on window, so a quirk can be previewed from devtools
   * without waiting a day for one: window.cuckooQuirk({ type: 'peek' }).
   */
  function handleQuirk(ev) {
    const now = Date.now();
    if (ev?.type === 'peek') {
      // A real strike owns the door. If one is running, let the quirk go.
      if (anim.doorTarget > 0 || anim.birdTarget > 0 || anim.door > 0.02) return;
      anim.peekT0 = now;
      window.cuckooAudio?.play('door', { gain: 0.22, rate: 1.22 });
    } else if (ev?.type === 'stutter') {
      anim.stutterT0 = now;
      anim.swayV += 0.016;
    }
  }
  window.cuckooQuirk = handleQuirk;

  // ------------------------------------------------------------------
  // Pointer interactions.
  // ------------------------------------------------------------------
  const svgPoint = (() => {
    const pt = svg.createSVGPoint();
    return (e) => {
      pt.x = e.clientX;
      pt.y = e.clientY;
      const m = svg.getScreenCTM();
      return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    };
  })();

  let drag = null; // { kind, ... } an active interaction, or null

  const handAngle = (p) => {
    const a = (Math.atan2(p.x - dial.cx, -(p.y - dial.cy)) * 180) / Math.PI;
    return a;
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;

    if (act === 'latch') {
      window.cuckooAudio?.play('latch');
      window.cuckoo?.toggle('latched');
      return;
    }
    if (act === 'resize') {
      window.cuckoo?.resize.start('se');
      drag = { kind: 'resize' };
      return;
    }
    if (act === 'night') { window.cuckoo?.toggle('nightSilence'); return; }
    if (act === 'mute') { window.cuckoo?.toggle('silent'); return; }
    if (act === 'bob') {
      drag = { kind: 'bobClick', x: e.clientX, y: e.clientY };
      return;
    }
    if (act === 'leaf') {
      drag = { kind: 'leaf', lastSet: 0 };
      return;
    }
    if (act === 'chain') {
      const train = actEl.dataset.train;
      drag = { kind: 'chain', train, startY: svgPoint(e).y, pull0: pull[train] };
      return;
    }
    if (act === 'minute') {
      handDragging = true;
      drag = {
        kind: 'minute',
        prevA: handAngle(svgPoint(e)),
        startMs: displayedNowMs(),
        accMin: 0,
        lastSet: 0,
      };
      return;
    }
    // Plain woodwork: drag the whole window.
    window.cuckoo?.drag.start();
    drag = { kind: 'window' };
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const now = Date.now();
    if (drag.kind === 'leaf') {
      const p = svgPoint(e);
      const t = clamp((p.y - L.pend.leafTop) / (L.pend.leafBottom - L.pend.leafTop), 0, 1);
      settings.pendulumLeaf = t;
      if (now - drag.lastSet > 120) {
        drag.lastSet = now;
        window.cuckoo?.set({ pendulumLeaf: t });
      }
    } else if (drag.kind === 'chain') {
      const y = svgPoint(e).y;
      const base = coneBaseY(drag.train);
      const maxPull = Math.max(0, base - 492);
      pull[drag.train] = clamp(drag.pull0 + (y - drag.startY), 0, maxPull);
      pullTarget[drag.train] = pull[drag.train];
    } else if (drag.kind === 'minute') {
      const a = handAngle(svgPoint(e));
      let d = a - drag.prevA;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      drag.prevA = a;
      drag.accMin += d / 6;
      const targetMs = drag.startMs + drag.accMin * 60000;
      previewMs = targetMs;
      if (now - drag.lastSet > 50) {
        drag.lastSet = now;
        const nd = new Date(targetMs);
        window.cuckoo?.setHands(nd.getHours(), nd.getMinutes() + nd.getSeconds() / 60);
      }
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'window') {
      window.cuckoo?.drag.end();
    } else if (d.kind === 'resize') {
      window.cuckoo?.resize.end();
    } else if (d.kind === 'bobClick') {
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved < 6) window.cuckoo?.toggle('pendulumRunning');
    } else if (d.kind === 'leaf') {
      window.cuckoo?.set({ pendulumLeaf: settings.pendulumLeaf });
    } else if (d.kind === 'chain') {
      if (pull[d.train] > 24) window.cuckoo?.wind(d.train);
      pullTarget[d.train] = 0;
    } else if (d.kind === 'minute') {
      handDragging = false;
      if (previewMs != null) {
        const nd = new Date(previewMs);
        window.cuckoo?.setHands(nd.getHours(), nd.getMinutes() + nd.getSeconds() / 60);
      }
      // The state push that follows clears the preview; guard anyway.
      setTimeout(() => { previewMs = null; }, 800);
    }
  });

  svg.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-act="dial"]')) window.cuckoo?.resetHands();
  });

  function coneBaseY(train) {
    const c = L.chains.find((ch) => ch.train === train);
    return c.top + (1 - wShown[train]) * (L.chainBottom - c.top);
  }

  // ------------------------------------------------------------------
  // The frame loop: hands, pendulum, weights, sway and every mechanism.
  // ------------------------------------------------------------------
  let prevT = performance.now();
  let moonStep = -1; // last drawn phase, quantised, so the moon is not redrawn per frame

  function frame(t) {
    const dt = clamp((t - prevT) / 1000, 0.001, 0.05);
    prevT = t;
    const now = Date.now();

    // Hands.
    const disp = new Date(displayedNowMs());
    const sec = disp.getSeconds() + disp.getMilliseconds() / 1000;
    const min = disp.getMinutes() + sec / 60;
    const hr = disp.getHours() + min / 60;
    const hourAngle = settings.twentyFourHour ? 15 * (hr % 24) : 30 * (hr % 12);
    el.handHour.setAttribute('transform', `translate(${dial.cx} ${dial.cy}) rotate(${fmt(hourAngle)})`);
    el.handMin.setAttribute('transform', `translate(${dial.cx} ${dial.cy}) rotate(${fmt(6 * min)})`);
    if (settings.showSeconds) {
      el.handSec.setAttribute('transform', `translate(${dial.cx} ${dial.cy}) rotate(${fmt(6 * sec)})`);
    }

    // The moon, which moves about half a degree an hour, so it is only
    // redrawn when the phase has actually shifted enough to see.
    if (settings.moonPhaseEnabled !== false) {
      const ph = moonPhase(disp);
      const step = Math.round(ph * 2000);
      if (step !== moonStep) {
        moonStep = step;
        el.moonDark.setAttribute('d', moonShadowPath(ph, MOON.disc));
        // Waning is the mirror of waxing, so only the shadow is flipped and
        // the seas stay put: the moon always shows the same face.
        el.moonShade.setAttribute('transform', ph > 0.5 ? 'scale(-1 1)' : '');
      }
    }

    // A quirk of the escapement: for an instant the bob lags and loses a
    // hair of swing, then catches itself up. This is layered over the phase
    // rather than into it, so the audible tick in audio.js never moves.
    let phaseLag = 0;
    let ampScale = 1;
    const su = now - anim.stutterT0;
    if (su >= 0 && su < 1600) {
      const env = Math.exp(-su / 480) * (1 - Math.exp(-su / 40));
      phaseLag = 0.3 * env;
      ampScale = 1 - 0.16 * env;
    }

    // Pendulum, phase locked to the escapement anchor the audio engine uses.
    let pendAngle;
    if (movement.running) {
      anim.pendAmp += (MAX_ANGLE - anim.pendAmp) * Math.min(1, dt * 1.6);
      const phase = ((now - movement.beatEpoch) / movement.beatMs) % 2;
      pendAngle = Math.cos(phase * Math.PI - phaseLag) * anim.pendAmp * ampScale;
    } else if (anim.stop) {
      // Coast down: decaying oscillation rather than snapping to vertical.
      const s = anim.stop;
      const elapsed = (now - s.t) / 1000;
      pendAngle = Math.cos(s.phase + (elapsed * Math.PI * 1000) / s.beatMs)
        * s.amp * Math.exp(-elapsed / 2.6);
      anim.pendAmp = Math.abs(pendAngle);
    } else {
      pendAngle = 0;
    }
    el.pendulum.setAttribute('transform', `rotate(${fmt(pendAngle)} ${L.pend.px} ${L.pend.py})`);

    // Regulating leaf rides the rod.
    const leafY = lerp(L.pend.leafTop, L.pend.leafBottom, settings.pendulumLeaf);
    el.regLeaf.setAttribute('transform', `translate(${L.pend.px} ${fmt(leafY)})`);

    // Weights: extrapolate the going train, ease everything toward target.
    const runtimeMs = Math.max(1, settings.runtimeHours) * 3600000;
    if (movement.running && !drag) {
      wTarget.time = Math.max(0.02, wTarget.time - (dt * 1000) / runtimeMs);
    }
    for (const c of L.chains) {
      const tr = c.train;
      wShown[tr] += (wTarget[tr] - wShown[tr]) * Math.min(1, dt * 3);
      pull[tr] += (pullTarget[tr] - pull[tr]) * Math.min(1, dt * 7);
      const y = c.top + (1 - wShown[tr]) * (L.chainBottom - c.top) - pull[tr];
      el.cones[tr].setAttribute('transform', `translate(${c.x - 18} ${fmt(y)})`);
      const chainEnd = y - 10;
      el.chains[tr].setAttribute('height', fmt(Math.max(2, chainEnd - 478)));
    }

    // A peek in progress, if there is one: a small additive layer over the
    // door and the bird, so the strike choreography's own springs are left
    // exactly as they were.
    let peekDoor = 0;
    let peekBird = 0;
    let peekLook = 0;
    const pu = now - anim.peekT0;
    if (pu >= 0 && pu < PEEK.dur) {
      const e = peekEnvelope(pu);
      peekDoor = e.door * PEEK.doorMax;
      peekBird = e.bird * PEEK.birdMax;
      peekLook = e.look * e.bird; // only looks around once it is actually out
    }

    // Door swing with a hint of perspective, plus strain when blocked.
    anim.door += (anim.doorTarget - anim.door) * Math.min(1, dt * (anim.doorTarget > anim.door ? 10 : 6));
    let strain = 0;
    if (now - anim.strainT0 < 900) {
      strain = Math.max(0, Math.exp(-(now - anim.strainT0) / 320)
        * Math.sin((now - anim.strainT0) * 0.06)) * 0.09;
    }
    const dOpen = clamp(anim.door + strain + peekDoor, 0, 1.1);
    const sx = 1 - 0.8 * dOpen;
    el.door.setAttribute('transform',
      `translate(${L.door.x} 0) scale(${fmt(sx)} 1) skewY(${fmt(-6 * dOpen)}) translate(${-L.door.x} 0)`);
    el.doorShade.setAttribute('opacity', fmt(0.34 * dOpen));
    el.doorShadow.setAttribute('opacity', fmt(0.32 * dOpen));

    // The bird: fast thrust out, slower return, tiny bounce at the travel end.
    const k = anim.birdTarget > anim.bird ? 90 : 34;
    anim.birdVel += (anim.birdTarget - anim.bird) * k * dt;
    anim.birdVel *= Math.exp(-dt * 7);
    anim.bird = clamp(anim.bird + anim.birdVel * dt, -0.15, 1.2);
    const b = clamp(anim.bird + peekBird, -0.15, 1.2);

    // The craning look, pivoted low near the feet so the head travels and
    // the perch does not. Written only when it changes.
    const look = fmt(peekLook);
    if (look !== anim.look) {
      anim.look = look;
      el.birdTilt.setAttribute('transform', peekLook ? `rotate(${look} 0 20)` : '');
    }

    const bScale = 0.85 + b * 0.45;
    el.bird.setAttribute('opacity', fmt(clamp(b * 2, 0, 1)));
    el.bird.setAttribute('transform',
      `translate(${fmt(230 + peekBird * PEEK.lean)} ${fmt(252 + (1 - b) * 10 - b * 2)})`
      + ` scale(${fmt(bScale)} ${fmt(bScale * (1 + 0.05 * b))})`);

    // Beak: two notes per call, two openings. The mouth gapes and the lower
    // beak drops, the way the bellows lever pulls it.
    const bt = now - anim.beakT0;
    let beak = 0;
    for (const [from, to] of [[40, 260], [310, 530]]) {
      if (bt >= from && bt <= to) beak = Math.max(beak, Math.sin(((bt - from) / (to - from)) * Math.PI));
    }
    el.beakLower.setAttribute('transform', `translate(0 ${fmt(beak * 2.8)})`);
    el.beakMouth.setAttribute('transform',
      `translate(0 -9) scale(1 ${fmt(Math.max(0.02, beak))}) translate(0 9)`);

    // Latch: swing and seat, plus the shudder when the train runs into it.
    anim.latch += (anim.latchTarget - anim.latch) * Math.min(1, dt * 9);
    let shake = 0;
    if (now - anim.shakeT0 < 800) {
      shake = 3.4 * Math.exp(-(now - anim.shakeT0) / 200) * Math.sin((now - anim.shakeT0) * 0.11);
    }
    const latchAngle = -80 * (1 - anim.latch) + shake;
    el.latchBar.setAttribute('transform', `rotate(${fmt(latchAngle)} ${L.latch.px} ${L.latch.py})`);

    // Levers: thrown down when active, with a tremble when they block a strike.
    anim.night += (anim.nightTarget - anim.night) * Math.min(1, dt * 8);
    anim.mute += (anim.muteTarget - anim.mute) * Math.min(1, dt * 8);
    const tremble = (t0) => (now - t0 < 600
      ? 4 * Math.exp(-(now - t0) / 180) * Math.sin((now - t0) * 0.12) : 0);
    el.nightArm.setAttribute('transform', `rotate(${fmt(lerp(-14, 64, anim.night) + tremble(anim.nightTrembleT0))})`);
    el.muteArm.setAttribute('transform', `rotate(${fmt(lerp(-14, 64, anim.mute) + tremble(anim.muteTrembleT0))})`);

    // The whole piece sways on its nail: a spring rocked by the strike train,
    // plus a barely perceptible counter sway from the pendulum.
    anim.swayV += (-7 * anim.swayA - 0.8 * anim.swayV) * dt;
    anim.swayA += anim.swayV * dt;
    const sway = anim.swayA + pendAngle * 0.005;
    svg.style.transform = `rotate(${sway.toFixed(3)}deg)`;

    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------
  // Boot.
  // ------------------------------------------------------------------
  applySettings();
  requestAnimationFrame(frame);

  async function boot() {
    if (!window.cuckoo) {
      console.warn('[clock] preload bridge missing, artwork only');
      return;
    }
    const state = await window.cuckoo.ready();
    // appStartedAt rides alongside settings rather than inside it, and it
    // never changes during a run, so it is taken once here: applySnapshot
    // only ever pulls settings and movement out of a state push.
    if (Number.isFinite(state?.appStartedAt)) appStartedAt = state.appStartedAt;
    applySnapshot(state);
    if (!movement.running) anim.frozenMs = Date.now() + movement.offsetMs;
    window.cuckoo.on('state', applySnapshot);
    window.cuckoo.on('sync', applySync);
    window.cuckoo.on('weights', (w) => { if (w) Object.assign(wTarget, w); });
    window.cuckoo.on('chime', handleChime);
    window.cuckoo.on('quirk', handleQuirk);
    window.cuckoo.on('clickthrough', (on) => svg.classList.toggle('ct', Boolean(on)));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
