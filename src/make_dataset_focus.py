"""Extra data aimed at the hard part: close fights. Screens random encounters quickly, keeps the ones whose win chance is neither
near 0 nor near 1, then re-simulates them with many more fights each so the labels are accurate (dice noise is small).
Usage: python src/make_dataset_focus.py [part 0-3] [n_parts] [screened_encounters]   (run the parts in parallel; export_model.py picks up all focus_part*.npz)"""
import sys, time
import numpy as np
from lab import *
from features_ext import features_all, ALL_NAMES

part = int(sys.argv[1]) if len(sys.argv) > 1 else 0; parts = int(sys.argv[2]) if len(sys.argv) > 2 else 1
SCREEN, R_TRAIN, R_EVAL = 16, 160, 400
N_SCREEN = int(sys.argv[3]) if len(sys.argv) > 3 else 20000
rng = np.random.default_rng(777 + part); t0 = time.time()
encs = [make_encounter(rng) for _ in range(N_SCREEN)]
p_screen = np.concatenate([simulate(pack(encs[i:i + 1500]), R=SCREEN, seed=part * 1000 + i)["p_win"] for i in range(0, N_SCREEN, 1500)])   # in chunks, to keep memory small
keep = [i for i, p in enumerate(p_screen) if .06 <= p <= .94]
encs = [encs[i] for i in keep]; print(f"part {part}: kept {len(encs)} of {N_SCREEN} close encounters ({time.time() - t0:.0f}s)", flush=True)
n_eval = len(encs) // 6
sets = {"train": (encs[n_eval:], R_TRAIN), "eval": (encs[:n_eval], R_EVAL)}
out = {}
for name, (e, R) in sets.items():
    X, Y = [], {"p_win": [], "hp_lost": [], "deaths": [], "rounds": []}
    for i in range(0, len(e), 400):
        c = e[i:i + 400]; r = simulate(pack(c), R=R, seed=1000 + i + part)
        X.append(features_all(c))
        for k in Y: Y[k].append(r[k])
        print(f"part {part} {name} {i + len(c)}/{len(e)}  {time.time() - t0:.0f}s", flush=True)
    out[name] = dict(X=np.vstack(X), **{k: np.concatenate(v) for k, v in Y.items()})
np.savez_compressed(DATA / f"focus_part{part}.npz", **{f"{n}_{k}": v for n, d in out.items() for k, v in d.items()})
print(f"part {part} done {time.time() - t0:.0f}s")
