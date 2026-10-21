"""Reduce the 5e SRD monster list to the few numbers a simplified fight needs.

Usage:  python src/extract_monsters.py <path to 5e-SRD-Monsters.json>
Source: https://github.com/5e-bits/5e-database  (src/2014/en/5e-SRD-Monsters.json, SRD 5.1, CC-BY-4.0)

Simplification (written down so the results can be read honestly):
  * A monster acts through its weapon / claw / bite attacks. Multiattack is read from the data.
  * Monsters with no attack at all (pure casters, breath-only) get a rough substitute from their
    best saving-throw action, and are flagged  approx = true.
  * A breath-weapon style action (a saving throw with a damage roll that recharges: "Recharge 5-6", per day, or after a rest) is kept as
    br_dmg / br_dc / br_p / br_n, so the simulator can use it. Legendary actions become `leg` extra attacks per round.
  * Spells, resistances, auras and terrain are still ignored.
"""
import json, re, sys
from pathlib import Path

WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}

def avg_dice(s):
    """'2d6+3' -> 10.0 ; '1d8 - 1' -> 3.5"""
    total = 0.0
    for sign, n, d, flat in re.findall(r"([+-]?)(?:(\d+)d(\d+)|(\d+))", s.replace(" ", "")):
        sg = -1 if sign == "-" else 1
        total += sg * ((int(n) * (int(d) + 1) / 2) if n else int(flat))
    return total

def attack_avg(action):
    """Average damage of one hit. Where the data offers a choice (one- or two-handed) the first option is used."""
    total = 0.0
    for d in action.get("damage", []):
        if "damage_dice" in d:
            total += avg_dice(d["damage_dice"])
        elif "from" in d:
            opts = [o for o in d["from"].get("options", []) if "damage_dice" in o]
            if opts: total += avg_dice(opts[0]["damage_dice"])
    return total

def breath(m, n_atk, dmg):
    """The monster's best recharging or limited damage action that hits with a saving throw, or None.
    Returns (avg damage, save DC, recharge chance per round, uses per fight: 99 = recharge, n = limited uses)."""
    best = None
    for a in m.get("actions", []):
        u, dc, d = a.get("usage"), a.get("dc"), attack_avg(a)
        if not (u and dc and d > 0): continue
        if u["type"] == "recharge on roll": p, n = (7 - u.get("min_value", 5)) / 6, 99
        elif u["type"] == "per day": p, n = 0.0, int(u.get("times", 1))
        elif u["type"] == "recharge after rest": p, n = 0.0, 1
        else: continue
        if d < max(n_atk * dmg * 0.7, 8): continue          # not a real alternative to just attacking
        if best is None or d > best[0]: best = (d, dc.get("dc_value", 12), p, n)
    return best

def extract(raw):
    out = []
    for m in raw:
        acts = m.get("actions", [])
        attacks = {a["name"]: a for a in acts if a.get("attack_bonus") is not None and attack_avg(a) > 0}
        n_atk, to_hit, dmg, approx = 0, 0, 0.0, False
        multi = next((a for a in acts if a["name"] == "Multiattack"), None)
        plan = []
        if multi and multi.get("actions"):
            for x in multi["actions"]:
                try: c = int(x.get("count", 1))
                except (TypeError, ValueError): c = 1
                nm = x.get("action_name", "")
                hit = attacks.get(nm) or next((v for k, v in attacks.items() if nm.lower() in k.lower() or k.lower() in nm.lower()), None)
                if hit: plan += [hit] * c
        elif multi and multi.get("desc"):
            mt = re.search(r"makes (\w+) (?:melee )?attacks?", multi["desc"])
            if mt and attacks:
                best = max(attacks.values(), key=attack_avg)
                plan = [best] * WORDS.get(mt.group(1), 2)
        if not plan and attacks:
            plan = [max(attacks.values(), key=attack_avg)]
        if plan:
            n_atk = len(plan)
            to_hit = sum(a["attack_bonus"] for a in plan) / n_atk
            dmg = sum(attack_avg(a) for a in plan) / n_atk
        else:
            saves = [attack_avg(a) for a in acts if a.get("dc") and attack_avg(a) > 0]
            if saves:
                n_atk, to_hit, dmg, approx = 1, 20, max(saves) * 0.75 * 0.5, True
        if n_atk == 0:
            continue
        ac = m["armor_class"][0]["value"] if m.get("armor_class") else 10
        br = breath(m, n_atk, dmg) or (0, 0, 0, 0)
        leg = 2 if m.get("legendary_actions") else 0
        regen = 0                                                      # "regains N hit points at the start of its turn"
        for sa in m.get("special_abilities", []):
            if sa["name"] == "Regeneration":
                g = re.search(r"regains (\d+) hit points", sa["desc"]); regen = int(g.group(1)) if g else 0
        out.append({"name": m["name"], "cr": m["challenge_rating"], "xp": m["xp"], "hp": m["hit_points"], "ac": ac,
                    "n_atk": n_atk, "to_hit": round(to_hit, 2), "dmg": round(dmg, 2), "approx": approx,
                    "br_dmg": round(br[0], 2), "br_dc": br[1], "br_p": round(br[2], 4), "br_n": br[3], "leg": leg, "regen": regen,
                    "type": "swarm" if m["type"].startswith("swarm") else m["type"], "subtype": m.get("subtype") or ""})
    return out

if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/5e-SRD-Monsters.json")
    raw = json.load(open(src, encoding="utf-8"))
    mons = extract(raw)
    json.dump(mons, open(Path(__file__).resolve().parent.parent / "data" / "monsters.json", "w"), indent=1)
    print(f"{len(mons)} of {len(raw)} monsters kept ({sum(m['approx'] for m in mons)} approximated from saving-throw actions)")
