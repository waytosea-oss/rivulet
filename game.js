/* Rivulet — draw, lean, and let real water do the rest. */
(function () {
  'use strict';
  var LEVELS = window.RIVULET.LEVELS;
  var CHAPTERS = window.RIVULET.CHAPTERS;
  var CELL = WaterSim.CELL, COLS = WaterSim.COLS, ROWS = WaterSim.ROWS;
  var BW = WaterSim.BW, BH = WaterSim.BH;
  var params = new URLSearchParams(location.search);
  var SAVE_KEY = 'rivulet-v4';

  var bg = document.getElementById('bg');
  var fx = document.getElementById('fx');
  var g = bg.getContext('2d');
  var o = fx.getContext('2d');
  var view = { x: 40, y: 80, bw: 300, bh: 400, W: 800, H: 600 };
  var screen = 'boot';
  var save = loadSave();
  if (params.get('unlock') === '1') save.unlocked = LEVELS.length;
  var qualityMode = save.quality || 'auto';
  var sim = null, level = null, demo = false;
  var paused = false, winLock = false, failLock = false;
  var winHold = 0, coachOn = false;
  var drag = null, last = performance.now(), hudTick = 0;
  var sparks = [];
  var lastFill = [0, 0, 0];
  var booted = false, fluidWait = performance.now();
  var lean = 0, leanBtn = 0;
  var COLORS = ['#3a94f0', '#f0c431', '#e45b86', '#3cbe6a', '#f08a32', '#8a62e0', '#6fbf45', '#e25822', '#e2b043'];
  var THEME = {
    teach:   { sky: ['#7eb6de', '#f6d7b0', '#d7b48a'], land: '#6e9a55', land2: '#8fb56e', sun: 'rgba(255,244,214,.95)', sunX: 0.78, mat: 'wood', frame: ['#c49262', '#6b3e22'], soil: ['#f3ddb8', '#e2c08a', '#c49258', '#8d6238'], pebble: '#f6e7cc', root: '#7a4e2c', glow: 'rgba(255,236,190,.28)' },
    float:   { sky: ['#f0a56a', '#f6d7a2', '#7eb4d4'], land: '#3f7d62', land2: '#6aa088', sun: 'rgba(255,228,180,.95)', sunX: 0.22, mat: 'earth', frame: ['#b98962', '#5c4030'], soil: ['#f6c9a0', '#e39a68', '#c47448', '#8a4e34'], pebble: '#f0d2b0', root: '#6a4030', glow: 'rgba(255,210,150,.26)' },
    vessels: { sky: ['#9fb8c9', '#e7d7c8', '#cbb59a'], land: '#7f9a90', land2: '#a8c0b4', sun: 'rgba(255,252,245,.9)', sunX: 0.7, mat: 'rock', frame: ['#c4a888', '#6a5344'], soil: ['#e6e2da', '#c8c6be', '#a8a49c', '#78746c'], pebble: '#f4f1ea', root: '#6a645c', glow: 'rgba(255,252,245,.22)' },
    tilt:    { sky: ['#f0b89a', '#f7e1c8', '#9eb8c8'], land: '#6e8f4e', land2: '#a3b86a', sun: 'rgba(255,236,200,.95)', sunX: 0.8, mat: 'clay', frame: ['#c4844e', '#6a3e24'], soil: ['#f3cbb0', '#e0a078', '#c07848', '#8a4c2c'], pebble: '#f6d8bc', root: '#7a4030', glow: 'rgba(255,220,180,.24)' },
    layers:  { sky: ['#f2c56a', '#f6e2b4', '#e0b888'], land: '#c47a3a', land2: '#e0a060', sun: 'rgba(255,236,170,.95)', sunX: 0.3, mat: 'earth', frame: ['#d09a4a', '#7a4e18'], soil: ['#f8e6b4', '#ecc878', '#d4a048', '#a07830'], pebble: '#fff0c8', root: '#8a5a20', glow: 'rgba(255,230,150,.26)' },
    weight:  { sky: ['#5e6c7a', '#c4b29a', '#8a7562'], land: '#4e463c', land2: '#6a5c4e', sun: 'rgba(240,220,190,.7)', sunX: 0.75, mat: 'rock', frame: ['#8a7560', '#3a3028'], soil: ['#d4c6b4', '#b4a494', '#8a7a68', '#56483c'], pebble: '#e6d8c8', root: '#4a3c30', glow: 'rgba(240,220,190,.16)' },
    ember:   { sky: ['#3a2438', '#c45a3a', '#e8a06a'], land: '#5a3030', land2: '#8a4030', sun: 'rgba(255,160,90,.8)', sunX: 0.82, mat: 'earth', frame: ['#a06040', '#3a241c'], soil: ['#e8b498', '#c87858', '#a04830', '#6a3024'], pebble: '#f0c8a8', root: '#4a2418', glow: 'rgba(255,160,80,.22)' },
    venom:   { sky: ['#1c3330', '#6a9078', '#c9d4b4'], land: '#2c4638', land2: '#4e6a52', sun: 'rgba(210,230,170,.7)', sunX: 0.2, mat: 'earth', frame: ['#6a7058', '#2c3428'], soil: ['#d8e4c8', '#b4c8a4', '#7a9470', '#3e5640'], pebble: '#e4f0d4', root: '#3a4a28', glow: 'rgba(210,230,160,.18)' },
    siphon:  { sky: ['#1a2744', '#3d5a78', '#9aa8b4'], land: '#243444', land2: '#3a5060', sun: 'rgba(210,224,236,.75)', sunX: 0.15, mat: 'rock', frame: ['#8a623c', '#3a2a22'], soil: ['#c5d0da', '#8ea0b0', '#5a7084', '#2e4254'], pebble: '#d5e0ea', root: '#3a4a58', glow: 'rgba(200,220,240,.16)' },
    mist:    { sky: ['#c5d4de', '#e7eef2', '#f4efe6'], land: '#8aa098', land2: '#b7c4bc', sun: 'rgba(255,255,255,.85)', sunX: 0.6, mat: 'rock', frame: ['#b0a498', '#6a645c'], soil: ['#f4f2ec', '#e0e6e8', '#c4d0d4', '#9aabae'], pebble: '#f8f6f2', root: '#8a847c', glow: 'rgba(255,255,255,.3)' },
    mill:    { sky: ['#7eafd0', '#d5e6c4', '#8aaa62'], land: '#5a7a40', land2: '#8aaa58', sun: 'rgba(255,248,220,.95)', sunX: 0.72, mat: 'wood', frame: ['#a86838', '#5a3418'], soil: ['#ead8b0', '#c8b888', '#7a9a58', '#4a6838'], pebble: '#f0e4c4', root: '#5a4028', glow: 'rgba(255,244,200,.24)' },
    sand:    { sky: ['#f0c48a', '#f8e6c4', '#e0b080'], land: '#c4956a', land2: '#e0c090', sun: 'rgba(255,244,210,.95)', sunX: 0.8, mat: 'sand', frame: ['#c08048', '#6a4018'], soil: ['#f8e6c0', '#ecc890', '#d4a868', '#a07840'], pebble: '#fff1d0', root: '#8a5a30', glow: 'rgba(255,236,190,.28)' },
    split:   { sky: ['#6a98b8', '#d5e6ea', '#b7c4a0'], land: '#5a7848', land2: '#8aa868', sun: 'rgba(255,255,255,.9)', sunX: 0.28, mat: 'rock', frame: ['#8a7058', '#3e342c'], soil: ['#e6f0e8', '#c5d6cc', '#8aab98', '#4e6e58'], pebble: '#f2f7f2', root: '#4a5c40', glow: 'rgba(230,245,235,.22)' }
  };
  var scenery = document.createElement('canvas');
  var sg = scenery.getContext('2d');
  var sceneryKey = '';

  function loadSave() {
    var blank = { v: 4, stars: [], best: [], unlocked: 1, sound: true, music: true, quality: 'auto' };
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return blank;
      var o = JSON.parse(raw);
      if (!o || o.v !== 4) return blank;
      o.unlocked = Math.max(1, Math.min(LEVELS.length, o.unlocked || 1));
      o.stars = o.stars || [];
      o.best = o.best || [];
      if (o.sound == null) o.sound = true;
      if (o.music == null) o.music = true;
      if (!o.quality) o.quality = 'auto';
      return o;
    } catch (e) { return blank; }
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  function starCount() {
    var n = 0;
    for (var i = 0; i < LEVELS.length; i++) n += save.stars[i] || 0;
    return n;
  }
  function show(name) {
    screen = name;
    document.body.dataset.screen = name;
    ['boot', 'title', 'select'].forEach(function (id) {
      document.getElementById(id).classList.toggle('on', id === name);
    });
    if (name !== 'play') closeModals();
  }
  function closeModals() {
    ['pause', 'win', 'fail', 'hint'].forEach(function (id) { document.getElementById(id).classList.remove('on'); });
  }
  function toastStars() {
    var t = starCount() + ' / ' + (LEVELS.length * 3) + ' stars';
    document.getElementById('starSum').textContent = t;
    document.getElementById('starSum2').textContent = t;
  }
  function qualityLabel() {
    if (qualityMode === 'auto') {
      var q = window.FLUID && FLUID.ok ? FLUID.quality : devicePreset();
      return 'Auto · ' + (q === 'low' ? 'Low' : 'High');
    }
    return qualityMode === 'low' ? 'Low' : 'High';
  }
  function devicePreset() {
    var mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
    return (mem <= 2 || cores <= 2) ? 'low' : 'high';
  }
  function effectivePreset() {
    if (qualityMode === 'low') return 'low';
    if (qualityMode === 'high') return 'high';
    if (window.FLUID && FLUID.ok) return FLUID.quality;
    return devicePreset();
  }
  function applyQualityUI() {
    document.getElementById('tQual').textContent = qualityLabel();
    var qLab = document.getElementById('qLab');
    if (qLab) qLab.textContent = qualityMode === 'auto' ? 'Auto' : (qualityMode === 'low' ? 'Low' : 'High');
    if (window.FLUID && FLUID.ok) FLUID.setQuality(qualityMode);
  }
  function cycleQuality() {
    qualityMode = qualityMode === 'auto' ? 'low' : qualityMode === 'low' ? 'high' : 'auto';
    save.quality = qualityMode; persist();
    applyQualityUI();
    if (sim && !demo) rebuildSim(sim.exportState());
    else if (demo) startDemo();
  }

  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (bg.width !== Math.round(W * dpr) || bg.height !== Math.round(H * dpr)) {
      bg.width = fx.width = Math.round(W * dpr);
      bg.height = fx.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.setTransform(dpr, 0, 0, dpr, 0, 0);
    var portrait = H >= W * 0.92;
    var topH = portrait ? 86 : 64;
    var botH = portrait ? 108 : 74;
    var pad = 16;
    var availW = W - pad * 2;
    var availH = H - topH - botH;
    var bw = availW, bh = bw * (BH / BW);
    if (bh > availH) { bh = availH; bw = bh * (BW / BH); }
    view.W = W; view.H = H;
    view.bw = bw; view.bh = bh;
    view.x = (W - bw) / 2;
    view.y = topH + (availH - bh) / 2;
    if (screen === 'title') view.y = Math.max(12, (H - bh) * 0.06);
  }
  function worldToScreen(wx, wy) {
    return { x: view.x + (wx / BW) * view.bw, y: view.y + (1 - wy / BH) * view.bh };
  }
  function screenToWorld(sx, sy) {
    return { x: ((sx - view.x) / view.bw) * BW, y: (1 - (sy - view.y) / view.bh) * BH };
  }
  function cellRect(c, r, w, h) {
    w = w || 1; h = h || 1;
    var p = worldToScreen(c * CELL, (ROWS - r) * CELL);
    var q = worldToScreen((c + w) * CELL, (ROWS - r - h) * CELL);
    return { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y };
  }
  function round(path, x, y, w, h, r) {
    path.beginPath();
    r = Math.min(r, w / 2, h / 2);
    path.moveTo(x + r, y);
    path.arcTo(x + w, y, x + w, y + h, r);
    path.arcTo(x + w, y + h, x, y + h, r);
    path.arcTo(x, y + h, x, y, r);
    path.arcTo(x, y, x + w, y, r);
    path.closePath();
  }
  function mapCells(ch) {
    var list = [];
    if (!level) return list;
    for (var r = 0; r < ROWS; r++) {
      var row = level.map[r] || '';
      for (var c = 0; c < COLS; c++) if (row[c] === ch) list.push({ c: c, r: r });
    }
    return list;
  }

  function themeFor(lv) {
    var id = (lv && lv.chapter) || 'teach';
    return THEME[id] || THEME.teach;
  }
  function nse(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function paintSky(ctx, theme, W, H) {
    var grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, theme.sky[0]);
    grd.addColorStop(0.52, theme.sky[1]);
    grd.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    var sx = W * theme.sunX, sy = H * 0.14;
    var sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, W * 0.34);
    sun.addColorStop(0, theme.sun);
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (var i = 0; i < 3; i++) {
      var cx = W * (0.18 + i * 0.26), cy = H * (0.1 + (i % 2) * 0.05);
      ctx.beginPath();
      ctx.ellipse(cx, cy, 34 + i * 10, 12, 0, 0, 7);
      ctx.ellipse(cx + 24, cy + 3, 22, 10, 0, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = theme.land;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.78);
    ctx.quadraticCurveTo(W * 0.22, H * 0.62, W * 0.48, H * 0.74);
    ctx.quadraticCurveTo(W * 0.74, H * 0.88, W, H * 0.66);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = theme.land2;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.86);
    ctx.quadraticCurveTo(W * 0.45, H * 0.74, W, H * 0.9);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function paintFrame(ctx, theme) {
    var x = view.x - 16, y = view.y - 16, w = view.bw + 32, h = view.bh + 32;
    ctx.fillStyle = 'rgba(40,24,12,.28)';
    round(ctx, x + 7, y + 10, w, h, 22);
    ctx.fill();
    var wood = ctx.createLinearGradient(x, y, x + w, y);
    wood.addColorStop(0, theme.frame[0]);
    wood.addColorStop(1, theme.frame[1]);
    ctx.fillStyle = wood;
    round(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,210,.35)';
    ctx.lineWidth = 2;
    round(ctx, x + 5, y + 5, w - 10, h - 10, 14);
    ctx.stroke();
    paintInterior(ctx, theme);
  }
  function paintInterior(ctx, theme) {
    var soil = theme.soil;
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.bw, view.bh);
    ctx.clip();
    var grd = ctx.createLinearGradient(view.x, view.y, view.x + view.bw * 0.15, view.y + view.bh);
    grd.addColorStop(0, soil[0]);
    grd.addColorStop(0.28, soil[1]);
    grd.addColorStop(0.62, soil[2]);
    grd.addColorStop(1, soil[3]);
    ctx.fillStyle = grd;
    ctx.fillRect(view.x, view.y, view.bw, view.bh);
    var idn = (level && level.id) || 1;
    for (var s = 0; s < 5; s++) {
      ctx.fillStyle = s % 2 ? 'rgba(255,248,230,.16)' : 'rgba(40,22,10,.13)';
      ctx.beginPath();
      var y0 = view.y + view.bh * (0.12 + s * 0.18);
      ctx.moveTo(view.x, y0);
      for (var k = 0; k <= 10; k++) {
        var xk = view.x + view.bw * (k / 10);
        var yk = y0 + Math.sin(k * 1.15 + s * 1.7 + idn) * view.bh * 0.028;
        ctx.lineTo(xk, yk);
      }
      ctx.lineTo(view.x + view.bw, view.y + view.bh);
      ctx.lineTo(view.x, view.y + view.bh);
      ctx.fill();
    }
    ctx.strokeStyle = theme.root;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.55;
    for (var r = 0; r < 4; r++) {
      var rx = view.x + view.bw * (0.08 + nse(idn * 9 + r) * 0.84);
      ctx.lineWidth = 1.6 + nse(r + 3) * 2.2;
      ctx.beginPath();
      ctx.moveTo(rx, view.y - 2);
      ctx.bezierCurveTo(
        rx + 18 - r * 8, view.y + view.bh * 0.22,
        rx - 26, view.y + view.bh * 0.48,
        rx + 8, view.y + view.bh * (0.62 + r * 0.06)
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx + 6, view.y + view.bh * 0.34);
      ctx.quadraticCurveTo(rx + 22, view.y + view.bh * 0.4, rx + 16, view.y + view.bh * 0.52);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (var i = 0; i < 36; i++) {
      var px = view.x + nse(idn * 3 + i * 1.7) * view.bw;
      var py = view.y + nse(idn * 5 + i * 2.3) * view.bh;
      var pr = 1.6 + nse(i + 11) * 4.2;
      ctx.fillStyle = nse(i + 4) > 0.45 ? theme.pebble : 'rgba(50,32,18,.28)';
      ctx.beginPath();
      ctx.ellipse(px, py, pr, pr * (0.55 + nse(i) * 0.3), nse(i + 2) * 3, 0, 7);
      ctx.fill();
      if (nse(i + 8) > 0.72) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath();
        ctx.ellipse(px - pr * 0.2, py - pr * 0.15, pr * 0.28, pr * 0.16, 0, 0, 7);
        ctx.fill();
      }
    }
    var vig = ctx.createRadialGradient(
      view.x + view.bw * (theme.sunX || 0.7), view.y + view.bh * 0.12, view.bw * 0.05,
      view.x + view.bw * 0.5, view.y + view.bh * 0.45, view.bw * 0.95
    );
    vig.addColorStop(0, theme.glow || 'rgba(255,244,220,.2)');
    vig.addColorStop(0.5, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(24,14,8,.34)');
    ctx.fillStyle = vig;
    ctx.fillRect(view.x, view.y, view.bw, view.bh);
    ctx.restore();
  }
  function paintScenery() {
    var theme = themeFor(level);
    var rev = sim && sim.scenery ? sim.scenery : 0;
    var key = [(level && level.id) || 0, view.W | 0, view.H | 0, view.bw | 0, view.x | 0, view.y | 0, rev].join(':');
    if (key !== sceneryKey) {
      sceneryKey = key;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      scenery.width = bg.width;
      scenery.height = bg.height;
      sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      sg.clearRect(0, 0, view.W, view.H);
      paintSky(sg, theme, view.W, view.H);
      if (level) {
        paintFrame(sg, theme);
        paintSolids(sg, theme);
        drawKettles(sg);
        drawPipes(sg);
        drawWeirs(sg);
        drawMarks(sg);
      }
    }
    g.drawImage(scenery, 0, 0, view.W, view.H);
  }
  function cellAlive(ch, idx) {
    if (ch === '#') return true;
    if (ch === 'i') return !sim || !sim.ice || sim.ice[idx];
    if (ch === 'n') return !sim || !sim.sand || sim.sand[idx];
    if (ch === 'o' && sim && sim.sealed && sim.sealed[idx]) return true;
    if (ch === 'e' && sim && sim.frozen && sim.frozen[idx]) return true;
    return false;
  }
  function paintSolids(ctx, theme) {
    for (var r = 0; r < ROWS; r++) {
      var row = level.map[r] || '';
      for (var c = 0; c < COLS; c++) {
        var ch = row[c];
        var idx = r * COLS + c;
        if (!cellAlive(ch, idx)) continue;
        var mat = ch === 'n' ? 'sand' : ch === 'i' || ch === 'e' ? 'ice' : ch === 'o' ? 'rock' : theme.mat;
        drawBlock(ctx, c, r, mat, c * 17 + r * 13 + (level.id || 1));
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.bw, view.bh);
    ctx.clip();
    var lip = ctx.createLinearGradient(view.x, view.y, view.x, view.y + view.bh * 0.12);
    lip.addColorStop(0, 'rgba(30,16,8,.2)');
    lip.addColorStop(1, 'rgba(30,16,8,0)');
    ctx.fillStyle = lip;
    ctx.fillRect(view.x, view.y, view.bw, view.bh * 0.12);
    ctx.restore();
  }
  function terrainTone(mat, seed) {
    var j = nse(seed) * 0.08 - 0.03;
    function mix(hex, lift) {
      var n = parseInt(hex.slice(1), 16);
      var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      var t = Math.max(0, Math.min(1, 0.5 + lift + j));
      r = Math.max(0, Math.min(255, r + (t - 0.5) * 70));
      g = Math.max(0, Math.min(255, g + (t - 0.5) * 60));
      b = Math.max(0, Math.min(255, b + (t - 0.5) * 46));
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }
    var lit, mid, shade;
    if (mat === 'wood') { lit = '#e7c498'; mid = '#b07240'; shade = '#6a3c22'; }
    else if (mat === 'sand') { lit = '#f6e2b8'; mid = '#e0bc78'; shade = '#b48a48'; }
    else if (mat === 'clay') { lit = '#f0c4a0'; mid = '#d08858'; shade = '#8a4c30'; }
    else if (mat === 'ice') { lit = '#f7fcff'; mid = '#c5e6f6'; shade = '#7eafcc'; }
    else if (mat === 'rock') { lit = '#e4ddd2'; mid = '#b7aea2'; shade = '#7a7268'; }
    else { lit = '#e7c9a4'; mid = '#c49262'; shade = '#7a5436'; }
    return { lit: mix(lit, 0.08), mid: mix(mid, 0), shade: mix(shade, -0.04) };
  }
  function sideOpen(c, r, dc, dr) {
    var cc = c + dc, rr = r + dr;
    if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) return false;
    var ch = (level.map[rr] || ' ')[cc] || ' ';
    return !cellAlive(ch, rr * COLS + cc);
  }
  function drawBlock(ctx, c, r, mat, seed) {
    var rc = cellRect(c, r, 1, 1);
    var tone = terrainTone(mat, seed);
    var x = rc.x - rc.w * 0.1, y = rc.y - rc.h * 0.1;
    var w = rc.w * 1.2, h = rc.h * 1.2;
    var body = ctx.createLinearGradient(x, y, x + w * 0.2, y + h);
    body.addColorStop(0, tone.lit);
    body.addColorStop(0.42, tone.mid);
    body.addColorStop(1, tone.shade);
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h);
    if (nse(seed + 4) > 0.55) {
      ctx.strokeStyle = 'rgba(40,20,8,.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rc.x + rc.w * (0.2 + nse(seed) * 0.3), rc.y + rc.h * 0.15);
      ctx.lineTo(rc.x + rc.w * (0.35 + nse(seed + 1) * 0.4), rc.y + rc.h * 0.9);
      ctx.stroke();
    }
    if (mat === 'wood') {
      ctx.strokeStyle = 'rgba(90,48,20,.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + h * (0.35 + nse(seed) * 0.2));
      ctx.lineTo(x + w - 1, y + h * (0.42 + nse(seed + 3) * 0.15));
      ctx.stroke();
    }
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var i = 0; i < dirs.length; i++) {
      if (!sideOpen(c, r, dirs[i][0], dirs[i][1])) continue;
      var wob = nse(seed + i * 7);
      var cx = rc.x + rc.w * (0.5 + dirs[i][0] * (0.12 + wob * 0.12));
      var cy = rc.y + rc.h * (0.5 + dirs[i][1] * (0.12 + wob * 0.1));
      ctx.fillStyle = dirs[i][1] < 0 ? tone.lit : tone.mid;
      ctx.beginPath();
      ctx.ellipse(
        cx, cy,
        rc.w * (0.46 + wob * 0.28),
        rc.h * (0.4 + nse(seed + i + 2) * 0.22),
        (wob - 0.5) * 0.8, 0, 7
      );
      ctx.fill();
      ctx.fillStyle = 'rgba(255,248,230,.26)';
      ctx.beginPath();
      ctx.ellipse(cx - rc.w * 0.1, cy - rc.h * 0.12, rc.w * 0.16, rc.h * 0.07, -0.4, 0, 7);
      ctx.fill();
    }
  }
  function drawClosures() {
    if (!sim) return;
    (sim.gates || []).forEach(function (cell) {
      if (sim.gateOpen || cell.open) return;
      var rc = cellRect(cell.c, cell.r, 1, 1);
      g.fillStyle = '#3a332c';
      round(g, rc.x + rc.w * 0.12, rc.y + 1, rc.w * 0.76, rc.h - 2, 3);
      g.fill();
      g.strokeStyle = '#d7d0c4';
      g.lineWidth = Math.max(2.2, rc.w * 0.1);
      g.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var x = rc.x + rc.w * (0.28 + i * 0.22);
        g.beginPath();
        g.moveTo(x, rc.y + 4);
        g.lineTo(x, rc.y + rc.h - 4);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x - 1.2, rc.y + 5);
        g.lineTo(x - 1.2, rc.y + rc.h * 0.45);
        g.stroke();
        g.strokeStyle = '#d7d0c4';
        g.lineWidth = Math.max(2.2, rc.w * 0.1);
      }
      g.fillStyle = '#8d6a3e';
      round(g, rc.x + 1, rc.y + 1, rc.w - 2, rc.h * 0.16, 2);
      g.fill();
    });
    (sim.hatches || []).forEach(function (cell) {
      if (sim.hatchOpen || cell.open) return;
      var rc = cellRect(cell.c, cell.r, 1, 1);
      g.fillStyle = '#6a3e22';
      round(g, rc.x + 1, rc.y + rc.h * 0.22, rc.w - 2, rc.h * 0.56, 4);
      g.fill();
      g.fillStyle = '#c48a52';
      round(g, rc.x + 2, rc.y + rc.h * 0.26, rc.w - 4, rc.h * 0.34, 3);
      g.fill();
      g.strokeStyle = 'rgba(255,228,190,.55)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(rc.x + 4, rc.y + rc.h * 0.36);
      g.quadraticCurveTo(rc.x + rc.w * 0.5, rc.y + rc.h * 0.3, rc.x + rc.w - 4, rc.y + rc.h * 0.4);
      g.stroke();
    });
  }
  function drawKettles(ctx) {
    [['S', 0], ['A', 1], ['B', 2], ['O', 8], ['L', 7], ['V', 6]].forEach(function (pair) {
      var cells = mapCells(pair[0]);
      if (!cells.length) return;
      var top = cells[0];
      cells.forEach(function (p) { if (p.r < top.r) top = p; });
      var rc = cellRect(top.c, top.r, 1, 1);
      var grd = ctx.createLinearGradient(rc.x, rc.y, rc.x + rc.w, rc.y + rc.h);
      grd.addColorStop(0, '#f6e2a8');
      grd.addColorStop(0.4, '#d4893a');
      grd.addColorStop(1, '#7a4a16');
      ctx.fillStyle = grd;
      round(ctx, rc.x - rc.w * 0.45, rc.y - rc.h * 0.05, rc.w * 1.55, rc.h * 0.62, rc.w * 0.3);
      ctx.fill();
      ctx.fillStyle = '#a86828';
      ctx.beginPath();
      ctx.ellipse(rc.x + rc.w * 1.15, rc.y + rc.h * 0.28, rc.w * 0.22, rc.h * 0.16, 0.4, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#f0d48a';
      ctx.lineWidth = Math.max(2, rc.w * 0.08);
      ctx.beginPath();
      ctx.arc(rc.x - rc.w * 0.05, rc.y + rc.h * 0.22, rc.w * 0.28, 0.6, 2.4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      ctx.ellipse(rc.x + rc.w * 0.15, rc.y + rc.h * 0.08, rc.w * 0.16, rc.h * 0.07, -0.5, 0, 7);
      ctx.fill();
      ctx.fillStyle = COLORS[pair[1]];
      ctx.beginPath();
      ctx.arc(rc.x + rc.w * 0.55, rc.y + rc.h * 0.7, Math.max(3, rc.w * 0.14), 0, 7);
      ctx.fill();
    });
  }
  function drawPipes(ctx) {
    if (!sim || !sim.basins) return;
    sim.basins.forEach(function (b) {
      if (b.link == null || b.link < 0 || !sim.basins[b.link] || b.i > b.link) return;
      var oth = sim.basins[b.link];
      var a = worldToScreen((b.x0 + b.x1) / 2, b.y0);
      var c = worldToScreen((oth.x0 + oth.x1) / 2, oth.y0);
      var mid = worldToScreen((b.x0 + oth.x1) / 2, Math.min(b.y0, oth.y0) - 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mid.x, mid.y, c.x, c.y);
      ctx.strokeStyle = '#5a3410';
      ctx.lineWidth = Math.max(11, view.bw * 0.046);
      ctx.stroke();
      ctx.strokeStyle = '#d4893a';
      ctx.lineWidth = Math.max(7, view.bw * 0.03);
      ctx.stroke();
      ctx.strokeStyle = '#f6e2a8';
      ctx.lineWidth = Math.max(2, view.bw * 0.008);
      ctx.stroke();
      ctx.fillStyle = '#e8c56a';
      var band = 0;
      for (var t = 0.25; t < 0.9; t += 0.25) {
        var bx = a.x + (c.x - a.x) * t, by = a.y + (mid.y - a.y) * Math.sin(t * Math.PI);
        ctx.beginPath(); ctx.arc(bx, by, Math.max(2, view.bw * 0.012), 0, 7); ctx.fill();
        band++;
      }
    });
  }
  function drawWeirs(ctx) {
    if (!sim || !sim.basins) return;
    sim.basins.forEach(function (b) {
      if (b.lipY > b.y1 + 1) return;
      var side = b.lipSide >= 0 ? b.x1 : b.x0;
      var p = worldToScreen(side, b.lipY);
      ctx.fillStyle = '#9a8b78';
      ctx.fillRect(p.x - 3, p.y - 2, 8, 7);
      ctx.fillStyle = '#efe6d8';
      ctx.fillRect(p.x - 2, p.y - 2, 6, 2);
    });
  }
  function drawMarks(ctx) {
    for (var r = 0; r < ROWS; r++) {
      var row = level.map[r] || '';
      for (var c = 0; c < COLS; c++) {
        var ch = row[c];
        var rc = cellRect(c, r, 1, 1);
        if (ch === 'P') {
          var px = rc.x + rc.w / 2, py = rc.y + rc.h * 0.64;
          ctx.fillStyle = 'rgba(40, 90, 30, .35)';
          ctx.beginPath();
          ctx.ellipse(px, py + 2, rc.w * 0.42, rc.h * 0.2, 0, 0, 7);
          ctx.fill();
          var pud = ctx.createRadialGradient(px, py, 1, px, py, rc.w * 0.4);
          pud.addColorStop(0, 'rgba(170, 220, 80, .85)');
          pud.addColorStop(0.6, 'rgba(70, 140, 40, .8)');
          pud.addColorStop(1, 'rgba(30, 70, 20, .15)');
          ctx.fillStyle = pud;
          ctx.beginPath();
          ctx.ellipse(px, py, rc.w * 0.38, rc.h * 0.2, 0, 0, 7);
          ctx.fill();
          ctx.fillStyle = 'rgba(220, 255, 160, .55)';
          ctx.beginPath();
          ctx.ellipse(px - rc.w * 0.08, py - rc.h * 0.04, rc.w * 0.1, rc.h * 0.05, -0.4, 0, 7);
          ctx.fill();
        } else if (ch === 'z') {
          ctx.fillStyle = '#c46a3a';
          ctx.fillRect(rc.x + rc.w * 0.15, rc.y + rc.h * 0.45, rc.w * 0.7, rc.h * 0.4);
          ctx.fillStyle = 'rgba(255, 180, 80, .45)';
          ctx.beginPath();
          ctx.ellipse(rc.x + rc.w / 2, rc.y + rc.h * 0.4, rc.w * 0.22, rc.h * 0.28, 0, 0, 7);
          ctx.fill();
        } else if (ch === 'k') {
          ctx.strokeStyle = 'rgba(255,255,255,.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(rc.x + 3, rc.y + 3, rc.w - 6, rc.h - 6);
        } else if (ch === 'o' && !(sim && sim.sealed && sim.sealed[r * COLS + c])) {
          ctx.fillStyle = '#6a5344';
          ctx.beginPath();
          ctx.ellipse(rc.x + rc.w / 2, rc.y + rc.h / 2, rc.w * 0.32, rc.h * 0.24, 0, 0, 7);
          ctx.fill();
        } else if (ch === 'F') {
          ctx.fillStyle = '#5a2a18';
          ctx.fillRect(rc.x + rc.w * 0.28, rc.y + rc.h * 0.55, rc.w * 0.44, rc.h * 0.28);
        }
      }
    }
  }
  function traceInk(ctx) {
    ctx.beginPath();
    sim.strokes.forEach(function (s) {
      s.pts.forEach(function (p, k) {
        var q = worldToScreen(p.x, p.y);
        if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
    });
  }
  function drawInk(ctx) {
    if (!sim || !sim.strokes.length) return;
    var width = Math.max(5, (0.046 / BW) * view.bw);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = '#6a3a1c';
    traceInk(ctx);
    ctx.stroke();
    ctx.lineWidth = width * 0.62;
    ctx.strokeStyle = '#d3924e';
    traceInk(ctx);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.4, width * 0.18);
    ctx.strokeStyle = 'rgba(255, 228, 180, .8)';
    traceInk(ctx);
    ctx.stroke();
  }

  function cupRects() {
    var out = [];
    ['C', 'D', 'E'].forEach(function (ch, idx) {
      var cells = mapCells(ch);
      if (!cells.length) return;
      var c0 = 99, c1 = -1, r0 = 99, r1 = -1;
      cells.forEach(function (p) {
        if (p.c < c0) c0 = p.c; if (p.c > c1) c1 = p.c;
        if (p.r < r0) r0 = p.r; if (p.r > r1) r1 = p.r;
      });
      var rc = cellRect(c0, r0, c1 - c0 + 1, r1 - r0 + 1);
      rc.idx = idx;
      out.push(rc);
    });
    return out;
  }
  function drawOverlay(t) {
    o.clearRect(0, 0, view.W, view.H);
    if (sim && (!window.FLUID || !FLUID.ok)) {
      var P = sim.P;
      var rad = Math.max(1.6, sim.RAD * sim.preset.radMul * (view.bw / BW) * 2.4);
      for (var j = 0; j < P.n; j++) {
        var q = worldToScreen(P.x[j], P.y[j]);
        o.fillStyle = COLORS[P.cid[j]] || COLORS[0];
        o.globalAlpha = 0.72;
        o.beginPath(); o.arc(q.x, q.y, rad, 0, 7); o.fill();
      }
      o.globalAlpha = 1;
    }
    if (sim) {
      sim.floats.forEach(drawFloat);
      (sim.wheels || []).forEach(drawWheel);
      (sim.fires || []).forEach(drawFire);
      (sim.gems || []).forEach(drawGem);
      drawSteam();
      drawPoison(t);
    }
    cupRects().forEach(drawGlass);
    for (var s = sparks.length - 1; s >= 0; s--) {
      var sp = sparks[s];
      sp.y += sp.vy; sp.x += sp.vx; sp.life -= 0.016; sp.vy += 0.05;
      if (sp.life <= 0) { sparks.splice(s, 1); continue; }
      o.globalAlpha = Math.max(0, sp.life);
      o.fillStyle = sp.c;
      o.beginPath(); o.arc(sp.x, sp.y, sp.r, 0, 7); o.fill();
    }
    o.globalAlpha = 1;
  }
  function drawGlass(cup) {
    var v = sim && sim.vessels[cup.idx];
    var ratio = v ? Math.min(1, v.ratio || 0) : 0;
    var prev = lastFill[cup.idx] || 0;
    if (ratio > prev + 0.035) {
      var sx = cup.x + cup.w * (0.35 + Math.random() * 0.3);
      var sy = cup.y + cup.h * 0.16;
      for (var k = 0; k < 3; k++) {
        sparks.push({
          x: sx, y: sy,
          vx: (Math.random() - 0.5) * 1.6,
          vy: -0.8 - Math.random() * 1.4,
          life: 0.38 + Math.random() * 0.2,
          r: 1.4 + Math.random() * 1.6,
          c: 'rgba(255,255,255,.92)'
        });
      }
      if (ratio >= 0.9 && prev < 0.9) {
        sparks.push({ x: cup.x + cup.w / 2, y: cup.y + 4, vx: 0, vy: -0.6, life: 0.7, r: 3.4, c: '#ffe08a' });
      }
    }
    lastFill[cup.idx] = ratio;
    var topW = cup.w * 0.96, botW = cup.w * 0.72;
    var top = cup.y + cup.h * 0.06, bot = cup.y + cup.h * 0.94;
    var x = cup.x;
    var cx = x + cup.w / 2;
    o.strokeStyle = 'rgba(186, 214, 224, .45)';
    o.lineWidth = Math.max(5, cup.w * 0.1);
    o.beginPath();
    o.moveTo(x + (cup.w - topW) / 2, top);
    o.lineTo(x + (cup.w - botW) / 2, bot);
    o.lineTo(x + (cup.w + botW) / 2, bot);
    o.lineTo(x + (cup.w + topW) / 2, top);
    o.stroke();
    o.strokeStyle = 'rgba(246, 252, 255, .95)';
    o.lineWidth = Math.max(2, cup.w * 0.045);
    o.stroke();
    o.strokeStyle = 'rgba(255,255,255,.75)';
    o.lineWidth = 1.6;
    o.beginPath();
    o.moveTo(x + (cup.w - topW) / 2 + 3, top + 6);
    o.lineTo(x + (cup.w - botW) / 2 + 2, bot - 6);
    o.stroke();
    o.strokeStyle = 'rgba(40, 60, 70, .22)';
    o.beginPath();
    o.moveTo(x + (cup.w + topW) / 2 - 3, top + 5);
    o.lineTo(x + (cup.w + botW) / 2 - 2, bot - 4);
    o.stroke();
    o.strokeStyle = 'rgba(236, 246, 250, .95)';
    o.lineWidth = Math.max(2, cup.w * 0.05);
    o.beginPath();
    o.ellipse(cx, top, topW / 2, Math.max(3, cup.h * 0.07), 0, 0, 7);
    o.stroke();
    if (ratio > 0.04) {
      var yy = top + (bot - top) * (1 - ratio);
      var half = topW * 0.5 * (0.72 + 0.28 * ratio);
      o.strokeStyle = 'rgba(255,255,255,.85)';
      o.lineWidth = 1.6;
      o.beginPath();
      o.ellipse(cx, yy, half * 0.72, Math.max(2.2, cup.h * 0.05), 0, 0, 7);
      o.stroke();
      o.strokeStyle = 'rgba(180, 220, 240, .55)';
      o.beginPath();
      o.ellipse(cx, yy + 1.5, half * 0.55, Math.max(1.4, cup.h * 0.03), 0, 0, 7);
      o.stroke();
    }
    if (ratio > 0.2) {
      o.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() * 0.008);
      o.fillStyle = 'rgba(255,255,255,.9)';
      o.beginPath();
      o.ellipse(cx - cup.w * 0.12, top + cup.h * 0.22, 3.2, 6, -0.4, 0, 7);
      o.fill();
      o.globalAlpha = 1;
    }
    if (v && v.color != null) {
      o.fillStyle = COLORS[v.color] || '#ddd';
      o.beginPath();
      o.arc(x + cup.w - 4, top - 6, 4.5, 0, 7);
      o.fill();
      o.strokeStyle = 'rgba(255,255,255,.85)';
      o.lineWidth = 1.2;
      o.stroke();
    }
  }
  function drawFloat(fl) {
    var p = worldToScreen(fl.x, fl.y + fl.hh * 0.1);
    var ppm = view.bw / BW;
    var w = Math.max(22, fl.hw * 3.1 * ppm);
    var h = Math.max(16, fl.hh * 2.8 * ppm);
    o.save();
    o.translate(p.x, p.y);
    o.fillStyle = 'rgba(40,50,40,.22)';
    o.beginPath(); o.ellipse(2, h * 0.46, w * 0.62, h * 0.16, 0, 0, 7); o.fill();
    o.fillStyle = '#e2b84a';
    o.beginPath(); o.ellipse(0, 4, w * 0.52, h * 0.4, 0, 0, 7); o.fill();
    o.fillStyle = '#f6d56a';
    o.beginPath(); o.ellipse(-w * 0.06, -h * 0.02, w * 0.4, h * 0.28, -0.2, 0, 7); o.fill();
    o.fillStyle = '#fff1b8';
    o.beginPath(); o.ellipse(-w * 0.16, -h * 0.06, w * 0.16, h * 0.1, -0.5, 0, 7); o.fill();
    o.fillStyle = '#f4c14a';
    o.beginPath(); o.ellipse(w * 0.34, -h * 0.22, h * 0.32, h * 0.26, 0.2, 0, 7); o.fill();
    o.fillStyle = '#ffe7a0';
    o.beginPath(); o.ellipse(w * 0.28, -h * 0.3, h * 0.12, h * 0.08, -0.4, 0, 7); o.fill();
    o.fillStyle = '#e07a2f';
    o.beginPath();
    o.moveTo(w * 0.52, -h * 0.24);
    o.quadraticCurveTo(w * 0.95, -h * 0.16, w * 0.55, -h * 0.02);
    o.quadraticCurveTo(w * 0.7, -h * 0.12, w * 0.52, -h * 0.24);
    o.fill();
    o.fillStyle = '#243038';
    o.beginPath(); o.arc(w * 0.4, -h * 0.28, Math.max(1.8, h * 0.07), 0, 7); o.fill();
    o.fillStyle = '#fff';
    o.beginPath(); o.arc(w * 0.42, -h * 0.3, Math.max(0.7, h * 0.025), 0, 7); o.fill();
    o.fillStyle = '#f08a32';
    o.beginPath(); o.ellipse(w * 0.5, -h * 0.16, h * 0.06, h * 0.04, 0.4, 0, 7); o.fill();
    o.strokeStyle = '#c9842f';
    o.lineWidth = 1.6;
    o.lineCap = 'round';
    o.beginPath();
    o.moveTo(-w * 0.05, h * 0.16);
    o.quadraticCurveTo(-w * 0.42, h * 0.28, -w * 0.08, h * 0.34);
    o.stroke();
    o.fillStyle = '#f2c14a';
    o.beginPath(); o.ellipse(-w * 0.42, -h * 0.02, w * 0.16, h * 0.1, -0.6, 0, 7); o.fill();
    o.restore();
  }
  function drawWheel(wh) {
    var p = worldToScreen(wh.cx, wh.cy);
    var rad = Math.max(14, Math.min(wh.hw, wh.hh) * (view.bw / BW) * 1.6);
    o.save();
    o.translate(p.x, p.y);
    o.rotate(wh.angle || 0);
    o.fillStyle = 'rgba(40,30,20,.28)';
    o.beginPath(); o.arc(3, 4, rad, 0, 7); o.fill();
    o.fillStyle = '#8a5a2a';
    o.beginPath(); o.arc(0, 0, rad, 0, 7); o.fill();
    o.fillStyle = '#e7c48a';
    o.beginPath(); o.arc(0, 0, rad * 0.82, 0, 7); o.fill();
    o.fillStyle = '#c48a48';
    o.beginPath(); o.arc(0, 0, rad * 0.62, 0, 7); o.fill();
    o.strokeStyle = '#5a3418';
    o.lineWidth = Math.max(2.4, rad * 0.1);
    o.lineCap = 'round';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      o.beginPath();
      o.moveTo(Math.cos(a) * rad * 0.22, Math.sin(a) * rad * 0.22);
      o.lineTo(Math.cos(a) * rad * 0.78, Math.sin(a) * rad * 0.78);
      o.stroke();
      if (i % 2 === 0) {
        o.fillStyle = i === 0 ? '#e25822' : '#f0d090';
        o.beginPath();
        o.ellipse(Math.cos(a) * rad * 0.86, Math.sin(a) * rad * 0.86, rad * 0.16, rad * 0.1, a, 0, 7);
        o.fill();
      }
    }
    o.fillStyle = '#f6e2a8';
    o.beginPath(); o.arc(0, 0, rad * 0.2, 0, 7); o.fill();
    o.fillStyle = '#a86820';
    o.beginPath(); o.arc(0, 0, rad * 0.08, 0, 7); o.fill();
    o.restore();
  }
  function drawFire(fire) {
    if (fire.hp <= 0) return;
    var p = worldToScreen(fire.x, fire.y);
    var ppm = view.bw / BW;
    var s = Math.max(0.45, fire.hp / fire.max);
    var h = Math.max(22, ppm * 0.16) * s;
    var flick = 0.85 + 0.15 * Math.sin(performance.now() * 0.02 + fire.x * 9);
    h *= flick;
    o.fillStyle = 'rgba(255, 80, 20, .28)';
    o.beginPath();
    o.ellipse(p.x, p.y - h * 0.35, h * 0.55, h * 0.7, 0, 0, 7);
    o.fill();
    o.fillStyle = 'rgba(255, 70, 16, .95)';
    o.beginPath();
    o.moveTo(p.x, p.y + h * 0.18);
    o.quadraticCurveTo(p.x - h * 0.62, p.y - h * 0.05, p.x - h * 0.08, p.y - h);
    o.quadraticCurveTo(p.x + h * 0.15, p.y - h * 0.35, p.x + h * 0.08, p.y - h * 0.85);
    o.quadraticCurveTo(p.x + h * 0.62, p.y - h * 0.1, p.x, p.y + h * 0.18);
    o.fill();
    o.fillStyle = 'rgba(255, 186, 48, .95)';
    o.beginPath();
    o.moveTo(p.x, p.y + h * 0.1);
    o.quadraticCurveTo(p.x - h * 0.24, p.y - h * 0.05, p.x, p.y - h * 0.55);
    o.quadraticCurveTo(p.x + h * 0.24, p.y, p.x, p.y + h * 0.1);
    o.fill();
    o.fillStyle = 'rgba(255, 244, 200, .95)';
    o.beginPath();
    o.ellipse(p.x, p.y - h * 0.05, h * 0.08, h * 0.16, 0, 0, 7);
    o.fill();
  }
  function drawGem(gem) {
    var p = worldToScreen(gem.x, gem.y);
    o.fillStyle = gem.lit ? '#7ec8e8' : '#9aa8b0';
    o.beginPath();
    o.moveTo(p.x, p.y - 7);
    o.lineTo(p.x + 6, p.y);
    o.lineTo(p.x, p.y + 7);
    o.lineTo(p.x - 6, p.y);
    o.fill();
    if (gem.lit) {
      o.fillStyle = 'rgba(255,255,255,.8)';
      o.fillRect(p.x - 1, p.y - 4, 2, 4);
    }
  }
  function drawPoison(t) {
    if (!level) return;
    var bob = Math.sin((t || 0) * 0.006);
    for (var r = 0; r < ROWS; r++) {
      var row = level.map[r] || '';
      for (var c = 0; c < COLS; c++) {
        if (row[c] !== 'P') continue;
        var rc = cellRect(c, r, 1, 1);
        var px = rc.x + rc.w * (0.35 + (c % 2) * 0.2);
        var py = rc.y + rc.h * (0.35 + bob * 0.08);
        o.fillStyle = 'rgba(210, 245, 140, .7)';
        o.beginPath();
        o.arc(px, py, 2.2 + (r % 2), 0, 7);
        o.fill();
        o.strokeStyle = 'rgba(255,255,255,.55)';
        o.lineWidth = 1;
        o.stroke();
      }
    }
  }
  function drawSteam() {
    var P = sim.P;
    if (!P) return;
    o.fillStyle = 'rgba(236, 244, 248, .55)';
    for (var i = 0; i < P.n; i++) {
      if (!P.steam[i]) continue;
      var q = worldToScreen(P.x[i], P.y[i]);
      o.beginPath();
      o.ellipse(q.x, q.y, 3.2, 2.2, 0, 0, 7);
      o.fill();
    }
  }

  function drawFrame() {
    layout();
    g.clearRect(0, 0, view.W, view.H);
    paintScenery();
    drawClosures();
    drawInk(g);
    drawOverlay(performance.now());
    if (window.FLUID && FLUID.ok && sim) {
      FLUID.setView(view, BW, BH);
      FLUID.setBackground(bg);
      FLUID.setRadius(sim.RAD * sim.preset.radMul * 5.1);
      FLUID.sync(sim.P);
      if (!FLUID._laid) { FLUID.setQuality(qualityMode); FLUID._laid = true; }
      FLUID.render(16);
    }
  }

  function makeSim(lv, preset) {
    return WaterSim.create(lv, { preset: preset, holdPour: !!lv.hold });
  }
  function rebuildSim(snap) {
    sim = makeSim(level, effectivePreset());
    if (snap) sim.importState(snap);
    if (!level.hold) { sim.releasePour(); sim.markPlaying(); }
    lean = 0; leanBtn = 0;
    if (level.tilt) sim.setTilt(0);
    winHold = 0;
  }
  function startLevel(id) {
    demo = false; paused = false; winLock = false; failLock = false; drag = null;
    level = LEVELS[id - 1];
    closeModals();
    show('play');
    document.body.dataset.tilt = level.tilt ? '1' : '0';
    coachOn = !!(level.coach && !(save.stars[id - 1] > 0));
    var coach = document.getElementById('coach');
    coach.textContent = coachOn ? level.coach : '';
    coach.classList.toggle('hide', !coachOn);
    document.getElementById('lvNum').textContent = 'Level ' + id;
    document.getElementById('lvName').textContent = level.name;
    lastFill = [0, 0, 0];
    rebuildSim(null);
    if (params.get('solve') === '1') { sim.applySolution(); sim.releasePour(); sim.markPlaying(); }
    Ads.gameplayStart();
    updateHud(true);
  }
  function startDemo() {
    demo = true;
    level = LEVELS[Math.min(2, LEVELS.length - 1)];
    document.body.dataset.tilt = '0';
    sim = makeSim(level, effectivePreset());
    sim.applySolution();
    sim.releasePour();
    winHold = 0; failLock = false; winLock = false;
  }
  function goTitle() {
    if (screen === 'play') Ads.gameplayStop();
    show('title'); toastStars(); applyQualityUI(); startDemo();
  }
  function goSelect() {
    if (screen === 'play') Ads.gameplayStop();
    demo = false; sim = null; level = null;
    document.body.dataset.tilt = '0';
    show('select'); renderSelect(); toastStars();
  }
  function renderSelect() {
    var host = document.getElementById('lvGrid');
    host.innerHTML = '';
    CHAPTERS.forEach(function (ch) {
      var band = document.createElement('section');
      band.className = 'band';
      band.dataset.ch = ch.id;
      var head = document.createElement('header');
      head.innerHTML = '<b></b><span></span>';
      head.querySelector('b').textContent = ch.name;
      head.querySelector('span').textContent = ch.mechanic;
      band.appendChild(head);
      var path = document.createElement('div');
      path.className = 'path';
      for (var id = ch.from; id <= ch.to; id++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lvbtn';
        if (LEVELS[id - 1] && LEVELS[id - 1].exam) b.classList.add('exam');
        var stars = save.stars[id - 1] || 0;
        var locked = id > save.unlocked;
        if (locked) b.classList.add('lock');
        else if (stars) b.classList.add('done');
        b.innerHTML = '<span class="n"></span><span class="st"></span>';
        b.querySelector('.n').textContent = String(id);
        b.querySelector('.st').textContent = locked ? '' : '★★★'.slice(0, stars);
        if (!locked) b.addEventListener('click', (function (n) { return function () { startLevel(n); }; })(id));
        path.appendChild(b);
      }
      band.appendChild(path);
      host.appendChild(band);
    });
  }

  function onWin() {
    if (winLock || demo) return;
    winLock = true;
    var stars = sim.stars || 1;
    var id = level.id;
    save.stars[id - 1] = Math.max(save.stars[id - 1] || 0, stars);
    var bt = sim.winTime || sim.playTime;
    if (!save.best[id - 1] || bt < save.best[id - 1]) save.best[id - 1] = bt;
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, id + 1));
    persist();
    Ads.gameplayStop();
    SFX.win();
    burst(view.x + view.bw * 0.5, view.y + view.bh * 0.35);
    document.getElementById('winTitle').textContent = id === LEVELS.length ? 'The tank knows' : 'Filled';
    document.getElementById('winFine').textContent = formatTime(bt);
    document.getElementById('bNext').textContent = id === LEVELS.length ? 'Levels' : 'Next';
    paintStars(stars);
    document.getElementById('win').classList.add('on');
    coachOn = false;
    document.getElementById('coach').classList.add('hide');
  }
  function paintStars(n) {
    var host = document.getElementById('winStars'); host.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M12 2.6l2.7 5.6 6.2.8-4.5 4.3 1.1 6.1L12 16.8 6.5 19.4l1.1-6.1L3.1 9l6.2-.8z');
      p.setAttribute('fill', i < n ? '#e2a325' : '#d9d0c2');
      s.appendChild(p); host.appendChild(s);
    }
  }
  function burst(x, y) {
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * 6.28, sp = 1.5 + Math.random() * 3.2;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, r: 2 + Math.random() * 3, life: 1, c: Math.random() < 0.5 ? '#7ec8e8' : '#f0d48a' });
    }
  }
  function onFail() {
    if (failLock || winLock || demo) return;
    failLock = true;
    Ads.gameplayStop();
    SFX.fail();
    var why = 'The pour missed the glass.';
    if (sim.failReason === 'tip') why = 'The glass tipped.';
    if (sim.failReason === 'venom') why = 'Venom reached the glass.';
    document.querySelector('#fail .fine').textContent = why;
    document.getElementById('fail').classList.add('on');
  }
  function formatTime(t) {
    t = Math.max(0, t || 0);
    if (t < 10) return t.toFixed(1) + 's';
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function updateHud(force) {
    hudTick++;
    if (!force && hudTick % 4) return;
    if (!sim || demo) return;
    document.getElementById('fillBar').style.width = Math.round(sim.fill * 100) + '%';
    document.getElementById('fillTxt').textContent = Math.round(sim.fill * 100) + '%';
    document.getElementById('timeTxt').textContent = formatTime(sim.playTime);
    var ink = document.getElementById('inkTxt');
    if (level && level.tilt) ink.textContent = lean < -0.2 ? 'leaning left' : lean > 0.2 ? 'leaning right' : 'hold steady';
    else if (level && level.ink) ink.textContent = 'ink ' + Math.max(0, sim.inkLeft).toFixed(1);
    else ink.textContent = '';
    document.getElementById('btnUndo').disabled = !sim.canUndo();
    document.getElementById('btnLeanL').classList.toggle('on', lean < -0.2);
    document.getElementById('btnLeanR').classList.toggle('on', lean > 0.2);
  }

  function insideBoard(sx, sy) {
    return sx >= view.x - 8 && sy >= view.y - 8 && sx <= view.x + view.bw + 8 && sy <= view.y + view.bh + 8;
  }
  function onDown(e) {
    if (screen !== 'play' || paused || winLock || failLock || demo) return;
    if (e.button != null && e.button !== 0) return;
    SFX.unlock();
    var rect = bg.getBoundingClientRect();
    var sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (!insideBoard(sx, sy)) return;
    if (!(level.ink > 0)) return;
    var w = screenToWorld(sx, sy);
    w.x = Math.max(0.02, Math.min(BW - 0.02, w.x));
    w.y = Math.max(0.02, Math.min(BH - 0.02, w.y));
    if (sim.beginStroke(w.x, w.y)) {
      drag = { type: 'ink', id: e.pointerId };
      coachOn = false;
      document.getElementById('coach').classList.add('hide');
      SFX.draw();
      try { bg.setPointerCapture(e.pointerId); } catch (err) {}
    }
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var rect = bg.getBoundingClientRect();
    var w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (sim.extendStroke(w.x, w.y)) SFX.draw();
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    sim.endStroke();
    if (sim.strokes.length) { sim.releasePour(); sim.markPlaying(); }
    drag = null;
  }
  function setLean(v) {
    lean = Math.max(-1, Math.min(1, v));
    leanBtn = lean === 0 ? 0 : 1;
    if (sim && level && level.tilt && !demo) sim.setTilt(lean);
  }

  function nextAfterAd() {
    Ads.commercialBreak().then(function () {
      if (level.id >= LEVELS.length) goSelect();
      else startLevel(level.id + 1);
    });
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!booted) {
      if ((window.FLUID && FLUID.ok) || now - fluidWait > 700) {
        booted = true;
        applyQualityUI();
        var jump = parseInt(params.get('level') || '', 10);
        if (jump >= 1 && jump <= LEVELS.length) startLevel(jump);
        else goTitle();
      }
    }
    if (sim && screen === 'play' && !paused && !winLock && !failLock) {
      sim.step(dt);
      if (sim.won) {
        winHold += dt;
        if (winHold > 0.35) onWin();
      } else if (sim.spoiled || (sim.playTime > 14 && sim.emitted >= sim.budget && sim.fill < 0.98)) {
        onFail();
      }
      updateHud(false);
    } else if (sim && demo && screen === 'title') {
      sim.step(dt);
      if (sim.won) startDemo();
    }
    if (screen === 'play' || screen === 'title') drawFrame();
    else if (screen === 'select') {
      layout();
      paintSky(g, THEME.float, view.W, view.H);
    }
    requestAnimationFrame(frame);
  }

  document.getElementById('bPlay').addEventListener('click', function () { startLevel(save.unlocked || 1); });
  document.getElementById('bLevels').addEventListener('click', goSelect);
  document.getElementById('bSelectBack').addEventListener('click', goTitle);
  document.getElementById('tSound').addEventListener('click', function () {
    save.sound = !save.sound; this.classList.toggle('off', !save.sound); persist();
  });
  document.getElementById('tMusic').addEventListener('click', function () {
    save.music = !save.music; this.classList.toggle('off', !save.music); persist();
  });
  document.getElementById('tQual').addEventListener('click', cycleQuality);
  document.getElementById('btnQuality').addEventListener('click', cycleQuality);
  document.getElementById('btnPause').addEventListener('click', function () {
    if (screen !== 'play' || winLock) return;
    paused = true; document.getElementById('pause').classList.add('on');
  });
  document.getElementById('bResume').addEventListener('click', function () {
    paused = false; document.getElementById('pause').classList.remove('on');
  });
  document.getElementById('bPauseRetry').addEventListener('click', function () { startLevel(level.id); });
  document.getElementById('bPauseLevels').addEventListener('click', goSelect);
  document.getElementById('bNext').addEventListener('click', nextAfterAd);
  document.getElementById('bWinRetry').addEventListener('click', function () { startLevel(level.id); });
  document.getElementById('bWinLevels').addEventListener('click', goSelect);
  document.getElementById('bFailRetry').addEventListener('click', function () { startLevel(level.id); });
  document.getElementById('bFailLevels').addEventListener('click', goSelect);
  document.getElementById('bFailHint').addEventListener('click', function () {
    document.getElementById('fail').classList.remove('on');
    document.getElementById('hintText').textContent = level.hint || level.coach || '';
    document.getElementById('hint').classList.add('on');
  });
  document.getElementById('btnHint').addEventListener('click', function () {
    document.getElementById('hintText').textContent = level.hint || level.coach || '';
    document.getElementById('hint').classList.add('on');
  });
  document.getElementById('bHintOk').addEventListener('click', function () {
    document.getElementById('hint').classList.remove('on');
    failLock = false;
  });
  document.getElementById('btnUndo').addEventListener('click', function () { if (sim) sim.undo(); });
  document.getElementById('btnRestart').addEventListener('click', function () { if (level) startLevel(level.id); });
  document.getElementById('btnLeanL').addEventListener('click', function () { setLean(lean < -0.2 ? 0 : -1); });
  document.getElementById('btnLeanR').addEventListener('click', function () { setLean(lean > 0.2 ? 0 : 1); });
  bg.addEventListener('pointerdown', onDown);
  bg.addEventListener('pointermove', onMove);
  bg.addEventListener('pointerup', onUp);
  bg.addEventListener('pointercancel', onUp);
  window.addEventListener('resize', layout);
  window.addEventListener('keydown', function (e) {
    if (!level || !level.tilt || screen !== 'play') return;
    if (e.key === 'ArrowLeft') setLean(-1);
    if (e.key === 'ArrowRight') setLean(1);
    if (e.key === 'ArrowDown' || e.key === ' ') setLean(0);
  });
  window.addEventListener('deviceorientation', function (e) {
    if (!level || !level.tilt || demo || leanBtn) return;
    var gma = e.gamma;
    if (gma == null || Math.abs(gma) < 6) return;
    if (sim) sim.setTilt(Math.max(-1, Math.min(1, gma / 26)));
    lean = Math.max(-1, Math.min(1, gma / 26));
  });
  if (window.FLUID && FLUID.onQuality) {
    FLUID.onQuality(function () { applyQualityUI(); });
  }
  requestAnimationFrame(frame);
})();
