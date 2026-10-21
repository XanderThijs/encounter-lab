import numpy as np, json
from lab import *
rng = np.random.default_rng(1)
mon = {m["name"]: m for m in MONSTERS}
def enc(level, size, names):
    return dict(level=level, size=size, party=make_party(level, size, rng), mons=[mon[n] for n in names])
tests = [("L1 x4 vs 2 goblins", enc(1, 4, ["Goblin"] * 2)), ("L1 x4 vs 6 goblins", enc(1, 4, ["Goblin"] * 6)), ("L3 x4 vs Ogre", enc(3, 4, ["Ogre"])),
         ("L3 x4 vs 2 Ogres", enc(3, 4, ["Ogre"] * 2)), ("L5 x4 vs Troll", enc(5, 4, ["Troll"])), ("L5 x4 vs 3 Trolls", enc(5, 4, ["Troll"] * 3)),
         ("L5 x4 vs Adult Red Dragon", enc(5, 4, ["Adult Red Dragon"]))]
res = simulate(pack([t[1] for t in tests]), R=400)
for (n, e), w, l in zip(tests, res["p_win"], res["hp_lost"]):
    adj = adjusted_xp([m["xp"] for m in e["mons"]], e["size"]) / deadly_budget(e["level"], e["size"])
    print(f"{n:28s} win {w*100:5.1f}%   party HP lost {l*100:5.1f}%   guideline: {adj:4.2f} x deadly budget")
