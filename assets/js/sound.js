/* ==========================================================================
   Rose Noire — ambiance sonore, toujours active et très discrète
   Synthétisée en direct avec la Web Audio API (aucun fichier audio, aucun droit
   d’auteur) : une nappe grave et feutrée en ré majeur, quelques notes de piano
   « feutre » lointaines, un léger souffle d’air, et un frôlement doux à chaque
   chapitre du héros. Pas de bouton : on règle le volume avec celui de l’appareil.
   Les navigateurs interdisent tout son avant un geste du visiteur : l’ambiance
   démarre donc d’elle-même au premier toucher, glissé, clic ou touche, en fondu.
   Seule option, pour l’accessibilité : « Couper le son » en pied de page (rni_sound).
   API pour app.js : window.__rnSound.transition(dir), .release()
   ========================================================================== */
(() => {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const noop = () => {};
  window.__rnSound = { transition: noop, release: noop };
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  if (!AC) return; // le lien « Couper le son » reste masqué

  const KEY = 'rni_sound';
  const LEVEL = 0.19; // niveau général, volontairement très bas (rendu hors ligne : ≈ −36 dB en moyenne)
  let muted = false;
  try { muted = JSON.parse(localStorage.getItem(KEY) || '{}').muted === true; } catch (e) { /* navigation privée */ }

  let ctx = null, master, music, fx, verb, noise, air = null;
  let chord = 0, padTimer = 0, noteTimer = 0, offTimer = 0, playing = false;

  /* ---------- Graphe audio (créé au premier geste) ---------- */
  function impulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function build() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 20; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.5;
    master.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver();
    verb.buffer = impulse(4.2, 2.8);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    verb.connect(wet).connect(master);
    music = ctx.createGain(); music.gain.value = 1;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 1800; warm.Q.value = 0.3;
    music.connect(warm);
    warm.connect(master);
    const send = ctx.createGain(); send.gain.value = 0.8; warm.connect(send).connect(verb);
    fx = ctx.createGain(); fx.gain.value = 1;
    fx.connect(master);
    const fxSend = ctx.createGain(); fxSend.gain.value = 0.6; fx.connect(fxSend).connect(verb);
    // bruit rose (plus doux que le bruit blanc) pour le souffle et les frôlements
    noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const n = noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      n[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  /* ---------- Nappe grave et feutrée (sinusoïdes seules, filtre très doux) ---------- */
  const CHORDS = [
    [73.42, 110.0, 146.83, 185.0, 220.0],   // Ré maj9 (ouvert)
    [61.74, 92.5, 146.83, 185.0, 220.0],    // Si m7
    [98.0, 146.83, 185.0, 246.94, 293.66],  // Sol maj7
    [110.0, 164.81, 220.0, 246.94, 293.66]  // La 6sus
  ];
  const CHORD_LEN = 12;
  function playChord(freqs, t) {
    const dur = CHORD_LEN + 4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(320, t);
    lp.frequency.linearRampToValueAtTime(680, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(360, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 4.5);
    env.gain.setValueAtTime(1, t + dur - 4.5);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(env).connect(music);
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = Math.random() * 8 - 4;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.05 : 0.022;
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }
  function padLoop() {
    if (!playing) return;
    playChord(CHORDS[chord % CHORDS.length], ctx.currentTime + 0.05);
    chord++;
    padTimer = setTimeout(padLoop, CHORD_LEN * 1000);
  }

  /* ---------- Notes de piano « feutre », rares et lointaines ---------- */
  const PENTA = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25]; // ré majeur pentatonique
  function felt(f, t, vol, bus, pan) {
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.001;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass';
    tone.frequency.setValueAtTime(1600, t);
    tone.frequency.exponentialRampToValueAtTime(420, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.8);
    const over = ctx.createGain(); over.gain.value = 0.12;
    o1.connect(g); o2.connect(over).connect(g);
    g.connect(tone);
    let out = tone;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; tone.connect(p); out = p; }
    out.connect(bus);
    o1.start(t); o2.start(t);
    o1.stop(t + 5); o2.stop(t + 5);
  }
  function noteLoop() {
    if (!playing) return;
    const t = ctx.currentTime + 0.05;
    const count = Math.random() < 0.4 ? 2 : 1;
    let k = Math.floor(Math.random() * PENTA.length);
    for (let i = 0; i < count; i++) {
      felt(PENTA[k], t + i * (0.45 + Math.random() * 0.25), 0.03 + Math.random() * 0.012, music, Math.random() * 0.8 - 0.4);
      k = (k + 2) % PENTA.length;
    }
    noteTimer = setTimeout(noteLoop, 7000 + Math.random() * 7000);
  }

  /* ---------- Souffle d’air presque imperceptible ---------- */
  function startAir() {
    if (air) return;
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.035;
    const depth = ctx.createGain(); depth.gain.value = 220;
    lfo.connect(depth).connect(bp.frequency);
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(bp).connect(g).connect(music);
    src.start(); lfo.start();
    air = src;
  }

  /* ---------- Chapitres du héros : un frôlement doux et une note ---------- */
  function swish(t, dur, peak, from, mid, to, panFrom, panTo) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(mid, t + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g);
    let out = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(panFrom, t);
      p.pan.linearRampToValueAtTime(panTo, t + dur);
      g.connect(p); out = p;
    }
    out.connect(fx);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }
  const ready = () => !!(ctx && playing && ctx.state === 'running');
  function transition(dir) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.02;
    swish(t, 1.4, 0.9, dir > 0 ? 260 : 1100, dir > 0 ? 1100 : 520, dir > 0 ? 420 : 240, dir > 0 ? -0.35 : 0.35, dir > 0 ? 0.35 : -0.35);
    const c = CHORDS[(chord + CHORDS.length - 1) % CHORDS.length];
    felt(c[3] * 2, t + 0.55, 0.06, fx, dir > 0 ? 0.2 : -0.2);
  }
  function release() {
    if (!ready()) return;
    swish(ctx.currentTime + 0.02, 1.2, 0.6, 700, 300, 180, 0.25, -0.25);
  }
  window.__rnSound = { transition, release };

  /* ---------- Marche (au premier geste) et coupure éventuelle ---------- */
  function fade(to, seconds) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(Math.max(0.0001, to), now + seconds);
  }
  function begin() {
    if (playing) return;
    playing = true;
    clearTimeout(padTimer); clearTimeout(noteTimer);
    startAir();
    padLoop();
    noteTimer = setTimeout(noteLoop, 5000);
    fade(LEVEL, 4);
  }
  function start() {
    if (muted || document.hidden) return;
    clearTimeout(offTimer);
    if (!ctx) build();
    if (ctx.state === 'running') begin();
    else ctx.resume().then(begin).catch(noop);
  }
  function stop() {
    playing = false;
    clearTimeout(padTimer); clearTimeout(noteTimer);
    if (!ctx) return;
    fade(0.0001, 0.6);
    offTimer = setTimeout(() => { if (!playing && ctx) ctx.suspend().catch(noop); }, 700);
  }
  // Premier geste du visiteur : seul moment où le navigateur autorise le son
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'];
  function unlock() {
    start();
    if (muted || (ctx && ctx.state === 'running')) GESTURES.forEach((t) => window.removeEventListener(t, unlock, true));
  }
  GESTURES.forEach((t) => window.addEventListener(t, unlock, true));

  // Onglet caché : silence et pause ; retour : reprise en fondu
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) stop();
    else if (!muted) start();
  });

  // « Couper le son » / « Remettre le son » (pied de page)
  function render() {
    $$('[data-sound-mute]').forEach((b) => {
      b.hidden = false;
      b.textContent = muted ? 'Remettre le son' : 'Couper le son';
      b.setAttribute('aria-pressed', String(muted));
    });
  }
  function init() {
    render();
    $$('[data-sound-mute]').forEach((b) => b.addEventListener('click', () => {
      muted = !muted;
      try { localStorage.setItem(KEY, JSON.stringify({ muted })); } catch (e) { /* rien */ }
      render();
      if (muted) stop(); else start();
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
