"""Train and compare predictors of 'chance the party wins', using the simulated fights as ground truth.
Usage: python src/train.py"""
import json
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from lab import ROOT, DATA

d = np.load(DATA / "dataset.npz")
X, y, feats = d["X"], d["p_win"], list(d["features"])
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=.2, random_state=7)
ratio = feats.index("ratio")

def report(name, pred):
    pred = np.clip(pred, 0, 1)
    return dict(model=name, mae=float(mean_absolute_error(yte, pred)), r2=float(r2_score(yte, pred)),
                right_side=float(np.mean((pred >= .5) == (yte >= .5))),              # predicts correctly whether the party is more likely to win or lose
                risky=float(np.mean((pred < .9) == (yte < .9))))                     # predicts correctly whether the fight is 'risky' (win chance below 90%)

rows = []
# 0. always predict the average
rows.append(report("Always the average", np.full_like(yte, ytr.mean())))
# 1. official XP-budget guideline, turned into a probability by the best monotone curve on the training data
iso = IsotonicRegression(out_of_bounds="clip", increasing=False).fit(Xtr[:, ratio], ytr)
rows.append(report("Official XP-budget guideline", iso.predict(Xte[:, ratio])))
# 2. linear model on all features
lin = make_pipeline(StandardScaler(), Ridge(alpha=1.0)).fit(Xtr, ytr); rows.append(report("Linear regression", lin.predict(Xte)))
# 3. gradient-boosted trees
gb = HistGradientBoostingRegressor(max_iter=400, learning_rate=.06, max_leaf_nodes=24, random_state=0).fit(Xtr, ytr)
rows.append(report("Gradient-boosted trees", gb.predict(Xte)))
# 4. small neural network
mlp = make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(32, 16), max_iter=600, early_stopping=True, random_state=0)).fit(Xtr, ytr)
rows.append(report("Small neural network (32-16)", mlp.predict(Xte)))

print(f"{'model':34s} {'avg error':>9s} {'R2':>6s} {'win/lose right':>15s} {'risky right':>12s}")
for r in rows: print(f"{r['model']:34s} {r['mae']*100:8.1f}% {r['r2']:6.2f} {r['right_side']*100:14.1f}% {r['risky']*100:11.1f}%")

# which numbers matter most? (permute one feature at a time on the test set)
base = mean_absolute_error(yte, np.clip(gb.predict(Xte), 0, 1)); rng = np.random.default_rng(0); imp = []
for j, f in enumerate(feats):
    Xp = Xte.copy(); Xp[:, j] = rng.permutation(Xp[:, j]); imp.append((f, mean_absolute_error(yte, np.clip(gb.predict(Xp), 0, 1)) - base))
imp.sort(key=lambda t: -t[1]); print("\nMost useful numbers (error added when scrambled):")
for f, v in imp[:6]: print(f"  {f:10s} +{v*100:.1f} points")
json.dump(dict(results=rows, importance=imp, n_train=len(ytr), n_test=len(yte)), open(ROOT / "results" / "results.json", "w"), indent=1)
