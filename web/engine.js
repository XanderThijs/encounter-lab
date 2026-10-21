/* Encounter lab engine: hero stats, model features, boosted-tree prediction, the official XP-budget guideline, and a fight simulator.
   Works in the browser (window.Engine) and in Node (module.exports). Mirrors src/lab.py exactly; tests/parity.mjs proves it. */
(function (root) {
  'use strict';
  const THRESH = { 1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500], 5: [250, 500, 750, 1100],
    6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100], 9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800],
    11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500], 13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400],
    16: [1600, 3200, 4800, 7200], 17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700] };
  const MULT = [.5, 1, 1.5, 2, 2.5, 3, 4];
  /*CLASSES_BEGIN*/
  const TABLE = {"slots":{"full":[[],[2],[3],[4,2],[4,3],[4,3,2],[4,3,3],[4,3,3,1],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2,1],[4,3,3,3,2,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]],"half":[[],[],[2],[3],[3],[4,2],[4,2],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1],[4,3,3,2],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]]},"pact":{"count":[[1,1],[2,2],[11,3],[17,4]]},"mod":[[1,3],[4,4],[8,5]],"classes":{"Artificer":{"die":8,"con":2,"ac":[[1,16],[10,18]],"nat":[[1,1]],"dmg":[{"cantrip":5.5}],"cast":"halfup","cure":1,"init":1},"Barbarian":{"die":12,"con":3,"ac":[[1,15],[8,16],[16,17]],"nat":[[1,1],[5,2]],"dmg":[{"base":6.5,"mod":1,"rage":[[1,2],[9,3],[16,4]]}],"rage":1,"init":1},"Bard":{"die":8,"con":2,"ac":[[1,14],[5,15],[12,16]],"nat":[[1,1]],"dmg":[{"base":4.5,"mod":1}],"cast":"full","bheal":1,"blast":0.5,"init":2},"Cleric":{"die":8,"con":2,"ac":[[1,18],[10,19]],"nat":[[1,1]],"dmg":[{"base":3.5,"mod":1},{"cantrip":4.5}],"cast":"full","bheal":1,"cure":1,"blast":0.7,"init":0},"Druid":{"die":8,"con":2,"ac":[[1,14],[5,15]],"nat":[[1,1]],"dmg":[{"base":4.5,"mod":1},{"cantrip":4.5}],"cast":"full","bheal":1,"blast":0.9,"init":1},"Fighter":{"die":10,"con":2,"ac":[[1,18],[10,19]],"nat":[[1,1],[5,2],[11,3],[20,4]],"dmg":[{"base":7,"mod":1}],"surge":[[2,1],[17,2]],"sw":1,"init":2},"Monk":{"die":8,"con":2,"ac":[[1,15],[4,16],[8,17],[12,18]],"nat":[[1,2],[5,3]],"dmg":[{"base":[[1,2.5],[5,3.5],[11,4.5],[17,5.5]],"mod":1}],"init":3},"Paladin":{"die":10,"con":2,"ac":[[1,18],[5,19],[11,20]],"nat":[[1,1],[5,2]],"dmg":[{"base":7,"mod":1}],"cast":"half","smite":1,"loh":5,"init":0},"Ranger":{"die":10,"con":2,"ac":[[1,15],[5,16]],"nat":[[1,1],[5,2]],"dmg":[{"base":8,"mod":1}],"cast":"half","cure":1,"init":3},"Rogue":{"die":8,"con":2,"ac":[[1,14],[5,15],[12,16]],"nat":[[1,1]],"dmg":[{"base":4.5,"mod":1,"sneak":2.625}],"init":3},"Sorcerer":{"die":6,"con":2,"ac":[[1,13],[5,15]],"nat":[[1,1]],"dmg":[{"cantrip":5.5}],"cast":"full","blast":1.0,"init":2},"Warlock":{"die":8,"con":2,"ac":[[1,13],[5,14]],"nat":[[1,1],[5,2],[11,3],[17,4]],"dmg":[{"base":5.5,"mod":1}],"cast":"pact","blast":1.0,"init":2},"Wizard":{"die":6,"con":2,"ac":[[1,12],[5,15]],"nat":[[1,1]],"dmg":[{"cantrip":5.5}],"cast":"full","blast":1.0,"init":2}},"weights":{"Artificer":0.4,"Barbarian":1,"Bard":0.9,"Cleric":1.2,"Druid":0.8,"Fighter":1.3,"Monk":0.7,"Paladin":1,"Ranger":0.9,"Rogue":1.2,"Sorcerer":0.8,"Warlock":0.8,"Wizard":1.2},"alias":[["eldritch knight","Fighter"],["arcane trickster","Rogue"],["blood hunter","Fighter"],["mystic","Wizard"],["warden","Fighter"],["guardian","Fighter"],["mage","Wizard"],["witch","Warlock"],["healer","Cleric"]]};
  /*CLASSES_END*/
  const CLASS_NAMES = Object.keys(TABLE.classes || {});
  const SPELL_HIT = 0.8, AREA_FROM = 3;
  const clip = (x, a, b) => Math.min(b, Math.max(a, x));
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const step = (tab, level, dflt = 0) => { if (!Array.isArray(tab)) return tab; let v = dflt; for (const [lv, x] of tab) if (level >= lv) v = x; return v; };

  /* Which of the 13 classes a free-text class name means ("Eldritch Knight" is a Fighter); null when it is something homebrew. */
  function classFor(name) {
    const n = String(name || '').trim().toLowerCase(); if (!n) return null;
    for (const k of CLASS_NAMES) if (n === k.toLowerCase()) return k;
    for (const k of CLASS_NAMES) if (n.includes(k.toLowerCase())) return k;
    for (const [frag, k] of TABLE.alias) if (n.includes(frag)) return k;
    return null;
  }
  function slotsFor(cast, level) {
    const out = Array(9).fill(0); let row = [];
    if (cast === 'full' || cast === 'half') row = TABLE.slots[cast][level];
    else if (cast === 'halfup') row = TABLE.slots.full[Math.ceil(level / 2)];
    else if (cast === 'pact') { row = Array(9).fill(0); row[Math.min(5, Math.ceil(level / 2)) - 1] = step(TABLE.pact.count, level); }
    row.forEach((n, i) => { out[i] = n; });
    return out;
  }
  /* A typical hero of this class and level: the same formulas as hero() in classes.py.
     classLevel is only for multiclass characters: proficiency and ability scores follow the total level, class features follow the levels in that class. */
  function heroFromClass(cls, level, classLevel) {
    const c = TABLE.classes[cls]; level = clip(Math.round(level), 1, 20); const cl = clip(Math.round(classLevel || level), 1, 20);
    const prof = 2 + Math.floor((level - 1) / 4), mod = step(TABLE.mod, level), dice = 1 + (cl >= 5) + (cl >= 11) + (cl >= 17);
    let best = 0;
    for (const o of c.dmg) {
      let d = step(o.base || 0, cl) + (o.mod ? mod : 0) + (o.sneak || 0) * Math.ceil(cl / 2) + (o.cantrip || 0) * dice;
      if (o.rage) d += step(o.rage, cl);
      best = Math.max(best, d);
    }
    const hp = c.die + c.con + (level - 1) * ((c.die + 1) / 2 + c.con);
    return { cls, level, hp, max: hp, ac: step(c.ac, cl), atk: prof + mod, nat: step(c.nat, cl, 1), dmg: best, init: c.init || 0, save: mod + prof / 2,
      slots: slotsFor(c.cast, level), blast: +(c.blast || 0), bheal: c.bheal ? 1 : 0, cure: c.cure ? 1 : 0, smite: c.smite ? 1 : 0, surge: step(c.surge || 0, cl),
      sw: c.sw ? 5.5 + cl : 0, loh: (c.loh || 0) * cl, rage: c.rage ? 1 : 0, mod };
  }
  /* Old callers pass a role (tank/striker/caster/support): they map onto a typical class so nothing breaks. */
  const LEGACY = { tank: 'Fighter', striker: 'Rogue', caster: 'Wizard', support: 'Cleric' };
  const pcStats = (level, cls) => heroFromClass(CLASSES_OK(cls) ? cls : (LEGACY[cls] || 'Fighter'), level);
  const CLASSES_OK = c => !!(TABLE.classes && TABLE.classes[c]);
  const roleForClass = cls => classFor(cls) || 'Fighter';
  /* Fills in whatever a hero object is missing (older callers, custom heroes), so the simulator and the features always see every field. */
  function norm(h) {
    const o = Object.assign({ cls: '', level: 1, init: 0, save: 3, blast: 0, bheal: 0, cure: 0, smite: 0, surge: 0, sw: 0, loh: 0, rage: 0, mod: 3 }, h);
    if (o.max == null) o.max = o.hp;
    o.slots = Array.from({ length: 9 }, (_, i) => +(h.slots && h.slots[i]) || 0);
    if (h.heal > 0 && h.bheal == null && h.cure == null && h.loh == null) o.loh = h.heal * 4;          // an old-style healer becomes a pool of healing
    return o;
  }
  const normMon = m => Object.assign({ br_dmg: 0, br_dc: 0, br_p: 0, br_n: 0, leg: 0, regen: 0 }, m);
  /* A Dragonwatch character. The classes pick the numbers (the highest-level class sets attacks and damage, features from every class are added), and
     what is really stored on the character replaces the estimates: max and current HP, AC, initiative, the spell slots and class resources still
     unspent ("Level 1" ... "Level 9", "Pact Slots (level N)", Action Surge, Second Wind, Lay on Hands, Rage), and optional real attack numbers in c.combat. */
  function fromCharacter(c) {
    const level = clip(Math.round(+c.level || 1), 1, 20);
    const list = (Array.isArray(c.classes) && c.classes.length ? c.classes : [{ name: c.class, level }]).map(x => ({ cls: classFor(x.name), level: +x.level || 1 })).filter(x => x.cls);
    const main = list.length ? list.reduce((b, x) => (x.level > b.level ? x : b)) : { cls: 'Fighter', level };
    const h = heroFromClass(main.cls, level, main.level);
    for (const x of list) {                                                                         // features from the other classes
      if (x === main) continue;
      const o = heroFromClass(x.cls, level, x.level);
      h.blast = Math.max(h.blast, o.blast); h.bheal = Math.max(h.bheal, o.bheal); h.cure = Math.max(h.cure, o.cure); h.smite = Math.max(h.smite, o.smite);
      h.surge = Math.max(h.surge, o.surge); h.sw = Math.max(h.sw, o.sw); h.loh = Math.max(h.loh, o.loh); h.rage = Math.max(h.rage, o.rage);
    }
    if (+c.max_hp > 0) { h.max = +c.max_hp; h.hp = c.current_hp != null && +c.current_hp >= 0 ? Math.min(+c.current_hp, h.max) : h.max; }
    if (+c.ac > 0) h.ac = +c.ac; if (Number.isFinite(+c.init_mod)) h.init = +c.init_mod;
    const o = c.combat || {};                                                                       // real attack numbers, when the DM has entered them
    if (+o.atk > 0) h.atk = +o.atk; if (+o.nat > 0) h.nat = +o.nat; if (+o.dmg > 0) h.dmg = +o.dmg;
    if (Array.isArray(c.resources) && c.resources.length) {
      h.slots = Array(9).fill(0); let any = false;
      for (const r of c.resources) {
        const n = String(r.name || ''), cur = Math.max(0, +r.cur || 0); let m;
        if (r.slot && (m = n.match(/^Level (\d)$/))) { h.slots[+m[1] - 1] += cur; any = true; }
        else if ((m = n.match(/^Pact Slots \(level (\d)\)/))) { h.slots[+m[1] - 1] += cur; any = true; }
        else if (/^Action Surge/i.test(n)) h.surge = cur;
        else if (/^Second Wind/i.test(n)) h.sw = cur > 0 ? Math.max(h.sw, 5.5 + main.level) : 0;
        else if (/^Lay on Hands/i.test(n)) h.loh = cur;
        else if (/^Rage$/i.test(n)) h.rage = cur > 0 ? 1 : 0;
      }
      if (!any && !list.some(x => TABLE.classes[x.cls].cast)) h.slots = Array(9).fill(0);
    }
    return Object.assign(h, { name: c.name, level });
  }
  /* What the trained model has not seen (it should not be trusted there). */
  function outOfRange(model, level, size, mons) {
    const r = model.range || { levels: [1, 10], party: [3, 6], cr_over_level: 3 }, w = [];
    if (level < r.levels[0] || level > r.levels[1]) w.push(`level ${level} is outside the levels the model was trained on (${r.levels[0]} to ${r.levels[1]})`);
    if (size < r.party[0] || size > r.party[1]) w.push(`a party of ${size} is outside the party sizes the model was trained on (${r.party[0]} to ${r.party[1]})`);
    if (r.max_monsters && mons.length > r.max_monsters) w.push(`${mons.length} monsters is more than the model was trained on (up to ${r.max_monsters})`);
    return w;
  }

  const expDpr = (atk, nat, dmg, refAc = 15) => nat * clip((21 - (refAc - atk)) / 20, .05, .95) * dmg;

  function adjustedXp(xps, partySize) {
    const n = xps.length;
    let i = n === 1 ? 1 : n === 2 ? 2 : n <= 6 ? 3 : n <= 10 ? 4 : n <= 14 ? 5 : 6;
    if (partySize < 3) i = Math.min(6, i + 1); else if (partySize >= 6) i = Math.max(0, i - 1);
    return sum(xps, x => x) * MULT[i];
  }
  const budget = (level, size, k = 3) => THRESH[level][k] * size;

  const BASE_FEATURES = ['level', 'n_pc', 'pc_hp', 'pc_ac', 'pc_dpr', 'n_mon', 'mon_hp', 'mon_ac', 'mon_dpr', 'mon_cr_max', 'xp_total', 'adj_xp', 'ratio', 'hp_ratio', 'dpr_ratio', 'ttk_party', 'ttk_mon'];
  const EXT_FEATURES = ['pc_hp_min', 'pc_ac_min', 'heal_total', 'n_healers', 'mon_hp_max', 'mon_hp_min', 'mon_dpr_max', 'n_kinds', 'mon_atk_mean', 'mon_nat_sum',
    'pc_nat_sum', 'top_hero_share', 'kill_first', 'lose_first', 'fluid_rounds', 'fluid_pc_left', 'fluid_mon_left', 'fluid_pc_alive', 'log_ttk_ratio', 'log_square', 'log_ratio'];
  const NEW_FEATURES = ['pc_max_hp', 'hp_frac', 'n_down', 'pc_burst', 'pc_dpr_eff', 'mon_breath', 'mon_leg', 'mon_dpr_eff', 'n_blasters', 'slots_total', 'log_ttk_eff', 'n_smiters', 'surge_total', 'mon_regen'];
  const FEATURES = BASE_FEATURES.concat(EXT_FEATURES, NEW_FEATURES);

  /* An average-case fight with no dice: the party focuses the weakest monster, monster damage is spread evenly over living heroes. */
  function fluid(hpPc, dprPc, hpM, dprM) {
    hpPc = hpPc.slice(); hpM = hpM.slice();
    const n0 = hpPc.length, h0 = Math.max(sum(hpPc, x => x), 1e-9), m0 = sum(hpM, x => x); let rounds = 0;
    while (rounds < 30 && hpPc.some(h => h > 0) && hpM.some(m => m > 0)) {
      rounds++;
      let dp = 0, dm = 0;
      hpPc.forEach((h, i) => { if (h > 0) dp += dprPc[i]; }); hpM.forEach((h, i) => { if (h > 0) dm += dprM[i]; });
      const order = hpM.map((h, i) => i).filter(i => hpM[i] > 0).sort((a, b) => hpM[a] - hpM[b]);
      for (const i of order) { const take = Math.min(dp, hpM[i]); hpM[i] -= take; dp -= take; if (dp <= 0) break; }
      const alive = hpPc.map((h, i) => i).filter(i => hpPc[i] > 0);
      for (const i of alive) hpPc[i] -= dm / alive.length;
    }
    return [rounds, sum(hpPc, h => Math.max(h, 0)) / h0, sum(hpM, m => Math.max(m, 0)) / m0, hpPc.filter(h => h > 0).length / n0];
  }
  /* What one hero brings besides the plain weapon attack: [spell and smite burst, healing capacity, number of slots, Action Surge damage]. */
  function heroNumbers(h, nMon, monAc) {
    const dpr = expDpr(h.atk, h.nat, h.dmg, monAc), tg = Math.min(3, nMon); let burst = 0, heal = 0;
    h.slots.forEach((n, i) => {
      const L = i + 1; if (!n) return;
      if (h.blast > 0) burst += n * Math.max(0, (5.5 * L + 5) * SPELL_HIT * h.blast * (L < AREA_FROM ? 1 : tg) - dpr);
      if (h.smite) burst += n * 4.5 * (L + 1) * Math.min(1, .8);
      if (h.bheal) heal += n * (2.5 * L + h.mod);
      if (h.cure && !h.bheal) heal += n * (4.5 * L + h.mod);
    });
    heal += h.loh + h.sw;
    return [burst, heal, sum(h.slots, x => x), dpr * h.surge];
  }
  function features(level, heroes, mons) {
    const P = heroes.map(norm), M = mons.map(normMon), nPc = P.length, nMon = M.length;
    const pcHp = sum(P, p => p.hp), pcMax = sum(P, p => p.max), pcDpr = sum(P, p => expDpr(p.atk, p.nat, p.dmg));
    const monHp = sum(M, m => m.hp), monDpr = sum(M, m => expDpr(m.to_hit, m.n_atk, m.dmg));
    const xps = M.map(m => m.xp), adj = adjustedXp(xps, nPc);
    const pcAc = sum(P, p => p.ac) / nPc, monAc = sum(M, m => m.ac) / nMon;
    const pcDprV = P.map(p => expDpr(p.atk, p.nat, p.dmg, monAc)), monDprV = M.map(m => expDpr(m.to_hit, m.n_atk, m.dmg, pcAc));
    const sPc = sum(pcDprV, x => x), sMon = sum(monDprV, x => x);
    const base = [level, nPc, pcHp, pcAc, pcDpr, nMon, monHp, monAc, monDpr, Math.max(...M.map(m => m.cr)), sum(xps, x => x), adj,
      adj / budget(level, nPc), monHp / Math.max(pcHp, 1e-6), monDpr / Math.max(pcDpr, 1e-6), monHp / Math.max(sPc, 1e-6), pcHp / Math.max(sMon, 1e-6)];
    const hn = P.map(p => heroNumbers(p, nMon, monAc)), burst = hn.map(x => x[0]), heal = hn.map(x => x[1]), surge = hn.map(x => x[3]);
    let br = 0, leg = 0;
    for (const m of M) {
      if (m.br_dmg > 0) { const uses = m.br_n === 99 ? 1 + 3 * m.br_p : Math.min(m.br_n, 3); br += m.br_dmg * .6 * Math.min(3, nPc) * uses; }
      if (m.leg > 0) leg += m.leg * clip((21 - (pcAc - m.to_hit)) / 20, .05, .95) * m.dmg;
    }
    const pcEff = pcDprV.map((d, i) => d + (burst[i] + surge[i]) / 4), monEffEach = monDprV.map(d => d + leg / nMon + br / 4 / nMon);
    const sPcEff = sum(pcEff, x => x), sMonEff = sum(monEffEach, x => x);
    const pcHpList = P.map((p, i) => p.hp + .5 * heal[i]), monHpList = M.map(m => m.hp + 3 * m.regen);
    const [fr, fp, fm, fa] = fluid(pcHpList, pcEff, monHpList, monEffEach);
    const tp = sum(monHpList, x => x) / Math.max(sPcEff, 1e-6), tm = sum(pcHpList, x => x) / Math.max(sMonEff, 1e-6);
    const ratio = adj / budget(level, nPc), dprRef = sum(P, p => expDpr(p.atk, p.nat, p.dmg));
    const minHp = Math.min(...P.map(p => p.hp)), minMon = Math.min(...monHpList);
    const ext = [minHp, Math.min(...P.map(p => p.ac)), sum(heal, x => x), heal.filter(x => x > 0).length, Math.max(...monHpList), minMon, Math.max(...monDprV),
      new Set(M.map(m => m.name)).size, sum(M, m => m.to_hit) / nMon, sum(M, m => m.n_atk), sum(P, p => p.nat),
      Math.max(...pcEff) / Math.max(sPcEff, 1e-6), minMon / Math.max(sPcEff, 1e-6), minHp / Math.max(sMonEff, 1e-6), fr, fp, fm, fa,
      Math.log(Math.max(tm, 1e-3) / Math.max(tp, 1e-3)),
      Math.log(Math.max(1 / Math.max(sum(monHpList, x => x) / Math.max(sum(P, p => p.hp), 1e-6), 1e-6) / Math.max(sMonEff / Math.max(dprRef, 1e-6), 1e-6), 1e-6)),
      Math.log(Math.max(ratio, 1e-3))];
    const nw = [pcMax, pcHp / Math.max(pcMax, 1e-6), P.filter(p => p.hp <= 0).length, sum(burst, x => x), sPcEff, br, leg, sMonEff,
      P.filter(p => p.blast > 0 && sum(p.slots, x => x) > 0).length, sum(hn, x => x[2]), Math.log(Math.max(tp, 1e-3)),
      P.filter(p => p.smite && sum(p.slots, x => x) > 0).length, sum(surge, x => x), sum(M, m => m.regen)];
    return base.concat(ext, nw);
  }

  function treeSum(model, x) {
    let s = model.base;
    for (const t of model.trees) { let i = 0; while (t.f[i] >= 0) i = x[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i]; s += t.v[i]; }
    return s;
  }
  function predict(model, x) {
    const o = {};
    for (const k in model.targets) { const m = model.targets[k]; o[k] = clip(treeSum(m, x), m.lo, m.hi); }
    return o;
  }

  /* The official guideline: the category, and the win chance its best monotone curve implies (fitted on the same data). */
  function guideline(model, level, size, mons) {
    const adj = adjustedXp(mons.map(m => m.xp), size), th = THRESH[level].map(v => v * size);
    const label = adj >= th[3] ? 'Deadly' : adj >= th[2] ? 'Hard' : adj >= th[1] ? 'Medium' : adj >= th[0] ? 'Easy' : 'Trivial';
    const r = adj / th[3], c = model.guideline_curve;     // [[ratio, win], ...] decreasing
    let p = c[c.length - 1][1];
    if (r <= c[0][0]) p = c[0][1];
    else for (let i = 1; i < c.length; i++) if (r <= c[i][0]) { const [x0, y0] = c[i - 1], [x1, y1] = c[i]; p = y0 + (y1 - y0) * (r - x0) / (x1 - x0 || 1); break; }
    return { adj, ratio: r, label, pWin: clip(p, 0, 1), budget: th };
  }

  /* One fight at a time, same rules as simulate() in lab.py (read the description there). Returns win, share of party HP lost, heroes down, rounds. */
  function binom(n, p) { let k = 0; for (let i = 0; i < n; i++) if (Math.random() < p) k++; return k; }
  const U = () => .75 + Math.random() * .5;
  function simulate(heroes, mons, runs = 1000) {
    const H = heroes.map(norm), Mo = mons.map(normMon);
    const base = [...H.map(h => ({ pc: true, hp: Math.max(h.hp, 0), max: h.max, ac: h.ac, atk: h.atk, nat: h.nat, dmg: h.dmg, init: h.init, save: h.save, slots: h.slots.slice(), blast: h.blast,
        bheal: !!h.bheal, cure: !!h.cure, smite: !!h.smite, surge: h.surge, sw: h.sw, loh: h.loh, rage: !!h.rage, mod: h.mod, brLeft: 0, brDmg: 0, brDc: 0, brP: 0, brN: 0, leg: 0, regen: 0 })),
      ...Mo.map(m => ({ pc: false, hp: m.hp, max: m.hp, ac: m.ac, atk: m.to_hit, nat: m.n_atk, dmg: m.dmg, init: 0, save: 0, slots: [], blast: 0, bheal: false, cure: false, smite: false,
        surge: 0, sw: 0, loh: 0, rage: false, mod: 0, brDmg: m.br_dmg, brDc: m.br_dc, brP: m.br_p, brN: m.br_n, brLeft: m.br_dmg > 0 ? (m.br_n === 99 ? 1 : m.br_n) : 0, leg: m.leg, regen: m.regen }))];
    const nPc = H.length, startHp = sum(H, h => Math.max(h.hp, 0)), maxHp = Math.max(sum(H, h => h.max), 1);
    let wins = 0, lost = 0, down = 0, rounds = 0;
    for (let r = 0; r < runs; r++) {
      const all = base.map(c => ({ ...c, slots: c.slots.slice(), on: c.hp > 0, roll: 1 + Math.floor(Math.random() * 20) + c.init }));
      const cs = all.slice().sort((a, b) => b.roll - a.roll);                         // turn order; ties between equals go to the lowest index, like the Python
      const pcs = all.filter(c => c.pc), ms = all.filter(c => !c.pc), liveP = () => pcs.filter(c => c.on), liveM = () => ms.filter(c => c.on);
      const lowSlot = c => c.slots.findIndex(n => n > 0), highSlot = c => { for (let i = 8; i >= 0; i--) if (c.slots[i] > 0) return i; return -1; };
      const hitHero = (t, d) => { t.hp = Math.max(t.hp - d, 0); if (t.hp <= 0) t.on = false; };
      const hitMon = (t, d) => { t.hp -= d; if (t.hp <= 0) t.on = false; };
      const raise = (t, amt) => { t.hp = Math.min(t.max, Math.max(t.hp, 0) + amt); if (t.hp > 0) t.on = true; };
      const weakest = () => { let low = null, lf = Infinity; for (const p of pcs) { const f = p.hp / Math.max(p.max, 1); if (f < lf) { lf = f; low = p; } } return [low, lf]; };
      const pickHero = () => { const lp = liveP(); if (Math.random() < .4) return lp.reduce((b, c) => (c.hp < b.hp ? c : b)); return lp[Math.floor(Math.random() * lp.length)]; };
      let rd = 0;
      for (; rd < 20 && liveP().length && liveM().length; rd++) {
        rounds++;
        for (const m of ms) if (m.on && m.brN === 99 && m.brLeft === 0 && Math.random() < m.brP) m.brLeft = 1;
        for (const a of cs) {
          if (!a.on || !liveP().length || !liveM().length) continue;
          if (a.pc) {
            if (a.sw > 0 && a.hp < .5 * a.max) { a.hp = Math.min(a.max, a.hp + a.sw); a.sw = 0; }
            let [low, fl] = weakest(), li = lowSlot(a);
            if (a.bheal && li >= 0 && fl < .4) { raise(low, 2.5 * (li + 1) + a.mod); a.slots[li]--; [low, fl] = weakest(); li = lowSlot(a); }
            let acted = false;
            if (a.loh > 0 && fl < .35) { const amt = Math.min(a.loh, Math.max(1, .6 * low.max)); raise(low, amt); a.loh -= amt; acted = true; }
            else if (a.cure && li >= 0 && fl < .35) { raise(low, 4.5 * (li + 1) + a.mod); a.slots[li]--; acted = true; }
            if (acted) continue;
            const hi = highSlot(a);
            if (a.blast > 0 && hi >= 0) {                                              // a damaging spell from the highest slot
              const tg = liveM().sort((x, y) => x.hp - y.hp).slice(0, hi + 1 >= AREA_FROM ? 3 : 1), d = (5.5 * (hi + 1) + 5) * SPELL_HIT * a.blast * U();
              for (const t of tg) hitMon(t, d);
              a.slots[hi]--; continue;
            }
            const t = liveM().reduce((b, c) => (c.hp < b.hp ? c : b));
            const sg = a.surge > 0 && rd === 0; if (sg) a.surge--;
            const hits = binom(a.nat * (sg ? 2 : 1), clip((21 - (t.ac - a.atk)) / 20, .05, .95));
            let d = hits * a.dmg * U(); const ls = lowSlot(a);
            if (a.smite && hits > 0 && ls >= 0 && t.hp - d > 0) { d += 4.5 * (ls + 2); a.slots[ls]--; }
            hitMon(t, d);
          } else {
            if (a.regen > 0) a.hp = Math.min(a.max, a.hp + a.regen);                  // regeneration at the start of the monster's turn
            if (a.brLeft > 0 && a.brDmg > 0) {                                         // breath-style action on up to three heroes
              const tg = liveP().map(c => [Math.random(), c]).sort((x, y) => y[0] - x[0]).slice(0, 3).map(x => x[1]);
              for (const t of tg) { const ps = clip((21 - (a.brDc - t.save)) / 20, .05, .95); hitHero(t, a.brDmg * (Math.random() < ps ? .5 : 1)); }
              a.brLeft--; continue;
            }
            const t = pickHero();
            hitHero(t, binom(a.nat, clip((21 - (t.ac - a.atk)) / 20, .05, .95)) * a.dmg * U() * (t.rage ? .5 : 1));
          }
        }
        for (const m of ms) {                                                          // legendary actions
          if (!m.on || !m.leg) continue;
          for (let k = 0; k < Math.min(m.leg, 2); k++) {
            if (!liveP().length || !liveM().length) break;
            const t = pickHero();
            hitHero(t, (Math.random() < clip((21 - (t.ac - m.atk)) / 20, .05, .95) ? 1 : 0) * m.dmg * U() * (t.rage ? .5 : 1));
          }
        }
      }
      const up = liveP().length, endHp = sum(pcs, p => Math.max(p.hp, 0));
      if (!liveM().length && up > 0) wins++;
      lost += clip((startHp - endHp) / maxHp, 0, 1); down += nPc - up;
    }
    return { p_win: wins / runs, hp_lost: lost / runs, deaths: down / runs, rounds: rounds / runs };
  }

  /* ---------------- encounter generator
     Builds encounters from a pool of monsters whose predicted win chance lands on a target. The model is fast enough to score thousands
     of candidates, so the search is simple: pick 1-3 kinds, add monsters one at a time until the prediction crosses the target, keep what
     lands close, then check the best ones with the live simulation.  */
  const tick = () => new Promise(r => setTimeout(r, 0));
  async function generate(model, level, heroes, pool, o = {}) {
    const rand = o.rand || Math.random, target = o.target, tol = o.tol ?? .05, maxMon = o.maxMon ?? 8, want = o.want ?? 6, tries = o.tries ?? 500;
    const by = Object.fromEntries(pool.map(m => [m.name, m])), cache = new Map(), found = new Map();
    const keyOf = c => Object.keys(c).sort().map(n => n + '×' + c[n]).join('|'), kindsOf = c => Object.keys(c).sort().join('|');
    const count = c => Object.values(c).reduce((a, b) => a + b, 0);
    const list = c => Object.entries(c).flatMap(([n, k]) => Array(k).fill(by[n]));
    let evals = 0;
    const score = c => { const k = keyOf(c); let p = cache.get(k); if (!p) { p = predict(model, features(level, heroes, list(c))); cache.set(k, p); evals++; } return p.p_win; };
    const note = c => { const p = score(c); if (Math.abs(p - target) <= tol) found.set(keyOf(c), { counts: { ...c }, model: cache.get(keyOf(c)) }); return p; };
    const pick = n => { const a = pool.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rand() * a.length), 1)[0].name); return out; };
    if (!pool.length || !heroes.length) return { results: [], reason: 'empty', evals: 0 };
    let weakest = null, strongest = null;
    for (let t = 0; t < tries; t++) {
      const r = rand(), kinds = pick(r < .35 ? 1 : r < .8 ? 2 : 3), c = Object.fromEntries(kinds.map(n => [n, 1]));
      let p = note(c);
      while (p > target && count(c) < maxMon) { const n = kinds[Math.floor(rand() * kinds.length)]; c[n]++; p = note(c); }
      if (p > target) strongest = strongest === null ? p : Math.max(strongest, p);      // even the full set is too easy
      if (t === 0 || t % 25 === 0) { const w = Object.fromEntries(kinds.map(n => [n, 1])); const pw = score(w); weakest = weakest === null ? pw : Math.min(weakest, pw); }
      if (o.onProgress && t % 25 === 0) o.onProgress(t / tries);
      if (t % 25 === 0) await tick();
    }
    // small neighbourhood search around what was found: +-1 of any kind, or one new kind
    const seeds = [...found.values()].sort((a, b) => Math.abs(a.model.p_win - target) - Math.abs(b.model.p_win - target)).slice(0, 30);
    for (const s of seeds) {
      for (const n of Object.keys(s.counts)) for (const d of [-1, 1]) {
        const c = { ...s.counts }; c[n] += d; if (c[n] <= 0) { delete c[n]; if (!Object.keys(c).length) continue; } if (count(c) > maxMon) continue; note(c);
      }
    }
    await tick();
    // best per set of monster kinds (variety), then verify the closest with the live simulation
    const bestPerKinds = new Map();
    for (const f of found.values()) { const k = kindsOf(f.counts), cur = bestPerKinds.get(k); if (!cur || Math.abs(f.model.p_win - target) < Math.abs(cur.model.p_win - target)) bestPerKinds.set(k, f); }
    const shortlist = [...bestPerKinds.values()].sort((a, b) => Math.abs(a.model.p_win - target) - Math.abs(b.model.p_win - target)).slice(0, Math.max(want * 3, 12));
    const verified = [];
    for (const f of shortlist) { const sim = simulate(heroes, list(f.counts), o.simRuns ?? 1500); verified.push({ ...f, sim, gap: Math.abs(sim.p_win - f.model.p_win) }); await tick(); }
    verified.sort((a, b) => (Math.abs(a.sim.p_win - target) + a.gap) - (Math.abs(b.sim.p_win - target) + b.gap));
    const results = verified.slice(0, want);
    let reason = null;
    if (!results.length) {
      const all = [...cache.values()].map(p => p.p_win);
      reason = all.length && Math.min(...all) > target + tol ? 'too_easy' : all.length && Math.max(...all) < target - tol ? 'too_hard' : 'none';
      return { results, reason, evals, closest: all.length ? all.reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a) : null };
    }
    return { results, reason, evals };
  }

  const api = { generate, roleForClass, fromCharacter, outOfRange, THRESH, FEATURES, CLASS_NAMES, classFor, heroFromClass, slotsFor, TABLE, norm, normMon, pcStats, features, predict, guideline, simulate, adjustedXp, budget };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof self !== 'undefined' ? self : this);
