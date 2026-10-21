"""Train the final models and export them for the browser.
Writes  web/model.json  (boosted trees for win chance, party HP lost, heroes down),  results/export_results.json  and  data/parity.json.
Uses data/dataset.npz, plus the extra close-fight data from make_dataset_focus.py if it is present.
Usage: python src/export_model.py"""
import glob, json
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from lab import *
from features_ext import features_all, ALL_NAMES

d = np.load(DATA / "dataset.npz")
X, feats = d["X"], list(d["features"])
idx = np.arange(len(X)); tr, te = train_test_split(idx, test_size=.2, random_state=7)
TARGETS = {"p_win": (0, 1), "hp_lost": (0, 1), "deaths": (0, NP)}
parts = [np.load(f) for f in sorted(glob.glob(str(DATA / "focus_part*.npz")))]
if parts:
    XF = np.vstack([p["train_X"] for p in parts]); YF = {k: np.concatenate([p[f"train_{k}"] for p in parts]) for k in TARGETS}
    XE = np.vstack([p["eval_X"] for p in parts]); YE = {k: np.concatenate([p[f"eval_{k}"] for p in parts]) for k in TARGETS}
    print(f"extra close-fight data: {len(XF)} training encounters, {len(XE)} evaluation encounters (400 fights each)")

def fit(Xt, yt):
    return HistGradientBoostingRegressor(max_iter=600, learning_rate=.15, max_leaf_nodes=16, min_samples_leaf=20, l2_regularization=1.0,
                                         early_stopping=True, validation_fraction=.1, n_iter_no_change=40, random_state=0).fit(Xt, yt)

def tree_arrays(p):
    n = p.nodes
    return dict(f=[int(-1 if leaf else f) for f, leaf in zip(n["feature_idx"], n["is_leaf"])], t=[float(a) for a in n["num_threshold"]],
                l=[int(a) for a in n["left"]], r=[int(a) for a in n["right"]], v=[float(f"{a:.6g}") for a in n["value"]])

def js_predict(model, x):
    s = model["base"]
    for t in model["trees"]:
        i = 0
        while t["f"][i] >= 0: i = t["l"][i] if x[t["f"][i]] <= t["t"][i] else t["r"][i]
        s += t["v"][i]
    return s

out, results = {"features": feats, "targets": {}, "range": {"levels": list(LEVELS), "party": list(SIZES), "cr_over_level": 3, "max_monsters": NM, "classes": CLASS_NAMES, "version": 3}}, {}
for name, (lo, hi) in TARGETS.items():
    y = d[name]
    base = fit(X[tr], y[tr])
    if parts:
        gb = fit(np.vstack([X[tr], XF]), np.concatenate([y[tr], YF[name]]))
    else:
        gb = base
    pred = np.clip(gb.predict(X[te]), lo, hi)
    m = dict(trees=[tree_arrays(it[0]) for it in gb._predictors], base=round(float(gb._baseline_prediction[0][0]), 6), lo=lo, hi=hi)
    chk = np.array([js_predict(m, X[te][i]) for i in range(200)]); assert np.allclose(np.clip(chk, lo, hi), pred[:200], atol=1e-3), "export mismatch"
    out["targets"][name] = m
    r = dict(mae=float(mean_absolute_error(y[te], pred)), r2=float(r2_score(y[te], pred)), trees=len(m["trees"]))
    if parts:
        r["close_fights_mae"] = float(mean_absolute_error(YE[name], np.clip(gb.predict(XE), lo, hi)))
        r["close_fights_mae_without_extra_data"] = float(mean_absolute_error(YE[name], np.clip(base.predict(XE), lo, hi)))
    lv_i, n_i = feats.index("level"), feats.index("n_pc")
    groups = {"party_over_6": X[te][:, n_i] > 6, "level_over_10": X[te][:, lv_i] > 10, "party_2_to_6_level_1_to_10": (X[te][:, n_i] <= 6) & (X[te][:, lv_i] <= 10)}
    r["by_group"] = {g: dict(n=int(m_.sum()), mae=float(mean_absolute_error(y[te][m_], pred[m_]))) for g, m_ in groups.items() if m_.sum() > 20}
    results[name] = r
    print(f"{name:8s} test error {r['mae']:.4f}  R2 {r['r2']:.3f}  trees {r['trees']}" + (f"   close fights: {r['close_fights_mae']:.4f} (without extra data {r['close_fights_mae_without_extra_data']:.4f})" if parts else ""))

ri = feats.index("ratio"); iso = IsotonicRegression(out_of_bounds="clip", increasing=False).fit(X[tr][:, ri], d["p_win"][tr])
out["guideline_curve"] = [list(map(float, p)) for p in zip(iso.X_thresholds_.round(4), iso.y_thresholds_.round(4))]
results["guideline_mae"] = float(mean_absolute_error(d["p_win"][te], iso.predict(X[te][:, ri])))
if parts: results["guideline_close_fights_mae"] = float(mean_absolute_error(YE["p_win"], iso.predict(XE[:, ri])))
print("guideline test error", round(results["guideline_mae"], 4), ("   close fights: %.4f" % results["guideline_close_fights_mae"]) if parts else "")
(ROOT / "web").mkdir(exist_ok=True)
old = ROOT / "web" / "model.json"
if old.exists():                                                  # keep the model that was there, named after its version
    ver = json.load(open(old)).get("range", {}).get("version", 2)
    keep = ROOT / "web" / f"model_v{ver}.json"
    if not keep.exists(): keep.write_bytes(old.read_bytes())
json.dump(out, open(ROOT / "web" / "model.json", "w"), separators=(",", ":"))
json.dump(results, open(ROOT / "results" / "export_results.json", "w"), indent=1)
trained_on = dict(encounters=int(len(X) + (len(XF) + len(XE) if parts else 0)), fights=int(len(X) * int(d["R"] if "R" in d.files else 48) + ((len(XF) * 160 + len(XE) * 400) if parts else 0)))
results["trained_on"] = trained_on
json.dump({k: ({a: b for a, b in v.items() if a != "by_group"} if isinstance(v, dict) else v) for k, v in results.items()}, open(ROOT / "web" / "metrics.json", "w"), indent=1)

rng = np.random.default_rng(99); encs = [make_encounter(rng) for _ in range(40)]
F = features_all(encs); cases = []
for en, f in zip(encs, F):
    names = {}
    for m_ in en["mons"]: names[m_["name"]] = names.get(m_["name"], 0) + 1
    cases.append(dict(level=en["level"], party=[{k: (v if isinstance(v, (str, list)) else float(v)) for k, v in p.items()} for p in en["party"]], monsters=names, features=f.tolist(),
                      pred={n: float(np.clip(js_predict(out["targets"][n], f), *TARGETS[n])) for n in TARGETS}))
json.dump(cases, open(ROOT / "data" / "parity.json", "w"))
print("model.json", round((ROOT / "web" / "model.json").stat().st_size / 1024), "KB")
