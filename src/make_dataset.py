"""Generate random encounters, play each one many times, and save features + outcomes.
Usage: python src/make_dataset.py [number_of_encounters] [fights_per_encounter]"""
import sys, time
import numpy as np
from lab import *
from features_ext import features_all, ALL_NAMES

n_enc = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
R = int(sys.argv[2]) if len(sys.argv) > 2 else 64
rng = np.random.default_rng(2024)
t0 = time.time()
X, Y = [], {"p_win": [], "hp_lost": [], "deaths": [], "rounds": []}
CH = 1500
for i in range(0, n_enc, CH):
    encs = [make_encounter(rng) for _ in range(min(CH, n_enc - i))]
    r = simulate(pack(encs), R=R, seed=i)
    X.append(features_all(encs))
    for k in Y: Y[k].append(r[k])
    print(f"{i + len(encs):6d}/{n_enc}  {time.time() - t0:5.0f}s", flush=True)
X = np.vstack(X); Y = {k: np.concatenate(v) for k, v in Y.items()}
np.savez_compressed(DATA / "dataset.npz", X=X, features=np.array(ALL_NAMES), R=R, **Y)
print("saved", X.shape, " mean win rate", Y["p_win"].mean().round(3))
print("share of encounters by win rate: <10%", (Y["p_win"] < .1).mean().round(2), " 10-90%", ((Y["p_win"] >= .1) & (Y["p_win"] <= .9)).mean().round(2), " >90%", (Y["p_win"] > .9).mean().round(2))
