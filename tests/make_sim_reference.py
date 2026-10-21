"""Writes data/sim_reference.json: hand-made encounters (real classes, some hurt and spent) simulated with the Python simulator (many fights), for the JS parity test."""
import json, sys, numpy as np
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent / "src"))
from lab import *
mon = {m["name"]: m for m in MONSTERS}
P4 = ["Fighter", "Cleric", "Rogue", "Wizard"]
cases = [("L1 F/C/R/W vs 6 Goblins", 1, P4, {"Goblin": 6}, 1), ("L3 F/C/R/W vs 2 Owlbears", 3, P4, {"Owlbear": 2}, 1), ("L5 F/C/R/W vs 3 Trolls", 5, P4, {"Troll": 3}, 1),
         ("L5 Pal/Rng/Rog/Clr vs 3 Trolls", 5, ["Paladin", "Ranger", "Rogue", "Cleric"], {"Troll": 3}, 1), ("L5 four casters vs 3 Trolls", 5, ["Wizard", "Sorcerer", "Cleric", "Druid"], {"Troll": 3}, 1),
         ("L8 Pal/Clr/Rog/Wiz vs 2 Young Green Dragons", 8, ["Paladin", "Cleric", "Rogue", "Wizard"], {"Young Green Dragon": 2}, 1),
         ("L11 F/C/R/W vs Adult Red Dragon", 11, P4, {"Adult Red Dragon": 1}, 1), ("L9 Barb/Bard/Wlk/Monk vs 4 Ogres", 9, ["Barbarian", "Bard", "Warlock", "Monk"], {"Ogre": 4}, 1),
         ("L5 Art/Drd/Fgt/Wlk vs Owlbear + 4 Wolves", 5, ["Artificer", "Druid", "Fighter", "Warlock"], {"Owlbear": 1, "Wolf": 4}, 1),
         ("L5 F/C/R/W hurt and spent vs 3 Trolls", 5, P4, {"Troll": 3}, 2), ("L8 Pal/Clr/Rog/Wiz hurt, one down, vs Young Green", 8, ["Paladin", "Cleric", "Rogue", "Wizard"], {"Young Green Dragon": 1}, 3),
         ("L2 two heroes vs 3 Goblins", 2, ["Fighter", "Wizard"], {"Goblin": 3}, 1)]
rng = np.random.default_rng(5); out = []
for name, lvl, cls, ms, mode in cases:
    party = [hero(c, lvl) for c in cls]
    if mode >= 2:                         # a mid-day state: hurt, slots and features partly spent
        for h in party: wear(h, rng)
    if mode == 3: party[0]["hp"] = 0.0
    en = dict(level=lvl, size=len(party), party=party, mons=[mon[n] for n, k in ms.items() for _ in range(k)])
    r = simulate(pack([en]), R=40000, seed=3)
    out.append(dict(name=name, level=lvl, heroes=party, monsters=ms, p_win=float(r["p_win"][0]), hp_lost=float(r["hp_lost"][0]), deaths=float(r["deaths"][0]), rounds=float(r["rounds"][0])))
json.dump(out, open(ROOT / "data" / "sim_reference.json", "w"))
print("wrote", len(out))
