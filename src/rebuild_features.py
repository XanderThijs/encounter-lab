"""Recomputes the feature columns of data/dataset.npz for the SAME random encounters (replays the generator), keeping the simulated labels.
Only needed if you change the features in features_ext.py without wanting to re-run the 15-minute simulation."""
import numpy as np
from lab import *
from features_ext import features_all, ALL_NAMES
d = dict(np.load(DATA / "dataset.npz")); n = len(d["p_win"]); rng = np.random.default_rng(2024); encs = []
for i in range(0, n, 1500): encs += [make_encounter(rng) for _ in range(min(1500, n - i))]
X = features_all(encs); assert X.shape[0] == d["X"].shape[0], "encounters differ from the ones that were simulated"
d["X"] = X; d["features"] = np.array(ALL_NAMES); np.savez_compressed(DATA / "dataset.npz", **d); print("rebuilt", X.shape)
