"""Pastes data/classes.json into web/engine.js between the CLASSES markers, so the browser builds the same heroes as the Python.
Run it after editing data/classes.json (run_all.py does it for you)."""
import json, re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
table = json.dumps(json.load(open(root / "data" / "classes.json")), separators=(",", ":"))
p = root / "web" / "engine.js"; s = p.read_text(encoding="utf-8")
new = f"/*CLASSES_BEGIN*/\n  const TABLE = {table};\n  /*CLASSES_END*/"
s2, n = re.subn(r"/\*CLASSES_BEGIN\*/.*?/\*CLASSES_END\*/", lambda m: new, s, flags=re.S)
assert n == 1, "markers not found in web/engine.js"
p.write_text(s2, encoding="utf-8"); print("classes table synced into web/engine.js")
