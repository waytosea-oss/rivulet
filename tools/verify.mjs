/* Prove every level. The authored solution must win on low and high.
   After the tutorials, the straight spout-to-glass line must not. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WaterSim = require('../sim.js');
const Book = require('../levels.js');

const presets = ['low', 'high'];
const limit = 12;

function play(level, preset, which) {
  const sim = WaterSim.create(level, { preset: preset });
  if (which === 'solve') sim.applySolution(level.solution || {});
  else sim.applySolution({ ink: level._naive || [], tilt: null });
  const steps = Math.round(limit * 60);
  for (let i = 0; i < steps; i++) {
    sim.step(1 / 60);
    if (sim.won || sim.spoiled) break;
  }
  return sim;
}

let bad = 0;
const rows = [];
for (const lv of Book.LEVELS) {
  for (const preset of presets) {
    const ok = play(lv, preset, 'solve');
    const solvePass = ok.won && !ok.spoiled;
    let naivePass = true;
    let naive = null;
    if (!lv.tutorial) {
      naive = play(lv, preset, 'naive');
      naivePass = !naive.won;
    }
    const status = solvePass && naivePass ? 'ok' : 'FAIL';
    if (status !== 'ok') bad++;
    rows.push([
      status,
      String(lv.id),
      preset,
      lv.name,
      solvePass ? 'win ' + ok.playTime.toFixed(2) + 's' : 'solve fill ' + ok.fill.toFixed(2) + ' ' + (ok.failReason || ''),
      lv.tutorial ? 'tutorial' : (naive && naive.won ? 'NAIVE WON' : 'naive held')
    ].join('  '));
  }
}
console.log(rows.join('\n'));
console.log(bad ? bad + ' failed' : 'all ' + Book.LEVELS.length + ' levels passed on low and high');
process.exit(bad ? 1 : 0);
