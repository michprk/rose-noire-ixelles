/* ==========================================================================
   Rose Noire — « le bouquet devient le site » (WebGL 2, sans bibliothèque)

   La photo du héros (Sophie et son bouquet) est dessinée sur un canevas WebGL.
   Au signal, le bouquet se décompose : quelques centaines de vrais pétales
   (rose, œillet, lisianthus, feuille d’eucalyptus), chacun de la couleur de la
   photo à l’endroit d’où il part, se détachent du cœur du bouquet. Ce sont de
   petites surfaces 3D bombées, avec nervures, lumière, reflet et ombre portée,
   qui se retournent lentement dans un tourbillon : le bouquet tourne sur
   lui-même, s’ouvre en spirale, et chaque pétale se pose dans la tuile du site
   qui a sa couleur. La photo se dissout derrière eux.

   Tout est fonction d’un seul temps P (en secondes) : l’animation peut donc
   être jouée dans les deux sens (en remontant, le bouquet se recompose).
   API : RNBloom.create(canvas) → { load, layout, render, clear, tileFill, end }
   ========================================================================== */
(() => {
  'use strict';

  const VS_PHOTO = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

  // Bruit doux identique en GLSL et en JavaScript (moment où chaque point se détache)
  const REL_GLSL = `
uniform vec2 uC; uniform vec2 uR; uniform float uDeMax; uniform vec3 uRel;
float nz(vec2 p) { return sin(p.x * 0.013 + sin(p.y * 0.021) * 1.7) * cos(p.y * 0.017 - sin(p.x * 0.011) * 1.3); }
float rel(vec2 p) {
  float de = length((p - uC) / uR);
  float t = de < 1.0 ? uRel.x * pow(de, 1.35)
                     : uRel.x + uRel.y * pow(clamp((de - 1.0) / max(uDeMax - 1.0, 0.001), 0.0, 1.0), 0.9);
  return max(0.0, t + uRel.z * nz(p));
}`;

  const FS_PHOTO = `#version 300 es
precision highp float;
uniform sampler2D uImg;
uniform vec2 uView; uniform float uDpr; uniform vec4 uCover; uniform float uP; uniform float uZ;
${REL_GLSL}
out vec4 o;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  float T = rel(p);
  float a = smoothstep(0.0, 0.07, T + 0.17 - uP);       /* la photo s’efface juste après le départ des pétales */
  if (a <= 0.0) discard;
  vec2 q = uC + (p - uC) / uZ;
  vec3 c = texture(uImg, (q - uCover.xy) / uCover.zw).rgb;
  float rim = (1.0 - smoothstep(0.0, 0.07, T + 0.17 - uP)) * step(0.0, uP);
  c = mix(c, vec3(1.0, 0.92, 0.95), rim * 0.22);
  o = vec4(c * a, a);
}`;

  /* Pétale : une grille 7 × 9 sommets, bombée en creux et légèrement recourbée à la pointe,
     qui culbute lentement autour de son propre axe et suit une spirale autour du bouquet
     (tous dans le même sens : un tourbillon, pas des confettis). */
  const VS_PETAL = `#version 300 es
precision highp float;
in vec2 aGrid;
in vec2 aUv; in vec3 aCol; in vec3 aPal; in vec4 aRnd; in vec4 aRnd2; in vec2 aTgt; in vec3 aTCol; in vec2 aLD; in float aMode; in float aType;
uniform vec2 uView; uniform vec4 uCover; uniform vec2 uC; uniform float uP; uniform float uIdle; uniform float uZ0; uniform float uSize; uniform float uShadow;
out vec2 vTex; out vec3 vCol; out float vA; out float vSpec;
const float PI = 3.14159265;
const float TAU = 6.2831853;
const float SPIN = -1.0;                 /* sens du tourbillon (anti-horaire à l’écran) */
float eo(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }
float eio(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
float sio(float x) { x = clamp(x, 0.0, 1.0); return 0.5 - 0.5 * cos(PI * x); }
mat3 axisAngle(vec3 a, float g) {
  a = normalize(a);
  float c = cos(g), s = sin(g), t = 1.0 - c;
  return mat3(t * a.x * a.x + c, t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y,
              t * a.x * a.y - s * a.z, t * a.y * a.y + c, t * a.y * a.z + s * a.x,
              t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c);
}
vec2 spiral(float t, float r0, float a0, float rT, float total, float bulge, float lift) {
  float ea = sio(t);
  float er = eio((t - 0.22) / 0.78);     /* d’abord le bouquet tourne sur lui-même, puis il s’ouvre */
  float a = a0 + total * ea;
  float r = mix(r0, rT, er) + bulge * sin(PI * er);
  return uC + r * vec2(cos(a), sin(a)) + vec2(0.0, -lift * sin(PI * ea));
}
void main() {
  vec2 O = uCover.xy + aUv * uCover.zw;
  float leaf = step(2.5, aType);
  float len = mix(30.0, 58.0, aRnd.x) * uSize * mix(1.0, 0.8, leaf);
  float wr = aType < 0.5 ? 0.92 : aType < 1.5 ? 0.98 : aType < 2.5 ? 0.78 : 0.88;
  float alpha = 1.0, t, heading = 0.0, scale = 1.0;
  vec2 pos; vec3 col = aCol;
  vec3 nat = aPal;                       /* couleur de vraie fleur (palette tirée du bouquet) */
  if (aMode < 0.5) {
    float L = aLD.x, D = aLD.y;
    t = (uP - L) / D;
    if (t <= 0.0 || t >= 1.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
    vec2 Oz = uC + (O - uC) * (uZ0 + 0.03 * eo(L / 1.5));
    vec2 d0 = Oz - uC, dT = aTgt - uC;
    float r0 = length(d0), rT = length(dT);
    float a0 = atan(d0.y, d0.x), aT = atan(dT.y, dT.x);
    float gap = mod(SPIN * (aT - a0), TAU);
    float inner = 1.3 - 0.55 * smoothstep(0.0, 320.0 * uSize, r0);      /* le cœur tourne plus vite que les bords */
    float total = SPIN * (gap + TAU * (0.45 + aRnd.z * 0.5) * inner);
    float bulge = (15.0 + aRnd2.y * aRnd2.y * 260.0) * uSize;
    float lift = (20.0 + aRnd2.x * 70.0) * uSize;
    pos = spiral(t, r0, a0, rT, total, bulge, lift);
    vec2 ahead = spiral(min(t + 0.02, 1.0), r0, a0, rT, total, bulge, lift);
    heading = atan(ahead.y - pos.y, ahead.x - pos.x);
    col = mix(mix(aCol, nat, smoothstep(0.0, 0.3, t)), mix(nat, aTCol, 0.55), smoothstep(0.55, 0.97, t));
    scale = mix(0.75, 1.0, smoothstep(0.0, 0.12, t)) * (1.0 - smoothstep(0.84, 1.0, t));
  } else {
    float L = aLD.x, D = aLD.y;                                          /* pétales qui s’envolent avant le signal */
    t = (uIdle - L) / D;
    if (t <= 0.0 || t >= 1.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
    vec2 Oz = uC + (O - uC) * uZ0;
    vec2 d0 = Oz - uC;
    float a = atan(d0.y, d0.x) + SPIN * 1.4 * sio(t);
    float r = length(d0) + 140.0 * uSize * eo(t);
    pos = uC + r * vec2(cos(a), sin(a)) + vec2(0.0, -30.0 * t + 60.0 * t * t);
    heading = a + SPIN * PI * 0.5;
    alpha = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.6, 1.0, t)) * (1.0 - smoothstep(-0.19, 0.1, uP));
    col = mix(aCol, nat, smoothstep(0.0, 0.3, t));
  }

  /* géométrie locale (y vers le haut, z vers l’écran) */
  float u = aGrid.x - 0.5, v = aGrid.y;
  float w = len * wr;
  float cup = mix(0.1, 0.36, aRnd2.w) * mix(1.0, 0.4, leaf);
  float curl = (aRnd.w - 0.35) * 0.45;
  vec3 p = vec3(u * w, (v - 0.5) * len, 0.0);
  p.z = cup * 2.0 * p.x * p.x / w + curl * 0.22 * len * v * v;
  vec3 n = normalize(vec3(-cup * 4.0 * p.x / w, -curl * 0.44 * v, 1.0));

  /* culbute lente + orientation dans le sens du vent */
  vec3 axis = vec3(aRnd2.z - 0.5, aRnd.z - 0.5, 0.25 + aRnd2.x * 0.5);
  float tumble = aRnd.y * TAU + t * (2.2 + aRnd.x * 2.4) + 0.5 * sin(t * 5.0 + aRnd.w * TAU);
  mat3 R = axisAngle(axis, tumble);
  float th = -heading - PI * 0.5;
  mat3 Hd = mat3(cos(th), sin(th), 0.0, -sin(th), cos(th), 0.0, 0.0, 0.0, 1.0);
  vec3 q = Hd * (R * p) * scale;
  vec3 nn = Hd * (R * n);
  float persp = 2200.0 / (2200.0 - q.z);
  vec2 P = pos + vec2(q.x, -q.y) * persp;

  /* lumière douce venant d’en haut à gauche ; le revers est plus clair (pétale translucide) */
  vec3 Ld = normalize(vec3(-0.35, 0.6, 0.72));
  float ndl = dot(nn, Ld);
  float back = step(nn.z, 0.0);
  float shade = 0.86 + 0.2 * abs(ndl);
  vec3 face = col * shade;
  vec3 rev = mix(col, vec3(1.0, 0.97, 0.95), 0.22) * (0.9 + 0.18 * abs(ndl));
  vec3 c = mix(face, rev, back);
  c = mix(c, mix(c, vec3(1.0, 0.97, 0.9), 0.42), (1.0 - smoothstep(0.0, 0.36, v)) * (1.0 - leaf));   /* base plus pâle */
  c *= mix(1.0, 0.93, smoothstep(0.25, 0.5, abs(u)) * (1.0 - leaf));                                  /* bords un peu plus soutenus */
  vec3 hn = nn * (back > 0.5 ? -1.0 : 1.0);
  vSpec = pow(max(dot(reflect(-Ld, hn), vec3(0.0, 0.0, 1.0)), 0.0), 16.0) * mix(0.16, 0.08, leaf);

  if (uShadow > 0.5) P += vec2(9.0, 16.0) * uSize * (0.6 + scale * 0.4);
  gl_Position = vec4(P.x / uView.x * 2.0 - 1.0, 1.0 - P.y / uView.y * 2.0, 0.0, 1.0);
  vec2 cell = vec2(mod(aType, 2.0), floor(aType / 2.0)) * 0.5;
  vTex = cell + 0.004 + vec2(aGrid.x, 1.0 - aGrid.y) * 0.492;
  vCol = c;
  vA = alpha;
}`;

  const FS_PETAL = `#version 300 es
precision highp float;
uniform sampler2D uAtlas; uniform float uShadow;
in vec2 vTex; in vec3 vCol; in float vA; in float vSpec;
out vec4 o;
void main() {
  if (uShadow > 0.5) {
    float s = textureLod(uAtlas, vTex, 3.0).a * vA * 0.15;
    if (s < 0.004) discard;
    o = vec4(vec3(0.16, 0.04, 0.09) * s, s);
    return;
  }
  vec4 tx = texture(uAtlas, vTex);
  float a = tx.a * vA;
  if (a < 0.02) discard;
  vec3 shade = tx.rgb / max(tx.a, 0.001);          /* planche prémultipliée : aucun liseré sombre au bord */
  vec3 c = vCol * shade + vSpec;
  o = vec4(c * a, a);
}`;

  const REL = { A: 0.9, B: 0.72, N: 0.14 };
  const GRID = [6, 8];                    // quadrillage d’un pétale (colonnes × rangées)
  const nz = (x, y) => Math.sin(x * 0.013 + Math.sin(y * 0.021) * 1.7) * Math.cos(y * 0.017 - Math.sin(x * 0.011) * 1.3);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const eo = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Générateur pseudo-aléatoire reproductible (même bouquet à chaque visite)
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  /* Planche de 4 pétales dessinés (512 × 512, en niveaux de gris : la couleur vient de la photo)
     0 pétale de rose · 1 pétale d’œillet frangé · 2 pétale de lisianthus · 3 feuille d’eucalyptus */
  function petalAtlas() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S * 2;
    const x = c.getContext('2d');
    const rand = rng(42);

    const rose = new Path2D();
    rose.moveTo(128, 252);
    rose.bezierCurveTo(78, 252, 14, 196, 14, 118);
    rose.bezierCurveTo(16, 52, 58, 14, 104, 14);
    rose.quadraticCurveTo(122, 15, 128, 27);
    rose.quadraticCurveTo(134, 15, 152, 14);
    rose.bezierCurveTo(198, 14, 240, 52, 242, 112);
    rose.bezierCurveTo(242, 196, 178, 252, 128, 252);

    const carn = new Path2D();
    carn.moveTo(128, 252);
    carn.bezierCurveTo(98, 236, 32, 146, 20, 76);
    // bord ondulé tout en douceur (festons arrondis, pas de dents)
    const N = 9;
    const edge = (k) => [20 + k * 216, 70 - Math.sin(Math.PI * k) * 46];
    for (let i = 0; i < N; i++) {
      const [x1, y1] = edge((i + 1) / N), [xm, ym] = edge((i + 0.5) / N);
      carn.quadraticCurveTo(xm, ym - 9 - rand() * 6, x1, y1);
    }
    carn.bezierCurveTo(224, 146, 158, 236, 128, 252);

    const lis = new Path2D();
    lis.moveTo(128, 252);
    lis.bezierCurveTo(84, 252, 30, 170, 32, 100);
    lis.bezierCurveTo(34, 36, 84, 8, 128, 8);
    lis.bezierCurveTo(172, 8, 222, 36, 224, 96);
    lis.bezierCurveTo(226, 170, 172, 252, 128, 252);

    const leaf = new Path2D();
    leaf.moveTo(128, 232);
    leaf.bezierCurveTo(54, 228, 18, 168, 22, 112);
    leaf.bezierCurveTo(28, 54, 80, 20, 128, 12);
    leaf.bezierCurveTo(176, 20, 228, 54, 234, 112);
    leaf.bezierCurveTo(238, 168, 202, 228, 128, 232);

    const draw = (ox, oy, path, o) => {
      x.save();
      x.translate(ox, oy);
      if (o.stem) { x.fillStyle = '#bdbdbd'; x.fillRect(125, 224, 6, 31); }
      const g = x.createRadialGradient(128, 92, 8, 128, 122, 175);
      g.addColorStop(0, o.light);
      g.addColorStop(0.55, o.mid);
      g.addColorStop(1, o.dark);
      x.fillStyle = g;
      x.fill(path);
      x.save();
      x.clip(path);
      // base plus soutenue, là où le pétale tenait à la fleur
      const b = x.createLinearGradient(0, 256, 0, 140);
      b.addColorStop(0, 'rgba(0,0,0,' + o.base + ')');
      b.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = b;
      x.fillRect(0, 0, 256, 256);
      // nervures en éventail (ou nervure centrale pour la feuille)
      for (let i = 0; i < o.veins; i++) {
        const k = o.veins > 1 ? (i / (o.veins - 1)) * 2 - 1 : 0;
        const ex = 128 + k * o.spread, ey = o.top + Math.abs(k) * 34;
        x.beginPath();
        x.moveTo(128 + k * 5, 250);
        x.quadraticCurveTo(128 + k * o.spread * 0.5, 150, ex, ey);
        x.strokeStyle = 'rgba(0,0,0,' + (o.veinA + rand() * 0.03).toFixed(3) + ')';
        x.lineWidth = 0.9 + rand() * 0.9;
        x.stroke();
        x.translate(1.6, 0);
        x.strokeStyle = 'rgba(255,255,255,0.08)';
        x.lineWidth = 1;
        x.stroke();
        x.translate(-1.6, 0);
      }
      if (o.midrib) {
        x.beginPath(); x.moveTo(128, 236); x.quadraticCurveTo(124, 130, 128, 26);
        x.strokeStyle = 'rgba(255,255,255,0.32)'; x.lineWidth = 3; x.stroke();
        for (let i = 1; i < 6; i++) {
          const y0 = 220 - i * 32;
          [-1, 1].forEach((sd) => { x.beginPath(); x.moveTo(127, y0); x.quadraticCurveTo(128 + sd * 40, y0 - 20, 128 + sd * 86, y0 - 46); x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1.4; x.stroke(); });
        }
      }
      // bord : léger creux ombré, puis liseré clair (le bord d’un pétale laisse passer la lumière)
      x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.02)'; x.stroke(path);
      x.lineWidth = 3.5; x.strokeStyle = 'rgba(255,255,255,' + o.rim + ')'; x.stroke(path);
      // reflet doux
      const hl = x.createRadialGradient(104, 86, 0, 104, 86, 90);
      hl.addColorStop(0, 'rgba(255,255,255,' + o.gloss + ')');
      hl.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = hl;
      x.fillRect(0, 0, 256, 256);
      // grain de la matière
      for (let i = 0; i < 2600; i++) {
        x.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.022)' : 'rgba(255,255,255,0.05)';
        x.fillRect(rand() * 256, rand() * 256, 1.3, 1.3);
      }
      x.restore();
      x.restore();
    };
    draw(0, 0, rose, { light: '#ffffff', mid: '#f6f6f6', dark: '#ebebeb', base: 0.07, veins: 15, spread: 112, top: 30, veinA: 0.05, rim: 0.4, gloss: 0.22 });
    draw(S, 0, carn, { light: '#ffffff', mid: '#f6f6f6', dark: '#ececec', base: 0.06, veins: 21, spread: 112, top: 34, veinA: 0.06, rim: 0.35, gloss: 0.16 });
    draw(0, S, lis, { light: '#ffffff', mid: '#f5f5f5', dark: '#e8e8e8', base: 0.07, veins: 13, spread: 94, top: 20, veinA: 0.045, rim: 0.42, gloss: 0.24 });
    draw(S, S, leaf, { light: '#f6f6f6', mid: '#e6e6e6', dark: '#cbcbcb', base: 0.05, veins: 0, spread: 0, top: 0, veinA: 0, rim: 0.28, gloss: 0.3, midrib: true, stem: true });
    return c;
  }

  // Teinte → tuile : 0 rose (bouquets), 1 vert (entreprises), 2 mauve (événements), 3 pêche (livraison)
  function family(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const s = max ? d / max : 0;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    if (s < 0.14) return 3;                       // blancs, crème
    if (h >= 70 && h < 185) return 1;             // feuillage, eucalyptus
    if (h >= 250 && h < 318) return 2;            // lisianthus, mauves
    if (h >= 18 && h < 70) return 3;              // pêche, abricot
    return 0;                                     // roses, framboise
  }
  /* Couleur de vraie fleur la plus proche de la photo (les couleurs brutes du reportage sont
     voilées par le contre-jour : des pétales de cette couleur paraîtraient sales). */
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const PAL = {
    blush: ['#f7c4d1', '#f4b3c4', '#fad3dc'],      // roses poudrées
    fuchsia: ['#e07fa5', '#d76896', '#e993b4'],    // roses vives, pivoines
    lilac: ['#d2b8ea', '#c4a3e2', '#dcc8f0'],      // lisianthus mauves
    white: ['#fbf4ef', '#f6ece4', '#fff8f4'],      // œillets et roses blanches
    peach: ['#f9cdb6', '#f6bea3', '#fbd9c6'],      // roses pêche
    leaf: ['#a6bcaf', '#98b2a4', '#b3c7ba'],       // eucalyptus
  };
  function paletteFor(r, g, b, fam, rnd) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max ? (max - min) / max : 0, lum = 0.3 * r + 0.59 * g + 0.11 * b;
    let set;
    if (fam === 1) set = PAL.leaf;
    else if (fam === 2) set = PAL.lilac;
    else if (fam === 0) set = sat > 0.3 && lum < 0.62 ? PAL.fuchsia : PAL.blush;
    else set = sat > 0.16 ? PAL.peach : (rnd < 0.45 ? PAL.blush : PAL.white);   // le bouquet est pastel : une partie des blancs rosit
    const base = hex(set[Math.floor(rnd * set.length) % set.length]);
    // une pointe de la couleur d’origine, pour garder le lien avec le bouquet
    return base.map((v, i) => clamp(v * 0.85 + [r, g, b][i] * 0.15 + 0.03, 0, 1));
  }
  // Forme du pétale selon sa couleur
  function shapeFor(fam, r) {
    if (fam === 1) return 3;                      // feuille d’eucalyptus
    if (fam === 2) return r < 0.8 ? 2 : 0;        // lisianthus
    if (fam === 0) return r < 0.7 ? 0 : 1;        // rose, parfois œillet
    return r < 0.6 ? 1 : 0;                       // œillet blanc ou pétale de rose crème
  }

  function create(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;

    const photo = program(gl, VS_PHOTO, FS_PHOTO);
    const petal = program(gl, VS_PETAL, FS_PETAL);

    // Quad plein écran (photo)
    const vaoPhoto = gl.createVertexArray();
    gl.bindVertexArray(vaoPhoto);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const locPos = gl.getAttribLocation(photo.p, 'aPos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const texImg = gl.createTexture();
    const texAtlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texAtlas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);      // prémultipliée : bords nets, sans liseré sombre
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, petalAtlas());
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Maillage d’un pétale (partagé par toutes les instances)
    const vaoPetal = gl.createVertexArray();
    const bufs = {};
    const grid = [], idx = [];
    for (let j = 0; j <= GRID[1]; j++) for (let i = 0; i <= GRID[0]; i++) grid.push(i / GRID[0], j / GRID[1]);
    for (let j = 0; j < GRID[1]; j++) for (let i = 0; i < GRID[0]; i++) {
      const a = j * (GRID[0] + 1) + i, b = a + 1, c2 = a + GRID[0] + 1, d2 = c2 + 1;
      idx.push(a, b, c2, b, d2, c2);
    }
    const nIdx = idx.length;
    let count = 0, teasers = 0;
    let petals = [];
    let src = null;           // { img, bouquet: [x, y, rx, ry] }
    const st = { W: 1, H: 1, dpr: 1, cover: [0, 0, 1, 1], C: [0, 0], R: [1, 1], deMax: 2, size: 1, end: 2.8 };
    let tiles = [];

    function attr(name, size, data, divisor) {
      const loc = gl.getAttribLocation(petal.p, name);
      if (!bufs[name]) bufs[name] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, divisor);
    }
    gl.bindVertexArray(vaoPetal);
    attr('aGrid', 2, new Float32Array(grid), 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // Pétales répartis sur tout le bouquet (espacés régulièrement), couleur moyenne de la photo à cet endroit
    function sample(img, bouquet, n) {
      const sw = 220, sh = Math.round(220 * img.naturalHeight / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, sw, sh);
      const px = x.getImageData(0, 0, sw, sh).data;
      const at = (u, v) => {
        // moyenne 3 × 3 pixels : la couleur d’un pétale, pas celle d’un détail
        let r = 0, g = 0, b = 0, k = 0;
        const cx = Math.floor(u * (sw - 1)), cy = Math.floor(v * (sh - 1));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = clamp(cx + dx, 0, sw - 1), yy = clamp(cy + dy, 0, sh - 1), i = (yy * sw + xx) * 4;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; k++;
        }
        return [r / k / 255, g / k / 255, b / k / 255];
      };
      const [bx, by, brx, bry] = bouquet;
      const ax = img.naturalWidth / img.naturalHeight;
      const minD = Math.sqrt((Math.PI * brx * ax * bry * 1.15 * 1.15) / n) * 0.82;
      const rand = rng(160);
      const out = [];
      let guard = 0;
      while (out.length < n && guard++ < n * 120) {
        const relax = guard > n * 80 ? 0.6 : 1;
        const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 1.15;
        const u = bx + Math.cos(a) * rr * brx, v = by + Math.sin(a) * rr * bry;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        if (out.some((p) => Math.hypot((p.u - u) * ax, p.v - v) < minD * relax)) continue;
        const [r, g, b] = at(u, v);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0, lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const brown = r > g && g > b && lum < 0.55 && (r - b) > 0.12 ? 0.08 : 1;   // papier kraft : presque jamais
        const fam0 = family(r, g, b);
        const w = (1 - sstep(0.85, 1.15, rr)) * (0.35 + sat * 1.4) * (lum < 0.3 ? 0.02 : 1) * brown * (fam0 === 1 ? 0.4 : 1);   // un peu de feuillage, surtout des fleurs
        if (rand() > w) continue;
        const fam = fam0;
        out.push({ u, v, col: [r, g, b], pal: paletteFor(r, g, b, fam, rand()), fam, type: shapeFor(fam, rand()), rnd: [rand(), rand(), rand(), rand()], rnd2: [rand(), rand(), rand(), rand()], dur: 1.45 + rand() * 0.5 });
      }
      return out;
    }

    function load(img, bouquet) {
      src = { img, bouquet };
      gl.bindTexture(gl.TEXTURE_2D, texImg);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const area = canvas.clientWidth * canvas.clientHeight;
      const n = Math.round(clamp(area / 3400, 230, 420));
      teasers = 7;
      petals = sample(img, bouquet, n + teasers);
      count = petals.length;
      gl.bindVertexArray(vaoPetal);
      attr('aUv', 2, new Float32Array(petals.flatMap((p) => [p.u, p.v])), 1);
      attr('aCol', 3, new Float32Array(petals.flatMap((p) => p.col)), 1);
      attr('aPal', 3, new Float32Array(petals.flatMap((p) => p.pal)), 1);
      attr('aRnd', 4, new Float32Array(petals.flatMap((p) => p.rnd)), 1);
      attr('aRnd2', 4, new Float32Array(petals.flatMap((p) => p.rnd2)), 1);
      attr('aType', 1, new Float32Array(petals.map((p) => p.type)), 1);
      attr('aMode', 1, new Float32Array(petals.map((_, i) => (i < teasers ? 1 : 0))), 1);
      gl.bindVertexArray(null);
    }

    // Mise en page : taille du canevas, recadrage « cover », cibles des pétales (tuiles)
    function layout(tileRects) {
      const W = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const img = src.img, iw = img.naturalWidth, ih = img.naturalHeight;
      const s = Math.max(W / iw, H / ih);
      const cw = iw * s, ch = ih * s, ox = (W - cw) / 2, oy = (H - ch) / 2;
      const [bx, by, brx, bry] = src.bouquet;
      const C = [ox + bx * cw, oy + by * ch], R = [brx * cw, bry * ch];
      const de = (x, y) => Math.hypot((x - C[0]) / R[0], (y - C[1]) / R[1]);
      Object.assign(st, { W, H, dpr, cover: [ox, oy, cw, ch], C, R, deMax: Math.max(de(0, 0), de(W, 0), de(0, H), de(W, H)), size: clamp(Math.min(W, H) / 800, 0.75, 1.3) });
      const rel = (x, y) => {
        const d = de(x, y);
        const t = d < 1 ? REL.A * Math.pow(d, 1.35) : REL.A + REL.B * Math.pow(clamp((d - 1) / Math.max(st.deMax - 1, 0.001), 0, 1), 0.9);
        return Math.max(0, t + REL.N * nz(x, y));
      };

      // Les pétales choisissent la tuile de leur couleur (une tuile sous l’écran, sur mobile, reste une cible)
      tiles = (tileRects || []).map((t) => ({ ...t, visible: t.y < H - 30 && t.y + t.h > 30, reach: t.y + t.h > 30 && t.y < H * 1.6, list: [] }));
      const reach = tiles.filter((t) => t.reach);
      const tgt = new Float32Array(count * 2), tcol = new Float32Array(count * 3), ld = new Float32Array(count * 2);
      const rand = rng(7);
      let end = 1.9;
      petals.forEach((p, i) => {
        const x = ox + p.u * cw, y = oy + p.v * ch;
        if (i < teasers) {
          ld[i * 2] = 0.3 + (i / teasers) * 2.6 + rand() * 0.2;
          ld[i * 2 + 1] = 3.0 + rand() * 1.2;
          tgt[i * 2] = x; tgt[i * 2 + 1] = y;
          tcol.set(p.col, i * 3);
          return;
        }
        const L = rel(x, y);
        ld[i * 2] = L;
        ld[i * 2 + 1] = p.dur;
        end = Math.max(end, L + p.dur);
        let tile = null;
        if (reach.length && p.rnd2[3] > 0.2) {
          tile = tiles[p.fam] && tiles[p.fam].reach ? tiles[p.fam] : reach[Math.floor(p.rnd[3] * reach.length)];
        }
        if (tile) { tile.list.push({ i, arrive: L + p.dur * 0.95 }); tcol.set(tile.color, i * 3); }
        else {
          // emportés par le tourbillon, hors de l’écran
          const out = Math.hypot(W, H) * 0.75, ang = p.rnd[2] * Math.PI * 2;
          tgt[i * 2] = C[0] + Math.cos(ang) * out;
          tgt[i * 2 + 1] = C[1] + Math.sin(ang) * out;
          tcol.set(p.col, i * 3);
        }
      });
      // Dans chaque tuile : les premiers pétales arrivent au centre, les suivants plus loin
      tiles.forEach((t) => {
        t.list.sort((a, b) => a.arrive - b.arrive);
        const n = t.list.length;
        t.list.forEach((e, k) => {
          const rr = Math.sqrt((k + 0.5) / Math.max(n, 1)) * 0.42, a = rand() * Math.PI * 2;
          tgt[e.i * 2] = t.x + t.w / 2 + Math.cos(a) * rr * t.w;
          tgt[e.i * 2 + 1] = t.y + t.h / 2 + Math.sin(a) * rr * t.h;
        });
        t.from = n ? t.list[Math.floor(n * 0.2)].arrive : 1.4;
        t.to = n ? t.list[Math.min(n - 1, Math.floor(n * 0.95))].arrive + 0.1 : 2.4;
        if (n < 6) { t.from = 1.3; t.to = 2.3; }
        t.list = [];
      });
      st.end = end + 0.05;
      gl.bindVertexArray(vaoPetal);
      attr('aTgt', 2, tgt, 1);
      attr('aTCol', 3, tcol, 1);
      attr('aLD', 2, ld, 1);
      gl.bindVertexArray(null);
    }

    // Remplissage d’une tuile (0 → 1) au temps P
    function tileFill(i, P) {
      const t = tiles[i];
      if (!t) return P > 2 ? 1 : 0;
      return sstep(t.from, t.to, P);
    }

    function render(P, idle, z0) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const zNow = z0 + (P > 0 ? 0.03 * eo(P / 1.5) : 0);
      const common = (u) => {
        gl.uniform2f(u.uView, st.W, st.H);
        gl.uniform4f(u.uCover, st.cover[0], st.cover[1], st.cover[2], st.cover[3]);
        gl.uniform2f(u.uC, st.C[0], st.C[1]);
        gl.uniform1f(u.uP, P);
      };
      // 1. la photo, qui se dissout du cœur du bouquet vers les bords
      if (P < REL.A + REL.B + REL.N + 0.32) {
        gl.useProgram(photo.p);
        common(photo.u);
        gl.uniform1f(photo.u.uDpr, st.dpr);
        gl.uniform2f(photo.u.uR, st.R[0], st.R[1]);
        gl.uniform1f(photo.u.uDeMax, st.deMax);
        gl.uniform3f(photo.u.uRel, REL.A, REL.B, REL.N);
        gl.uniform1f(photo.u.uZ, zNow);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texImg);
        gl.uniform1i(photo.u.uImg, 0);
        gl.bindVertexArray(vaoPhoto);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      // 2. les pétales : d’abord leurs ombres, puis les pétales
      if (P < st.end || idle < 8) {
        gl.useProgram(petal.p);
        common(petal.u);
        gl.uniform1f(petal.u.uIdle, idle);
        gl.uniform1f(petal.u.uZ0, z0);
        gl.uniform1f(petal.u.uSize, st.size);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texAtlas);
        gl.uniform1i(petal.u.uAtlas, 1);
        gl.bindVertexArray(vaoPetal);
        gl.uniform1f(petal.u.uShadow, 1);
        gl.drawElementsInstanced(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0, count);
        gl.uniform1f(petal.u.uShadow, 0);
        gl.drawElementsInstanced(gl.TRIANGLES, nIdx, gl.UNSIGNED_SHORT, 0, count);
      }
      gl.bindVertexArray(null);
    }

    function clear() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    return { load, layout, render, clear, tileFill, get end() { return st.end; }, get count() { return count; }, state: st, lost: () => gl.isContextLost() };
  }

  window.RNBloom = { create };
})();
