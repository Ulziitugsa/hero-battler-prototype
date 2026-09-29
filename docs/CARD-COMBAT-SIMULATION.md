# Card combat simulation

A seeded, deterministic simulator for the intended Moonwater card-combat model. It is a design study tool only: no game mode imports it, and it does not change live combat, Combat V2, saves or Legacy Level.

## Model under test

- Units have **ATK** and **HP Contribution (HPC)**. Spells have neither.
- **Starting HP** = sum of the deck's Unit HPC.
- Three lanes. In a clash the higher effective ATK wins; the loser is destroyed and the winner stays unchanged (no per-Unit HP).
- Equal ATK destroys both Units (variant: neither).
- An unopposed Unit deals its ATK to the opposing player's HP (variant: 75%).
- No overflow damage from clashes (variant: the losing Unit's owner takes the ATK difference, as the live engine does).

Everything else follows the live engine: 15-card decks, hand refill to 3, simultaneous deploy where placement is targeting, and the phase order Reveal → Spells L→R → Unit ON_PLAY → BEFORE_COMBAT → Combat → death chains → AFTER_COMBAT → ROUND_END → temporary-effect expiry. Every roster condition, action and trigger is modelled. Power-based effects convert at `atkStep` ATK per Power (15 in the baseline), legacy player-HP values at `hpUnit` HP per point (45 in the baseline), and "Power ≤ 0 dies" is kept as "ATK at or below the Power 0 line dies".

## Code

| Path | Contents |
| --- | --- |
| `src/game/cardSim/statModels.ts` | Stat models A–H, the recommended baseline, Mastery options |
| `src/game/cardSim/engine.ts` | The resolver, rule switches (`tie`, `directScale`, `overflow`, `deathAtk`, `recursionCap`) |
| `src/game/cardSim/ai.ts` | Aggressive, balanced and defensive pilots (lane heuristics plus one-ply Spell look-ahead) and a random pilot |
| `src/game/cardSim/decks.ts` | Starters, archetype decks and six study decks (all legal 15-card lists) |
| `src/game/cardSim/experiments.ts` | Series, matrices and the controlled experiments |
| `src/game/cardSim/cardSim.test.ts` | Rule and determinism tests |
| `scripts/simulate-card-combat.mjs` | Runs everything and writes CSV/JSON |

## Reproduce

```bash
npm ci
node scripts/simulate-card-combat.mjs --out card-sim-results            # full run, about 10 minutes
node scripts/simulate-card-combat.mjs --out card-sim-results --quick    # smoke run, under a minute
npx vitest run src/game/cardSim
```

Seed 20260929. The same arguments always produce byte-identical files. Outputs: `roster-stats.csv`, `deck-profiles.csv`, `model-summary.csv`, `matchups.csv`, `deck-standings.csv`, `stat-premium.csv`, `mastery.csv`, `mastery-cross.csv`, `mastery-band-crossing.csv`, `skill-proxy.csv`, `style-matrix.csv`, `unit-count.csv`, `card-outliers.csv`, `summary.json`.

## Headline findings (seed 20260929, full run)

1. **The ATK range barely matters.** Any affine Power→ATK map gives the same clash orderings. Models A–D (85–145, 80–140, 100–180, 100–140) produce the same deck standings within a few points and the same 9–10 round median.
2. **Band ATK makes ties common.** Printed-ATK tie chance is 0.305 on 15-point bands and 0.051 with a fixed per-card offset of ±6; the in-match tie rate falls from about 12% to 3%.
3. **ATK dominates HP.** In mirrors, +1% ATK wins 56–68% and +3% ATK wins 59–78%, while +80% HPC wins only 59–62%. HPC cannot pay for lower ATK.
4. **Deck quality outweighs decisions.** The aggressive study deck beats the balanced one 97% with equal pilots and still 92% when played randomly. Same-deck good-versus-random play is only 57–66%.
5. **Graveyard recursion stalls games without overflow.** Uncapped, 4.5% of games hit the round cap. One return per card per match drops that to 0.1%.
6. **Overflow shortens games (median 7) and removes stalls,** but 35–40% of kills come from overflow and it swings faction starters (Undead 0.31, Infernal 0.84).
7. **Mastery ATK steps are too strong.** MA's M5-vs-M1 mirror is 0.86–0.93, far over the 60% line. HP-only Mastery (+20% HPC at V) stays at 0.52–0.54.

## Recommended baseline

| Item | Recommendation |
| --- | --- |
| ATK | `80 + 15 × (Power − 3)` plus a fixed per-card offset in −6..+6 (76–145 on the current roster) |
| HPC | `max(45, round(0.75 × (210 − ATK))) + rarity premium` (common 0, rare 4, epic 8, legendary 11) |
| Starting HP | Sum of Unit HPC. Minimum 8 Units per deck. Typical 11-Unit deck about 900 (roster 590–1,039) |
| Clash | Higher ATK wins, loser destroyed, winner unchanged |
| Tie | Both destroyed |
| Direct damage | Full ATK, uncapped, no overflow |
| Recursion | Each card may return from the Graveyard once per match |
| Effects | 15 ATK per Power, 45 HP per legacy player-HP point |
| Mastery | HPC only, +5/10/15/20% at II–V; no ATK step; effect stages must not flip clashes |
| Rarity | Premium goes to effects and HPC only, never ATK |
| Match target | Median 9 rounds, p90 at most 12, winner lands about 7 direct hits |

Measured on the recommended settings: rounds mean 8.5, median 9, p10 5, p90 12; draws 2.5%; stalls 0.1%; tie rate 3.0%; 90% of kill shots are direct hits; seat 0 wins 49%. Archetype spread is still 0.18–0.85, so the baseline fixes pacing and stability but not deck balance. See the full report in the project files for every table and the open decisions.

## Limitations

- The AI is a heuristic one-ply pilot. It under-plays some decks (Undead, Arcane Control) and is not a substitute for human playtests.
- The Mastery effect stand-in is a +10% clash boost once per card; real Mastery effects need their own pass.
- Win shares are against this roster and these decks only.
