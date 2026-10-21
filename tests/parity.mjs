// Proves the JavaScript matches the Python: same features, same predictions, and a simulator that agrees with the Python simulator.
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..');
const E = createRequire(import.meta.url)(path.join(root, 'web/engine.js'));
const model = JSON.parse(fs.readFileSync(path.join(root, 'web/model.json'))), mons = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, 'data/monsters.json'))).map(m => [m.name, m]));
const cases = JSON.parse(fs.readFileSync(path.join(root, 'data/parity.json')));
let worstF = 0, worstP = 0;
for (const c of cases) {
  const list = Object.entries(c.monsters).flatMap(([n, k]) => Array(k).fill(mons[n]));
  const f = E.features(c.level, c.party, list);
  if (f.length !== c.features.length) { console.error(`FEATURE COUNT: js ${f.length}, python ${c.features.length}`); process.exit(1); }
  c.features.forEach((v, i) => { worstF = Math.max(worstF, Math.abs(f[i] - v) / Math.max(1, Math.abs(v))); });
  const p = E.predict(model, f);
  for (const k in c.pred) worstP = Math.max(worstP, Math.abs(p[k] - c.pred[k]));
}
console.log(`features: worst relative difference ${worstF.toExponential(2)} over ${cases.length} encounters`);
console.log(`predictions: worst absolute difference ${worstP.toExponential(2)}`);
if (worstF > 1e-9 || worstP > 1e-3) { console.error('PARITY FAILED'); process.exit(1); }
// simulator vs Python simulator (numbers produced by tests/make_sim_reference.py)
const ref = JSON.parse(fs.readFileSync(path.join(root, 'data/sim_reference.json')));
let worst = 0;
for (const r of ref) {
  const heroes = r.heroes, list = Object.entries(r.monsters).flatMap(([n, k]) => Array(k).fill(mons[n]));
  const s = E.simulate(heroes, list, 40000);
  const d = Math.abs(s.p_win - r.p_win); worst = Math.max(worst, d);
  console.log(`${r.name.padEnd(34)} python ${(r.p_win * 100).toFixed(1).padStart(5)}%   js ${(s.p_win * 100).toFixed(1).padStart(5)}%   hp lost py ${(r.hp_lost * 100).toFixed(0)}% js ${(s.hp_lost * 100).toFixed(0)}%   down py ${r.deaths.toFixed(2)} js ${s.deaths.toFixed(2)}`);
}
console.log(`simulator: worst win-chance difference ${(worst * 100).toFixed(1)} points`);
if (worst > .025) { console.error('SIMULATOR MISMATCH'); process.exit(1); }
console.log('PARITY OK');
