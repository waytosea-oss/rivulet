/* Rivulet — draw, lean, and let real water do the rest. */
(function () {
  'use strict';
  var LEVELS = window.RIVULET.LEVELS;
  var CHAPTERS = window.RIVULET.CHAPTERS;
  var CELL = WaterSim.CELL, COLS = WaterSim.COLS, ROWS = WaterSim.ROWS;
  var BW = WaterSim.BW, BH = WaterSim.BH;
  var params = new URLSearchParams(location.search);
  var SAVE_KEY = 'rivulet-v3';

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
  var SKY = {
    teach: ['#9fd4ee', '#f6e2c4'],
    float: ['#f3d7a2', '#8ec6ea'],
    vessels: ['#b7d0c8', '#f4e7cf'],
    tilt: ['#f0c9b4', '#d5e4f2'],
    layers: ['#f6e2b8', '#d7ecf6']
  };

  function loadSave() {
    var blank = { v: 3, stars: [], best: [], unlocked: 1, sound: true, music: true, quality: 'auto' };
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return blank;
      var o = JSON.parse(raw);
      if (!o || o.v !== 3) return blank;
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

  function paintBoard() {
    var sky = SKY[(level && level.chapter) || 'teach'] || SKY.teach;
    var grd = g.createLinearGradient(0, 0, 0, view.H);
    grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]);
    g.fillStyle = grd; g.fillRect(0, 0, view.W, view.H);
    var sun = g.createRadialGradient(view.W * 0.78, view.H * 0.12, 8, view.W * 0.78, view.H * 0.12, view.W * 0.32);
    sun.addColorStop(0, 'rgba(255,248,220,.9)'); sun.addColorStop(1, 'rgba(255,248,220,0)');
    g.fillStyle = sun; g.fillRect(0, 0, view.W, view.H);
    var bx = view.x - 14, by = view.y - 14, bw = view.bw + 28, bh = view.bh + 28;
    g.fillStyle = '#b98962'; round(g, bx + 6, by + 10, bw, bh, 26); g.fill();
    g.fillStyle = '#f7f1e6'; round(g, bx, by, bw, bh, 24); g.fill();
    if (!level) return;
    for (var r = 0; r < ROWS; r++) {
      var row = level.map[r] || '';
      for (var c = 0; c < COLS; c++) if (row[c] === '#') drawBlock(c, r);
    }
    drawClosures();
    drawKettles();
    drawPipes();
    drawInk(g);
  }
  function drawBlock(c, r) {
    var rc = cellRect(c, r, 1, 1);
    var e = Math.max(3, rc.w * 0.18);
    g.fillStyle = '#6e8fb0';
    g.beginPath();
    g.moveTo(rc.x + e, rc.y + rc.h);
    g.lineTo(rc.x + rc.w + e * 0.3, rc.y + rc.h);
    g.lineTo(rc.x + rc.w, rc.y + rc.h - e);
    g.lineTo(rc.x, rc.y + rc.h - e);
    g.fill();
    var top = g.createLinearGradient(rc.x, rc.y, rc.x, rc.y + rc.h);
    top.addColorStop(0, '#f4fbff');
    top.addColorStop(0.45, '#8eb4d4');
    top.addColorStop(1, '#5d86aa');
    g.fillStyle = top;
    round(g, rc.x, rc.y, rc.w, rc.h - e * 0.15, Math.min(5, rc.w * 0.2));
    g.fill();
  }
  function drawClosures() {
    if (!sim) return;
    function door(list, open, fill) {
      list.forEach(function (cell) {
        if (open || cell.open) return;
        var rc = cellRect(cell.c, cell.r, 1, 1);
        g.fillStyle = fill;
        round(g, rc.x + 2, rc.y + 2, rc.w - 4, rc.h - 4, 4); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(rc.x + 4, rc.y + 4, rc.w * 0.35, 3);
      });
    }
    door(sim.gates || [], sim.gateOpen, '#d7b15a');
    door(sim.hatches || [], sim.hatchOpen, '#8d6a45');
  }
  function drawKettles() {
    [['S', 0], ['A', 1], ['B', 2], ['O', 8]].forEach(function (pair) {
      var cells = mapCells(pair[0]);
      if (!cells.length) return;
      var top = cells[0];
      cells.forEach(function (p) { if (p.r < top.r) top = p; });
      var rc = cellRect(top.c, top.r, 1, 1);
      var grd = g.createLinearGradient(rc.x, rc.y, rc.x + rc.w, rc.y + rc.h);
      grd.addColorStop(0, '#f0d48a');
      grd.addColorStop(0.45, '#c9842f');
      grd.addColorStop(1, '#7a4e12');
      g.fillStyle = grd;
      round(g, rc.x - rc.w * 0.35, rc.y - rc.h * 0.15, rc.w * 1.7, rc.h * 0.7, rc.w * 0.35);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath();
      g.ellipse(rc.x + rc.w * 0.15, rc.y + rc.h * 0.05, rc.w * 0.18, rc.h * 0.08, -0.4, 0, 7);
      g.fill();
      g.fillStyle = COLORS[pair[1]];
      g.beginPath();
      g.arc(rc.x + rc.w * 0.5, rc.y + rc.h * 0.72, Math.max(3, rc.w * 0.16), 0, 7);
      g.fill();
    });
  }
  function drawPipes() {
    if (!sim || !sim.basins) return;
    sim.basins.forEach(function (b) {
      if (b.link == null || b.link < 0 || !sim.basins[b.link] || b.i > b.link) return;
      var oth = sim.basins[b.link];
      var a = worldToScreen((b.x0 + b.x1) / 2, b.y0);
      var c = worldToScreen((oth.x0 + oth.x1) / 2, oth.y0);
      var mid = worldToScreen((b.x0 + oth.x1) / 2, Math.min(b.y0, oth.y0) - 0.12);
      g.strokeStyle = '#8a5414';
      g.lineWidth = Math.max(8, view.bw * 0.035);
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(mid.x, mid.y, c.x, c.y); g.stroke();
      g.strokeStyle = '#f0d48a';
      g.lineWidth = Math.max(3, view.bw * 0.012);
      g.stroke();
    });
  }
  function drawInk(ctx) {
    if (!sim || !sim.strokes.length) return;
    ctx.strokeStyle = '#2c241c';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(5, 0.05 * view.bw / BW * 40);
    ctx.beginPath();
    sim.strokes.forEach(function (s) {
      s.pts.forEach(function (p, k) {
        var q = worldToScreen(p.x, p.y);
        if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
    });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = Math.max(2, ctx.lineWidth * 0.28);
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
    if (sim) sim.floats.forEach(drawFloat);
    cupRects().forEach(function (cup) {
      var v = sim && sim.vessels[cup.idx];
      o.strokeStyle = 'rgba(255,255,255,.9)';
      o.lineWidth = 3;
      o.beginPath();
      o.moveTo(cup.x + 2, cup.y + 6);
      o.lineTo(cup.x + 2, cup.y + cup.h - 4);
      o.moveTo(cup.x + cup.w - 2, cup.y + 6);
      o.lineTo(cup.x + cup.w - 2, cup.y + cup.h - 4);
      o.stroke();
      o.strokeStyle = 'rgba(40,60,70,.35)';
      o.beginPath();
      o.moveTo(cup.x + cup.w - 5, cup.y + 8);
      o.lineTo(cup.x + cup.w - 5, cup.y + cup.h - 6);
      o.stroke();
      o.strokeStyle = 'rgba(255,255,255,.8)';
      o.beginPath();
      o.ellipse(cup.x + cup.w / 2, cup.y + 4, cup.w / 2, Math.max(4, cup.h * 0.08), 0, 0, 7);
      o.stroke();
      if (v && v.ratio > 0.04) {
        var yy = cup.y + cup.h * (1 - Math.min(1, v.ratio)) ;
        o.strokeStyle = 'rgba(255,255,255,.55)';
        o.beginPath();
        o.ellipse(cup.x + cup.w / 2, yy, cup.w * 0.42, Math.max(3, cup.h * 0.05), 0, 0, 7);
        o.stroke();
      }
      if (v && v.color != null) {
        o.fillStyle = COLORS[v.color] || '#ddd';
        o.fillRect(cup.x + cup.w - 10, cup.y - 14, 10, 10);
      }
    });
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
  function drawFloat(fl) {
    var p = worldToScreen(fl.x, fl.y + fl.hh * 0.1);
    var ppm = view.bw / BW;
    var w = Math.max(16, fl.hw * 2.4 * ppm);
    var h = Math.max(12, fl.hh * 2.2 * ppm);
    o.save();
    o.translate(p.x, p.y);
    o.fillStyle = 'rgba(40,60,70,.18)';
    o.beginPath(); o.ellipse(2, h * 0.35, w * 0.55, h * 0.16, 0, 0, 7); o.fill();
    o.fillStyle = '#f6e27a';
    o.beginPath(); o.ellipse(0, 0, w * 0.52, h * 0.38, 0, 0, 7); o.fill();
    o.fillStyle = '#ffe9a0';
    o.beginPath(); o.ellipse(-w * 0.12, -h * 0.08, w * 0.22, h * 0.12, -0.5, 0, 7); o.fill();
    o.fillStyle = '#f6e27a';
    o.beginPath(); o.arc(w * 0.34, -h * 0.32, h * 0.26, 0, 7); o.fill();
    o.fillStyle = '#e07a2f';
    o.beginPath();
    o.moveTo(w * 0.5, -h * 0.32);
    o.lineTo(w * 0.82, -h * 0.18);
    o.lineTo(w * 0.46, -h * 0.12);
    o.fill();
    o.fillStyle = '#243038';
    o.beginPath(); o.arc(w * 0.4, -h * 0.4, Math.max(1.5, h * 0.06), 0, 7); o.fill();
    o.restore();
  }

  function drawFrame() {
    layout();
    g.clearRect(0, 0, view.W, view.H);
    paintBoard();
    drawOverlay(performance.now());
    if (window.FLUID && FLUID.ok && sim) {
      FLUID.setView(view, BW, BH);
      FLUID.setBackground(bg);
      FLUID.setRadius(sim.RAD * sim.preset.radMul * 3.35);
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
      var h = document.createElement('div'); h.className = 'chap';
      h.innerHTML = '<b></b><span></span>';
      h.querySelector('b').textContent = ch.name;
      h.querySelector('span').textContent = ch.mechanic;
      host.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'grid';
      for (var id = ch.from; id <= ch.to; id++) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'lvbtn';
        var stars = save.stars[id - 1] || 0;
        var locked = id > save.unlocked;
        if (locked) b.classList.add('lock');
        else if (stars) b.classList.add('done');
        b.innerHTML = '<span class="n"></span><span class="st"></span>';
        b.querySelector('.n').textContent = locked ? '' : String(id);
        b.querySelector('.st').textContent = locked ? '' : '★★★'.slice(0, stars);
        if (!locked) b.addEventListener('click', (function (n) { return function () { startLevel(n); }; })(id));
        grid.appendChild(b);
      }
      host.appendChild(grid);
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
        goTitle();
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
