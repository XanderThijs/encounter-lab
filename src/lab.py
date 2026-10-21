"""Party model, encounter generator, fight simulator and the official XP-budget guideline.

Everything is deliberately simple and written out here, so the limits are visible:
  * Fights are 'theatre of the mind': no positions, no terrain, and spells are reduced to damage, healing and smites by slot level.
  * Heroes are the 13 real classes (src/classes.py + data/classes.json): attacks per round, damage by level, spell slots, Action Surge,
    Second Wind, Lay on Hands, Rage, bonus-action healing. A hero at 0 HP is down (out of the fight) and can be healed back up.
  * Monsters attack, use a breath-style saving-throw action when it is charged, and make extra attacks for legendary actions.
  * The simulator plays many fights per encounter and reports how often the party wins.
"""
import json
from pathlib import Path
import numpy as np
from classes import *

NP, NM = 10, 20          # max party size, max monsters
LEVELS, SIZES = (1, 20), (2, 10)      # ranges the training encounters cover (inclusive)
N = NP + NM
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "v2"; DATA.mkdir(parents=True, exist_ok=True)   # generated datasets (big, can be rebuilt)
MONSTERS = json.load(open(ROOT / "data" / "monsters.json"))

# ---------------------------------------------------------------- player characters
def make_pc(level, cls, rng):
    """One hero of this class with a little random spread so no two parties are identical."""
    h = hero(cls, level); j = lambda v, s=.12: v * rng.uniform(1 - s, 1 + s)
    h["hp"] = h["max"] = j(h["hp"]); h["dmg"] = j(h["dmg"]); h["ac"] = h["ac"] + int(rng.integers(-1, 2))
    return h

def wear(h, rng):
    """Start the fight partway through the adventuring day: some HP lost, some slots and class features already spent."""
    h["hp"] = h["max"] * rng.uniform(.35, 1.0)
    h["slots"] = [int(rng.binomial(n, rng.uniform(.2, 1.0))) if n else 0 for n in h["slots"]]
    if rng.random() < .5: h["surge"] = 0
    if rng.random() < .5: h["sw"] = 0.0
    if h["loh"]: h["loh"] = float(round(h["loh"] * rng.uniform(0, 1)))
    if rng.random() < .3: h["rage"] = 0
    return h

def make_party(level, size, rng, worn=None):
    names = rng.choice(CLASS_NAMES, size=size, p=np.array([TABLE["weights"][k] for k in CLASS_NAMES]) / sum(TABLE["weights"].values()))
    party = [make_pc(level, str(c), rng) for c in names]
    if (rng.random() < .35) if worn is None else worn: party = [wear(h, rng) for h in party]
    return party

# ---------------------------------------------------------------- official guideline (DMG 2014 XP budget)
THRESH = {1: (25, 50, 75, 100), 2: (50, 100, 150, 200), 3: (75, 150, 225, 400), 4: (125, 250, 375, 500),
          5: (250, 500, 750, 1100), 6: (300, 600, 900, 1400), 7: (350, 750, 1100, 1700), 8: (450, 900, 1400, 2100),
          9: (550, 1100, 1600, 2400), 10: (600, 1200, 1900, 2800), 11: (800, 1600, 2400, 3600), 12: (1000, 2000, 3000, 4500),
          13: (1100, 2200, 3400, 5100), 14: (1250, 2500, 3800, 5700), 15: (1400, 2800, 4300, 6400), 16: (1600, 3200, 4800, 7200),
          17: (2000, 3900, 5900, 8800), 18: (2100, 4200, 6300, 9500), 19: (2400, 4900, 7300, 10900), 20: (2800, 5700, 8500, 12700)}
MULT = [.5, 1, 1.5, 2, 2.5, 3, 4]

def adjusted_xp(xps, party_size):
    n = len(xps)
    i = 1 if n == 1 else 2 if n == 2 else 3 if n <= 6 else 4 if n <= 10 else 5 if n <= 14 else 6
    if party_size < 3: i = min(6, i + 1)
    elif party_size >= 6: i = max(0, i - 1)
    return sum(xps) * MULT[i]

def deadly_budget(level, party_size):
    return THRESH[level][3] * party_size

# ---------------------------------------------------------------- encounters
def make_encounter(rng):
    level = int(rng.integers(LEVELS[0], LEVELS[1] + 1)); size = int(rng.integers(SIZES[0], SIZES[1] + 1))
    party = make_party(level, size, rng)
    target = rng.uniform(.4, 3.4) * deadly_budget(level, size) / 2.0     # share of the budget, before the multiplier
    pool = [m for m in MONSTERS if m["cr"] <= level + 3 and m["xp"] <= max(target * 1.6, 60)] or [min(MONSTERS, key=lambda m: m["xp"])]
    mons = []
    for _ in range(int(rng.integers(1, 4))):
        m = pool[int(rng.integers(len(pool)))]
        c = int(np.clip(round(target / max(m["xp"], 1) * rng.uniform(.5, 1.2)), 1, 12))
        c = min(c, NM - len(mons))
        mons += [m] * c
        target = max(target - c * m["xp"], 0)
        if len(mons) >= NM or target < 10: break
    return dict(level=level, size=size, party=party, mons=mons)

HERO_KEYS = ["hp", "max", "ac", "atk", "nat", "dmg", "init", "save", "blast", "bheal", "cure", "smite", "surge", "sw", "loh", "rage", "mod"]
MON_KEYS = ["br_dmg", "br_dc", "br_p", "br_n", "leg", "regen"]

def pack(encs):
    E = len(encs)
    A = {k: np.zeros((E, N), np.float32) for k in ["hp", "max", "ac", "atk", "nat", "dmg", "init", "save", "blast", "bheal", "cure", "smite", "surge", "sw", "loh", "rage", "mod"] + MON_KEYS}
    A["slots"] = np.zeros((E, N, 9), np.int8)
    side = np.ones((E, N), np.int8); valid = np.zeros((E, N), bool)
    for e, en in enumerate(encs):
        for i, p in enumerate(en["party"]):
            for k in HERO_KEYS: A[k][e, i] = p[k]
            A["slots"][e, i] = p["slots"]
            side[e, i] = 0; valid[e, i] = True
        for j, m in enumerate(en["mons"]):
            s = NP + j
            A["hp"][e, s] = A["max"][e, s] = m["hp"]; A["ac"][e, s] = m["ac"]; A["atk"][e, s] = m["to_hit"]; A["nat"][e, s] = m["n_atk"]
            A["dmg"][e, s] = m["dmg"]; valid[e, s] = True
            for k in MON_KEYS: A[k][e, s] = m.get(k, 0)
    A["side"] = side; A["valid"] = valid
    return A

# ---------------------------------------------------------------- simulator
def simulate(A, R=64, seed=0, max_rounds=20):
    """Play every encounter R times at once. Returns per-encounter win rate, party HP lost, heroes down, rounds.

    One turn, in order. HERO: Second Wind if under half HP; bonus-action heal on the weakest ally (or a downed one) if under 40%;
    Lay on Hands / Cure Wounds if an ally is under 35%; else a spell from the highest slot (blasters) or weapon attacks on the weakest monster
    (Action Surge doubles the attacks in round 1; a paladin smites with the lowest slot after a hit). MONSTER: breath-style action when charged
    (3 random heroes, save for half), else attacks a random hero (40% of the time the weakest one). At the end of each round legendary monsters
    make extra attacks, and monsters with regeneration heal at the start of their turn. A hero at 0 HP is down, not dead: healing stands them back up. The fight ends when one side has nobody left standing."""
    rng = np.random.default_rng(seed)
    E = A["hp"].shape[0]; B = E * R
    rep = lambda a: np.repeat(a, R, axis=0)
    hp = rep(A["hp"]).astype(np.float64); hp_start = hp.copy(); mx = rep(A["max"]).astype(np.float64); ac = rep(A["ac"]); atk = rep(A["atk"]); nat = rep(A["nat"]).astype(int)
    dmg = rep(A["dmg"]); valid = rep(A["valid"]); is_pc = rep(A["side"]) == 0; save = rep(A["save"]); mod = rep(A["mod"])
    blast = rep(A["blast"]); bheal = rep(A["bheal"]) > 0; cure = rep(A["cure"]) > 0; smite = rep(A["smite"]) > 0; surge = rep(A["surge"]).astype(int)
    sw = rep(A["sw"]).astype(np.float64); loh = rep(A["loh"]).astype(np.float64); rage = rep(A["rage"]) > 0; slots = rep(A["slots"]).astype(np.int8)
    br_dmg = rep(A["br_dmg"]); br_dc = rep(A["br_dc"]); br_p = rep(A["br_p"]); br_n = rep(A["br_n"]).astype(int); leg = rep(A["leg"]).astype(int); regen = rep(A["regen"]).astype(np.float64)
    br_left = np.where(br_dmg > 0, np.where(br_n == 99, 1, br_n), 0)
    on = valid & (hp > 0); hp = np.where(valid, np.maximum(hp, 0), 0)
    init = rng.integers(1, 21, (B, N)) + rep(A["init"]); init[~valid] = -99
    order = np.argsort(-init, axis=1, kind="stable")
    ar = np.arange(B); rounds = np.zeros(B)
    any_leg = (leg > 0).any(0); any_br = (br_dmg > 0).any(1)
    U = lambda n: rng.uniform(.75, 1.25, n)

    # every helper below works on a list of rows (fights) that already passed their condition, so each step only touches the fights that need it
    def hit_hero(r, t, d):
        hp[r, t] = np.maximum(hp[r, t] - d, 0); on[r, t] = on[r, t] & (hp[r, t] > 0)
    def hit_mon(r, t, d):
        hp[r, t] = hp[r, t] - d; on[r, t] = on[r, t] & (hp[r, t] > 0)
    def raise_hero(r, t, amt):
        hp[r, t] = np.minimum(mx[r, t], np.maximum(hp[r, t], 0) + amt); on[r, t] = on[r, t] | (hp[r, t] > 0)
    def weakest_ally(r):
        frac = np.where(valid[r] & is_pc[r], hp[r] / np.maximum(mx[r], 1), np.inf); low = frac.argmin(1)
        return low, frac[np.arange(len(r)), low]
    def pick_hero(r, live):           # the monsters' choice: the weakest hero 40% of the time, otherwise a random one
        n = len(r)
        t_rand = np.where(live, rng.random((n, N)), -1).argmax(1); t_weak = np.where(live, hp[r], np.inf).argmin(1)
        return np.where(rng.random(n) < .4, t_weak, t_rand)

    for rd in range(max_rounds):
        live_pc = on & is_pc; live_mon = on & ~is_pc
        done = ~live_pc.any(1) | ~live_mon.any(1)
        if done.all(): break
        rounds += ~done
        if any_br.any():
            back = (br_n == 99) & (br_left == 0) & (rng.random((B, N)) < br_p) & live_mon       # a recharged breath weapon
            br_left = np.where(back, 1, br_left)
        for p in range(N):
            a = order[:, p]
            act = on[ar, a] & (on & is_pc).any(1) & (on & ~is_pc).any(1)
            ih = np.nonzero(act & is_pc[ar, a])[0]; im = np.nonzero(act & ~is_pc[ar, a])[0]
            if len(ih):
                ah = a[ih]
                m_ = (sw[ih, ah] > 0) & (hp[ih, ah] < .5 * mx[ih, ah])                       # Second Wind
                j = ih[m_]; aj = ah[m_]
                if len(j): hp[j, aj] = np.minimum(mx[j, aj], hp[j, aj] + sw[j, aj]); sw[j, aj] = 0
                low, fl = weakest_ally(ih)
                hasL = slots[ih, ah] > 0; anyL = hasL.any(1); li = hasL.argmax(1)             # lowest slot level left
                m_ = bheal[ih, ah] & anyL & (fl < .4)                                        # Healing Word: a bonus action
                j = np.nonzero(m_)[0]
                if len(j):
                    raise_hero(ih[j], low[j], 2.5 * (li[j] + 1) + mod[ih[j], ah[j]]); slots[ih[j], ah[j], li[j]] -= 1
                    low, fl = weakest_ally(ih)
                    hasL = slots[ih, ah] > 0; anyL = hasL.any(1); li = hasL.argmax(1)
                m_lh = (loh[ih, ah] > 0) & (fl < .35)                                        # Lay on Hands
                j = np.nonzero(m_lh)[0]
                if len(j):
                    amt = np.minimum(loh[ih[j], ah[j]], np.maximum(1.0, .6 * mx[ih[j], low[j]]))
                    raise_hero(ih[j], low[j], amt); loh[ih[j], ah[j]] -= amt
                m_cu = ~m_lh & cure[ih, ah] & anyL & (fl < .35)                              # Cure Wounds
                j = np.nonzero(m_cu)[0]
                if len(j):
                    raise_hero(ih[j], low[j], 4.5 * (li[j] + 1) + mod[ih[j], ah[j]]); slots[ih[j], ah[j], li[j]] -= 1
                acted = m_lh | m_cu
                hasH = slots[ih, ah] > 0; hi = 8 - hasH[:, ::-1].argmax(1)                   # highest slot level left
                m_bl = ~acted & (blast[ih, ah] > 0) & hasH.any(1)                            # a damaging spell
                j = np.nonzero(m_bl)[0]
                if len(j):
                    r = ih[j]; key = np.where(on[r] & ~is_pc[r], hp[r], np.inf); srt = np.argsort(key, axis=1)[:, :3]; rr = np.arange(len(r))
                    d_sp = (5.5 * (hi[j] + 1) + 5) * SPELL_HIT * blast[r, ah[j]] * U(len(r))
                    for k in range(3):
                        ok = np.isfinite(key[rr, srt[:, k]]) & ((k == 0) | (hi[j] + 1 >= AREA_FROM))
                        q = np.nonzero(ok)[0]
                        if len(q): hit_mon(r[q], srt[q, k], d_sp[q])
                    slots[r, ah[j], hi[j]] -= 1
                m_at = ~acted & ~m_bl                                                        # weapon or cantrip attacks
                j = np.nonzero(m_at)[0]
                if len(j):
                    r = ih[j]; aa = ah[j]; key = np.where(on[r] & ~is_pc[r], hp[r], np.inf); t = key.argmin(1)
                    sg = (surge[r, aa] > 0) & (rd == 0)                                      # Action Surge in round 1
                    surge[r, aa] -= sg
                    p_hit = np.clip((21 - (ac[r, t] - atk[r, aa])) / 20, .05, .95)
                    hits = rng.binomial(nat[r, aa] * np.where(sg, 2, 1), p_hit)
                    d = hits * dmg[r, aa] * U(len(r))
                    hasS = slots[r, aa] > 0; lo_ = hasS.argmax(1)
                    sm = smite[r, aa] & (hits > 0) & hasS.any(1) & (hp[r, t] - d > 0)        # a paladin smites with the lowest slot
                    d = d + np.where(sm, 4.5 * (lo_ + 2), 0)
                    q = np.nonzero(sm)[0]
                    if len(q): slots[r[q], aa[q], lo_[q]] -= 1
                    hit_mon(r, t, d)
            if len(im):
                am = a[im]; live = on[im] & is_pc[im]
                j = np.nonzero(regen[im, am] > 0)[0]                                         # regeneration: trolls, oni, vampires heal at the start of their turn
                if len(j): hp[im[j], am[j]] = np.minimum(mx[im[j], am[j]], hp[im[j], am[j]] + regen[im[j], am[j]])
                ub = (br_left[im, am] > 0) & (br_dmg[im, am] > 0)                            # breath-style action
                j = np.nonzero(ub)[0]
                if len(j):
                    r = im[j]; aa = am[j]; rk = np.where(on[r] & is_pc[r], rng.random((len(r), N)), -1.0); top = np.argsort(-rk, axis=1)[:, :3]; rr = np.arange(len(r))
                    for k in range(3):
                        q = np.nonzero(rk[rr, top[:, k]] >= 0)[0]
                        if not len(q): continue
                        tt = top[q, k]; ps = np.clip((21 - (br_dc[r[q], aa[q]] - save[r[q], tt])) / 20, .05, .95)
                        hit_hero(r[q], tt, br_dmg[r[q], aa[q]] * np.where(rng.random(len(q)) < ps, .5, 1.0))
                    br_left[r, aa] -= 1
                j = np.nonzero(~ub)[0]
                if len(j):
                    r = im[j]; aa = am[j]; t = pick_hero(r, live[j])
                    p_hit = np.clip((21 - (ac[r, t] - atk[r, aa])) / 20, .05, .95)
                    d = rng.binomial(nat[r, aa], p_hit) * dmg[r, aa] * U(len(r)) * np.where(rage[r, t], .5, 1.0)
                    hit_hero(r, t, d)
        for s in range(NP, N):                                                               # legendary actions: extra single attacks
            if not any_leg[s]: continue
            for k in range(2):
                ok = on[:, s] & (leg[:, s] > k) & (on & is_pc).any(1) & (on & ~is_pc).any(1)
                r = np.nonzero(ok)[0]
                if not len(r): continue
                t = pick_hero(r, on[r] & is_pc[r]); p_hit = np.clip((21 - (ac[r, t] - atk[r, s])) / 20, .05, .95)
                hit_hero(r, t, (rng.random(len(r)) < p_hit) * dmg[r, s] * U(len(r)) * np.where(rage[r, t], .5, 1.0))
    up = (on & is_pc).sum(1); mons_left = (on & ~is_pc).sum(1); n_pc = (valid & is_pc).sum(1)
    win = (mons_left == 0) & (up > 0)
    start = np.where(is_pc & valid, hp_start, 0).sum(1); end = np.where(is_pc & valid, hp, 0).sum(1); tot = np.maximum(np.where(is_pc & valid, mx, 0).sum(1), 1)
    lost = np.clip((start - end) / tot, 0, 1)
    f = lambda a_: a_.reshape(E, R).mean(1)
    return dict(p_win=f(win.astype(float)), hp_lost=f(lost), deaths=f((n_pc - up).astype(float)), rounds=f(rounds))

# ---------------------------------------------------------------- features (see features_ext.py)
