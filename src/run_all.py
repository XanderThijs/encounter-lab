"""One command to rebuild everything: data (in parallel), the final model, and the checks.
Usage:  python src/run_all.py                 (full run; the time depends on your CPU cores, usually 15 to 30 minutes)
        python src/run_all.py quick           (small test run, about 3 minutes; the model is NOT good enough to use)
        python src/run_all.py big             (twice the data, for the last bit of accuracy; about an hour)
The new model replaces web/model.json (the previous one is kept as web/model_v<N>.json)."""
import os, subprocess, sys
from pathlib import Path
here = Path(__file__).resolve().parent; root = here.parent
mode = sys.argv[1] if len(sys.argv) > 1 else "full"
n_enc, fights, screen = {"quick": (3000, "8", "1500"), "full": (50000, "48", "20000"), "big": (100000, "64", "40000")}[mode]
parts = 1 if mode == "quick" else max(2, min(4, (os.cpu_count() or 2) - 1))
run = lambda *a: subprocess.Popen([sys.executable, str(here / a[0]), *map(str, a[1:])], cwd=root)
subprocess.call([sys.executable, str(root / "tools" / "sync_classes.py")], cwd=root)         # engine.js gets the current class table
print(f"Simulating {n_enc} encounters x {fights} fights and {parts} close-fight part(s) at the same time. This takes a while; progress is printed below.")
jobs = [run("make_dataset.py", n_enc, fights)] + [run("make_dataset_focus.py", i, parts, screen) for i in range(parts)]
codes = [j.wait() for j in jobs]
if any(codes): sys.exit("A data job failed (see messages above).")
if subprocess.call([sys.executable, str(here / "export_model.py")], cwd=root): sys.exit("Training/export failed.")
subprocess.call([sys.executable, str(root / "tests" / "make_sim_reference.py")], cwd=root)
if subprocess.call(["node", str(root / "tests" / "parity.mjs")], cwd=root): print("Parity test failed (or Node.js is not installed). The model file is still written.")
print("Done. Open it with:  cd web  &&  python -m http.server 8000   then http://localhost:8000")
