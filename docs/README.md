# Documentation map

The repository-side source of truth. These files exist so a **new** Claude Design or Claude Code
session can be bootstrapped from a short read instead of an enormous chat history.

| File | Owns |
| --- | --- |
| [design/DESIGN-SOURCE-OF-TRUTH.md](design/DESIGN-SOURCE-OF-TRUTH.md) | Approved Embervale visual direction, typography, colour/material, navigation, card frames, UI principles, rejected directions |
| [design/CHARACTER-ART-BIBLE.md](design/CHARACTER-ART-BIBLE.md) | Approved character/spell art style, detail ceiling, anti-AI rules, faction visual language, base image prompt |
| [design/UI-REDESIGN-BACKLOG.md](design/UI-REDESIGN-BACKLOG.md) | Design work that is **not** finished, prioritised P0-P4 |
| [game/CORE-RULES.md](game/CORE-RULES.md) | The frozen playtest ruleset, as actually implemented |
| [game/CARD-SYSTEM.md](game/CARD-SYSTEM.md) | Card data model, rarity, factions, abilities, deck rules, as actually implemented |

Two documents outside this folder are also authoritative:

- **`Design Source of Truth.pdf`** (repo root) - the full Claude Design export, v1, September 2026.
  `design/DESIGN-SOURCE-OF-TRUTH.md` is the concise repo-side summary of it and defers to it on
  detail. If the two ever disagree on a *visual* decision, the PDF wins.
- **`README.md`** (repo root) - build/run instructions, phase history, card set rationale, playtesting
  goals, architecture. Still the right place for "why is the code like this".

## Precedence

1. **Working code** beats every document on *rules and mechanics*. Where a doc and the engine
   disagree, the engine is correct and the doc is a bug - `game/CORE-RULES.md` records the known
   discrepancies.
2. **The Design Source of Truth** beats every document on *visual direction*.
3. Neither doc set describes anything the product does not currently do, except in
   `design/UI-REDESIGN-BACKLOG.md`, which is explicitly the "not built yet" list.
