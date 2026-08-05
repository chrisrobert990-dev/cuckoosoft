'use strict';
/* Placeholder visual layer, used to prove the backend contract before the real
   woodwork lands. Replaced wholesale by the visual layer. */
(async () => {
  const stage = document.getElementById('stage');
  const el = document.createElement('div');
  el.className = 'probe';
  el.innerHTML = `
    <h1 id="t">--:--</h1>
    <p id="s">connecting</p>
    <p id="b">beat -</p>
    <div>
      <button id="hour">strike hour</button>
      <button id="latch">latch</button>
      <button id="menu">menu</button>
    </div>`;
  stage.appendChild(el);

  const state = await window.cuckoo.ready();
  let snap = state.movement;
  let settings = state.settings;
  console.log('[probe] ready', state);

  window.cuckoo.on('state', (s) => { settings = s.settings; snap = s.movement; });
  window.cuckoo.on('sync', (s) => { snap = s; });
  window.cuckoo.on('chime', (e) => {
    console.log('[probe] chime', e);
    document.getElementById('s').textContent = e.type;
  });
  window.cuckooAudio?.on('beat', (b) => {
    document.getElementById('b').textContent = `beat ${b.side} ${b.index}`;
  });

  document.getElementById('hour').onclick = () => window.cuckoo.strike('hour');
  document.getElementById('latch').onclick = () => window.cuckoo.toggle('latched');
  document.getElementById('menu').onclick = () => window.cuckoo.menu();
  el.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'BUTTON') window.cuckoo.drag.start();
  });
  window.addEventListener('mouseup', () => window.cuckoo.drag.end());

  const tick = () => {
    const d = new Date(Date.now() + (snap?.offsetMs ?? 0));
    document.getElementById('t').textContent = d.toLocaleTimeString('en-GB');
    requestAnimationFrame(tick);
  };
  tick();
})();
