(function () {
  'use strict';
  const E = window.Engine, $ = id => document.getElementById(id);
  let MAX_MON = 14; const SIM_RUNS = 3000; let MIN_HEROES = 3, MAX_HEROES = 6, MAX_LEVEL = 10;
  const FIELDS = [['hp', 'HP', 1, 999, 1], ['ac', 'AC', 1, 30, 1], ['atk', 'To-hit', -5, 30, 1], ['nat', 'Attacks', 1, 12, 1], ['dmg', 'Dmg/hit', 0, 300, .5]];
  const DEFAULT_CLASSES = ['Fighter', 'Cleric', 'Wizard', 'Rogue', 'Barbarian', 'Bard', 'Paladin', 'Ranger', 'Druid', 'Sorcerer'];
  const PRESETS = [
    { id: 'goblins', name: 'Goblin ambush', level: 1, classes: ['Fighter', 'Cleric', 'Rogue', 'Wizard'], mons: { 'Goblin': 5 } },
    { id: 'ogres', name: 'Ogre brawl', level: 3, classes: ['Paladin', 'Ranger', 'Cleric', 'Wizard'], mons: { 'Ogre': 2 } },
    { id: 'wolves', name: 'Owlbear and wolves', level: 5, classes: ['Barbarian', 'Druid', 'Rogue', 'Bard', 'Fighter'], mons: { 'Owlbear': 1, 'Wolf': 4 } },
    { id: 'trolls', name: 'Troll den', level: 5, classes: ['Fighter', 'Cleric', 'Rogue', 'Wizard'], mons: { 'Troll': 3 } },
    { id: 'giants', name: 'Hill giants', level: 8, classes: ['Paladin', 'Ranger', 'Cleric', 'Sorcerer'], mons: { 'Hill Giant': 2 } },
    { id: 'dragon', name: 'Way too strong', level: 5, classes: ['Fighter', 'Cleric', 'Rogue', 'Wizard'], mons: { 'Adult Red Dragon': 1 } },
    { id: 'tired', name: 'Tired party, trolls', level: 5, classes: ['Fighter', 'Cleric', 'Rogue', 'Wizard'], mons: { 'Troll': 3 }, tired: true },
  ];
  const S = { level: 3, heroes: [], mons: {}, q: '', plausible: true, preset: null, pool: new Set(), gq: '', gtype: '', target: .7 };
  let MODEL, MONS = [], BY = {}, METRICS = null, simTimer = 0, simToken = 0;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pct = v => Math.round(v * 100) + '%';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const tone = p => p >= .8 ? 'var(--good)' : p >= .5 ? 'var(--mid)' : 'var(--bad)';
  const verdict = p => p >= .9 ? 'Very likely a win' : p >= .7 ? 'Likely a win' : p >= .5 ? 'Close, leaning towards a win' : p >= .3 ? 'Close, leaning towards a loss' : p >= .1 ? 'Likely a loss' : 'Very likely a loss';
  const crText = cr => cr === .125 ? '1/8' : cr === .25 ? '1/4' : cr === .5 ? '1/2' : String(cr);
  const monsterTotal = () => Object.values(S.mons).reduce((a, b) => a + b, 0);
  const monsterList = counts => Object.entries(counts || S.mons).flatMap(([n, k]) => Array(k).fill(BY[n]));

  /* ---------------- party */
  /* Each hero is the class table's numbers (editable) plus how the fight starts: current HP, how many slots are left, and whether the hero is down. */
  function newHero(cls) { return Object.assign(E.heroFromClass(cls, S.level), { custom: false, start: { hp: null, slots: 'Full', down: false } }); }
  function setHeroCount(n) {
    while (S.heroes.length < n) S.heroes.push(newHero(DEFAULT_CLASSES[S.heroes.length % DEFAULT_CLASSES.length]));
    S.heroes.length = n;
  }
  /* What the engine sees: the hero with the starting state applied (HP, spent slots and spent class features). */
  function effective(h) {
    const e = Object.assign({}, h), st = h.start || {}, f = st.slots === 'Empty' ? 0 : st.slots === 'Half spent' ? .5 : 1;
    e.max = h.hp; e.hp = st.down ? 0 : Math.min(st.hp == null ? h.hp : st.hp, h.hp);
    e.slots = (h.slots || []).map(n => Math.floor(n * f));
    if (f < 1) { e.surge = 0; e.sw = 0; e.rage = f ? h.rage : 0; e.loh = Math.round(h.loh * f); }
    return e;
  }
  const party = () => S.heroes.map(effective);
  function chips(h) {
    const out = [], sl = (h.slots || []).filter(n => n > 0);
    if (sl.length) out.push(['Slots ', sl.join(' · ')]);
    if (h.surge) out.push(['Action Surge', ' ×' + h.surge]);
    if (h.sw) out.push(['Second Wind', '']);
    if (h.loh) out.push(['Lay on Hands ', String(Math.round(h.loh))]);
    if (h.smite) out.push(['Smite', '']);
    if (h.rage) out.push(['Rage', '']);
    if (h.cure || h.bheal) out.push([h.cure && h.bheal ? 'Cure Wounds' : h.cure ? 'Cure Wounds' : 'Healing Word', h.cure && h.bheal ? ' and Healing Word' : '']);
    if (h.blast && S.level >= 3 && sl.length) out.push(['Area spells', ' from level 3']);
    return out;
  }
  function renderHeroes() {
    $('heroCount').textContent = S.heroes.length;
    $('heroDec').disabled = S.heroes.length <= MIN_HEROES; $('heroInc').disabled = S.heroes.length >= MAX_HEROES;
    const box = $('heroes'); box.textContent = '';
    S.heroes.forEach((h, i) => {
      const card = el('div', 'hero' + (h.start.down ? ' down' : '')), top = el('div', 'hero-top'); top.appendChild(el('strong', '', 'Hero ' + (i + 1)));
      const sel = el('select'); sel.setAttribute('aria-label', 'Class of hero ' + (i + 1));
      for (const k of E.CLASS_NAMES) { const o = el('option', '', k); o.value = k; if (k === h.cls) o.selected = true; sel.appendChild(o); }
      sel.addEventListener('change', () => { S.heroes[i] = newHero(sel.value); S.preset = null; markPreset(); renderHeroes(); update(); });
      top.appendChild(sel); const tag = el('span', 'tag', h.start.down ? 'down' : h.custom ? 'edited' : ''); top.appendChild(tag); card.appendChild(top);
      const grid = el('div', 'stats');
      for (const [key, label, min, max, step] of FIELDS) {
        const l = el('label'); l.appendChild(el('span', '', label));
        const inp = el('input'); inp.type = 'number'; inp.min = min; inp.max = max; inp.step = step; inp.value = Math.round(h[key] * 10) / 10; inp.setAttribute('aria-label', label + ' of hero ' + (i + 1));
        inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (Number.isNaN(v)) return; h[key] = clamp(v, min, max); if (key === 'hp') h.max = h.hp; h.custom = true; if (!h.start.down) tag.textContent = 'edited'; S.preset = null; markPreset(); update(); });
        l.appendChild(inp); grid.appendChild(l);
      }
      card.appendChild(grid);
      const feat = el('div', 'start feat');
      for (const [b, rest] of chips(h)) { const p = el('span', 'pill'); p.appendChild(el('b', '', b)); p.appendChild(document.createTextNode(rest)); feat.appendChild(p); }
      card.appendChild(feat);
      const st = el('div', 'start'), l1 = el('label'), hpIn = el('input');
      hpIn.type = 'number'; hpIn.min = 0; hpIn.step = 1; hpIn.max = h.hp; hpIn.value = h.start.down ? 0 : (h.start.hp == null ? h.hp : Math.min(h.start.hp, h.hp)); hpIn.disabled = h.start.down; hpIn.setAttribute('aria-label', 'Starting HP of hero ' + (i + 1));
      hpIn.addEventListener('input', () => { const v = parseFloat(hpIn.value); if (Number.isNaN(v)) return; h.start.hp = clamp(v, 0, h.hp); S.preset = null; markPreset(); update(); });
      l1.append(document.createTextNode('Starts at '), hpIn, document.createTextNode(' / ' + h.hp + ' HP'));
      const l2 = el('label'), ss = el('select'); ss.setAttribute('aria-label', 'Spell slots left for hero ' + (i + 1));
      for (const v of ['Full', 'Half spent', 'Empty']) { const o = el('option', '', v); o.value = v; if (v === h.start.slots) o.selected = true; ss.appendChild(o); }
      ss.addEventListener('change', () => { h.start.slots = ss.value; S.preset = null; markPreset(); update(); });
      l2.append(document.createTextNode('Slots '), ss);
      const l3 = el('label', 'chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = h.start.down;
      cb.addEventListener('change', () => { h.start.down = cb.checked; S.preset = null; markPreset(); renderHeroes(); update(); });
      l3.append(cb, document.createTextNode(' Starts downed'));
      st.append(l1, l2, l3); card.appendChild(st); box.appendChild(card);
    });
  }

  /* ---------------- monsters */
  function renderPicked() {
    const box = $('picked'); box.textContent = '';
    for (const [name, k] of Object.entries(S.mons)) {
      const m = BY[name], row = el('div', 'prow'), info = el('div');
      info.appendChild(el('div', 'pname', name));
      const meta = el('div', 'pmeta', `CR ${crText(m.cr)} · ${m.hp} HP · AC ${m.ac} · ${m.n_atk} × ${m.dmg} dmg`);
      if (m.cr > S.level + 3) { const w = el('span', 'warn', '  · above the trained range'); meta.appendChild(w); }
      info.appendChild(meta); row.appendChild(info);
      const st = el('div', 'stepper'), dec = el('button', '', '−'), n = el('span', '', k), inc = el('button', '', '+');
      dec.type = inc.type = 'button'; dec.setAttribute('aria-label', 'One fewer ' + name); inc.setAttribute('aria-label', 'One more ' + name);
      inc.disabled = monsterTotal() >= MAX_MON;
      dec.addEventListener('click', () => changeMon(name, -1)); inc.addEventListener('click', () => changeMon(name, 1));
      st.append(dec, n, inc); row.appendChild(st);
      const rm = el('button', 'rm', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + name); rm.addEventListener('click', () => changeMon(name, -k));
      row.appendChild(rm); box.appendChild(row);
    }
    $('monCount').textContent = `${monsterTotal()} of ${MAX_MON}`;
  }
  function changeMon(name, d) {
    const k = (S.mons[name] || 0) + d;
    if (d > 0 && monsterTotal() >= MAX_MON) return;
    if (k <= 0) delete S.mons[name]; else S.mons[name] = k;
    S.preset = null; markPreset(); renderPicked(); renderList(); update();
  }
  function renderList() {
    const ul = $('list'); ul.textContent = '';
    const q = S.q.trim().toLowerCase(), full = monsterTotal() >= MAX_MON;
    const rows = MONS.filter(m => (!q || m.name.toLowerCase().includes(q)) && (!S.plausible || m.cr <= S.level + 3));
    if (!rows.length) { const li = el('li', 'empty', 'No monsters match. Try a different name' + (S.plausible ? ' or untick the CR filter.' : '.')); li.style.display = 'block'; ul.appendChild(li); return; }
    for (const m of rows.slice(0, 80)) {
      const li = el('li'), nm = el('span', '', m.name), cr = el('span', 'cr', 'CR ' + crText(m.cr)), b = el('button', 'add', 'Add');
      b.type = 'button'; b.disabled = full; b.setAttribute('aria-label', 'Add ' + m.name); b.addEventListener('click', () => changeMon(m.name, 1));
      li.append(nm, cr, b); ul.appendChild(li);
    }
    if (rows.length > 80) { const li = el('li', 'empty', `${rows.length - 80} more. Search to narrow the list.`); li.style.display = 'block'; ul.appendChild(li); }
  }


  /* ---------------- generator */
  const GEN_PRESETS = [['Easy', 90], ['Medium', 75], ['Hard', 55], ['Deadly', 30]];
  const crOk = m => m.cr <= S.level + 3;
  function poolShown() {
    const q = S.gq.trim().toLowerCase();
    return MONS.filter(m => crOk(m) && (!q || m.name.toLowerCase().includes(q)) && (!S.gtype || m.type === S.gtype || (m.subtype && m.subtype === S.gtype)));
  }
  function poolActive() { const chosen = MONS.filter(m => S.pool.has(m.name)); return chosen.length ? chosen : MONS.filter(crOk); }
  function renderPool() {
    const ul = $('gpool'); ul.textContent = ''; const rows = poolShown();
    if (!rows.length) { const li = el('li', 'empty', 'No monsters match this filter.'); li.style.display = 'block'; ul.appendChild(li); }
    for (const m of rows.slice(0, 120)) {
      const li = el('li'), cb = el('input'); cb.type = 'checkbox'; cb.checked = S.pool.has(m.name); cb.id = 'gp-' + m.name.replace(/\W+/g, '_');
      const lab = el('label', '', m.name); lab.htmlFor = cb.id; lab.style.cursor = 'pointer';
      cb.addEventListener('change', () => { if (cb.checked) S.pool.add(m.name); else S.pool.delete(m.name); poolInfo(); });
      li.addEventListener('click', e => { if (e.target === li) cb.click(); });
      li.append(cb, lab, el('span', 'cr', 'CR ' + crText(m.cr))); ul.appendChild(li);
    }
    if (rows.length > 120) { const li = el('li', 'empty', `${rows.length - 120} more. Filter to narrow the list.`); li.style.display = 'block'; ul.appendChild(li); }
    poolInfo();
  }
  function poolInfo() {
    const n = S.pool.size;
    $('genPoolInfo').textContent = n ? `· ${n} chosen` : `· nothing chosen, so every monster up to CR ${S.level + 3} is used (${MONS.filter(crOk).length})`;
  }
  function setTarget(v) {
    S.target = v / 100; $('genTarget').value = v; $('genTargetOut').textContent = v + '%';
    document.querySelectorAll('#genPresets .chip').forEach(c => c.classList.toggle('on', +c.dataset.v === v));
  }
  const namesText = c => Object.entries(c).map(([n, k]) => (k > 1 ? k + ' × ' : '') + n).join(' + ');
  async function runGenerate() {
    const btn = $('genGo'), out = $('genOut'), status = $('genStatus'); btn.disabled = true; out.textContent = '';
    const pool = poolActive(), maxMon = +$('genMax').value;
    status.textContent = 'Searching…';
    try {
      const r = await E.generate(MODEL, S.level, party(), pool, { target: S.target, maxMon, want: 6, onProgress: f => { status.textContent = `Searching… ${Math.round(f * 100)}%`; } });
      status.textContent = '';
      if (!r.results.length) {
        const t = Math.round(S.target * 100), c = r.closest == null ? null : Math.round(r.closest * 100);
        const msg = r.reason === 'too_easy' ? `This pool is too weak for a ${t}% fight. Even ${maxMon} of its monsters leave the party at about ${c}%. Add stronger monsters or allow more of them.`
          : r.reason === 'too_hard' ? `This pool is too strong for a ${t}% fight. Even one of its monsters is a ${c}% win for the party. Add weaker monsters.`
          : `No combination from this pool lands near ${t}%. Try a wider pool or a different target.`;
        out.appendChild(el('div', 'gen-msg', msg)); return;
      }
      for (const x of r.results) {
        const row = el('div', 'gres'), info = el('div'), b = el('button', 'add', 'Use this fight'); b.type = 'button';
        info.appendChild(el('div', 'gname', namesText(x.counts)));
        info.appendChild(el('div', 'gmeta', `Model ${pct(x.model.p_win)} · Simulation ${pct(x.sim.p_win)} · party HP lost ${pct(x.sim.hp_lost)} · heroes down ${x.sim.deaths.toFixed(1)}`));
        b.addEventListener('click', () => { S.mons = { ...x.counts }; S.preset = null; markPreset(); renderPicked(); renderList(); update(); $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        row.append(info, b);
        if (x.gap > .1) row.appendChild(el('div', 'gwarn', 'The model and the simulation disagree here by more than 10 points, so treat this one as a rough fit.'));
        out.appendChild(row);
      }
      out.appendChild(el('div', 'sub', `Searched ${r.evals.toLocaleString('en-US')} combinations. Press Generate again for different ones.`));
    } finally { btn.disabled = false; if (status.textContent.startsWith('Searching')) status.textContent = ''; }
  }
  function initGenerator() {
    const box = $('genPresets');
    for (const [n, v] of GEN_PRESETS) { const b = el('button', 'chip', `${n} · ${v}%`); b.type = 'button'; b.dataset.v = v; b.addEventListener('click', () => setTarget(v)); box.appendChild(b); }
    $('genTarget').addEventListener('input', e => setTarget(+e.target.value));
    const mx = $('genMax'); for (let i = 2; i <= MAX_MON; i++) { const o = el('option', '', i); o.value = i; mx.appendChild(o); } mx.value = Math.min(8, MAX_MON);
    const ty = $('gtype'); ty.appendChild(Object.assign(el('option', '', 'All types'), { value: '' }));
    for (const t of [...new Set(MONS.map(m => m.type).filter(Boolean))].sort()) ty.appendChild(Object.assign(el('option', '', t[0].toUpperCase() + t.slice(1)), { value: t }));
    for (const t of ['goblinoid', 'orc', 'kobold', 'gnoll', 'devil', 'demon', 'lizardfolk']) if (MONS.some(m => m.subtype === t)) ty.appendChild(Object.assign(el('option', '', t[0].toUpperCase() + t.slice(1) + ' (subtype)'), { value: t }));
    $('gq').addEventListener('input', e => { S.gq = e.target.value; renderPool(); });
    ty.addEventListener('change', e => { S.gtype = e.target.value; renderPool(); });
    $('gAll').addEventListener('click', () => { poolShown().forEach(m => S.pool.add(m.name)); renderPool(); });
    $('gNone').addEventListener('click', () => { S.pool.clear(); renderPool(); });
    $('genGo').addEventListener('click', runGenerate);
    setTarget(70); renderPool();
  }

  /* ---------------- presets */
  function renderPresets() {
    const box = $('presets');
    for (const p of PRESETS) {
      const b = el('button', 'chip', p.name); b.type = 'button'; b.dataset.id = p.id;
      b.addEventListener('click', () => applyPreset(p)); box.appendChild(b);
    }
  }
  function markPreset() { document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.id === S.preset)); }
  function applyPreset(p) {
    S.level = p.level; $('level').value = p.level; S.heroes = p.classes.map(r => newHero(r)); if (p.tired) S.heroes.forEach(h => { h.start.slots = 'Half spent'; h.start.hp = Math.round(h.hp * .7); }); S.mons = { ...p.mons }; S.preset = p.id;
    markPreset(); renderHeroes(); renderPicked(); renderList(); if ($('gpool')) renderPool(); update();
  }

  /* ---------------- results */
  function skeleton() {
    $('result').innerHTML = `
      <div class="cap">Chance the party wins</div>
      <div class="big"><span class="pct" id="pct">–</span><span class="verdict" id="verdict"></span></div>
      <div class="meter" role="img" aria-label="Win chance"><i id="meter"></i></div>
      <table class="cmp"><thead><tr><th class="sr">Measure</th><th>Model</th><th id="simHead">Simulation</th></tr></thead><tbody>
        <tr><td>Win chance</td><td id="m1">–</td><td class="sim" id="s1">…</td></tr>
        <tr><td>Party HP lost</td><td id="m2">–</td><td class="sim" id="s2">…</td></tr>
        <tr><td>Heroes down</td><td id="m3">–</td><td class="sim" id="s3">…</td></tr></tbody></table>
      <div class="sub" id="simNote"></div>
      <div class="guide" id="guide"></div>
      <ul class="warns" id="warns"></ul>
      <div class="sens"><h3 id="sensH"></h3><div class="bars" id="bars"></div></div>`;
  }
  function update() {
    if (!MODEL) return;
    const list = monsterList(), pctEl = $('pct');
    if (!list.length) {
      pctEl.textContent = '–'; $('verdict').textContent = 'Add at least one monster'; $('meter').style.width = '0';
      for (const id of ['m1', 'm2', 'm3', 's1', 's2', 's3']) $(id).textContent = '–';
      $('guide').textContent = ''; $('warns').textContent = ''; $('bars').textContent = ''; $('sensH').textContent = ''; $('simNote').textContent = '';
      clearTimeout(simTimer); simToken++; return;
    }
    const x = E.features(S.level, party(), list), p = E.predict(MODEL, x), g = E.guideline(MODEL, S.level, S.heroes.length, list);
    pctEl.textContent = pct(p.p_win); pctEl.style.color = tone(p.p_win); $('verdict').textContent = verdict(p.p_win);
    const mt = $('meter'); mt.style.width = Math.max(p.p_win * 100, 1.5) + '%'; mt.style.background = tone(p.p_win);
    $('m1').textContent = pct(p.p_win); $('m2').textContent = pct(p.hp_lost); $('m3').textContent = p.deaths.toFixed(1);
    for (const id of ['s1', 's2', 's3']) $(id).style.opacity = .45;
    $('guide').innerHTML = `Official guideline: <b></b> encounter (${g.ratio.toFixed(2)}× the deadly budget), which would suggest about <b></b>.`;
    const bs = $('guide').querySelectorAll('b'); bs[0].textContent = g.label; bs[1].textContent = pct(g.pWin) + ' win chance';
    const warns = $('warns'); warns.textContent = '';
    for (const t of E.outOfRange(MODEL, S.level, S.heroes.length, monsterList())) warns.appendChild(el('li', '', `${t[0].toUpperCase() + t.slice(1)}. Treat the model's numbers as unreliable here and trust the simulation.`));
    const out = Object.keys(S.mons).filter(n => BY[n].cr > S.level + 3);
    if (out.length) warns.appendChild(el('li', '', `${out.join(', ')} ${out.length > 1 ? 'are' : 'is'} well above the monsters the model was trained on (CR up to level + 3). Trust the simulation more here.`));
    sensitivity();
    clearTimeout(simTimer); const tk = ++simToken; simTimer = setTimeout(() => runSim(tk, p), 150);
  }
  function runSim(tk, p) {
    const list = monsterList(); if (!list.length || tk !== simToken) return;
    const r = E.simulate(party(), list, SIM_RUNS); if (tk !== simToken) return;
    $('s1').textContent = pct(r.p_win); $('s2').textContent = pct(r.hp_lost); $('s3').textContent = r.deaths.toFixed(1);
    for (const id of ['s1', 's2', 's3']) $(id).style.opacity = 1;
    $('simHead').textContent = 'Simulation';
    $('simNote').textContent = `The simulation plays this exact fight ${SIM_RUNS.toLocaleString()} times, so it can differ by about 1 point from run to run.`;
    const diff = Math.abs(r.p_win - p.p_win), w = $('warns');
    w.querySelectorAll('.disagree').forEach(n => n.remove());
    if (diff > .1) { const li = el('li', 'disagree', `The model and the simulation differ by ${Math.round(diff * 100)} points here. This encounter is unusual, so go with the simulation.`); w.appendChild(li); }
  }
  function sensitivity() {
    const names = Object.keys(S.mons); if (!names.length) return;
    const top = names.reduce((a, b) => BY[a].xp * S.mons[a] >= BY[b].xp * S.mons[b] ? a : b);
    const others = monsterTotal() - S.mons[top];
    $('sensH').textContent = `What if there were more or fewer ${top}? (model prediction)`;
    const box = $('bars'); box.textContent = '';
    for (let k = 1; k <= 12; k++) {
      const cell = el('div'), bar = el('i');
      if (others + k <= MAX_MON) {
        const counts = { ...S.mons, [top]: k }, p = E.predict(MODEL, E.features(S.level, party(), monsterList(counts))).p_win;
        bar.style.height = Math.max(p * 64, 2) + 'px'; bar.style.background = tone(p); bar.title = `${k} × ${top}: ${pct(p)}`;
      } else bar.style.height = '2px';
      cell.append(bar, document.createTextNode(k)); if (k === S.mons[top]) cell.className = 'cur'; box.appendChild(cell);
    }
  }

  /* ---------------- start up */
  function renderMetrics() {
    const t = $('metrics'), pts = v => (v * 100).toFixed(1) + ' pts', G = METRICS.guideline_mae, GC = METRICS.guideline_close_fights_mae;
    const head = el('tr'); head.append(Object.assign(el('th', 'sr'), { textContent: 'Measure' }), el('th', '', 'All fights'), el('th', '', 'Close fights'));
    t.appendChild(head);
    const rows = [['Win chance, official guideline', pts(G), pts(GC)], ['Win chance, this model', pts(METRICS.p_win.mae), pts(METRICS.p_win.close_fights_mae), 1],
      ['Party HP lost, this model', pts(METRICS.hp_lost.mae), pts(METRICS.hp_lost.close_fights_mae), 1],
      ['Heroes down, this model', METRICS.deaths.mae.toFixed(2), METRICS.deaths.close_fights_mae.toFixed(2), 1]];
    for (const [a, b, c, best] of rows) { const tr = el('tr', best ? 'best' : ''); tr.append(el('th', '', a), el('td', '', b), el('td', '', c)); t.appendChild(tr); }
    t.appendChild(Object.assign(el('caption', 'foot-cap'), { textContent: 'Close fights are the ones that could go either way (win chance between 6% and 94%). Points are percentage points.' }));
  }
  async function start() {
    const lv = $('level');
    renderPresets();
    try {
      const [m, mons, met] = await Promise.all(['model.json', 'monsters.json', 'metrics.json'].map(f => fetch(f).then(r => { if (!r.ok) throw new Error(f); return r.json(); })));
      MODEL = m; METRICS = met; MONS = mons.sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name)); BY = Object.fromEntries(MONS.map(x => [x.name, x]));
    } catch (e) { $('loading').textContent = 'Could not load the model files. Open this page through the server, not as a local file.'; return; }
    const R = MODEL.range || { levels: [1, 10], party: [3, 6] };
    MIN_HEROES = R.party[0]; MAX_HEROES = R.party[1]; MAX_LEVEL = R.levels[1];
    for (let i = R.levels[0]; i <= MAX_LEVEL; i++) { const o = el('option', '', i); o.value = i; lv.appendChild(o); }
    document.querySelectorAll('.range-text').forEach(n => { n.textContent = `parties of ${R.party[0]} to ${R.party[1]} heroes at levels ${R.levels[0]} to ${R.levels[1]}`; });
    if (R.max_monsters) MAX_MON = R.max_monsters;
    if (METRICS.trained_on) {
      const T = METRICS.trained_on, round = v => v >= 1e6 ? (Math.round(v / 1e5) / 10) + ' million' : v.toLocaleString('en-US');
      document.querySelectorAll('[data-k=enc]').forEach(n => { n.textContent = T.encounters.toLocaleString('en-US'); });
      document.querySelectorAll('[data-k=fights]').forEach(n => { n.textContent = round(T.fights); });
    }
    skeleton(); renderMetrics(); initGenerator();
    lv.addEventListener('change', () => { S.level = +lv.value; S.heroes = S.heroes.map(h => h.custom ? h : newHero(h.cls)); S.preset = null; markPreset(); renderHeroes(); renderPicked(); renderList(); renderPool(); update(); });
    $('heroDec').addEventListener('click', () => { if (S.heroes.length > MIN_HEROES) { S.heroes.pop(); S.preset = null; markPreset(); renderHeroes(); update(); } });
    $('heroInc').addEventListener('click', () => { if (S.heroes.length < MAX_HEROES) { setHeroCount(S.heroes.length + 1); S.preset = null; markPreset(); renderHeroes(); update(); } });
    $('q').addEventListener('input', e => { S.q = e.target.value; renderList(); });
    $('plausible').addEventListener('change', e => { S.plausible = e.target.checked; renderList(); });
    applyPreset(PRESETS[1]);
  }
  start();
})();
