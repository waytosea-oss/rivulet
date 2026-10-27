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
  var booted = false, fluidWait = performance.now();
  var lean = 0, leanBtn = 0;
  var COLORS = ['#3a94f0', '#f0c431', '#e45b86', '#3cbe6a', '#f08a32', '#8a62e0', '#6fbf45', '#e25822', '#e2b043'];
  var THEME = {
    teach:   { sky: ['#7eb6de', '#f6d7b0', '#d7b48a'], land: '#6e9a55', land2: '#8fb56e', sun: 'rgba(255,244,214,.95)', sunX: 0.78, mat: 'wood', plaster: ['#f3e2c8', '#e7d3b4'], frame: ['#c49262', '#6b3e22'] },
    float:   { sky: ['#f0a56a', '#f6d7a2', '#7eb4d4'], land: '#3f7d62', land2: '#6aa088', sun: 'rgba(255,228,180,.95)', sunX: 0.22, mat: 'stone', plaster: ['#efe4cf', '#d9c8aa'], frame: ['#b98962', '#5c4030'] },
    vessels: { sky: ['#9fb8c9', '#e7d7c8', '#cbb59a'], land: '#7f9a90', land2: '#a8c0b4', sun: 'rgba(255,252,245,.9)', sunX: 0.7, mat: 'tile', plaster: ['#f7f1e8', '#e4d9cc'], frame: ['#c4a888', '#6a5344'] },
    tilt:    { sky: ['#f0b89a', '#f7e1c8', '#9eb8c8'], land: '#6e8f4e', land2: '#a3b86a', sun: 'rgba(255,236,200,.95)', sunX: 0.8, mat: 'wood', plaster: ['#f6e6d2', '#e4d0b4'], frame: ['#c4844e', '#6a3e24'] },
    layers:  { sky: ['#f2c56a', '#f6e2b4', '#e0b888'], land: '#c47a3a', land2: '#e0a060', sun: 'rgba(255,236,170,.95)', sunX: 0.3, mat: 'stone', plaster: ['#f8ecd4', '#ead6b0'], frame: ['#d09a4a', '#7a4e18'] },
    weight:  { sky: ['#5e6c7a', '#c4b29a', '#8a7562'], land: '#4e463c', land2: '#6a5c4e', sun: 'rgba(240,220,190,.7)', sunX: 0.75, mat: 'stone', plaster: ['#d9cbb8', '#c4b39e'], frame: ['#8a7560', '#3a3028'] },
    ember:   { sky: ['#3a2438', '#c45a3a', '#e8a06a'], land: '#5a3030', land2: '#8a4030', sun: 'rgba(255,160,90,.8)', sunX: 0.82, mat: 'stone', plaster: ['#e7cbb0', '#c49878'], frame: ['#a06040', '#3a241c'] },
    venom:   { sky: ['#1c3330', '#6a9078', '#c9d4b4'], land: '#2c4638', land2: '#4e6a52', sun: 'rgba(210,230,170,.7)', sunX: 0.2, mat: 'stone', plaster: ['#e4ecd8', '#c9d4bc'], frame: ['#6a7058', '#2c3428'] },
    siphon:  { sky: ['#1a2744', '#3d5a78', '#9aa8b4'], land: '#243444', land2: '#3a5060', sun: 'rgba(210,224,236,.75)', sunX: 0.15, mat: 'stone', plaster: ['#d5dde4', '#b7c4cc'], frame: ['#8a623c', '#3a2a22'] },
    mist:    { sky: ['#c5d4de', '#e7eef2', '#f4efe6'], land: '#8aa098', land2: '#b7c4bc', sun: 'rgba(255,255,255,.85)', sunX: 0.6, mat: 'stone', plaster: ['#f4f1ea', '#e0ddd4'], frame: ['#b0a498', '#6a645c'] },
    mill:    { sky: ['#7eafd0', '#d5e6c4', '#8aaa62'], land: '#5a7a40', land2: '#8aaa58', sun: 'rgba(255,248,220,.95)', sunX: 0.72, mat: 'wood', plaster: ['#f0e2c8', '#dcc8a4'], frame: ['#a86838', '#5a3418'] },
    sand:    { sky: ['#f0c48a', '#f8e6c4', '#e0b080'], land: '#c4956a', land2: '#e0c090', sun: 'rgba(255,244,210,.95)', sunX: 0.8, mat: 'stone', plaster: ['#f6e6c8', '#e8d0a4'], frame: ['#c08048', '#6a4018'] },
    split:   { sky: ['#6a98b8', '#d5e6ea', '#b7c4a0'], land: '#5a7848', land2: '#8aa868', sun: 'rgba(255,255,255,.9)', sunX: 0.28, mat: 'stone', plaster: ['#eef2ea', '#d5e0cc'], frame: ['#8a7058', '#3e342c'] }
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
    document.getElementById('btnQuality').textContent = qualityMode === 'auto' ? 'Auto' : (qualityMode === 'low' ? 'Low' : 'High');
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
    var plaster = ctx.createLinearGradient(view.x, view.y, view.x, view.y + view.bh);
    plaster.addColorStop(0, theme.plaster[0]);
    plaster.addColorStop(1, theme.plaster[1]);
    ctx.fillStyle = plaster;
    ctx.fillRect(view.x, view.y, view.bw, view.bh);
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
        var mat = ch === 'n' ? 'sand' : ch === 'i' || ch === 'e' ? 'ice' : ch === 'o' ? 'stone' : theme.mat;
        drawBlock(ctx, c, r, mat, c * 17 + r * 13 + (level.id || 1));
      }
    }
  }
  function drawBlock(ctx, c, r, mat, seed) {
    var rc = cellRect(c, r, 1, 1);
    var gap = Math.max(1, rc.w * 0.08);
    var x = rc.x + gap, y = rc.y + gap, w = rc.w - gap * 2, h = rc.h - gap * 2;
    var lit, mid, shade;
    if (mat === 'wood') { lit = '#e8c79a'; mid = '#b47848'; shade = '#7a4c28'; }
    else if (mat === 'sand') { lit = '#f3ddb0'; mid = '#d2b07a'; shade = '#a88448'; }
    else if (mat === 'tile') { lit = '#f7f3ec'; mid = '#e4ddd2'; shade = '#c4b8a8'; }
    else if (mat === 'ice') { lit = '#f4fbff'; mid = '#c5e4f4'; shade = '#8eb8d0'; }
    else { lit = '#efe8dc'; mid = '#cfc4b4'; shade = '#9a8c7c'; }
    ctx.fillStyle = shade;
    ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    var body = ctx.createLinearGradient(x, y, x, y + h);
    body.addColorStop(0, lit);
    body.addColorStop(0.55, mid);
    body.addColorStop(1, shade);
    ctx.fillStyle = body;
    ctx.fillRect(x, y, w, h * 0.84);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillRect(x, y, w, Math.max(2, h * 0.12));
    for (var k = 0; k < 4; k++) {
      var px = x + nse(seed + k) * w * 0.8;
      var py = y + nse(seed + k + 4) * h * 0.7;
      ctx.fillStyle = nse(seed + k + 9) > 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(40,24,12,.12)';
      ctx.fillRect(px, py, Math.max(1.5, w * 0.16), Math.max(1.5, h * 0.1));
    }
    if (mat === 'wood') {
      ctx.strokeStyle = 'rgba(90,40,16,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + h * 0.35);
      ctx.lineTo(x + w - 2, y + h * 0.42);
      ctx.stroke();
    }
  }
  function drawClosures() {
    if (!sim) return;
    (sim.gates || []).forEach(function (cell) {
      if (sim.gateOpen || cell.open) return;
      var rc = cellRect(cell.c, cell.r, 1, 1);
      g.fillStyle = '#4a4038';
      g.fillRect(rc.x + 1, rc.y + 1, rc.w - 2, rc.h - 2);
      g.strokeStyle = '#c8c2b8';
      g.lineWidth = Math.max(2, rc.w * 0.12);
      for (var i = 0; i < 3; i++) {
        var x = rc.x + rc.w * (0.28 + i * 0.22);
        g.beginPath();
        g.moveTo(x, rc.y + 3);
        g.lineTo(x, rc.y + rc.h - 3);
        g.stroke();
      }
    });
    (sim.hatches || []).forEach(function (cell) {
      if (sim.hatchOpen || cell.open) return;
      var rc = cellRect(cell.c, cell.r, 1, 1);
      g.fillStyle = '#8d5a32';
      g.fillRect(rc.x + 1, rc.y + rc.h * 0.25, rc.w - 2, rc.h * 0.5);
      g.strokeStyle = 'rgba(255,220,170,.45)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(rc.x + 2, rc.y + rc.h * 0.4);
      g.lineTo(rc.x + rc.w - 2, rc.y + rc.h * 0.48);
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
      ctx.strokeStyle = '#8a5414';
      ctx.lineWidth = Math.max(8, view.bw * 0.035);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mid.x, mid.y, c.x, c.y); ctx.stroke();
      ctx.strokeStyle = '#f3d48a';
      ctx.lineWidth = Math.max(3, view.bw * 0.012);
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
          ctx.fillStyle = 'rgba(90, 160, 60, .55)';
          ctx.beginPath();
          ctx.ellipse(rc.x + rc.w / 2, rc.y + rc.h * 0.62, rc.w * 0.36, rc.h * 0.22, 0, 0, 7);
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
  function drawInk(ctx) {
    if (!sim || !sim.strokes.length) return;
    var width = Math.max(4, (0.042 / BW) * view.bw);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = '#2c241c';
    ctx.beginPath();
    sim.strokes.forEach(function (s) {
      s.pts.forEach(function (p, k) {
        var q = worldToScreen(p.x, p.y);
        if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
    });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = Math.max(1.5, width * 0.28);
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
    var topW = cup.w * 0.96, botW = cup.w * 0.72;
    var top = cup.y + cup.h * 0.06, bot = cup.y + cup.h * 0.94;
    var x = cup.x;
    o.strokeStyle = 'rgba(236, 246, 250, .92)';
    o.lineWidth = Math.max(2, cup.w * 0.06);
    o.beginPath();
    o.moveTo(x + (cup.w - topW) / 2, top);
    o.lineTo(x + (cup.w - botW) / 2, bot);
    o.lineTo(x + (cup.w + botW) / 2, bot);
    o.lineTo(x + (cup.w + topW) / 2, top);
    o.stroke();
    o.beginPath();
    o.ellipse(x + cup.w / 2, top, topW / 2, Math.max(3, cup.h * 0.07), 0, 0, 7);
    o.stroke();
    o.strokeStyle = 'rgba(40, 60, 70, .28)';
    o.lineWidth = 1.5;
    o.beginPath();
    o.moveTo(x + (cup.w + topW) / 2 - 3, top + 4);
    o.lineTo(x + (cup.w + botW) / 2 - 2, bot - 3);
    o.stroke();
    if (v && v.ratio > 0.04) {
      var yy = top + (bot - top) * (1 - Math.min(1, v.ratio));
      o.strokeStyle = 'rgba(255,255,255,.7)';
      o.beginPath();
      o.ellipse(x + cup.w / 2, yy, topW * 0.36, Math.max(2, cup.h * 0.045), 0, 0, 7);
      o.stroke();
    }
    if (v && v.color != null) {
      o.fillStyle = COLORS[v.color] || '#ddd';
      o.beginPath();
      o.arc(x + cup.w - 4, top - 6, 4, 0, 7);
      o.fill();
      o.strokeStyle = 'rgba(255,255,255,.8)';
      o.stroke();
    }
  }
  function drawFloat(fl) {
    var p = worldToScreen(fl.x, fl.y + fl.hh * 0.1);
    var ppm = view.bw / BW;
    var w = Math.max(18, fl.hw * 2.6 * ppm);
    var h = Math.max(14, fl.hh * 2.4 * ppm);
    o.save();
    o.translate(p.x, p.y);
    o.fillStyle = 'rgba(40,60,70,.2)';
    o.beginPath(); o.ellipse(2, h * 0.42, w * 0.55, h * 0.14, 0, 0, 7); o.fill();
    o.fillStyle = '#f4d56a';
    o.beginPath(); o.ellipse(0, 2, w * 0.5, h * 0.36, 0, 0, 7); o.fill();
    o.fillStyle = '#ffe7a2';
    o.beginPath(); o.ellipse(-w * 0.12, -h * 0.02, w * 0.22, h * 0.12, -0.4, 0, 7); o.fill();
    o.fillStyle = '#f6e27a';
    o.beginPath(); o.ellipse(w * 0.28, -h * 0.28, h * 0.28, h * 0.24, 0, 0, 7); o.fill();
    o.fillStyle = '#e07a2f';
    o.beginPath();
    o.moveTo(w * 0.48, -h * 0.3);
    o.quadraticCurveTo(w * 0.9, -h * 0.22, w * 0.5, -h * 0.08);
    o.fill();
    o.fillStyle = '#243038';
    o.beginPath(); o.arc(w * 0.34, -h * 0.34, Math.max(1.6, h * 0.06), 0, 7); o.fill();
    o.strokeStyle = '#e0b84a';
    o.lineWidth = 1.5;
    o.beginPath();
    o.moveTo(-w * 0.15, h * 0.05);
    o.quadraticCurveTo(-w * 0.45, h * 0.2, -w * 0.1, h * 0.28);
    o.stroke();
    o.restore();
  }
  function drawWheel(wh) {
    var p = worldToScreen(wh.cx, wh.cy);
    var rad = Math.max(14, Math.min(wh.hw, wh.hh) * (view.bw / BW) * 1.6);
    o.save();
    o.translate(p.x, p.y);
    o.rotate(wh.angle || 0);
    o.fillStyle = 'rgba(40,30,20,.25)';
    o.beginPath(); o.arc(2, 3, rad, 0, 7); o.fill();
    o.strokeStyle = '#8a5a2a';
    o.lineWidth = Math.max(3, rad * 0.18);
    o.beginPath(); o.arc(0, 0, rad, 0, 7); o.stroke();
    o.strokeStyle = '#e8c48a';
    o.lineWidth = Math.max(1.5, rad * 0.08);
    o.beginPath(); o.arc(0, 0, rad * 0.82, 0, 7); o.stroke();
    o.strokeStyle = '#6a3e1c';
    o.lineWidth = Math.max(2, rad * 0.1);
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      o.beginPath();
      o.moveTo(Math.cos(a) * rad * 0.2, Math.sin(a) * rad * 0.2);
      o.lineTo(Math.cos(a) * rad * 0.82, Math.sin(a) * rad * 0.82);
      o.stroke();
    }
    o.fillStyle = '#c4842f';
    o.beginPath(); o.arc(0, 0, rad * 0.18, 0, 7); o.fill();
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
    o.fillStyle = 'rgba(255, 90, 24, .95)';
    o.beginPath();
    o.moveTo(p.x, p.y + h * 0.15);
    o.quadraticCurveTo(p.x - h * 0.55, p.y - h * 0.15, p.x, p.y - h);
    o.quadraticCurveTo(p.x + h * 0.55, p.y - h * 0.1, p.x, p.y + h * 0.15);
    o.fill();
    o.fillStyle = 'rgba(255, 196, 64, .95)';
    o.beginPath();
    o.moveTo(p.x, p.y + h * 0.08);
    o.quadraticCurveTo(p.x - h * 0.22, p.y - h * 0.05, p.x, p.y - h * 0.55);
    o.quadraticCurveTo(p.x + h * 0.22, p.y - h * 0.02, p.x, p.y + h * 0.08);
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
