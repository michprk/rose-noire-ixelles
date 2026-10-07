/* ==========================================================================
   Rose Noire — « le bouquet devient le site » (WebGL 2, sans bibliothèque)

   La photo du héros (Sophie et son bouquet) est dessinée sur un canevas WebGL.
   Au signal, le bouquet se décompose : quelques milliers de pétales, chacun de
   la vraie couleur de la photo à cet endroit, se détachent du cœur du bouquet
   vers l’extérieur, tourbillonnent autour de lui, puis volent chacun vers la
   tuile du site qui a sa couleur (rose → bouquets, vert → entreprises, mauve →
   événements, pêche → livraison) ; la photo se dissout derrière eux.

   Tout est fonction d’un seul temps P (en secondes) : l’animation peut donc
   être jouée dans les deux sens (en remontant, le bouquet se recompose).
   API : RNBloom.create(canvas) → { load, layout, render, tileFill, end }
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
  float a = smoothstep(0.0, 0.07, T - uP);
  if (a <= 0.0) discard;
  vec2 q = uC + (p - uC) / uZ;
  vec3 c = texture(uImg, (q - uCover.xy) / uCover.zw).rgb;
  float rim = (1.0 - smoothstep(0.0, 0.07, T - uP)) * step(0.0, uP);
  c = mix(c, vec3(1.0, 0.92, 0.95), rim * 0.22);
  o = vec4(c * a, a);
}`;

  const VS_PETAL = `#version 300 es
precision highp float;
in vec2 aCorner; in vec2 aUv; in vec3 aCol; in vec4 aRnd; in vec4 aRnd2; in vec2 aTgt; in vec3 aTCol; in vec2 aLD; in float aMode;
uniform vec2 uView; uniform vec4 uCover; uniform vec2 uC; uniform float uP; uniform float uIdle; uniform float uZ0; uniform float uSize;
out vec2 vUv; out vec3 vCol; out float vA;
const float PI = 3.14159265;
float eo(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }
float eio(float x) { x = clamp(x, 0.0, 1.0); return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
/* couleur du pétale : celle de la photo, plus franche et plus lumineuse une fois détaché */
vec3 vivid(vec3 c) {
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  vec3 v = clamp(mix(vec3(l), c, 1.9), 0.0, 1.0);
  v = mix(v, vec3(1.0, 0.97, 0.98), 0.1) + vec3(max(0.0, 0.62 - l) * 0.85);   /* les tons sombres (papier kraft, ombres) deviennent pastel */
  return clamp(v, 0.0, 1.0);
}
void main() {
  vec2 O = uCover.xy + aUv * uCover.zw;
  float spin = aRnd.y < 0.5 ? -1.0 : 1.0;
  float sz = mix(6.5, 14.0, aRnd.x * aRnd.x) * uSize;
  float alpha = 1.0, t;
  vec2 pos; vec3 col = aCol;
  if (aMode < 0.5) {
    float L = aLD.x, D = aLD.y;
    t = (uP - L) / D;
    if (t <= 0.0 || t >= 1.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
    vec2 Oz = uC + (O - uC) * (uZ0 + 0.03 * eo(L / 1.5));
    float e1 = eo(t / 0.62);
    float ang = spin * (0.6 + aRnd.z * 1.8) * e1;                       /* le bouquet tourne en s’ouvrant */
    vec2 S = uC + rot(ang) * (Oz - uC) * (1.0 + 0.45 * e1)
           + vec2((aRnd.w - 0.3) * 90.0 * e1, -(30.0 + aRnd2.x * 110.0) * e1);
    float k = eio((t - 0.24) / 0.76);
    vec2 dv = aTgt - S;
    vec2 nrm = normalize(vec2(-dv.y, dv.x) + 0.0001);
    pos = mix(S, aTgt, k) + nrm * sin(PI * k) * (aRnd2.y - 0.5) * 170.0;
    col = mix(mix(aCol, vivid(aCol), smoothstep(0.02, 0.3, t)), aTCol, smoothstep(0.45, 0.96, t));
    sz *= mix(0.55, 1.0, smoothstep(0.0, 0.08, t)) * (1.0 - smoothstep(0.84, 1.0, t));
  } else {
    float L = aLD.x, D = aLD.y;                                          /* pétales qui s’envolent avant le signal */
    t = (uIdle - L) / D;
    if (t <= 0.0 || t >= 1.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
    vec2 Oz = uC + (O - uC) * uZ0;
    pos = Oz + vec2(170.0 * t * (0.6 + aRnd.z) + 26.0 * sin(t * 5.0 + aRnd.w * 6.283), -70.0 * t + 190.0 * t * t);
    alpha = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.7, 1.0, t)) * (1.0 - smoothstep(-0.19, 0.1, uP));
    sz *= 1.25;
    col = mix(aCol, vivid(aCol), smoothstep(0.0, 0.25, t));
  }
  float r = aRnd2.z * 6.283 + t * (3.0 + aRnd2.w * 7.0) * spin;
  float fl = cos(t * (7.0 + aRnd.x * 9.0) + aRnd.w * 6.283);              /* le pétale se retourne */
  vec2 c = rot(r) * (aCorner * vec2(sz * mix(0.22, 1.0, abs(fl)), sz));
  vec2 P = pos + c;
  gl_Position = vec4(P.x / uView.x * 2.0 - 1.0, 1.0 - P.y / uView.y * 2.0, 0.0, 1.0);
  vUv = aCorner * 0.5 + 0.5;
  vCol = col * (fl < 0.0 ? 0.84 : 1.0);
  vA = alpha;
}`;

  const FS_PETAL = `#version 300 es
precision mediump float;
uniform sampler2D uPetal;
in vec2 vUv; in vec3 vCol; in float vA;
out vec4 o;
void main() {
  vec4 tx = texture(uPetal, vec2(vUv.x, 1.0 - vUv.y));
  float a = tx.a * vA;
  if (a < 0.01) discard;
  o = vec4(vCol * tx.rgb * vA, a);
}`;

  const REL = { A: 0.9, B: 0.72, N: 0.14 };
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

  // Forme d’un pétale (texture 64 × 64 : dégradé de lumière + nervure)
  function petalCanvas() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const path = new Path2D();
    path.moveTo(32, 62);
    path.bezierCurveTo(7, 50, 3, 18, 19, 6);
    path.quadraticCurveTo(32, 13, 45, 6);
    path.bezierCurveTo(61, 18, 57, 50, 32, 62);
    const g = x.createRadialGradient(30, 30, 2, 32, 36, 34);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.65, '#f2f2f2');
    g.addColorStop(1, '#c9c9c9');
    x.fillStyle = g;
    x.fill(path);
    x.strokeStyle = 'rgba(0,0,0,0.12)';
    x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(32, 58); x.quadraticCurveTo(30, 36, 32, 16); x.stroke();
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
    if (s < 0.14) return 3;                       // blancs, crème, papier kraft
    if (h >= 70 && h < 185) return 1;             // feuillage, eucalyptus
    if (h >= 250 && h < 318) return 2;            // lisianthus, mauves
    if (h >= 18 && h < 70) return 3;              // pêche, abricot
    return 0;                                     // roses, framboise
  }

  function create(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
    if (!gl) return null;

    const photo = program(gl, VS_PHOTO, FS_PHOTO);
    const petal = program(gl, VS_PETAL, FS_PETAL);

    // Quad plein écran (photo) et quad de pétale (instancié)
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vaoPhoto = gl.createVertexArray();
    gl.bindVertexArray(vaoPhoto);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const locPos = gl.getAttribLocation(photo.p, 'aPos');
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const texImg = gl.createTexture();
    const texPetal = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texPetal);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, petalCanvas());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    const vaoPetal = gl.createVertexArray();
    const bufs = {};
    let count = 0, teasers = 0;
    let petals = [];          // données CPU (origine, couleur, temps…)
    let src = null;           // { img, bouquet: [x, y, rx, ry] }
    const st = { W: 1, H: 1, dpr: 1, cover: [0, 0, 1, 1], C: [0, 0], R: [1, 1], deMax: 2, size: 1, end: 2.6 };
    let tiles = [];           // { x, y, w, h, color: [r,g,b], visible, from, to }

    function attr(name, size, data, divisor, usage) {
      const loc = gl.getAttribLocation(petal.p, name);
      if (!bufs[name]) bufs[name] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc, divisor);
    }

    // Échantillonne les pétales dans le bouquet, pondérés par la couleur (les fleurs plus que le papier)
    function sample(img, bouquet, n) {
      const sw = 220, sh = Math.round(220 * img.naturalHeight / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, sw, sh);
      const px = x.getImageData(0, 0, sw, sh).data;
      const [bx, by, brx, bry] = bouquet;
      const rand = rng(160);
      const out = [];
      let guard = 0;
      while (out.length < n && guard++ < n * 60) {
        const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 1.22;
        const u = bx + Math.cos(a) * rr * brx, v = by + Math.sin(a) * rr * bry;
        if (u < 0 || u > 1 || v < 0 || v > 1) continue;
        const i = (Math.floor(v * (sh - 1)) * sw + Math.floor(u * (sw - 1))) * 4;
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0, lum = 0.3 * r + 0.59 * g + 0.11 * b;
        const brown = r > g && g > b && lum < 0.55 && (r - b) > 0.12 ? 0.22 : 1;   // papier kraft : moins de pétales
        const w = (1 - sstep(0.8, 1.22, rr)) * (0.08 + sat * 2.4) * (lum < 0.22 ? 0.03 : 1) * brown;
        if (rand() > w / 1.4) continue;
        // couleur exacte de la photo (le shader l’avive une fois le pétale détaché)
        out.push({ u, v, col: [r, g, b], fam: family(r, g, b), rnd: [rand(), rand(), rand(), rand()], rnd2: [rand(), rand(), rand(), rand()], dur: 1.15 + rand() * 0.45 });
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
      const n = Math.round(clamp(area / 420, 900, 3200));
      teasers = 18;
      petals = sample(img, bouquet, n + teasers);
      count = petals.length;
      gl.bindVertexArray(vaoPetal);
      attr('aCorner', 2, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 0);
      attr('aUv', 2, new Float32Array(petals.flatMap((p) => [p.u, p.v])), 1);
      attr('aCol', 3, new Float32Array(petals.flatMap((p) => p.col)), 1);
      attr('aRnd', 4, new Float32Array(petals.flatMap((p) => p.rnd)), 1);
      attr('aRnd2', 4, new Float32Array(petals.flatMap((p) => p.rnd2)), 1);
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
      Object.assign(st, { W, H, dpr, cover: [ox, oy, cw, ch], C, R, deMax: Math.max(de(0, 0), de(W, 0), de(0, H), de(W, H)), size: clamp(Math.min(W, H) / 820, 0.64, 1.25) });
      const rel = (x, y) => {
        const d = de(x, y);
        const t = d < 1 ? REL.A * Math.pow(d, 1.35) : REL.A + REL.B * Math.pow(clamp((d - 1) / Math.max(st.deMax - 1, 0.001), 0, 1), 0.9);
        return Math.max(0, t + REL.N * nz(x, y));
      };

      // Tuiles visibles dans le canevas ; les pétales choisissent la tuile de leur couleur
      tiles = (tileRects || []).map((t) => ({ ...t, visible: t.y < H - 30 && t.y + t.h > 30, reach: t.y + t.h > 30 && t.y < H * 1.6, list: [] }));
      const reach = tiles.filter((t) => t.reach);
      const tgt = new Float32Array(count * 2), tcol = new Float32Array(count * 3), ld = new Float32Array(count * 2);
      const rand = rng(7);
      let end = 1.9;
      petals.forEach((p, i) => {
        const x = ox + p.u * cw, y = oy + p.v * ch;
        if (i < teasers) {
          ld[i * 2] = 0.25 + (i / teasers) * 3.4 + rand() * 0.2;
          ld[i * 2 + 1] = 2.6 + rand() * 1.2;
          tgt[i * 2] = x; tgt[i * 2 + 1] = y;
          tcol.set(p.col, i * 3);
          return;
        }
        const L = rel(x, y);
        ld[i * 2] = L;
        ld[i * 2 + 1] = p.dur;
        end = Math.max(end, L + p.dur);
        let tile = null;
        // (une tuile sous l’écran, sur mobile, reste une cible : les pétales filent vers le bas et invitent à défiler)
        if (reach.length && p.rnd2[3] > 0.26) {
          tile = tiles[p.fam] && tiles[p.fam].reach ? tiles[p.fam] : reach[Math.floor(p.rnd[3] * reach.length)];
        }
        if (tile) { tile.list.push({ i, arrive: L + p.dur * 0.9 }); tcol.set(tile.color, i * 3); }
        else {
          // emportés par le vent, hors de l’écran
          tgt[i * 2] = W * (0.55 + p.rnd[2] * 0.6);
          tgt[i * 2 + 1] = -80 - p.rnd2[0] * 260;
          tcol.set(p.col, i * 3);
        }
      });
      // Dans chaque tuile : les premiers pétales arrivent au centre, les suivants plus loin
      tiles.forEach((t) => {
        t.list.sort((a, b) => a.arrive - b.arrive);
        const n = t.list.length;
        t.list.forEach((e, k) => {
          const rr = Math.sqrt((k + 0.5) / Math.max(n, 1)) * 0.46, a = rand() * Math.PI * 2;
          tgt[e.i * 2] = t.x + t.w / 2 + Math.cos(a) * rr * t.w;
          tgt[e.i * 2 + 1] = t.y + t.h / 2 + Math.sin(a) * rr * t.h;
        });
        t.from = n ? t.list[Math.floor(n * 0.08)].arrive : 1.2;
        t.to = n ? t.list[Math.floor(n * 0.9)].arrive : 2.2;
        if (n < 12) { t.from = 1.1; t.to = 2.1; }
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
      if (P < REL.A + REL.B + REL.N + 0.15) {
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
      // 2. les pétales
      if (P < st.end || idle < 6) {
        gl.useProgram(petal.p);
        common(petal.u);
        gl.uniform1f(petal.u.uIdle, idle);
        gl.uniform1f(petal.u.uZ0, z0);
        gl.uniform1f(petal.u.uSize, st.size);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texPetal);
        gl.uniform1i(petal.u.uPetal, 1);
        gl.bindVertexArray(vaoPetal);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
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
