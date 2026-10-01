# Ranked mode (local prototype)

Ranked is a local rating loop against an AI deck. It is not online PvP or a seasonal service. Matches
use the production card-combat resolver (ATK, HP Contribution, Clash Damage); Combat V2 remains a separate developer lab.

## Rating and rewards

- A win adds 24 rating; a loss removes 12, with rating floored at zero. A draw changes no rating.
- Bronze starts at 0. Silver, Gold, Platinum, Diamond, and Master begin at 100-point intervals. Master
  is the current ceiling; its progress display stays full because there is no next rank.
- Reaching each 100-point milestone sets eligibility using peak rating. Each milestone reward can be
  claimed once and grants configured Gems and Gold; the 300-point milestone also grants one Summon
  Ticket. This is local prototype data and uses the existing economy grant functions.
- The local record stores rating, peak, wins/losses, the ten most recent results, and claimed milestones
  in `localStorage` under `moonwater:ranked:v1`.

## AI opponent selection

Each division has fixed rival decks and one fixed Card Mastery stage (`src/game/ranked/tiers.ts`): Bronze I,
Silver II, Gold II, Platinum III, Diamond IV, Master V. Mastery changes HP Contribution only, never ATK. Rivals
get harder through deck construction (plain Commons, then synergy, then optimized lists), never by reading the
player's decks, Legacy Level or Power. The rival is picked deterministically from the current rating seed and
shown on the Ranked screen (deck name and tier line). This is not an MMR queue or a claim of human matchmaking.

Simulated on the production resolver (`scripts/simulate-modes.mjs`, seed 20261001), the card AI piloting a starter
deck wins about 88% in Bronze, 71% in Silver, 53% in Gold, 48% in Platinum, 37% in Diamond and 36% in Master.

## Attention and limits

Ranked's navigation marker appears only when an earned milestone reward is unclaimed. Rating and
rewards are stored locally and are not server validated, shared across devices, or reset by a season
clock. Ranked analytics use the existing analytics abstraction. Profile remains reachable from Home.
