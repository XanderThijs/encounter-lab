"""Model inputs. Mirrors web/engine.js (features) exactly, number for number: tests/parity.mjs checks it.
The first 17 describe the fight at face value, the next 21 add a quick dice-free fight and spreads, the last 14 describe what the new
simulator knows about: spell slots, healing, class features, breath weapons, legendary actions and heroes who start hurt or down."""
import math
import numpy as np
from lab import *

BASE_NAMES = ["level", "n_pc", "pc_hp", "pc_ac", "pc_dpr", "n_mon", "mon_hp", "mon_ac", "mon_dpr", "mon_cr_max", "xp_total", "adj_xp", "ratio",
              "hp_ratio", "dpr_ratio", "ttk_party", "ttk_mon"]
EXT_NAMES = ["pc_hp_min", "pc_ac_min", "heal_total", "n_healers", "mon_hp_max", "mon_hp_min", "mon_dpr_max", "n_kinds", "mon_atk_mean", "mon_nat_sum",
             "pc_nat_sum", "top_hero_share", "kill_first", "lose_first", "fluid_rounds", "fluid_pc_left", "fluid_mon_left", "fluid_pc_alive",
             "log_ttk_ratio", "log_square", "log_ratio"]
NEW_NAMES = ["pc_max_hp", "hp_frac", "n_down", "pc_burst", "pc_dpr_eff", "mon_breath", "mon_leg", "mon_dpr_eff", "n_blasters", "slots_total",
             "log_ttk_eff", "n_smiters", "surge_total", "mon_regen"]
ALL_NAMES = BASE_NAMES + EXT_NAMES + NEW_NAMES
FEATURES = ALL_NAMES

def exp_dpr(atk, nat, dmg, ref_ac=15):
    return nat * min(max((21 - (ref_ac - atk)) / 20, .05), .95) * dmg

def fluid(hp_pc, dpr_pc, hp_m, dpr_m, max_rounds=30):
    """Average-case fight with no dice: focus fire on the weakest monster, monster damage spread evenly over living heroes."""
    hp_pc = list(map(float, hp_pc)); hp_m = list(map(float, hp_m)); n0 = len(hp_pc); h0 = max(sum(hp_pc), 1e-9); m0 = sum(hp_m)
    rounds = 0
    while rounds < max_rounds and any(h > 0 for h in hp_pc) and any(m > 0 for m in hp_m):
        rounds += 1
        dp = sum(d for h, d in zip(hp_pc, dpr_pc) if h > 0); dm = sum(d for h, d in zip(hp_m, dpr_m) if h > 0)
        order = sorted((i for i, m in enumerate(hp_m) if m > 0), key=lambda i: hp_m[i])
        for i in order:
            take = min(dp, hp_m[i]); hp_m[i] -= take; dp -= take
            if dp <= 0: break
        alive = [i for i, h in enumerate(hp_pc) if h > 0]
        for i in alive: hp_pc[i] -= dm / len(alive)
    return rounds, sum(max(h, 0) for h in hp_pc) / h0, sum(max(m, 0) for m in hp_m) / m0, sum(h > 0 for h in hp_pc) / n0

def hero_numbers(h, n_mon, mon_ac):
    """What one hero brings besides the plain weapon attack: (spell+smite burst, heal capacity, slot total, surge damage)."""
    dpr = exp_dpr(h["atk"], h["nat"], h["dmg"], mon_ac)
    tg = min(3, n_mon); burst = heal = 0.0
    for i, n in enumerate(h["slots"]):
        L = i + 1
        if n and h["blast"] > 0:
            tot = (5.5 * L + 5) * SPELL_HIT * h["blast"] * (1 if L < AREA_FROM else tg)
            burst += n * max(0.0, tot - dpr)
        if n and h["smite"]: burst += n * 4.5 * (L + 1) * min(1.0, .8)
        if n and h["bheal"]: heal += n * (2.5 * L + h["mod"])
        if n and h["cure"] and not h["bheal"]: heal += n * (4.5 * L + h["mod"])
    heal += h["loh"] + h["sw"]
    return burst, heal, sum(h["slots"]), dpr * h["surge"]

def features_one(level, P, M):
    n_pc, n_mon = len(P), len(M)
    pc_hp = sum(p["hp"] for p in P); pc_max = sum(p["max"] for p in P); pc_dpr = sum(exp_dpr(p["atk"], p["nat"], p["dmg"]) for p in P)
    mon_hp = sum(m["hp"] for m in M); mon_dpr = sum(exp_dpr(m["to_hit"], m["n_atk"], m["dmg"]) for m in M)
    xps = [m["xp"] for m in M]; adj = adjusted_xp(xps, n_pc)
    pc_ac = sum(p["ac"] for p in P) / n_pc; mon_ac = sum(m["ac"] for m in M) / n_mon
    pc_dpr_v = [exp_dpr(p["atk"], p["nat"], p["dmg"], mon_ac) for p in P]; mon_dpr_v = [exp_dpr(m["to_hit"], m["n_atk"], m["dmg"], pc_ac) for m in M]
    s_pc, s_mon = sum(pc_dpr_v), sum(mon_dpr_v)
    base = [level, n_pc, pc_hp, pc_ac, pc_dpr, n_mon, mon_hp, mon_ac, mon_dpr, max(m["cr"] for m in M), sum(xps), adj,
            adj / deadly_budget(level, n_pc), mon_hp / max(pc_hp, 1e-6), mon_dpr / max(pc_dpr, 1e-6),
            mon_hp / max(s_pc, 1e-6), pc_hp / max(s_mon, 1e-6)]
    # --- the new simulator's extras
    hn = [hero_numbers(p, n_mon, mon_ac) for p in P]
    burst = [x[0] for x in hn]; heal = [x[1] for x in hn]; surge = [x[3] for x in hn]
    # dice-free monsters: breath (3 targets, about 60% of full damage, used once plus recharges over a 4-round fight) and legendary attacks
    br = leg = 0.0
    for m in M:
        if m.get("br_dmg", 0) > 0:
            uses = 1 + 3 * m["br_p"] if m["br_n"] == 99 else min(m["br_n"], 3)
            br += m["br_dmg"] * .6 * min(3, n_pc) * uses
        if m.get("leg", 0) > 0: leg += m["leg"] * min(max((21 - (pc_ac - m["to_hit"])) / 20, .05), .95) * m["dmg"]
    pc_eff = [d + (b + s) / 4 for d, b, s in zip(pc_dpr_v, burst, surge)]
    mon_eff_each = [d + leg / n_mon + br / 4 / n_mon for d in mon_dpr_v]
    s_pc_eff, s_mon_eff = sum(pc_eff), sum(mon_eff_each)
    pc_hp_list = [p["hp"] + .5 * hh for p, hh in zip(P, heal)]; mon_hp_list = [m["hp"] + 3 * m.get("regen", 0) for m in M]          # a regenerating monster is worth about three rounds of its healing in extra hit points
    fr, fp, fm, fa = fluid(pc_hp_list, pc_eff, mon_hp_list, mon_eff_each)
    tp, tm = sum(mon_hp_list) / max(s_pc_eff, 1e-6), sum(pc_hp_list) / max(s_mon_eff, 1e-6)
    ratio = adj / deadly_budget(level, n_pc)
    dpr_ref = sum(exp_dpr(p["atk"], p["nat"], p["dmg"]) for p in P)
    hp_list = [p["hp"] for p in P]; min_hp = min(p["hp"] for p in P); min_mon = min(mon_hp_list)
    ext = [min_hp, min(p["ac"] for p in P), sum(heal), sum(1 for x in heal if x > 0), max(mon_hp_list), min_mon, max(mon_dpr_v),
           len({m["name"] for m in M}), sum(m["to_hit"] for m in M) / n_mon, sum(m["n_atk"] for m in M), sum(p["nat"] for p in P),
           max(pc_eff) / max(s_pc_eff, 1e-6), min_mon / max(s_pc_eff, 1e-6), min_hp / max(s_mon_eff, 1e-6), fr, fp, fm, fa,
           math.log(max(tm, 1e-3) / max(tp, 1e-3)),
           math.log(max(1 / max(sum(mon_hp_list) / max(sum(hp_list), 1e-6), 1e-6) / max(s_mon_eff / max(dpr_ref, 1e-6), 1e-6), 1e-6)),
           math.log(max(ratio, 1e-3))]
    new = [pc_max, pc_hp / max(pc_max, 1e-6), sum(1 for p in P if p["hp"] <= 0), sum(burst), s_pc_eff, br, leg, s_mon_eff,
           sum(1 for p in P if p["blast"] > 0 and sum(p["slots"]) > 0), sum(x[2] for x in hn), math.log(max(tp, 1e-3)),
           sum(1 for p in P if p["smite"] and sum(p["slots"]) > 0), sum(surge), sum(m.get("regen", 0) for m in M)]
    return base + ext + new

def features_all(encs):
    return np.array([features_one(e["level"], e["party"], e["mons"]) for e in encs], np.float64)
