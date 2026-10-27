/* Rivulet — particle water plus rigid ink, glasses, and reactions.
   The solver stays deterministic so Node can prove every level.
   World: x right, y up, meters. Board is COLS*CELL by ROWS*CELL.
   Row 0 in a level map is the top. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WaterSim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CELL = 0.08, COLS = 12, ROWS = 16;
  var BW = COLS * CELL, BH = ROWS * CELL;
  /* Particle radius is about half the first build (0.0054 → 0.0026) so the
     pour reads as a fine liquid. Count goes up to fill the same stream.
     Gravity, emit speed, damping and XSPH stay put — the motion should. */
  var RAD = 0.0026, HH = 0.0104, IHH = 1 / HH;
  var GRAV = -9.4;
  var FINE = 4, FS = CELL / FINE, FW = COLS * FINE, FH = ROWS * FINE;
  var MAXN = 3200;
  var HMASK = 4095;
  var MAXNB = 22;
  var K_ST = 8.5, K_NEAR = 24, RHO0 = 3.15, XSPH = 0.08;
  var INK_R = 0.021;
  var PRESETS = {
    low: { name: 'Low', sub: 48, maxN: 980, rate: 460, radMul: 1.05 },
    high: { name: 'High', sub: 60, maxN: 2200, rate: 900, radMul: 1 }
  };
  var MIX = { '0,1': 3, '1,0': 3, '1,2': 4, '2,1': 4, '0,2': 5, '2,0': 5 };
  var CID_VENOM = 6, CID_LAVA = 7, CID_OIL = 8;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function toWorld(c, r) { return { x: c * CELL, y: (ROWS - r) * CELL }; }
  function cellCenter(c, r) { return { x: (c + 0.5) * CELL, y: (ROWS - r - 0.5) * CELL }; }
  /* Goals are authored against the original 460 Hz pour. Faster rates
     spawn more, smaller particles, so the count target scales with them. */
  var GOAL_BASIS = 460;
  function scaleCount(n, preset) {
    return Math.max(6, Math.round(n * (preset.rate / GOAL_BASIS)));
  }

  function create(level, opt) {
    opt = opt || {};
    var preset = PRESETS[opt.preset] || PRESETS.high;
    var rateMul = opt.rateMul || 1;
    var P = {
      n: 0,
      x: new Float32Array(MAXN), y: new Float32Array(MAXN), z: new Float32Array(MAXN),
      vx: new Float32Array(MAXN), vy: new Float32Array(MAXN), vz: new Float32Array(MAXN),
      ox: new Float32Array(MAXN), oy: new Float32Array(MAXN),
      age: new Float32Array(MAXN), cid: new Uint8Array(MAXN), steam: new Uint8Array(MAXN),
      pin: new Uint8Array(MAXN), rho: new Float32Array(MAXN)
    };
    var hStart = new Int32Array(HMASK + 2), hOf = new Int32Array(MAXN), sorted = new Int32Array(MAXN);
    var CI = new Int32Array(MAXN), CJ = new Int32Array(MAXN);
    var nbI = new Int32Array(MAXN * MAXNB), nbQ = new Float32Array(MAXN * MAXNB), nbN = new Uint8Array(MAXN);
    var PR = new Float32Array(MAXN), PN = new Float32Array(MAXN);

    var map = level.map;
    var base = new Uint8Array(COLS * ROWS);
    var ice = new Uint8Array(COLS * ROWS);
    var moss = new Uint8Array(COLS * ROWS);
    var poison = new Uint8Array(COLS * ROWS);
    var mold = new Uint8Array(COLS * ROWS);
    var cupOf = new Int16Array(COLS * ROWS);
    cupOf.fill(-1);
    var solid0 = new Uint8Array(COLS * ROWS);

    var vessels = [];
    function addStaticCup(ch, idx) {
      var c0 = 99, c1 = -1, r0 = 99, r1 = -1, n = 0;
      for (var r = 0; r < ROWS; r++) {
        var row = map[r] || '';
        for (var c = 0; c < COLS; c++) if (row[c] === ch) {
          n++;
          if (c < c0) c0 = c; if (c > c1) c1 = c;
          if (r < r0) r0 = r; if (r > r1) r1 = r;
        }
      }
      if (!n) return;
      var meta = (level.vessels && level.vessels[idx]) || {};
      var x0 = c0 * CELL, x1 = (c1 + 1) * CELL;
      var yTop = (ROWS - r0) * CELL, yBot = (ROWS - (r1 + 1)) * CELL;
      vessels.push({
        dynamic: false, narrow: false, ice: false,
        x: (x0 + x1) / 2, y: (yTop + yBot) / 2,
        hw: (x1 - x0) / 2, hh: (yTop - yBot) / 2,
        x0: (x0 + x1) / 2, y0: (yTop + yBot) / 2,
        a: 0, vx: 0, vy: 0, lean: 0, tipped: false,
        wall: 0.012, mass: 0.8, invM: 1.25,
        goal: meta.goal || level.goal || 48,
        need: meta.need != null ? meta.need : (level.need == null ? 0.72 : level.need),
        color: meta.color != null ? meta.color : (idx === 0 ? level.cupColor : null),
        count: 0, ch: ch
      });
      if (meta.color == null && idx === 0 && level.cupColor != null) vessels[vessels.length - 1].color = level.cupColor;
    }
    addStaticCup('C', 0);
    addStaticCup('D', 1);
    addStaticCup('E', 2);

    for (var r = 0; r < ROWS; r++) {
      var row = map[r] || '';
      for (var c = 0; c < COLS; c++) {
        var ch = row[c] || '.';
        var i = r * COLS + c;
        if (ch === '#' || ch === 'i' || ch === 'H' || ch === 'X') { base[i] = 1; solid0[i] = 1; }
        if (ch === 'i') ice[i] = 1;
        if (ch === 'M') moss[i] = 1;
        if (ch === 'P') poison[i] = 1;
        if (ch === 'o') mold[i] = 1;
        if (ch === 'C') cupOf[i] = 0;
        else if (ch === 'D') cupOf[i] = 1;
        else if (ch === 'E') cupOf[i] = 2;
      }
    }

    var dynSpecs = level.dynCups || [];
    for (var d = 0; d < dynSpecs.length; d++) {
      var spec = dynSpecs[d];
      var x0d = spec.c * CELL, x1d = (spec.c + spec.w) * CELL;
      var yTopD = (ROWS - spec.r) * CELL, yBotD = (ROWS - (spec.r + spec.h)) * CELL;
      vessels.push({
        dynamic: true, narrow: !!spec.narrow, ice: !!spec.ice,
        x: (x0d + x1d) / 2, y: (yTopD + yBotD) / 2,
        hw: (x1d - x0d) / 2, hh: (yTopD - yBotD) / 2,
        x0: (x0d + x1d) / 2, y0: (yTopD + yBotD) / 2,
        a: 0, vx: 0, vy: 0, lean: 0, tipped: false,
        wall: spec.wall || 0.014, mass: spec.mass || 0.65, invM: 1 / (spec.mass || 0.65),
        goal: spec.goal || level.goal || 48,
        need: spec.need != null ? spec.need : (level.need == null ? 0.72 : level.need),
        color: spec.color != null ? spec.color : null,
        count: 0, ch: 'dyn', slide: spec.slide != null ? spec.slide : !!spec.ice
      });
    }

    for (var vi = 0; vi < vessels.length; vi++) {
      vessels[vi].goal = scaleCount(vessels[vi].goal, preset);
    }

    var fires = [];
    var gems = [];
    for (var r2 = 0; r2 < ROWS; r2++) {
      var row2 = map[r2] || '';
      for (var c2 = 0; c2 < COLS; c2++) {
        var ch2 = row2[c2] || '.';
        if (ch2 === 'F') {
          var fp = cellCenter(c2, r2);
          fires.push({
            c: c2, r: r2, x: fp.x, y: fp.y,
            rad: CELL * 0.72,
            max: scaleCount(level.fireHp || 14, preset),
            hp: scaleCount(level.fireHp || 14, preset)
          });
        } else if (ch2 === 'G') {
          var gp = cellCenter(c2, r2);
          gems.push({ c: c2, r: r2, x: gp.x, y: gp.y, lit: false });
        }
      }
    }

    var sealed = new Uint8Array(COLS * ROWS);
    var lavaSeen = new Uint8Array(COLS * ROWS);
    var waterSeen = new Uint8Array(COLS * ROWS);

    var hatchCells = [];
    var gateCells = [];
    for (var hr = 0; hr < ROWS; hr++) {
      var hrow = map[hr] || '';
      for (var hc = 0; hc < COLS; hc++) {
        var hch = hrow[hc] || '.';
        if (hch === 'H') hatchCells.push({ c: hc, r: hr, open: false });
        if (hch === 'X') gateCells.push({ c: hc, r: hr, open: false });
      }
    }
    var hatchNeed = scaleCount(level.hatchNeed || 28, preset);
    var hatchOpen = false;
    var gateOpen = false;
    var gravX = 0, gravY = GRAV;
    var tiltScript = null, useTiltScript = false, tiltUser = 0;

    var floats = (level.floats || []).map(function (f) {
      var w = f.w || 1, h = f.h || 1;
      var x = (f.c + w / 2) * CELL;
      var yTop = (ROWS - f.r) * CELL;
      var yBot = (ROWS - (f.r + h)) * CELL;
      var hh = (yTop - yBot) / 2 * 0.86;
      var hw = (w * CELL) / 2 * 0.62;
      var restY = (yTop + yBot) / 2;
      var openY = f.openRow != null ? (ROWS - f.openRow - 0.5) * CELL : restY + CELL * 3;
      var maxY = f.maxRow != null ? (ROWS - f.maxRow - 0.5) * CELL : openY;
      if (maxY < openY) maxY = openY;
      return {
        kind: f.kind || 'duck',
        x: x, y: restY, hw: hw, hh: hh,
        restY: restY, openY: openY, maxY: maxY,
        floorY: yBot - 0.01,
        shaftC0: f.shaftC0 != null ? f.shaftC0 : f.c - 1,
        shaftC1: f.shaftC1 != null ? f.shaftC1 : f.c + w,
        need: scaleCount(f.need || 70, preset),
        vy: 0, latched: false, n: 0, basin: f.basin || 0
      };
    });
    var pinGap = preset.maxN > 1200 ? 0.0092 : 0.0155;
    var basins = (level.basins || []).map(function (b, idx) {
      var x0 = b.c * CELL, x1 = (b.c + b.w) * CELL;
      var yTop = (ROWS - b.r) * CELL, yBot = (ROWS - (b.r + b.h)) * CELL;
      return {
        i: idx, x0: x0 + 0.008, x1: x1 - 0.008, y0: yBot + 0.01, y1: yTop - 0.004,
        water: 0, oil: 0,
        cap: Math.max(12, scaleCount(b.cap || 80, preset)),
        lipY: b.lipRow != null ? (ROWS - b.lipRow) * CELL : yTop + 1,
        lipSide: b.lipSide == null ? 1 : b.lipSide,
        lowY: b.lowRow != null ? (ROWS - b.lowRow) * CELL : null,
        lowSide: b.lowSide == null ? 1 : b.lowSide,
        spill: b.spill || 'always',
        link: b.link == null ? -1 : b.link,
        leftY: b.leftRow != null ? (ROWS - b.leftRow) * CELL : null,
        rightY: b.rightRow != null ? (ROWS - b.rightRow) * CELL : null,
        leap: b.leap || 1.65
      };
    });

    var fineBase = new Uint8Array(FW * FH);
    var fineHard = new Uint8Array(FW * FH);
    var fineInk = new Uint8Array(FW * FH);

    function stampCell(mask, c, rTop) {
      if (c < 0 || rTop < 0 || c >= COLS || rTop >= ROWS) return;
      var fy0 = (ROWS - 1 - rTop) * FINE, fx0 = c * FINE;
      for (var iy = 0; iy < FINE; iy++) for (var ix = 0; ix < FINE; ix++) mask[(fy0 + iy) * FW + fx0 + ix] = 1;
    }
    function stampCircle(mask, x, y, rad) {
      var c0 = Math.floor((x - rad) / FS), c1 = Math.floor((x + rad) / FS);
      var r0 = Math.floor((y - rad) / FS), r1 = Math.floor((y + rad) / FS);
      var r2 = rad * rad;
      for (var cy = r0; cy <= r1; cy++) for (var cx = c0; cx <= c1; cx++) {
        if (cx < 0 || cy < 0 || cx >= FW || cy >= FH) continue;
        var px = (cx + 0.5) * FS - x, py = (cy + 0.5) * FS - y;
        if (px * px + py * py <= r2) mask[cy * FW + cx] = 1;
      }
    }
    function rebuildStaticFine() {
      fineBase.fill(0);
      for (var i = 0; i < COLS * ROWS; i++) if (solid0[i] || sealed[i]) stampCell(fineBase, i % COLS, (i / COLS) | 0);
    }
    rebuildStaticFine();

    function sourcesOf(ch, cid, budgeted) {
      var list = [];
      for (var rr = 0; rr < ROWS; rr++) {
        var rowS = map[rr] || '';
        for (var cc = 0; cc < COLS; cc++) if (rowS[cc] === ch) list.push({ c: cc, r: rr });
      }
      if (!list.length) return null;
      var sx = 0, top = 99;
      for (var k = 0; k < list.length; k++) {
        sx += list[k].c + 0.5;
        if (list[k].r < top) top = list[k].r;
      }
      return {
        x: sx / list.length * CELL,
        y: (ROWS - top) * CELL - RAD * 2,
        cid: cid, budgeted: budgeted
      };
    }
    var sources = [];
    var s0 = sourcesOf('S', 0, true); if (s0) sources.push(s0);
    var s1 = sourcesOf('A', 1, true); if (s1) sources.push(s1);
    var s2 = sourcesOf('B', 2, true); if (s2) sources.push(s2);
    var sV = sourcesOf('V', CID_VENOM, false); if (sV) sources.push(sV);
    var sL = sourcesOf('L', CID_LAVA, false); if (sL) sources.push(sL);
    var sO = sourcesOf('O', CID_OIL, true); if (sO) sources.push(sO);
    var oilOn = !!level.oil || !!sO;

    var strokes = [];
    var curStroke = null;
    var seed = ((level.id || 1) * 10007 + 11) >>> 0;
    var rng = mulberry32(seed);
    var emitAcc = sources.map(function () { return 0; });
    var time = 0, playTime = 0, playing = false;
    var fill = 0, won = false, winTime = 0, stars = 0;
    var splash = 0, absorbPulse = 0;
    var goalSum = 0;
    for (var gs = 0; gs < vessels.length; gs++) goalSum += vessels[gs].goal;
    if (!goalSum) goalSum = scaleCount(level.goal || 48, preset);
    var budget = Math.max(goalSum + 6, Math.round(goalSum * (level.tank || 2.2)));
    var emitted = 0;
    var hold0 = !!opt.holdPour;
    var hold = hold0;
    var failReason = '';
    var spoiled = false;
    var anchor = !!level.anchor;

    function worldCell(x, y) {
      return { c: Math.floor(x / CELL), r: ROWS - 1 - Math.floor(y / CELL) };
    }
    function blocked(mask, x, y) {
      var fx = Math.floor(x / FS), fy = Math.floor(y / FS);
      if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return false;
      return mask[fy * FW + fx] === 1;
    }
    function circleRect(cx, cy, rad, rx, ry, rw, rh) {
      var qx = Math.max(rx, Math.min(cx, rx + rw));
      var qy = Math.max(ry, Math.min(cy, ry + rh));
      var dx = cx - qx, dy = cy - qy, d2 = dx * dx + dy * dy;
      if (d2 > rad * rad) return null;
      if (d2 < 1e-10) {
        var dl = cx - rx, dr = rx + rw - cx, db = cy - ry, dt = ry + rh - cy;
        var m = Math.min(dl, dr, db, dt);
        if (m === dl) return { nx: -1, ny: 0, depth: rad + dl };
        if (m === dr) return { nx: 1, ny: 0, depth: rad + dr };
        if (m === db) return { nx: 0, ny: -1, depth: rad + db };
        return { nx: 0, ny: 1, depth: rad + dt };
      }
      var d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, depth: rad - d };
    }
    function xform(rod, lx, ly) {
      var c = Math.cos(rod.a), s = Math.sin(rod.a);
      return { x: rod.x + lx * c - ly * s, y: rod.y + lx * s + ly * c };
    }
    function makeRod(pts) {
      var cx = 0, cy = 0, n = pts.length;
      for (var i = 0; i < n; i++) { cx += pts[i].x; cy += pts[i].y; }
      cx /= n; cy /= n;
      var local = new Array(n);
      for (var j = 0; j < n; j++) local[j] = { x: pts[j].x - cx, y: pts[j].y - cy };
      var samples = [];
      var len = 0;
      for (var s = 1; s < n; s++) {
        var ax = local[s - 1].x, ay = local[s - 1].y, bx = local[s].x, by = local[s].y;
        var L = hypot(bx - ax, by - ay);
        len += L;
        var segs = Math.max(1, Math.ceil(L / 0.018));
        for (var k = 0; k < segs; k++) {
          var t = k / segs;
          samples.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
        }
      }
      samples.push({ x: local[n - 1].x, y: local[n - 1].y });
      var mass = clamp(0.35 + len * 2.4, 0.45, 3.2);
      var inertia = Math.max(0.0006, mass * Math.max(len, 0.08) * Math.max(len, 0.08) / 12);
      return {
        x: cx, y: cy, a: 0, vx: 0, vy: 0, w: 0,
        local: local, samples: samples, mass: mass, invM: 1 / mass, invI: 1 / inertia,
        asleep: anchor, dead: false, still: 0, grounded: false, radius: INK_R, len: len
      };
    }
    function rodList() {
      var list = [];
      for (var i = 0; i < strokes.length; i++) {
        if (strokes[i] === curStroke) continue;
        if (strokes[i].rod) list.push(strokes[i].rod);
      }
      return list;
    }
    function rebuildRods() {
      for (var i = 0; i < strokes.length; i++) {
        if (strokes[i] === curStroke) { strokes[i].rod = null; continue; }
        if (strokes[i].pts.length >= 2) strokes[i].rod = makeRod(strokes[i].pts);
      }
    }
    function polyWorld(rod) {
      var out = new Array(rod.local.length);
      for (var i = 0; i < rod.local.length; i++) out[i] = xform(rod, rod.local[i].x, rod.local[i].y);
      return out;
    }

    function pushCircle(x, y, rad) {
      var reach = Math.ceil(rad / FS) + 1;
      var fx = Math.floor(x / FS), fy = Math.floor(y / FS);
      var best = null, bd = 0;
      for (var dy = -reach; dy <= reach; dy++) for (var dx = -reach; dx <= reach; dx++) {
        var cx = fx + dx, cy = fy + dy;
        if (cx < 0 || cy < 0 || cx >= FW || cy >= FH) continue;
        if (fineBase[cy * FW + cx] !== 1) continue;
        var hit = circleRect(x, y, rad, cx * FS, cy * FS, FS, FS);
        if (hit && hit.depth > bd) { best = hit; bd = hit.depth; }
      }
      return best;
    }

    function stepRod(rod, dt) {
      if (rod.dead || rod.asleep) return;
      if (level.settle) {
        rod.vx += gravX * dt;
        rod.vy = Math.max(-3.2, rod.vy + gravY * dt);
        rod.x += rod.vx * dt;
        rod.y += rod.vy * dt;
        var landed = false, lift = 0;
        for (var i = 0; i < rod.samples.length; i += 1) {
          var wp = xform(rod, rod.samples[i].x, rod.samples[i].y);
          var hit = pushCircle(wp.x, wp.y, rod.radius);
          if (hit && hit.ny > 0.2 && hit.depth > lift) { lift = hit.depth; landed = true; }
        }
        if (landed) { rod.y += lift; rod.vy = 0; rod.asleep = true; }
        if (rod.y < -0.3) rod.dead = true;
        return;
      }
      rod.vx += gravX * dt;
      rod.vy += gravY * dt;
      rod.vx *= Math.exp(-0.35 * dt);
      rod.w *= Math.exp(-1.1 * dt);
      var px = rod.x, py = rod.y, pa = rod.a;
      rod.x += rod.vx * dt;
      rod.y += rod.vy * dt;
      rod.a += rod.w * dt;
      var grounded = false;
      for (var iter = 0; iter < 6; iter++) {
        var sx = 0, sy = 0, n = rod.samples.length;
        var desx = new Float32Array(n), desy = new Float32Array(n);
        var any = false;
        for (var i = 0; i < n; i++) {
          var wp = xform(rod, rod.samples[i].x, rod.samples[i].y);
          var hit = pushCircle(wp.x, wp.y, rod.radius);
          if (hit) {
            any = true;
            var dep = hit.depth > 0.028 ? 0.028 : hit.depth;
            desx[i] = wp.x + hit.nx * dep;
            desy[i] = wp.y + hit.ny * dep;
            if (hit.ny > 0.45) grounded = true;
          } else {
            desx[i] = wp.x; desy[i] = wp.y;
          }
          sx += desx[i]; sy += desy[i];
        }
        if (!any) break;
        sx /= n; sy /= n;
        var num = 0, den = 0;
        for (var k = 0; k < n; k++) {
          var lx = rod.samples[k].x, ly = rod.samples[k].y;
          var wx = desx[k] - sx, wy = desy[k] - sy;
          num += lx * wy - ly * wx;
          den += lx * wx + ly * wy;
        }
        rod.x = sx; rod.y = sy;
        if (den * den + num * num > 1e-10) rod.a = Math.atan2(num, den);
      }
      rod.vx = clamp((rod.x - px) / dt, -5, 5);
      rod.vy = clamp((rod.y - py) / dt, -7, 5);
      var da = rod.a - pa;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      rod.w = clamp(da / dt, -7, 7);
      if (grounded) {
        rod.vx *= Math.exp(-7 * dt);
        rod.w *= Math.exp(-8 * dt);
      }
      rod.grounded = grounded;
      var sp = hypot(rod.vx, rod.vy);
      var support = 0;
      if (rod.samples.length) {
        for (var si = 0; si < rod.samples.length; si += 2) {
          var sw = xform(rod, rod.samples[si].x, rod.samples[si].y);
          if (blocked(fineBase, sw.x, sw.y - rod.radius - 0.012)) support++;
        }
        support /= Math.ceil(rod.samples.length / 2);
      }
      if (support > 0.22 && sp < 0.55) {
        rod.vx *= 0.7; rod.w *= 0.6; rod.still += 2;
      }
      if (grounded && sp < 0.08 && Math.abs(rod.w) < 0.35) rod.still++;
      else if (support < 0.22) rod.still = 0;
      if (rod.still > 6) {
        rod.asleep = true;
        rod.vx = 0; rod.vy = 0; rod.w = 0;
      }
      if (rod.y < -0.35 || rod.x < -0.4 || rod.x > BW + 0.4) rod.dead = true;
    }

    function cupLocal(cup, x, y) {
      var dx = x - cup.x, dy = y - cup.y;
      var c = Math.cos(cup.a), s = Math.sin(cup.a);
      return { x: dx * c + dy * s, y: -dx * s + dy * c };
    }
    function separateRodCup(rod, cup) {
      if (rod.dead) return;
      var rodInv = rod.asleep ? 0 : rod.invM;
      var n = rod.samples.length;
      for (var i = 0; i < n; i += 1) {
        var wp = xform(rod, rod.samples[i].x, rod.samples[i].y);
        var hit = circleRect(wp.x, wp.y, rod.radius, cup.x - cup.hw, cup.y - cup.hh, cup.hw * 2, cup.hh * 2);
        if (!hit || hit.depth < 0.0005) continue;
        var inv = rodInv + cup.invM;
        if (inv < 1e-6) continue;
        var corr = hit.depth;
        if (rodInv > 0) {
          rod.x -= hit.nx * corr * (rodInv / inv);
          rod.y -= hit.ny * corr * (rodInv / inv);
        }
        cup.x += hit.nx * corr * (cup.invM / inv);
        cup.y += hit.ny * corr * (cup.invM / inv) * 0.35;
        if (Math.abs(hit.nx) > 0.4) cup.vx += hit.nx * corr * 6;
      }
    }

    function rodStops(cup, dir) {
      var rods = rodList();
      var face = cup.x + dir * cup.hw;
      for (var i = 0; i < rods.length; i++) {
        if (rods[i].dead) continue;
        var pts = polyWorld(rods[i]);
        for (var k = 0; k < pts.length; k++) {
          if (Math.abs(pts[k].y - cup.y) > cup.hh) continue;
          if (dir > 0 && pts[k].x >= face - 0.01 && pts[k].x < face + 0.06) return true;
          if (dir < 0 && pts[k].x <= face + 0.01 && pts[k].x > face - 0.06) return true;
        }
      }
      return false;
    }
    function stepCups(dt) {
      for (var i = 0; i < vessels.length; i++) {
        var cup = vessels[i];
        if (!cup.dynamic || cup.tipped) continue;
        if (cup.slide) {
          cup.y = cup.y0;
          cup.parked = rodStops(cup, cup.slideDir || 1);
          if (!cup.parked) cup.x += (cup.slideSpeed || 0.22) * (cup.slideDir || 1) * dt;
          if (cup.x < 0.05 || cup.x > BW - 0.05) {
            cup.tipped = true; spoiled = true;
            if (!failReason) failReason = 'drop';
          }
          continue;
        }
        cup.x = cup.x0; cup.y = cup.y0; cup.vx = 0; cup.vy = 0; cup.parked = true;
      }
    }

    function rodBraces(cup) {
      var rods = rodList();
      var xL = cup.x - cup.hw, xR = cup.x + cup.hw;
      var y0 = cup.y - cup.hh * 0.2, y1 = cup.y + cup.hh;
      for (var i = 0; i < rods.length; i++) {
        var rod = rods[i];
        if (rod.dead) continue;
        var pts = polyWorld(rod);
        var span = 0, touch = false;
        for (var k = 0; k < pts.length; k++) {
          if (k) span = Math.max(span, Math.abs(pts[k].y - pts[0].y));
          if (pts[k].y < y0 || pts[k].y > y1) continue;
          if ((pts[k].x < cup.x && Math.abs(pts[k].x - xL) < 0.05) || (pts[k].x > cup.x && Math.abs(pts[k].x - xR) < 0.05)) touch = true;
        }
        if (touch && span > CELL * 0.7) return true;
      }
      return false;
    }

    function hsh(i, j) { return (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) & HMASK; }
    function buildGrid() {
      hStart.fill(0);
      for (var i = 0; i < P.n; i++) {
        var a = Math.floor(P.x[i] * IHH), b = Math.floor(P.y[i] * IHH);
        CI[i] = a; CJ[i] = b;
        var h = hsh(a, b); hOf[i] = h; hStart[h + 1]++;
      }
      for (var h = 0; h <= HMASK; h++) hStart[h + 1] += hStart[h];
      var fillH = hStart.slice(0, HMASK + 1);
      for (var i2 = 0; i2 < P.n; i2++) sorted[fillH[hOf[i2]]++] = i2;
    }
    function relax(dt) {
      var dt2 = dt * dt, H2 = HH * HH;
      buildGrid();
      for (var i = 0; i < P.n; i++) {
        if (P.steam[i] || P.pin[i]) { nbN[i] = 0; P.rho[i] = 0; PR[i] = 0; PN[i] = 0; continue; }
        var xi = P.x[i], yi = P.y[i], ci = CI[i], cj = CJ[i];
        var rho = 0, rhoN = 0, cnt = 0, baseI = i * MAXNB;
        for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
          var h = hsh(ci + di, cj + dj);
          for (var s = hStart[h], e = hStart[h + 1]; s < e; s++) {
            var j = sorted[s]; if (j === i || P.steam[j] || P.pin[j]) continue;
            var dx = P.x[j] - xi, dy = P.y[j] - yi, r2 = dx * dx + dy * dy;
            if (r2 >= H2 || r2 < 1e-12) continue;
            var q = 1 - Math.sqrt(r2) * IHH;
            rho += q * q; rhoN += q * q * q;
            if (cnt < MAXNB && j > i) {
              nbI[baseI + cnt] = j; nbQ[baseI + cnt] = q; cnt++;
              if (P.cid[i] <= 2 && P.cid[j] <= 2) {
                var key = P.cid[i] + ',' + P.cid[j], mix = MIX[key];
                if (mix != null && q > 0.28) { P.cid[i] = mix; P.cid[j] = mix; }
              }
            }
          }
        }
        nbN[i] = cnt; P.rho[i] = rho;
        PR[i] = K_ST * (rho - RHO0); PN[i] = K_NEAR * rhoN;
      }
      for (var i2 = 0; i2 < P.n; i2++) {
        var cnt2 = nbN[i2]; if (!cnt2) continue;
        var b2 = i2 * MAXNB;
        for (var k = 0; k < cnt2; k++) {
          var j2 = nbI[b2 + k], q2 = nbQ[b2 + k];
          var dx2 = P.x[j2] - P.x[i2], dy2 = P.y[j2] - P.y[i2];
          var r = (1 - q2) * HH || 1e-6;
          var pr = 0.5 * (PR[i2] + PR[j2]), pn = 0.5 * (PN[i2] + PN[j2]);
          var D = dt2 * (pr * q2 + pn * q2 * q2) * 0.5 / r;
          if (D > 0.045) D = 0.045; else if (D < -0.045) D = -0.045;
          P.x[j2] += dx2 * D; P.y[j2] += dy2 * D;
          P.x[i2] -= dx2 * D; P.y[i2] -= dy2 * D;
          var wx = (P.vx[j2] - P.vx[i2]) * q2 * XSPH * 0.5;
          var wy = (P.vy[j2] - P.vy[i2]) * q2 * XSPH * 0.5;
          P.vx[i2] += wx; P.vy[i2] += wy; P.vx[j2] -= wx; P.vy[j2] -= wy;
          if (oilOn && (P.cid[i2] === CID_OIL) !== (P.cid[j2] === CID_OIL) && P.cid[i2] !== CID_LAVA && P.cid[j2] !== CID_LAVA) {
            var oi = P.cid[i2] === CID_OIL ? i2 : j2;
            var wi = oi === i2 ? j2 : i2;
            if (P.cid[wi] <= 5 && P.y[oi] < P.y[wi] + 0.004) {
              var lift = q2 * 0.02;
              P.y[oi] += lift;
              P.y[wi] -= lift * 0.7;
            }
          }
        }
      }
      if (oilOn) stratify();
    }

    var stratUsed = new Uint8Array(MAXN);
    function stratify() {
      buildGrid();
      stratUsed.fill(0);
      var reach2 = HH * 1.25 * HH * 1.25;
      for (var i = 0; i < P.n; i++) {
        if (P.cid[i] !== CID_OIL || P.steam[i] || P.pin[i] || stratUsed[i]) continue;
        var best = -1, bd = reach2;
        var ci = CI[i], cj = CJ[i];
        for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) {
          var h = hsh(ci + di, cj + dj);
          for (var s = hStart[h], e = hStart[h + 1]; s < e; s++) {
            var j = sorted[s];
            if (j === i || stratUsed[j] || P.steam[j] || P.cid[j] > 5) continue;
            var dx = P.x[j] - P.x[i], dy = P.y[j] - P.y[i];
            if (dy <= 0.0004) continue;
            var d2 = dx * dx + dy * dy;
            if (d2 < bd) { bd = d2; best = j; }
          }
        }
        if (best < 0) continue;
        stratUsed[i] = 1; stratUsed[best] = 1;
        var ox = P.x[i], oy = P.y[i];
        P.x[i] = P.x[best]; P.y[i] = P.y[best];
        P.x[best] = ox; P.y[best] = oy;
      }
    }

    function respond(i, hit) {
      P.x[i] += hit.nx * hit.depth;
      P.y[i] += hit.ny * hit.depth;
      var vn = P.vx[i] * hit.nx + P.vy[i] * hit.ny;
      if (vn < 0) {
        P.vx[i] -= 1.04 * vn * hit.nx;
        P.vy[i] -= 1.04 * vn * hit.ny;
      }
      P.vx[i] *= 0.986; P.vy[i] *= 0.986;
    }
    function collideMask(i, mask) {
      for (var pass = 0; pass < 2; pass++) {
        var x = P.x[i], y = P.y[i];
        var fx = Math.floor(x / FS), fy = Math.floor(y / FS);
        var best = null, bd = 0;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          var cx = fx + dx, cy = fy + dy;
          if (cx < 0 || cy < 0 || cx >= FW || cy >= FH) continue;
          if (mask[cy * FW + cx] !== 1) continue;
          var hit = circleRect(x, y, RAD, cx * FS, cy * FS, FS, FS);
          if (hit && hit.depth > bd) { best = hit; bd = hit.depth; }
        }
        if (!best) break;
        respond(i, best);
      }
    }
    function segmentFree(mask, ox, oy, x, y) {
      var dist = hypot(x - ox, y - oy);
      var n = Math.max(1, Math.ceil(dist / (FS * 0.65)));
      for (var s = 1; s <= n; s++) {
        var t = s / n;
        if (blocked(mask, ox + (x - ox) * t, oy + (y - oy) * t)) return false;
      }
      return true;
    }
    function sweep(i, mask) {
      var ox = P.ox[i], oy = P.oy[i], x = P.x[i], y = P.y[i];
      if (segmentFree(mask, ox, oy, x, y)) return;
      if (segmentFree(mask, ox, oy, x, oy)) { P.y[i] = oy; P.vy[i] *= -0.05; return; }
      if (segmentFree(mask, ox, oy, ox, y)) { P.x[i] = ox; P.vx[i] *= -0.05; return; }
      P.x[i] = ox; P.y[i] = oy;
    }

    function rebuildInk() {
      fineInk.fill(0);
      var rods = rodList();
      for (var i = 0; i < rods.length; i++) {
        if (rods[i].dead) continue;
        var pts = polyWorld(rods[i]);
        for (var k = 1; k < pts.length; k++) {
          var ax = pts[k - 1].x, ay = pts[k - 1].y, bx = pts[k].x, by = pts[k].y;
          var L = hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.012));
          for (var t = 0; t <= n; t++) stampCircle(fineInk, ax + (bx - ax) * t / n, ay + (by - ay) * t / n, INK_R + 0.008);
        }
      }
    }
    function guideInk(i, dt) {
      if (P.pin[i] || P.steam[i] || P.cid[i] === CID_LAVA) return;
      var rods = rodList();
      var best = 0.055, tx = 0, ty = 0, ux = 0, uy = 0, found = false;
      for (var s = 0; s < rods.length; s++) {
        if (rods[s].dead) continue;
        var pts = polyWorld(rods[s]);
        for (var k = 1; k < pts.length; k++) {
          var ax = pts[k - 1].x, ay = pts[k - 1].y, bx = pts[k].x, by = pts[k].y;
          var abx = bx - ax, aby = by - ay, L2 = abx * abx + aby * aby || 1e-8;
          var t = ((P.x[i] - ax) * abx + (P.y[i] - ay) * aby) / L2;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          var qx = ax + abx * t, qy = ay + aby * t;
          var dx = P.x[i] - qx, dy = P.y[i] - qy, d = hypot(dx, dy);
          if (d < best) { best = d; tx = qx - P.x[i]; ty = qy - P.y[i]; ux = abx; uy = aby; found = true; }
        }
      }
      if (!found) return;
      var pull = (0.055 - best) * 42;
      var dl = hypot(tx, ty) || 1;
      P.vx[i] += tx / dl * pull * dt;
      P.vy[i] += ty / dl * pull * dt;
      var ul = hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      if (uy > 0) { ux = -ux; uy = -uy; }
      if (!level.siphon && uy < -0.035) { P.vx[i] += ux * 7.2 * dt; P.vy[i] += uy * 7.2 * dt; }
    }

    function collideDynCup(i) {
      for (var c = 0; c < vessels.length; c++) {
        var cup = vessels[c];
        if (!cup.dynamic || cup.tipped) continue;
        var lp = cupLocal(cup, P.x[i], P.y[i]);
        var iw = cup.hw - cup.wall, ih = cup.hh - cup.wall;
        var walls = [
          [-cup.hw, -cup.hh, cup.wall, cup.hh * 2],
          [cup.hw - cup.wall, -cup.hh, cup.wall, cup.hh * 2],
          [-cup.hw, -cup.hh, cup.hw * 2, cup.wall]
        ];
        var inside = Math.abs(lp.x) < iw && lp.y > -ih && lp.y < cup.hh + 0.02;
        if (inside && lp.y < cup.hh - 0.004) {
          /* keep particles in the bowl: collide inner faces */
          var inner = [
            [-iw, -ih, 0.004, ih + cup.hh],
            [iw - 0.004, -ih, 0.004, ih + cup.hh],
            [-iw, -ih, iw * 2, 0.004]
          ];
          for (var w = 0; w < inner.length; w++) {
            var R = inner[w];
            var hit = circleRect(lp.x, lp.y, RAD, R[0], R[1], R[2], R[3]);
            if (!hit) continue;
            var ca = Math.cos(cup.a), sa = Math.sin(cup.a);
            var nx = hit.nx * ca - hit.ny * sa, ny = hit.nx * sa + hit.ny * ca;
            respond(i, { nx: nx, ny: ny, depth: hit.depth });
            if (Math.abs(hit.nx) > 0.7 && P.cid[i] <= 5) cup.vx += hit.nx * 0.012;
          }
          continue;
        }
        for (var w2 = 0; w2 < walls.length; w2++) {
          var W = walls[w2];
          var hit2 = circleRect(lp.x, lp.y, RAD, W[0], W[1], W[2], W[3]);
          if (!hit2) continue;
          var ca2 = Math.cos(cup.a), sa2 = Math.sin(cup.a);
          var nx2 = hit2.nx * ca2 - hit2.ny * sa2, ny2 = hit2.nx * sa2 + hit2.ny * ca2;
          respond(i, { nx: nx2, ny: ny2, depth: hit2.depth });
          if (Math.abs(hit2.nx) > 0.65 && lp.x * hit2.nx < 0 && P.cid[i] <= 5) cup.vx -= hit2.nx * 0.02;
        }
      }
    }

    function kill(i) {
      var j = --P.n;
      if (i === j) return;
      P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.z[i] = P.z[j];
      P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.vz[i] = P.vz[j];
      P.ox[i] = P.ox[j]; P.oy[i] = P.oy[j];
      P.age[i] = P.age[j]; P.cid[i] = P.cid[j]; P.steam[i] = P.steam[j]; P.pin[i] = P.pin[j]; P.rho[i] = P.rho[j];
    }

    function emit(dt) {
      if (hold) return;
      var sp = 1.55;
      for (var s = 0; s < sources.length; s++) {
        var src = sources[s];
        if (src.budgeted && emitted >= budget) continue;
        var share = sources.length > 1 && src.budgeted ? 0.82 : 1;
        emitAcc[s] += preset.rate * rateMul * dt * share * (src.cid === CID_LAVA ? 0.55 : src.cid === CID_VENOM ? 0.62 : 1);
        var n = Math.floor(emitAcc[s]); emitAcc[s] -= n;
        for (var k = 0; k < n && P.n < preset.maxN && P.n < MAXN; k++) {
          if (src.budgeted && emitted >= budget) break;
          if (src.budgeted) emitted++;
          var f = (k + 0.5) / Math.max(1, n);
          var back = (1 - f) * dt;
          var i = P.n++;
          var jx = (rng() - 0.5) * 0.012;
          P.x[i] = src.x + jx;
          P.y[i] = src.y - sp * back;
          P.z[i] = 0.012 + rng() * 0.02;
          P.vx[i] = jx * 2.2;
          P.vy[i] = -sp;
          P.vz[i] = 0;
          P.ox[i] = P.x[i]; P.oy[i] = P.y[i];
          P.age[i] = 0; P.cid[i] = src.cid; P.steam[i] = 0; P.pin[i] = 0; P.rho[i] = 0;
        }
      }
    }

    function waterish(cid) { return cid <= 5; }
    function liquidish(cid) { return cid <= 5 || cid === CID_OIL; }

    function clearSolids(list) {
      var changed = false;
      for (var i = 0; i < list.length; i++) {
        var id = list[i].r * COLS + list[i].c;
        if (solid0[id]) { solid0[id] = 0; base[id] = 0; changed = true; }
        list[i].open = true;
      }
      if (changed) rebuildStaticFine();
    }
    function restoreSolids(list) {
      for (var i = 0; i < list.length; i++) {
        var id = list[i].r * COLS + list[i].c;
        solid0[id] = 1; base[id] = 1; list[i].open = false;
      }
    }
    function countRegion(x0, x1, y0, y1) {
      var n = 0;
      for (var i = 0; i < P.n; i++) {
        if (P.steam[i] || !liquidish(P.cid[i])) continue;
        if (P.x[i] < x0 || P.x[i] > x1 || P.y[i] < y0 || P.y[i] > y1) continue;
        n++;
      }
      return n;
    }
    function basinLevels(b) {
      var innerH = Math.max(0.05, b.y1 - b.y0);
      var waterH = Math.min(innerH, b.water / b.cap * innerH);
      var oilH = Math.min(Math.max(0, innerH - waterH), b.oil / b.cap * innerH);
      return { innerH: innerH, waterH: waterH, oilH: oilH, waterTop: b.y0 + waterH, top: b.y0 + waterH + oilH };
    }
    function spawnDrop(x, y, vx, vy, cid) {
      if (P.n >= preset.maxN - 1 || P.n >= MAXN - 1) return false;
      var i = P.n++;
      P.x[i] = x; P.y[i] = y; P.z[i] = 0.02;
      P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = 0;
      P.ox[i] = x; P.oy[i] = y;
      P.age[i] = 0; P.cid[i] = cid; P.steam[i] = 0; P.pin[i] = 0; P.rho[i] = 0;
      return true;
    }
    function takeFluid(b, preferOil) {
      if (preferOil && b.oil > 0) { b.oil--; return CID_OIL; }
      if (b.water > 0) { b.water--; return 0; }
      if (b.oil > 0) { b.oil--; return CID_OIL; }
      return -1;
    }
    function pourOut(b, cid, side, y) {
      var leap = CELL * (b.leap || 1.65);
      var x = side >= 0 ? b.x1 + leap : b.x0 - leap;
      return spawnDrop(x, y, side * 0.45, -0.55, cid);
    }
    function captureBasins() {
      if (!basins.length) return;
      for (var i = P.n - 1; i >= 0; i--) {
        if (P.pin[i] || P.steam[i] || P.age[i] < 0.1 || !liquidish(P.cid[i])) continue;
        for (var k = 0; k < basins.length; k++) {
          var b = basins[k];
          if (b.spill === 'hatch' && hatchOpen) continue;
          if (P.x[i] < b.x0 || P.x[i] > b.x1 || P.y[i] < b.y0 || P.y[i] > b.y1 + 0.02) continue;
          if (P.cid[i] === CID_OIL) b.oil++;
          else b.water++;
          kill(i);
          i++;
          break;
        }
      }
    }
    function stepBasins(dt) {
      if (!basins.length && !level.siphon) return;
      captureBasins();
      for (var i = 0; i < basins.length; i++) {
        var b = basins[i];
        if (b.link > i) {
          var c = basins[b.link];
          var la = basinLevels(b), lc = basinLevels(c);
          var diff = la.top - lc.top;
          var move = (diff / la.innerH) * 220 * dt;
          var n = move > 0 ? Math.floor(move) : -Math.floor(-move);
          if (n > 4) n = 4; else if (n < -4) n = -4;
          while (n > 0 && b.water > 0) { b.water--; c.water++; n--; }
          while (n < 0 && c.water > 0) { c.water--; b.water++; n++; }
        }
      }
      var open = gateOpen;
      for (var f = 0; f < floats.length; f++) {
        var fl = floats[f];
        var host = basins[fl.basin] || basins[0];
        if (!host) continue;
        var lv = basinLevels(host);
        fl.n = host.water + host.oil;
        var surface = lv.top;
        var target = surface + fl.hh * 0.15;
        if (target < fl.restY) target = fl.restY;
        if (fl.latched) target = Math.max(target, fl.openY);
        if (target > fl.maxY) target = fl.maxY;
        fl.y += (target - fl.y) * Math.min(1, 8 * dt);
        if (fl.y >= fl.openY - 0.01) { fl.latched = true; open = true; }
      }
      if (open && !gateOpen) { gateOpen = true; clearSolids(gateCells); }
      for (var h = 0; h < basins.length; h++) {
        var basin = basins[h];
        var lv2 = basinLevels(basin);
        if (basin.spill === 'hatch' && !hatchOpen && basin.water + basin.oil >= hatchNeed) {
          hatchOpen = true; clearSolids(hatchCells);
        }
        var spills = 0;
        var budget = basin.spill === 'hatch' ? 8 : 3;
        if (basin.spill === 'hatch' && hatchOpen) {
          while (budget-- > 0 && basin.water + basin.oil > 0) {
            var cid = takeFluid(basin, false);
            if (cid < 0 || !spawnDrop((basin.x0 + basin.x1) / 2, basin.y0 - 0.03, (budget - 1) * 0.04, -1.6, cid)) {
              if (cid === CID_OIL) basin.oil++; else if (cid >= 0) basin.water++;
              break;
            }
          }
          continue;
        }
        if (basin.spill === 'tilt') {
          var tilt = gravX / 8.2;
          var half = (basin.x1 - basin.x0) * 0.5;
          var leftTop = lv2.top + (-tilt) * half * 1.25;
          var rightTop = lv2.top + tilt * half * 1.25;
          if (basin.leftY != null && leftTop > basin.leftY && basin.water + basin.oil > 0) {
            var cidL = takeFluid(basin, lv2.oilH > 0.012);
            if (cidL >= 0 && !pourOut(basin, cidL, -1, Math.min(basin.y1 - 0.01, basin.leftY + 0.01))) {
              if (cidL === CID_OIL) basin.oil++; else basin.water++;
            }
          }
          if (basin.rightY != null && rightTop > basin.rightY && basin.water + basin.oil > 0) {
            var cidR = takeFluid(basin, lv2.oilH > 0.012);
            if (cidR >= 0 && !pourOut(basin, cidR, 1, Math.min(basin.y1 - 0.01, basin.rightY + 0.01))) {
              if (cidR === CID_OIL) basin.oil++; else basin.water++;
            }
          }
          continue;
        }
        if (basin.lowY != null && lv2.waterTop > basin.lowY && basin.water > 0 && spills < budget) {
          var cidW = takeFluid(basin, false);
          if (cidW >= 0 && cidW !== CID_OIL && pourOut(basin, cidW, basin.lowSide, basin.lowY + 0.012)) spills++;
          else if (cidW === CID_OIL) basin.oil++;
          else if (cidW >= 0) basin.water++;
        }
        var allowLip = basin.spill === 'always' || (basin.spill === 'gate' && gateOpen);
        if (allowLip && lv2.top > basin.lipY && basin.water + basin.oil > 0 && spills < budget) {
          var cidT = takeFluid(basin, lv2.oilH > 0.01);
          if (cidT >= 0 && !pourOut(basin, cidT, basin.lipSide, Math.min(basin.y1 - 0.008, basin.lipY + 0.01))) {
            if (cidT === CID_OIL) basin.oil++; else basin.water++;
          }
        }
      }
      if (level.siphon) basinSiphon(dt);
      layoutBasins();
    }
    function basinSiphon(dt) {
      var rods = rodList();
      var moved = 0;
      for (var s = 0; s < rods.length && moved < 3; s++) {
        var rod = rods[s];
        if (rod.dead || rod.samples.length < 5) continue;
        var world = new Array(rod.samples.length);
        var crest = 0;
        for (var k = 0; k < world.length; k++) {
          world[k] = xform(rod, rod.samples[k].x, rod.samples[k].y);
          if (world[k].y > world[crest].y) crest = k;
        }
        if (crest < 2 || crest > world.length - 3) continue;
        var ends = [world[0], world[world.length - 1]];
        var inlet = -1, bin = -1, surface = 0;
        for (var e = 0; e < 2; e++) {
          for (var b = 0; b < basins.length; b++) {
            var box = basins[b];
            var lv = basinLevels(box);
            if (ends[e].x < box.x0 - 0.02 || ends[e].x > box.x1 + 0.02) continue;
            if (ends[e].y > lv.top + 0.02 || ends[e].y < box.y0 - 0.02) continue;
            if (box.water < 4) continue;
            var other = ends[1 - e];
            if (other.y < lv.top - 0.04 && world[crest].y < lv.top + (level.siphonLift || 0.46)) {
              inlet = e; bin = b; surface = lv.top;
            }
          }
        }
        if (inlet < 0) continue;
        var out = ends[1 - inlet];
        var cid = takeFluid(basins[bin], false);
        if (cid < 0) continue;
        var dir = out.x >= ends[inlet].x ? 1 : -1;
        if (!spawnDrop(out.x + dir * 0.02, out.y - 0.02, dir * 0.4, -1.15, cid)) {
          basins[bin].water++;
          continue;
        }
        moved++;
      }
    }
    function layoutBasins() {
      for (var i = P.n - 1; i >= 0; i--) if (P.pin[i]) kill(i);
      for (var b = 0; b < basins.length; b++) {
        var box = basins[b];
        var lv = basinLevels(box);
        stampFluid(box, box.y0, lv.waterH, 0);
        stampFluid(box, lv.waterTop, lv.oilH, CID_OIL);
      }
    }
    function stampFluid(box, yBase, height, cid) {
      if (height < pinGap * 0.65) return;
      var x0 = box.x0 + 0.01, x1 = box.x1 - 0.01;
      var cols = Math.max(1, Math.floor((x1 - x0) / pinGap));
      var rows = Math.max(1, Math.floor(height / pinGap));
      var dx = (x1 - x0) / cols;
      var dy = height / rows;
      for (var ry = 0; ry < rows; ry++) for (var cx = 0; cx < cols; cx++) {
        if (P.n >= MAXN - 1) return;
        var i = P.n++;
        P.x[i] = x0 + (cx + 0.5) * dx;
        P.y[i] = yBase + (ry + 0.45) * dy;
        P.z[i] = 0.018;
        P.vx[i] = 0; P.vy[i] = 0; P.vz[i] = 0;
        P.ox[i] = P.x[i]; P.oy[i] = P.y[i];
        P.age[i] = 1; P.cid[i] = cid; P.steam[i] = 0; P.pin[i] = 1; P.rho[i] = 0;
      }
    }
    function stepHatches() {
      if (!hatchCells.length || hatchOpen) return;
      var c0 = 99, c1 = -1, top = 99;
      for (var i = 0; i < hatchCells.length; i++) {
        if (hatchCells[i].c < c0) c0 = hatchCells[i].c;
        if (hatchCells[i].c > c1) c1 = hatchCells[i].c;
        if (hatchCells[i].r < top) top = hatchCells[i].r;
      }
      var yLine = (ROWS - top) * CELL;
      var depth = CELL * (level.hatchDepth || 4.2);
      var n = countRegion((c0 - 0.2) * CELL, (c1 + 1.2) * CELL, yLine, yLine + depth);
      if (n >= hatchNeed) { hatchOpen = true; clearSolids(hatchCells); }
    }
    function columnHead(c0, c1, yMin) {
      var top = -1, n = 0, low = -1, li = -1;
      var x0 = c0 * CELL, x1 = (c1 + 1) * CELL;
      for (var i = 0; i < P.n; i++) {
        if (P.steam[i] || !waterish(P.cid[i])) continue;
        if (P.x[i] < x0 || P.x[i] > x1 || P.y[i] < yMin) continue;
        n++;
        if (P.y[i] > top) top = P.y[i];
        if (li < 0 || P.y[i] < low) { low = P.y[i]; li = i; }
      }
      return { n: n, top: n ? top : yMin, low: li };
    }
    function stepPipes() {
      var list = level.pipes;
      if (!list || !level.pipeFlow) return;
      for (var p = 0; p < list.length; p++) {
        var pipe = list[p];
        var mouth = (ROWS - (pipe.mouth == null ? ROWS - 2 : pipe.mouth)) * CELL;
        var A = columnHead(pipe.c0, pipe.c1, mouth - CELL * 0.4);
        var B = columnHead(pipe.d0, pipe.d1, mouth - CELL * 0.4);
        var moves = 0;
        while (moves < 2) {
          var from, toC0, toC1, headGap;
          if (A.n >= 2 && A.top > B.top + 0.03 && A.low >= 0) {
            from = A; toC0 = pipe.d0; toC1 = pipe.d1; headGap = A.top - B.top;
          } else if (B.n >= 2 && B.top > A.top + 0.03 && B.low >= 0) {
            from = B; toC0 = pipe.c0; toC1 = pipe.c1; headGap = B.top - A.top;
          } else break;
          var i = from.low;
          P.x[i] = (toC0 + toC1 + 1) * 0.5 * CELL + (moves ? 0.01 : -0.01);
          P.y[i] = mouth + 0.03 + Math.min(0.12, headGap * 0.15);
          P.vx[i] = 0;
          P.vy[i] = 0.85;
          P.ox[i] = P.x[i]; P.oy[i] = P.y[i];
          moves++;
          A = columnHead(pipe.c0, pipe.c1, mouth - CELL * 0.4);
          B = columnHead(pipe.d0, pipe.d1, mouth - CELL * 0.4);
        }
      }
    }
    function stepSiphon(dt) {
      if (!level.siphon) return;
      var rods = rodList();
      for (var s = 0; s < rods.length; s++) {
        var rod = rods[s];
        if (rod.dead || rod.samples.length < 5) continue;
        var world = new Array(rod.samples.length);
        var crest = 0;
        for (var k = 0; k < rod.samples.length; k++) {
          world[k] = xform(rod, rod.samples[k].x, rod.samples[k].y);
          if (world[k].y > world[crest].y) crest = k;
        }
        if (crest < 2 || crest > world.length - 3) continue;
        function poolAt(p) {
          var n = 0, top = -1;
          for (var i = 0; i < P.n; i++) {
            if (P.steam[i] || !waterish(P.cid[i])) continue;
            var dx = P.x[i] - p.x, dy = P.y[i] - p.y;
            if (dx * dx + dy * dy < 0.0064) { n++; if (P.y[i] > top) top = P.y[i]; }
          }
          return { n: n, top: top };
        }
        var A = world[0], B = world[world.length - 1];
        var pA = poolAt(A), pB = poolAt(B);
        var flow = 0, surface = 0;
        if (pA.n >= 6 && pA.top > B.y + 0.045 && (pB.top < 0 || pA.top > pB.top + 0.02)) {
          flow = 1; surface = pA.top;
        } else if (pB.n >= 6 && pB.top > A.y + 0.045 && (pA.top < 0 || pB.top > pA.top + 0.02)) {
          flow = -1; surface = pB.top;
        } else continue;
        if (world[crest].y > surface + (level.siphonLift || 0.5)) continue;
        var spd = 11.5 * dt;
        for (var i = 0; i < P.n; i++) {
          if (P.steam[i] || !waterish(P.cid[i])) continue;
          var best = 0.0036, bi = -1;
          for (var w = 0; w < world.length; w += 1) {
            var dx = P.x[i] - world[w].x, dy = P.y[i] - world[w].y, d2 = dx * dx + dy * dy;
            if (d2 < best) { best = d2; bi = w; }
          }
          if (bi < 0) continue;
          var nxt = bi + flow;
          if (nxt < 0 || nxt >= world.length) {
            P.vy[i] -= 3.4 * dt;
            P.vx[i] += flow * 1.2 * dt;
            continue;
          }
          var tx = world[nxt].x - world[bi].x, ty = world[nxt].y - world[bi].y;
          var L = hypot(tx, ty) || 1;
          P.vx[i] += tx / L * spd;
          P.vy[i] += ty / L * spd;
        }
      }
    }
    function collideFloat(i) {
      for (var f = 0; f < floats.length; f++) {
        var fl = floats[f];
        var hit = circleRect(P.x[i], P.y[i], RAD, fl.x - fl.hw, fl.y - fl.hh, fl.hw * 2, fl.hh * 2);
        if (hit && hit.depth > 0) respond(i, hit);
      }
    }

    function reactions() {
      for (var i = P.n - 1; i >= 0; i--) {
        if (P.pin[i]) continue;
        var wc = worldCell(P.x[i], P.y[i]);
        var inside = wc.c >= 0 && wc.r >= 0 && wc.c < COLS && wc.r < ROWS;
        var idx = inside ? wc.r * COLS + wc.c : -1;
        if (P.cid[i] === CID_LAVA && inside && mold[idx] && !sealed[idx]) lavaSeen[idx] = 1;
        if (waterish(P.cid[i]) && !P.steam[i] && inside && mold[idx] && !sealed[idx]) waterSeen[idx] = 1;
        if (inside && mold[idx] && !sealed[idx] && lavaSeen[idx] && waterSeen[idx]) {
          sealed[idx] = 1;
          stampCell(fineBase, wc.c, wc.r);
        }
        if (P.cid[i] === CID_LAVA && inside && sealed[idx]) { kill(i); i++; continue; }
        if (waterish(P.cid[i]) && !P.steam[i] && inside && moss[idx]) { absorbPulse++; kill(i); i++; continue; }
        if (waterish(P.cid[i]) && !P.steam[i] && inside && poison[idx]) P.cid[i] = CID_VENOM;
        if (waterish(P.cid[i]) && !P.steam[i]) {
          var burnt = false;
          for (var f = 0; f < fires.length; f++) {
            var fire = fires[f];
            if (fire.hp <= 0) continue;
            if (hypot(P.x[i] - fire.x, P.y[i] - fire.y) <= fire.rad) {
              fire.hp--;
              absorbPulse++;
              kill(i); i++;
              burnt = true;
              break;
            }
          }
          if (burnt) continue;
          for (var g = 0; g < gems.length; g++) {
            if (!gems[g].lit && hypot(P.x[i] - gems[g].x, P.y[i] - gems[g].y) < CELL * 0.62) gems[g].lit = true;
          }
        }
      }
    }

    function containDyn(i) {
      for (var c = 0; c < vessels.length; c++) {
        var cup = vessels[c];
        if (!cup.dynamic || cup.tipped) continue;
        var lp = cupLocal(cup, P.x[i], P.y[i]);
        var iw = cup.hw - cup.wall * 1.4, ih = cup.hh - cup.wall;
        if (Math.abs(lp.x) < iw && lp.y > -ih && lp.y < cup.hh * 0.92) return cup;
      }
      return null;
    }

    function step(dt) {
      if (dt > 0.05) dt = 0.05;
      if (won) dt = Math.min(dt, 0.02);
      if (useTiltScript && tiltScript) {
        var g = 0;
        for (var ti = 0; ti < tiltScript.length; ti++) if (playTime + 1e-5 >= tiltScript[ti][0]) g = tiltScript[ti][1];
        gravX = g * 8.2; gravY = GRAV;
      }
      var sub = 1 / preset.sub;
      var acc = step._acc || 0;
      acc += dt;
      var guard = 0;
      while (acc >= sub - 1e-9 && guard < 5) { substep(sub); acc -= sub; guard++; }
      if (guard === 5) acc = 0;
      step._acc = acc;
      time += dt;
      if (playing && !won && !spoiled) playTime += dt;
    }

    function substep(dt) {
      emit(dt);
      var rods = rodList();
      for (var r = 0; r < rods.length; r++) stepRod(rods[r], dt);
      stepCups(dt);
      if (!basins.length) stepSiphon(dt);
      var n = P.n;
      for (var i = 0; i < n; i++) {
        if (P.pin[i]) continue;
        P.vx[i] += gravX * dt;
        P.vy[i] += gravY * dt;
        guideInk(i, dt);
        var dmp = 1 - 0.12 * dt;
        P.vx[i] *= dmp; P.vy[i] *= dmp;
        P.ox[i] = P.x[i]; P.oy[i] = P.y[i];
        P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
        P.age[i] += dt;
      }
      relax(dt);
      for (var i2 = 0; i2 < P.n; i2++) {
        P.vx[i2] = (P.x[i2] - P.ox[i2]) / dt;
        P.vy[i2] = (P.y[i2] - P.oy[i2]) / dt;
        var sp2 = P.vx[i2] * P.vx[i2] + P.vy[i2] * P.vy[i2];
        var cap = gravX !== 0 ? 5.2 : 3;
        if (sp2 > cap * cap) { var s = cap / Math.sqrt(sp2); P.vx[i2] *= s; P.vy[i2] *= s; }
      }
      rebuildInk();
      var prevCup = 0;
      for (var vc = 0; vc < vessels.length; vc++) { prevCup += vessels[vc].count; vessels[vc].count = 0; }
      for (var i3 = P.n - 1; i3 >= 0; i3--) {
        if (P.pin[i3]) continue;
        sweep(i3, fineBase);
        collideMask(i3, fineBase);
        sweep(i3, fineInk);
        collideMask(i3, fineInk);
        collideDynCup(i3);
        collideFloat(i3);
        if (P.x[i3] < -0.05 || P.x[i3] > BW + 0.05 || P.y[i3] < -0.08 || P.y[i3] > BH + 0.12 || P.age[i3] > 16) {
          kill(i3); i3++; continue;
        }
      }
      reactions();
      stepBasins(dt);
      for (var i4 = P.n - 1; i4 >= 0; i4--) {
        if (P.pin[i4]) continue;
        var cup = containDyn(i4);
        var wc = worldCell(P.x[i4], P.y[i4]);
        var staticId = -1;
        if (!cup && wc.c >= 0 && wc.r >= 0 && wc.c < COLS && wc.r < ROWS) staticId = cupOf[wc.r * COLS + wc.c];
        var vessel = cup || (staticId >= 0 ? vessels[staticId] : null);
        if (!vessel || vessel.tipped) continue;
        if (P.cid[i4] === CID_VENOM) {
          spoiled = true;
          if (!failReason) failReason = 'venom';
          kill(i4); i4++;
          continue;
        }
        if (P.cid[i4] === CID_LAVA) {
          spoiled = true;
          if (!failReason) failReason = 'lava';
          kill(i4); i4++;
          continue;
        }
        if (P.steam[i4] || !liquidish(P.cid[i4])) continue;
        if (vessel.color == null) { if (P.cid[i4] > 5) continue; }
        else if (P.cid[i4] !== vessel.color) continue;
        if (vessel.slide && !vessel.parked) continue;
        vessel.count++;
      }
      var minR = vessels.length ? 1 : 0;
      var sumC = 0;
      for (var vi = 0; vi < vessels.length; vi++) {
        var ratio = vessels[vi].goal ? vessels[vi].count / vessels[vi].goal : 0;
        vessels[vi].ratio = ratio;
        if (ratio < minR) minR = ratio;
        sumC += vessels[vi].count;
        if (vessels[vi].narrow && !vessels[vi].tipped) {
          var braced = rodBraces(vessels[vi]);
          vessels[vi].braced = braced;
          if (!braced && (vessels[vi].count > 0 || vessels[vi].lean > 0)) {
            vessels[vi].lean += dt * (vessels[vi].count > 4 ? 1.6 : 0.35);
            if (vessels[vi].lean > 0.9) {
              vessels[vi].tipped = true;
              spoiled = true;
              if (!failReason) failReason = 'tip';
            }
          } else if (braced) vessels[vi].lean = Math.max(0, vessels[vi].lean - dt * 2.4);
        }
      }
      fill = vessels.length ? clamp(minR, 0, 1) : 0;
      if (sumC > prevCup + 2) splash += sumC - prevCup;
      var firesOk = true;
      for (var f = 0; f < fires.length; f++) if (fires[f].hp > 0) firesOk = false;
      var gemsNeeded = !level.gemsRequired || gemsOk();
      var sealNeeded = true;
      if (level.sealRequired) {
        for (var si = 0; si < COLS * ROWS; si++) if (mold[si] && !sealed[si]) sealNeeded = false;
      }
      var cupsOk = vessels.length > 0;
      for (var u = 0; u < vessels.length; u++) {
        if (vessels[u].ratio < vessels[u].need || vessels[u].tipped) cupsOk = false;
        if (vessels[u].narrow && !vessels[u].braced) cupsOk = false;
      }
      if (!won && !spoiled && cupsOk && firesOk && gemsNeeded && sealNeeded && time > 0.4) {
        won = true; winTime = playTime; stars = scoreStars();
      } else if (won) {
        var ns = scoreStars();
        if (ns > stars) stars = ns;
      }
    }

    function inkUsed() {
      var m = 0;
      for (var s = 0; s < strokes.length; s++) {
        var pts = strokes[s].pts;
        for (var i = 1; i < pts.length; i++) m += hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      }
      return m;
    }
    function gemsOk() {
      for (var i = 0; i < gems.length; i++) if (!gems[i].lit) return false;
      return true;
    }
    function scoreStars() {
      var bud = level.ink || 0;
      var u = inkUsed();
      var inkOk3 = !bud || u <= (level.ink3 == null ? bud : level.ink3) + 1e-4;
      var inkOk2 = !bud || u <= (level.ink2 == null ? bud : level.ink2) + 1e-4;
      var t3 = (level.par && level.par[1]) || 22;
      var t2 = (level.par && level.par[0]) || 40;
      var full = fill >= 0.96;
      if (full && inkOk3 && playTime <= t3 && gemsOk()) return 3;
      if (fill >= 0.86 && inkOk2 && playTime <= t2) return 2;
      return 1;
    }
    function stripStrokes() {
      return strokes.map(function (s) {
        return { pts: s.pts.map(function (p) { return { x: p.x, y: p.y }; }) };
      });
    }
    function pushHist() {
      history.push(JSON.stringify({ strokes: stripStrokes() }));
      if (history.length > 40) history.shift();
    }
    var history = [];
    function resetFlags() {
      sealed.fill(0); lavaSeen.fill(0); waterSeen.fill(0);
      hatchOpen = false; gateOpen = false;
      for (var bi = 0; bi < basins.length; bi++) { basins[bi].water = 0; basins[bi].oil = 0; }
      restoreSolids(hatchCells); restoreSolids(gateCells);
      for (var fi = 0; fi < floats.length; fi++) {
        floats[fi].y = floats[fi].restY; floats[fi].vy = 0; floats[fi].latched = false; floats[fi].n = 0;
      }
      rebuildStaticFine();
      for (var f = 0; f < fires.length; f++) fires[f].hp = fires[f].max;
      for (var g = 0; g < gems.length; g++) gems[g].lit = false;
      for (var v = 0; v < vessels.length; v++) {
        var cup = vessels[v];
        cup.x = cup.x0; cup.y = cup.y0; cup.vx = 0; cup.vy = 0; cup.a = 0;
        cup.lean = 0; cup.tipped = false; cup.count = 0; cup.ratio = 0;
      }
      failReason = ''; spoiled = false;
    }
    function resetWater() {
      P.n = 0; emitted = 0; emitAcc = sources.map(function () { return 0; });
      rng = mulberry32(seed);
      time = 0; step._acc = 0; fill = 0; won = false; winTime = 0; stars = 0; splash = 0;
      resetFlags();
      rebuildRods();
    }
    function restore(raw) {
      var o = JSON.parse(raw);
      strokes = o.strokes.map(function (s) { return { pts: s.pts }; });
      curStroke = null;
      resetWater();
    }
    function resample(pts) {
      var out = [{ x: pts[0].x, y: pts[0].y }], acc = 0, stepL = 0.028;
      for (var i = 1; i < pts.length; i++) {
        var ax = out[out.length - 1].x, ay = out[out.length - 1].y;
        var bx = pts[i].x, by = pts[i].y;
        var dx = bx - ax, dy = by - ay, L = hypot(dx, dy);
        if (L < 1e-5) continue;
        var d = stepL - acc;
        while (d <= L) {
          var t = d / L;
          out.push({ x: ax + dx * t, y: ay + dy * t });
          ax = out[out.length - 1].x; ay = out[out.length - 1].y;
          dx = bx - ax; dy = by - ay; L = hypot(dx, dy); d = stepL; acc = 0;
        }
        acc += L;
      }
      var last = pts[pts.length - 1];
      var q = out[out.length - 1];
      if (hypot(q.x - last.x, q.y - last.y) > 0.01) out.push({ x: last.x, y: last.y });
      return out;
    }
    function applySolution(sol) {
      sol = sol || level.solution || {};
      strokes = [];
      (sol.ink || []).forEach(function (line) {
        var pts = line.map(function (p) { return toWorld(p[0], p[1]); });
        if (pts.length >= 2) strokes.push({ pts: resample(pts) });
      });
      curStroke = null;
      tiltScript = sol.tilt || null;
      useTiltScript = !!tiltScript;
      if (!useTiltScript) { gravX = 0; gravY = GRAV; tiltUser = 0; }
      resetWater();
      playing = true;
      hold = false;
    }
    function inkLeft() {
      var bud = level.ink || 0;
      if (!bud) return 0;
      return Math.max(0, bud - inkUsed());
    }

    var api = {
      P: P, level: level, preset: preset,
      CELL: CELL, COLS: COLS, ROWS: ROWS, BW: BW, BH: BH, RAD: RAD,
      get strokes() { return strokes; },
      get rods() { return rodList(); },
      get vessels() { return vessels; },
      get fires() { return fires; },
      get gems() { return gems; },
      get sealed() { return sealed; },
      get floats() { return floats; },
      get hatches() { return hatchCells; },
      get gates() { return gateCells; },
      get basins() { return basins; },
      get hatchOpen() { return hatchOpen; },
      get gateOpen() { return gateOpen; },
      get tilt() { return gravX / 8.2; },
      setTilt: function (v) {
        useTiltScript = false;
        tiltUser = clamp(v, -1, 1);
        gravX = tiltUser * 8.2; gravY = GRAV;
      },
      get time() { return time; }, get playTime() { return playTime; },
      get fill() { return fill; },
      get inCup() {
        var n = 0; for (var i = 0; i < vessels.length; i++) n += vessels[i].count; return n;
      },
      get goal() { return goalSum; },
      get won() { return won; },
      get stars() { return stars || (won ? scoreStars() : 0); },
      get winTime() { return winTime; },
      get inkUsed() { return inkUsed(); }, get inkLeft() { return inkLeft(); },
      get splash() { return splash; },
      takeSplash: function () { var s = splash; splash = 0; return s; },
      takeAbsorb: function () { var s = absorbPulse; absorbPulse = 0; return s; },
      get failReason() { return failReason; },
      get spoiled() { return spoiled; },
      get emitted() { return emitted; },
      get budget() { return budget; },
      step: step,
      resetWater: resetWater,
      releasePour: function () { hold = false; },
      holdPour: function () { hold = true; },
      get pouring() { return !hold; },
      polyline: polyWorld,
      exportState: function () {
        return { strokes: stripStrokes(), playTime: playTime, pouring: !hold };
      },
      importState: function (st) {
        strokes = (st.strokes || []).map(function (s) { return { pts: s.pts.map(function (p) { return { x: p.x, y: p.y }; }) }; });
        curStroke = null;
        hold = st.pouring ? false : hold0;
        playTime = st.playTime || 0;
        playing = true;
        history = [];
        resetWater();
      },
      markPlaying: function () { playing = true; },
      applySolution: applySolution,
      beginStroke: function (x, y) {
        if (!(level.ink > 0) || inkLeft() <= 0.02) return false;
        pushHist();
        curStroke = { pts: [{ x: x, y: y }] };
        strokes.push(curStroke);
        playing = true;
        return true;
      },
      extendStroke: function (x, y) {
        if (!curStroke) return false;
        var pts = curStroke.pts, last = pts[pts.length - 1];
        var dx = x - last.x, dy = y - last.y, L = hypot(dx, dy);
        if (L < 0.016) return true;
        if (inkUsed() + L > (level.ink || 0) + 1e-4) {
          var allow = (level.ink || 0) - inkUsed();
          if (allow <= 0.004) return false;
          var t = allow / L;
          pts.push({ x: last.x + dx * t, y: last.y + dy * t });
          return false;
        }
        pts.push({ x: x, y: y });
        return true;
      },
      endStroke: function () {
        if (!curStroke) return;
        if (curStroke.pts.length < 2) strokes.pop();
        else {
          curStroke.pts = resample(curStroke.pts);
          curStroke.rod = makeRod(curStroke.pts);
        }
        curStroke = null;
        playing = true;
      },
      undo: function () {
        if (!history.length) return false;
        restore(history.pop());
        playing = true;
        return true;
      },
      canUndo: function () { return history.length > 0; },
      restart: function () {
        strokes = []; history = []; curStroke = null;
        playTime = 0; playing = false; hold = hold0;
        tiltScript = null; useTiltScript = false; tiltUser = 0; gravX = 0; gravY = GRAV;
        resetWater();
      },
      probe: function (x, y) { return blocked(fineBase, x, y) ? 1 : 0; },
      debugGrid: function () {
        var g = [];
        for (var rr = 0; rr < ROWS; rr++) g.push(new Array(COLS).fill(0));
        for (var i = 0; i < P.n; i++) {
          var c = Math.floor(P.x[i] / CELL), rb = Math.floor(P.y[i] / CELL), mr = ROWS - 1 - rb;
          if (mr >= 0 && mr < ROWS && c >= 0 && c < COLS) g[mr][c]++;
        }
        var lines = [];
        for (var r3 = 0; r3 < ROWS; r3++) {
          var s = '';
          for (var c3 = 0; c3 < COLS; c3++) {
            var ch = (map[r3] || '.')[c3] || '.';
            if (sealed[r3 * COLS + c3]) ch = 'o';
            if (g[r3][c3] > 0) ch = g[r3][c3] > 9 ? '*' : String(Math.min(9, g[r3][c3]));
            s += ch;
          }
          lines.push(s);
        }
        var extra = vessels.map(function (v, idx) {
          return 'cup' + idx + '=' + v.count + '/' + v.goal + (v.tipped ? ' TIP' : '') + (v.lean ? ' lean' + v.lean.toFixed(2) : '');
        }).join(' ');
        var fr = fires.map(function (f) { return 'fire' + f.hp; }).join(' ');
        var gm = gems.map(function (gem) { return gem.lit ? 'G' : 'g'; }).join('');
        return lines.join('\n') + '\n' + extra + ' ' + fr + ' gems:' + gm + ' fail:' + (failReason || '-') + ' fill:' + fill.toFixed(2);
      }
    };
    return api;
  }

  return {
    create: create, PRESETS: PRESETS, CELL: CELL, COLS: COLS, ROWS: ROWS, BW: BW, BH: BH, RAD: RAD,
    toWorld: toWorld, CID_VENOM: CID_VENOM, CID_LAVA: CID_LAVA
  };
});
