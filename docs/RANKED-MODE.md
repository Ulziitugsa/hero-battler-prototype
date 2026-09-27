# Ranked mode (local prototype)

Ranked is a local rating loop against an AI deck. It is not online PvP or a seasonal service. Matches
use the existing production battle resolver; Combat V2 remains a separate developer lab.

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

At battle start, the app chooses another saved deck option with the closest average Hero Power to the
player's active deck. Ties are resolved deterministically from the current rating seed. AI Hero Levels
mirror the player's average owned Hero Level. The opponent label describes the selected deck; this is
not an MMR queue or a claim of human matchmaking.

## Attention and limits

Ranked's navigation marker appears only when an earned milestone reward is unclaimed. Rating and
rewards are stored locally and are not server validated, shared across devices, or reset by a season
clock. Ranked analytics use the existing analytics abstraction. Profile remains reachable from Home.
