"""The 13 player classes as data (data/classes.json) and the function that turns (class, level) into a hero for the simulator.
web/engine.js reads the same table (it is pasted in by tools/sync_classes.py), so Python and JavaScript build identical heroes."""
import json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
TABLE = json.load(open(ROOT / "data" / "classes.json"))
CLASSES = TABLE["classes"]; CLASS_NAMES = list(CLASSES)

def step(tab, level, default=0):
    """Value of a step table [[from_level, value], ...] at this level."""
    if not isinstance(tab, list): return tab
    v = default
    for lv, x in tab:
        if level >= lv: v = x
    return v

def class_for(name):
    """Which of the 13 classes a free-text class name means ('Eldritch Knight' -> Fighter), or None."""
    n = str(name or "").strip().lower()
    if not n: return None
    for k in CLASS_NAMES:
        if n == k.lower(): return k
    for k in CLASS_NAMES:
        if k.lower() in n: return k
    for frag, k in TABLE["alias"]:
        if frag in n: return k
    return None

def slots_for(cast, level):
    """Spell slots by level 1-9 for a caster type at this class level."""
    out = [0] * 9
    if cast in ("full", "half"): row = TABLE["slots"][cast][level]
    elif cast == "halfup": row = TABLE["slots"]["full"][math.ceil(level / 2)]
    elif cast == "pact":
        row = [0] * 9; row[min(5, math.ceil(level / 2)) - 1] = step(TABLE["pact"]["count"], level)
    else: row = []
    for i, n in enumerate(row): out[i] = n
    return out

def hero(cls, level):
    """A typical hero of this class and level, before any jitter. Every number is a plain formula so the JavaScript can repeat it."""
    c = CLASSES[cls]; level = max(1, min(20, int(level)))
    prof = 2 + (level - 1) // 4; mod = step(TABLE["mod"], level)
    dice = 1 + (level >= 5) + (level >= 11) + (level >= 17)
    best = 0.0
    for o in c["dmg"]:
        d = step(o.get("base", 0), level) + (mod if o.get("mod") else 0) + o.get("sneak", 0) * math.ceil(level / 2) + o.get("cantrip", 0) * dice
        if "rage" in o: d += step(o["rage"], level)
        best = max(best, d)
    hp = c["die"] + c["con"] + (level - 1) * ((c["die"] + 1) / 2 + c["con"])
    return dict(cls=cls, level=level, hp=hp, max=hp, ac=step(c["ac"], level), atk=prof + mod, nat=step(c["nat"], level, 1), dmg=best, init=c.get("init", 0),
                save=mod + prof / 2, slots=slots_for(c.get("cast"), level), blast=float(c.get("blast", 0)), bheal=int(bool(c.get("bheal"))), cure=int(bool(c.get("cure"))),
                smite=int(bool(c.get("smite"))), surge=step(c.get("surge", 0), level), sw=(5.5 + level) if c.get("sw") else 0.0, loh=float(c.get("loh", 0)) * level,
                rage=int(bool(c.get("rage"))), mod=mod)

# ---- spell numbers shared by the simulator and the features
def spell_dmg(L): return 5.5 * L + 5              # one damaging spell of slot level L, per target
def smite_dmg(L): return 4.5 * (L + 1)
def word_heal(L, mod): return 2.5 * L + mod        # a bonus-action heal (Healing Word)
def cure_heal(L, mod): return 4.5 * L + mod        # an action heal (Cure Wounds)
SPELL_HIT = 0.8                                    # chance-weighted share of full damage: save-or-half and attack rolls averaged
AREA_FROM = 3                                      # slot levels from this up hit up to three monsters
