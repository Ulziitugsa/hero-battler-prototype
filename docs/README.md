# Documentation map

The repository-side implementation and design references. Current product name and visual direction:
Moonwater, using the pixel-art direction recorded in the Moonwater design documents below.

| File | Owns |
| --- | --- |
| [design/MOONWATER-VISUAL-POLISH.md](design/MOONWATER-VISUAL-POLISH.md) | Current Moonwater UI hierarchy, typography, color, and screen presentation |
| [design/PIXEL-STYLE-CORRECTION.md](design/PIXEL-STYLE-CORRECTION.md) | Current pixel-art correction and asset direction |
| [design/DESIGN-SOURCE-OF-TRUTH.md](design/DESIGN-SOURCE-OF-TRUTH.md) | Historical Embervale visual study; superseded for current product direction |
| [BEHAVIORAL-UX-POLICY.md](BEHAVIORAL-UX-POLICY.md) | Current Home/navigation attention and reward-readiness rules |
| [NATIVE-MOBILE.md](NATIVE-MOBILE.md) | Capacitor configuration, native shell behavior, sync, and device-verification status |
| [CARD-COMBAT-DESIGN.md](CARD-COMBAT-DESIGN.md) | **Authoritative** card-combat design (ATK, HP Contribution, Starting HP), rejected models and the production migration plan |
| [CARD-COMBAT-SIMULATION.md](CARD-COMBAT-SIMULATION.md) | Seeded card-combat simulator: methods, reproduction commands and results |
| [COMBAT-V2-DESIGN.md](COMBAT-V2-DESIGN.md) | Historical per-Unit-HP Combat V2 experiment and lab; superseded by CARD-COMBAT-DESIGN.md |
| [COLLECTION-PROGRESSION.md](COLLECTION-PROGRESSION.md) | Player-facing terminology, Card Mastery, duplicates, Account Level, Renown and the legacy-progression migration plan |
| [RANKED-MODE.md](RANKED-MODE.md) | Local Ranked rating, AI opponent selection, rewards, and prototype limits |
| [EXTERNAL-PLAYTEST-CHECKLIST.md](EXTERNAL-PLAYTEST-CHECKLIST.md) | Manual playtest checks and known prototype limits |
| [design/CHARACTER-ART-BIBLE.md](design/CHARACTER-ART-BIBLE.md) | Historical painterly art exploration; superseded by the current Moonwater pixel-art direction |
| [design/UI-REDESIGN-BACKLOG.md](design/UI-REDESIGN-BACKLOG.md) | Historical Embervale redesign discussion; not the current Moonwater task list |
| [game/CORE-RULES.md](game/CORE-RULES.md) | The frozen playtest ruleset, as actually implemented |
| [game/CARD-SYSTEM.md](game/CARD-SYSTEM.md) | Card data model, rarity, factions, abilities, deck rules, as actually implemented |

Two documents outside this folder remain useful references:

- **`Design Source of Truth.pdf`** (repo root) - the historical Claude Design export, v1, September
  2026. It records the superseded Embervale direction and does not override current Moonwater docs.
- **`README.md`** (repo root) - build/run instructions, phase history, card set rationale, playtesting
  goals, architecture. Still the right place for "why is the code like this".

## Precedence

1. **Working code** beats every document on *rules and mechanics*. Where a doc and the engine
   disagree, the engine is correct and the doc is a bug - `game/CORE-RULES.md` records the known
   discrepancies.
2. **The current Moonwater pixel-art/design documents** describe current visual direction. The old
   Embervale study and PDF are historical and superseded.
3. Historical design studies and backlogs record earlier proposals; use current code and the current
   Moonwater design docs to determine what is implemented and authoritative.
