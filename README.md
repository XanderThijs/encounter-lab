# Encounter lab

Predicts how likely a D&D 5e party is to win an encounter, and compares that with the official XP-budget guideline.
Runs entirely in the browser, with no server and no dependencies. [Dragonwatch](https://github.com/XanderThijsPXL) uses the same engine.

## What it does
Pick a party (13 classes, with spell slots and class features) and some SRD monsters. Gradient-boosted trees trained on simulated encounters predict the win chance, the share of party HP lost and how many heroes fall, and compare that with the official XP-budget guideline. It runs in the browser (`web/`, no server needed), next to a live simulation of the same fight that checks it. Dragonwatch, my D&D combat tracker, uses the same engine for its live win chance.

## How it works
1. `src/extract_monsters.py` reads the SRD 5.1 monster list (CC-BY-4.0, github.com/5e-bits/5e-database) and keeps HP, AC, attacks, to-hit and damage per hit, plus breath weapons and legendary actions.
2. `data/classes.json` is the class table: 13 classes with hit die, AC and attack growth, damage options, spell slot tables (full, half, pact), Action Surge, Second Wind, Lay on Hands, Rage, smites and healing spells. `tools/sync_classes.py` pastes it into `web/engine.js` so Python and the browser always read the same table.
3. `src/classes.py` and `src/lab.py` build heroes from that table (levels 1-20, 2-10 heroes; about a third of the parties start hurt or low on slots) and run a vectorised fight simulator: casters spend slots (area spells from level 3, Healing Word and Cure Wounds), martials focus the weakest monster, monsters use breath weapons, legendary actions and regeneration (trolls, oni, vampires heal at the start of their turn; the party is assumed to have no fire or acid to stop it), and a hero at 0 HP is down but can be healed back up.
4. `src/make_dataset.py` and `src/make_dataset_focus.py` play random encounters (a share of them chosen to be close fights); `src/features_ext.py` builds 52 features, including a quick dice-free fight.
5. `src/export_model.py` trains the final three models (`HistGradientBoostingRegressor`, 600 rounds each) and writes the trees to `web/model.json`; the previous model is kept as `web/model_v<N>.json`.
6. `tests/parity.mjs` checks that the JavaScript gives the same numbers as Python (features to 1e-9, predictions exact, JS simulation within 1 point on 12 test fights, including hurt, spent and downed parties).

## Run it locally
```
cd web
python -m http.server 8000
```
Then open http://localhost:8000

## Train the model on your own PC
```
pip install -r requirements.txt
python src/run_all.py          # full run: 50,000 encounters, roughly 15 minutes on a recent CPU
```
`python src/run_all.py quick` is a 3-minute test of the whole chain (its model is too rough to use) and `python src/run_all.py big` uses twice the data (roughly 30 minutes) for the last bit of accuracy. It syncs the class table, simulates in parallel on all cores, trains, exports `web/model.json` and `web/metrics.json`, and runs the parity checks. Look at `results/export_results.json` afterwards: `by_group` shows the error for big parties and high levels separately. Everything runs on the CPU; the simulator is branchy numpy code that a GPU would not speed up.

To change how the game plays out, edit `data/classes.json` (class numbers) or `src/lab.py` and `web/engine.js` (rules; keep them in step), then train again.

## Encounter generator
The "Generate an encounter" card on the page builds fights from a monster pool. You pick the pool (search, type filter, or tick monsters; nothing ticked means every monster up to CR level + 3), the win chance you want (a slider with Easy/Medium/Hard/Deadly shortcuts) and the most monsters allowed. `Engine.generate` in `web/engine.js` then:
1. picks 1 to 3 kinds of monster from the pool and adds monsters one at a time until the model's win chance crosses the target,
2. tries one more or one fewer of each kind around the best fits (about 1,000 to 3,000 combinations, under a second),
3. keeps the closest fit per set of monsters so the results differ, and checks the best ones with the live simulation.
Each result shows the model and the simulation side by side; if they disagree by more than 10 points it is flagged. If the pool cannot reach the target, it says whether the pool is too weak or too strong instead of returning something wrong. The win chance is "in my simplified simulator", so treat it as a starting point.

## Using Dragonwatch characters
`Engine.fromCharacter(character)` in `web/engine.js` turns a Dragonwatch character into a hero: `classes` (with levels, multiclass supported) pick the numbers and features, `max_hp`, `current_hp`, `ac` and `init_mod` replace the estimates, `resources` supply the spell slots (`Level N`, `Pact Slots (level N)`) and features still unspent (`Action Surge`, `Second Wind`, `Lay on Hands`, `Rage`), and an optional `combat` object `{atk, nat, dmg}` replaces the class table's attack bonus, attacks per round and damage per hit. Dragonwatch's live win chance and its Generate with Encounter lab dialog both use it.

## Results (encounters the model never saw)
| | All fights | Close fights |
|---|---|---|
| Win chance, official guideline | 21.0 pts | 28.6 pts |
| Win chance, this model | 3.4 pts | 10.7 pts |
| Party HP lost, this model | 2.8 pts | 5.3 pts |
| Heroes down, this model | 0.21 | 0.52 |

(The data now includes hurt parties, breath weapons, legendary actions and 13 classes, so these numbers are not comparable with the older, simpler model.)

## Limits
- The ground truth is my own simplified simulator, not real tables. The model learns that simulator.
- Not simulated: magic items, ways to switch regeneration off, control and buff spells, positioning, terrain, resistances, death saves. Every hero follows a simple fixed tactic.
- Close fights (win chance near 50%) are the least certain: the model is off by about 11 points there, partly because those fights come down to dice.
- The guideline is a budgeting aid, not a probability, so it is compared after fitting its best monotone curve.

## License and credits
Code: MIT (see `LICENSE`). Monster data comes from the SRD 5.1 (`data/5e-SRD-Monsters.json`, via github.com/5e-bits/5e-database), which is licensed CC-BY-4.0 by Wizards of the Coast.
