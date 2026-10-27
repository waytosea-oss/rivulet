/* Rivulet level book. Maps are 12×16, row 0 at the top.
   Two lessons, then one real-water idea per chapter. The last level of a
   chapter mixes that idea with another. tools/verify.mjs runs the authored
   solution on both presets and checks a straight line does not win. */
(function (root, factory) {
  var out = factory();
  if (typeof module === 'object' && module.exports) module.exports = out;
  else root.RIVULET = out;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var COLS = 12, ROWS = 16;
  var CHAPTERS = [
    { id: 'teach', name: 'First Pour', mechanic: 'Draw the water home', from: 1, to: 2 },
    { id: 'float', name: 'Rise', mechanic: 'Water lifts what floats', from: 3, to: 5 },
    { id: 'vessels', name: 'Level', mechanic: 'Columns share one waterline', from: 6, to: 8 },
    { id: 'tilt', name: 'Lean', mechanic: 'Tip the bowl, the water runs', from: 9, to: 10 },
    { id: 'layers', name: 'Layers', mechanic: 'Oil floats. Water sinks.', from: 11, to: 12 },
    { id: 'weight', name: 'Weight', mechanic: 'A full tank opens the floor', from: 13, to: 15 },
    { id: 'ember', name: 'Ember', mechanic: 'Water puts the fire out', from: 16, to: 17 },
    { id: 'venom', name: 'Venom', mechanic: 'Keep poison out of the glass', from: 18, to: 19 },
    { id: 'siphon', name: 'Siphon', mechanic: 'The crest still pulls the pour', from: 20, to: 20 },
    { id: 'mist', name: 'Mist', mechanic: 'Thaw a gap, or rise as steam', from: 21, to: 24 },
    { id: 'mill', name: 'Mill', mechanic: 'The wheel opens the gate', from: 25, to: 26 },
    { id: 'sand', name: 'Sand', mechanic: 'Water washes the plug away', from: 27, to: 28 },
    { id: 'split', name: 'Split', mechanic: 'One pour feeds two glasses', from: 29, to: 30 }
  ];

  function inkLen(lines) {
    var m = 0;
    (lines || []).forEach(function (pts) {
      for (var i = 1; i < pts.length; i++) {
        var dx = (pts[i][0] - pts[i - 1][0]) * 0.08;
        var dy = (pts[i][1] - pts[i - 1][1]) * 0.08;
        m += Math.sqrt(dx * dx + dy * dy);
      }
    });
    return m;
  }
  function findChar(map, ch) {
    var list = [];
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if ((map[r] || '')[c] === ch) list.push({ c: c, r: r });
    return list;
  }
  function cupBox(map, ch) {
    var cells = findChar(map, ch);
    if (!cells.length) return null;
    var c0 = 99, c1 = -1, r0 = 99, r1 = -1;
    cells.forEach(function (p) {
      if (p.c < c0) c0 = p.c; if (p.c > c1) c1 = p.c;
      if (p.r < r0) r0 = p.r; if (p.r > r1) r1 = p.r;
    });
    return { c: (c0 + c1 + 1) / 2, r: r0 + 0.15 };
  }
  function straightNaive(lv) {
    var lines = [];
    var srcCh = ['S', 'A', 'B', 'O'];
    var cups = [];
    ['C', 'D', 'E'].forEach(function (ch) {
      var b = cupBox(lv.map, ch);
      if (b) cups.push(b);
    });
    (lv.dynCups || []).forEach(function (d) {
      cups.push({ c: d.c + d.w / 2, r: d.r + 0.2 });
    });
    if (!cups.length) return lines;
    srcCh.forEach(function (ch) {
      var srcs = findChar(lv.map, ch);
      if (!srcs.length) return;
      srcs.sort(function (a, b) { return a.r - b.r; });
      var s = srcs[0];
      cups.forEach(function (cup) {
        lines.push([[s.c + 0.5, s.r + 1.15], [cup.c, cup.r]]);
      });
    });
    return lines;
  }

  var levels = [];
  function push(lv) {
    if (lv.map.length !== ROWS) throw new Error(lv.name + ' rows ' + lv.map.length);
    for (var i = 0; i < lv.map.length; i++) {
      if (lv.map[i].length !== COLS) throw new Error(lv.name + ' row ' + i + ' len ' + lv.map[i].length);
    }
    lv.id = levels.length + 1;
    lv.par = lv.par || [48, 22];
    lv.tank = lv.tank || 1.7;
    lv.need = lv.need == null ? 0.7 : lv.need;
    lv.goal = lv.goal || 42;
    var slen = inkLen(lv.solution && lv.solution.ink);
    var nlen = 0;
    straightNaive(lv).forEach(function (ln) { nlen = Math.max(nlen, inkLen([ln])); });
    if (lv.ink3 == null) lv.ink3 = Math.max(0.12, slen * 1.28);
    if (lv.ink2 == null) lv.ink2 = Math.max(lv.ink3 + 0.04, slen * 1.85);
    if (lv.ink == null) lv.ink = Math.max(lv.ink2 + 0.06, slen * 2.5, nlen * 1.12, 0.45);
    lv._naive = straightNaive(lv);
    levels.push(lv);
  }
  function M(s) {
    var rows = s.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
    rows.forEach(function (l, i) {
      if (l.length !== COLS) throw new Error('map line ' + i + ' is ' + l.length + ': ' + l);
    });
    return rows;
  }

  push({
    name: 'First Drop', chapter: 'teach', settle: true, tutorial: true, hold: true,
    coach: 'Drag a line from the falling water into the glass. The ink drops until it lands, then the pour follows it.',
    hint: 'One gentle slope is enough. The glass sits to the right of the stream.',
    goal: 40, tank: 2.2, need: 0.72,
    map: M(`
############
#..S.......#
#..S.......#
#..........#
#..........#
#..........#
#..........#
#..........#
#.....#...##
#.....#CCC##
#.....#CCC##
#.....#CCC##
#.....######
#..........#
#..........#
############
`),
    solution: { ink: [[[2.6, 3.1], [5.2, 6.0], [8.5, 7.7]]] }
  });

  push({
    name: 'Around the Bend', chapter: 'teach', anchor: true, tutorial: true, hold: true,
    coach: 'The shelf sits under the spout. Bend the line over it, then down into the glass.',
    hint: 'Stay above the shelf, then drop into the glass on the right.',
    goal: 36, tank: 2.4, need: 0.62, ink: 2.4,
    map: M(`
############
#S.........#
#S.........#
#..........#
#######....#
#######....#
#.......CCC#
#.......CCC#
#.......CCC#
#.......####
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[1.4, 2.9], [8.4, 3.4], [8.6, 6.2]]] }
  });

  push({
    name: 'The Duck', chapter: 'float', anchor: true, hold: true,
    coach: 'Fill the well. The duck rises and opens the side, and the water follows.',
    hint: 'Guide the pour into the left well. A line to the glass hits the roof.',
    goal: 32, tank: 4.5, need: 0.55, ink: 2.8,
    basins: [{ c: 1, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: 1, spill: 'gate' }],
    floats: [{ c: 1, r: 11, w: 1, h: 2, basin: 0, openRow: 10, maxRow: 7, kind: 'duck' }],
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#..........#
#..X.......#
#..X.......#
#..#.......#
#..#######.#
#..#CCC....#
#..#CCC....#
#..#CCC....#
#######....#
#..........#
####.......#
`),
    solution: { ink: [[[10.2, 3.1], [6.0, 4.0], [1.6, 4.7]]] }
  });

  push({
    name: 'The Far Bank', chapter: 'float', anchor: true, hold: true,
    coach: 'Same duck, other shore. Fill the right well until it lifts the gate.',
    hint: 'Guide the pour into the right well. The roof stops a line to the glass.',
    goal: 32, tank: 4.5, need: 0.55, ink: 2.8,
    basins: [{ c: 9, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: -1, spill: 'gate' }],
    floats: [{ c: 10, r: 11, w: 1, h: 2, basin: 0, openRow: 10, maxRow: 7, kind: 'duck' }],
    map: M(`
############
#S.........#
#S.........#
#..........#
#..........#
#..........#
#.......X..#
#.......X..#
#.......#..#
#.#######..#
#....CCC#..#
#....CCC#..#
#....CCC#..#
#....#######
#..........#
#.......####
`),
    solution: { ink: [[[1.4, 3.1], [5.6, 4.0], [10.0, 4.7]]] }
  });

  push({
    name: 'Duck and Stone', chapter: 'float', anchor: true, hold: true, gemsRequired: true, exam: true,
    coach: 'Fill the well so the duck opens the gate. The pour has to wake the stone on the way.',
    hint: 'The stone sits in the channel under the spout. A line to the glass misses it.',
    goal: 32, tank: 4.8, need: 0.48, ink: 2.8,
    basins: [{ c: 1, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: 1, spill: 'gate' }],
    floats: [{ c: 1, r: 11, w: 1, h: 2, basin: 0, openRow: 10, maxRow: 7, kind: 'duck' }],
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#..........#
#..X.......#
#..X.......#
#..#..G....#
#..#######.#
#..#CCC....#
#..#CCC....#
#..#CCC....#
#######....#
#..........#
####.......#
`),
    solution: { ink: [[[10.2, 3.1], [6.0, 4.0], [1.6, 4.7]]] }
  });

  push({
    name: 'Two Columns', chapter: 'vessels', anchor: true, hold: true,
    coach: 'The columns are joined at the bottom. Fill the left one and the right one rises.',
    hint: 'Pour into the left shaft. The glass is fed from the right waterline.',
    goal: 28, tank: 4.2, need: 0.5, ink: 2.4,
    basins: [
      { c: 1, r: 5, w: 2, h: 6, cap: 42, lipRow: 1, spill: 'always', link: 1 },
      { c: 4, r: 5, w: 2, h: 6, cap: 42, lipRow: 9, lipSide: 1, spill: 'always', leap: 2.5 }
    ],
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#..#..#....#
#..#..#....#
#..#..######
#..#..#.CCC#
#..#..#.CCC#
#..#..#.CCC#
######.#####
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[10.2, 3.1], [1.8, 4.6]]] }
  });

  push({
    name: 'The Far Column', chapter: 'vessels', anchor: true, hold: true,
    coach: 'Pour into the right shaft. The join at the bottom lifts the left one.',
    hint: 'The glass is fed from the left waterline. Do not draw to it.',
    goal: 28, tank: 4.2, need: 0.5, ink: 2.4,
    basins: [
      { c: 8, r: 5, w: 2, h: 6, cap: 42, lipRow: 1, spill: 'always', link: 1 },
      { c: 5, r: 5, w: 2, h: 6, cap: 42, lipRow: 9, lipSide: -1, spill: 'always', leap: 2.5 }
    ],
    map: M(`
############
#S.........#
#S.........#
#..........#
#..........#
#....#..#..#
######..#..#
#CCC.#..#..#
#CCC.#..#..#
#CCC.#..#..#
#####.######
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[1.4, 3.1], [9.2, 4.6]]] }
  });

  push({
    name: 'Stone in the Shaft', chapter: 'vessels', anchor: true, hold: true, gemsRequired: true, exam: true,
    coach: 'Fill the left column until the right one spills. The stone in the shaft has to wake.',
    hint: 'Pour into the left shaft. The stone is in that column.',
    goal: 28, tank: 4.2, need: 0.5, ink: 2.4,
    basins: [
      { c: 1, r: 5, w: 2, h: 6, cap: 42, lipRow: 1, spill: 'always', link: 1 },
      { c: 4, r: 5, w: 2, h: 6, cap: 42, lipRow: 9, lipSide: 1, spill: 'always', leap: 2.5 }
    ],
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#..#..#....#
#G.#..#....#
#..#..######
#..#..#.CCC#
#..#..#.CCC#
#..#..#.CCC#
######.#####
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[10.2, 3.1], [1.8, 4.6]]] }
  });

  push({
    name: 'Tip the Bowl', chapter: 'tilt', tilt: true, anchor: true,
    coach: 'The bowl holds the pour. Lean left and the water climbs the lip.',
    hint: 'Use Lean left. A drawn line cannot get under the roof.',
    goal: 22, tank: 1.7, need: 0.42, ink: 0,
    basins: [{ c: 5, r: 4, w: 4, h: 3, cap: 70, spill: 'tilt', leftRow: 5, rightRow: 3, leap: 2.1 }],
    map: M(`
############
#......S...#
#......S...#
#..........#
####.......#
#CCC.......#
#CCC.......#
#CCC.......#
##########.#
#..........#
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [], tilt: [[0.4, -1], [4.5, -1]] }
  });

  push({
    name: 'The Other Lip', chapter: 'tilt', tilt: true, anchor: true, exam: true,
    coach: 'The bowl holds the pour. Lean right and the water climbs that lip.',
    hint: 'Use Lean right. A drawn line cannot get under the roof.',
    goal: 22, tank: 1.7, need: 0.42, ink: 0,
    basins: [{ c: 3, r: 4, w: 4, h: 3, cap: 70, spill: 'tilt', leftRow: 3, rightRow: 5, leap: 2.1 }],
    map: M(`
############
#...S......#
#...S......#
#..........#
#.......####
#.......CCC#
#.......CCC#
#.......CCC#
#.##########
#..........#
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [], tilt: [[0.4, 1], [4.5, 1]] }
  });

  push({
    name: 'Oil on Water', chapter: 'layers', oil: true, anchor: true,
    coach: 'Wait. Oil floats over the high lip. Water leaves by the low one.',
    hint: 'Do not draw. A straight line to each glass is blocked by the roof.',
    goal: 22, tank: 3.4, need: 0.5, ink: 2.2, ink3: 2.2, ink2: 2.2,
    vessels: [{ color: 0, goal: 20, need: 0.45 }, { color: 8, goal: 16, need: 0.4 }],
    basins: [{ c: 4, r: 4, w: 4, h: 4, cap: 34, lowRow: 7.8, lowSide: -1, lipRow: 7.25, lipSide: 1, spill: 'always', leap: 2.4 }],
    map: M(`
############
#...S.O....#
#...S.O....#
#..........#
#..........#
####....####
#CCC....DDD#
#CCC....DDD#
#CCC....DDD#
############
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [] }
  });

  push({
    name: 'Oil the Other Way', chapter: 'layers', oil: true, anchor: true, exam: true,
    coach: 'Now the oil leaves to the left and the water to the right. Wait for both.',
    hint: 'Do not draw. Each glass wants a different layer.',
    goal: 22, tank: 3.4, need: 0.5, ink: 2.2, ink3: 2.2, ink2: 2.2,
    vessels: [{ color: 8, goal: 16, need: 0.4 }, { color: 0, goal: 20, need: 0.45 }],
    basins: [{ c: 4, r: 4, w: 4, h: 4, cap: 34, lowRow: 7.8, lowSide: 1, lipRow: 7.25, lipSide: -1, spill: 'always', leap: 2.4 }],
    map: M(`
############
#...O.S....#
#...O.S....#
#..........#
#..........#
####....####
#CCC....DDD#
#CCC....DDD#
#CCC....DDD#
############
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [] }
  });

  push({
    name: 'The Floor Gives', chapter: 'weight', anchor: true, hold: true,
    coach: 'Fill the left tank. When it is heavy enough the floor opens and the water drops into the glass.',
    hint: 'Guide the pour into the open tank on the left. The wall hides the glass until the floor drops.',
    goal: 24, tank: 3.8, need: 0.42, ink: 2.4, hatchNeed: 24,
    basins: [{ c: 1, r: 3, w: 1, h: 6, cap: 36, spill: 'hatch' }],
    map: M(`
############
#....S.....#
#....S.....#
#.##.......#
#.#########.
#.#########.
#.#########.
#.H###.....#
#.H###.....#
#CC###.....#
#CC###.....#
#CC###.....#
#####......#
#..........#
#..........#
############
`),
    solution: { ink: [[[5.4, 2.1], [1.35, 2.95], [1.35, 7.6]]] }
  });

  push({
    name: 'A Stone Below', chapter: 'weight', anchor: true, hold: true, gemsRequired: true,
    coach: 'Fill the tank until the floor opens. The stone in the shaft has to wake first.',
    hint: 'Guide the pour down the left shaft. The stone is in that shaft.',
    goal: 24, tank: 3.8, need: 0.42, ink: 2.4, hatchNeed: 24,
    basins: [{ c: 1, r: 3, w: 1, h: 6, cap: 36, spill: 'hatch' }],
    map: M(`
############
#....S.....#
#....S.....#
#.##.......#
#G#########.
#.#########.
#.#########.
#.H###.....#
#.H###.....#
#CC###.....#
#CC###.....#
#CC###.....#
#####......#
#..........#
#..........#
############
`),
    solution: { ink: [[[5.4, 2.1], [1.35, 2.95], [1.35, 7.6]]] }
  });

  push({
    name: 'Weight and Flame', chapter: 'weight', anchor: true, hold: true, fireHp: 5, exam: true,
    coach: 'The pour must put the flame out in the shaft, then fill the tank until the floor opens.',
    hint: 'Stay in the left shaft. The flame dies, then the floor gives.',
    goal: 24, tank: 4.2, need: 0.42, ink: 2.4, hatchNeed: 24,
    basins: [{ c: 1, r: 3, w: 1, h: 6, cap: 36, spill: 'hatch' }],
    map: M(`
############
#....S.....#
#....S.....#
#.##.......#
#.#########.
#F#########.
#.#########.
#.H###.....#
#.H###.....#
#CC###.....#
#CC###.....#
#CC###.....#
#####......#
#..........#
#..........#
############
`),
    solution: { ink: [[[5.4, 2.1], [1.35, 2.95], [1.35, 7.6]]] }
  });

  push({
    name: 'Put It Out', chapter: 'ember', anchor: true, hold: true, fireHp: 6,
    coach: 'The flame eats the first of the pour. Run the line through it, then down into the glass.',
    hint: 'Cross the flame, then drop into the glass. A straight line leaves the flame burning.',
    goal: 24, tank: 3.6, need: 0.45, ink: 2.8,
    map: M(`
############
#S.........#
#S.........#
#..........#
#..F.......#
#####......#
#####......#
#.......CCC#
#.......CCC#
#.......CCC#
#######.####
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[1.5, 2.4], [3.5, 4.5], [8.6, 6.2], [8.6, 8.2]]] }
  });

  push({
    name: 'The Far Flame', chapter: 'ember', anchor: true, hold: true, fireHp: 6, exam: true,
    coach: 'The flame is on the right. Put it out on the way into the glass.',
    hint: 'Start under the spout, cross the flame, then drop on the left.',
    goal: 24, tank: 3.6, need: 0.45, ink: 2.8,
    map: M(`
############
#.........S#
#.........S#
#..........#
#.......F..#
#......#####
#......#####
#CCC.......#
#CCC.......#
#CCC.......#
####.#######
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[10.5, 2.4], [8.5, 4.5], [3.4, 6.2], [3.4, 8.2]]] }
  });

  push({
    name: 'Venom on the Shelf', chapter: 'venom', anchor: true, hold: true,
    coach: 'Venom sits on the straight drop. Fill the well and let the duck open a clean path.',
    hint: 'Pour into the left well. A line across the venom spoils the glass.',
    goal: 32, tank: 4.5, need: 0.55, ink: 2.8,
    basins: [{ c: 1, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: 1, spill: 'gate' }],
    floats: [{ c: 1, r: 11, w: 1, h: 2, basin: 0, openRow: 10, maxRow: 7, kind: 'duck' }],
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#..........#
#..X.......#
#..X..PP...#
#..#.......#
#..#######.#
#..#CCC....#
#..#CCC....#
#..#CCC....#
#######....#
#..........#
####.......#
`),
    solution: { ink: [[[10.2, 3.1], [6.0, 4.0], [1.6, 4.7]]] }
  });

  push({
    name: 'Venom on the Left', chapter: 'venom', anchor: true, hold: true, exam: true,
    coach: 'The venom is on the other side. Fill the right well.',
    hint: 'Guide the pour into the right well. Leave the venom alone.',
    goal: 32, tank: 4.5, need: 0.55, ink: 2.8,
    basins: [{ c: 9, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: -1, spill: 'gate' }],
    floats: [{ c: 10, r: 11, w: 1, h: 2, basin: 0, openRow: 10, maxRow: 7, kind: 'duck' }],
    map: M(`
############
#S.........#
#S.........#
#..........#
#..........#
#..........#
#.......X..#
#...PP..X..#
#.......#..#
#.#######..#
#....CCC#..#
#....CCC#..#
#....CCC#..#
#....#######
#..........#
#.......####
`),
    solution: { ink: [[[1.4, 3.1], [5.6, 4.0], [10.0, 4.7]]] }
  });

  push({
    name: 'Over the Crest', chapter: 'siphon', siphon: true, anchor: true, hold: true, exam: true,
    coach: 'Fill the cistern, then draw a crest: one end in the water, the other over the glass. The outlet has to sit lower than the surface.',
    hint: 'First stroke fills the cistern. Second stroke dips in, rises, and comes down above the glass.',
    goal: 22, tank: 4.2, need: 0.45, ink: 3.2,
    basins: [{ c: 1, r: 4, w: 3, h: 5, cap: 40, lipRow: 1, spill: 'always' }],
    map: M(`
############
#S.........#
#S.........#
#..........#
#..........#
#...########
#...#......#
#...#..CCC.#
#...#..CCC.#
#...#..CCC.#
#####..#####
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [
      [[1.4, 2.8], [2.2, 5.5]],
      [[2.2, 7.2], [2.4, 4.2], [6.2, 3.2], [8.4, 6.6]]
    ] }
  });

  push({
    name: 'Thaw the Gap', chapter: 'mist', melt: true, anchor: true, hold: true, meltHits: 8,
    coach: 'The ice blocks the gap. Run water against it until it gives, then the pour falls into the glass.',
    hint: 'Hold the line on the ice. A straight drop hits the wall.',
    goal: 26, tank: 3.0, need: 0.48, ink: 2.4,
    map: M(`
############
#S.........#
#S.........#
#..........#
#..........#
####ii.....#
####..CCC..#
####..CCC..#
####..CCC..#
#########..#
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[1.4, 2.8], [1.6, 5.2], [4.5, 5.6], [6.5, 6.4]]] }
  });

  push({
    name: 'Thaw the Far Gap', chapter: 'mist', melt: true, anchor: true, hold: true, meltHits: 8,
    coach: 'Ice on the right. Melt it, and the glass is just beyond.',
    hint: 'Bring the line to the ice from the spout, then into the glass.',
    goal: 26, tank: 3.0, need: 0.48, ink: 2.4,
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#.....ii####
#..CCC..####
#..CCC..####
#..CCC..####
#..#########
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[10.4, 2.8], [10.2, 5.2], [7.5, 5.6], [5.5, 6.4]]] }
  });

  push({
    name: 'Rise as Steam', chapter: 'mist', anchor: true, hold: true,
    coach: 'The hearth turns the pour to steam. It rises, cools, and falls into the glass.',
    hint: 'Guide the water onto the hearth under the shaft. Do not try to draw uphill.',
    goal: 20, tank: 3.4, need: 0.42, ink: 2.4,
    map: M(`
############
#S.........#
#S.........#
#..........#
#..CCC.....#
#..CkC.....#
#..C#C.....#
####.#.#####
#....z.....#
#..........#
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[1.4, 2.6], [5.5, 5.2], [5.5, 8.6]]] }
  });

  push({
    name: 'The Far Shaft', chapter: 'mist', anchor: true, hold: true, exam: true,
    coach: 'Melt was the first trick. This hearth is on the right: steam has to do the climbing.',
    hint: 'Carry the pour to the hearth. The condenser sits in the glass.',
    goal: 20, tank: 3.4, need: 0.42, ink: 2.4,
    map: M(`
############
#.........S#
#.........S#
#..........#
#.....CCC..#
#.....CkC..#
#.....C#C..#
#####.#.####
#.....z....#
#..........#
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[10.4, 2.6], [6.5, 5.2], [6.5, 8.6]]] }
  });

  push({
    name: 'The Mill Wheel', chapter: 'mill', anchor: true, hold: true,
    coach: 'Fill the well. The wheel turns with the water and opens the gate.',
    hint: 'Pour into the left well. The wheel needs that water before the side opens.',
    goal: 32, tank: 4.5, need: 0.55, ink: 2.8,
    basins: [{ c: 1, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: 1, spill: 'gate' }],
    wheels: [{ c: 1, r: 8, w: 2, h: 2, basin: 0, need: 18 }],
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#..........#
#..X.......#
#..X.......#
#..#.......#
#..#######.#
#..#CCC....#
#..#CCC....#
#..#CCC....#
#######....#
#..........#
####.......#
`),
    solution: { ink: [[[10.2, 3.1], [6.0, 4.0], [1.6, 4.7]]] }
  });

  push({
    name: 'The Far Wheel', chapter: 'mill', anchor: true, hold: true, exam: true,
    coach: 'The wheel is in the right well. Fill it and the gate opens toward the glass.',
    hint: 'Guide the pour into the right well.',
    goal: 32, tank: 4.5, need: 0.55, ink: 2.8,
    basins: [{ c: 9, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: -1, spill: 'gate' }],
    wheels: [{ c: 9, r: 8, w: 2, h: 2, basin: 0, need: 18 }],
    map: M(`
############
#S.........#
#S.........#
#..........#
#..........#
#..........#
#.......X..#
#.......X..#
#.......#..#
#.#######..#
#....CCC#..#
#....CCC#..#
#....CCC#..#
#....#######
#..........#
#.......####
`),
    solution: { ink: [[[1.4, 3.1], [5.6, 4.0], [10.0, 4.7]]] }
  });

  push({
    name: 'Wash the Reed', chapter: 'sand', anchor: true, hold: true, sandHits: 3,
    coach: 'Sand plugs the well. The pour has to wash it clear before the duck can rise.',
    hint: 'Aim into the sand at the mouth of the left well.',
    goal: 32, tank: 4.8, need: 0.5, ink: 2.8,
    basins: [{ c: 1, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: 1, spill: 'gate' }],
    floats: [{ c: 1, r: 11, w: 1, h: 2, basin: 0, openRow: 10, maxRow: 7, kind: 'duck' }],
    map: M(`
############
#.........S#
#.........S#
#..........#
#..........#
#nn........#
#..X.......#
#..X.......#
#..#.......#
#..#######.#
#..#CCC....#
#..#CCC....#
#..#CCC....#
#######....#
#..........#
####.......#
`),
    solution: { ink: [[[10.2, 3.1], [6.0, 4.0], [1.6, 4.7]]] }
  });

  push({
    name: 'Wash the Far Reed', chapter: 'sand', anchor: true, hold: true, sandHits: 3, exam: true,
    coach: 'Sand on the far well. Wash it, float the duck, open the gate.',
    hint: 'Carry the pour to the sand on the right.',
    goal: 32, tank: 4.8, need: 0.5, ink: 2.8,
    basins: [{ c: 9, r: 6, w: 2, h: 7, cap: 48, lipRow: 10, lipSide: -1, spill: 'gate' }],
    floats: [{ c: 10, r: 11, w: 1, h: 2, basin: 0, openRow: 10, maxRow: 7, kind: 'duck' }],
    map: M(`
############
#S.........#
#S.........#
#..........#
#..........#
#........nn#
#.......X..#
#.......X..#
#.......#..#
#.#######..#
#....CCC#..#
#....CCC#..#
#....CCC#..#
#....#######
#..........#
#.......####
`),
    solution: { ink: [[[1.4, 3.1], [5.6, 4.0], [10.0, 4.7]]] }
  });

  push({
    name: 'Two Glasses', chapter: 'split', anchor: true, hold: true,
    coach: 'The slot splits the pour. One stream cannot favor a single glass.',
    hint: 'Drop the line through the slot. The roof blocks a line to either glass.',
    goal: 18, tank: 4.4, need: 0.38,
    vessels: [{ goal: 16, need: 0.36 }, { goal: 16, need: 0.36 }],
    splits: [{ c: 2, r: 5, w: 8, h: 3, left: 0.5 }],
    map: M(`
############
#.....S....#
#.....S....#
#..........#
#####..#####
#..........#
#CCC....DDD#
#CCC....DDD#
#CCC....DDD#
############
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[6.4, 2.4], [6.2, 6.2]]] }
  });

  push({
    name: 'The Wider Glass', chapter: 'split', anchor: true, hold: true, exam: true,
    coach: 'The split is uneven. Both glasses still have to fill, the right one a little fuller.',
    hint: 'Same slot. Let the pour divide itself.',
    goal: 16, tank: 4.6, need: 0.36,
    vessels: [{ goal: 14, need: 0.34 }, { goal: 18, need: 0.34 }],
    splits: [{ c: 2, r: 5, w: 8, h: 3, left: 0.42 }],
    map: M(`
############
#.....S....#
#.....S....#
#..........#
#####..#####
#..........#
#CCC....DDD#
#CCC....DDD#
#CCC....DDD#
############
#..........#
#..........#
#..........#
#..........#
#..........#
############
`),
    solution: { ink: [[[6.4, 2.4], [6.2, 6.2]]] }
  });

  return { LEVELS: levels, CHAPTERS: CHAPTERS, COLS: COLS, ROWS: ROWS };
});
