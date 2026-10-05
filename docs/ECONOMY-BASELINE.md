# Economy baseline: Pull Tickets and monetization principles

This is the starting point for the future monetization and economy pass. It records where Pull Tickets (called Pack Tickets before the launch set, and Summon Tickets before PR #13) come from and the principles that pass should follow. **Nothing here is a final price or quantity.**

## Pull Tickets

- **1 Pull Ticket = 1 pull = 1 card** from any archetype Box (`buyBoxPulls(boxId, count, 'tickets')`), since the launch set (2026-10-05). Before it, the same Ticket was called a Pack Ticket and opened one 5-card pack of the retired Moonfall Box; there are no packs any more. The internal name (`tickets`) is unchanged. The Ticket's final value is the economy follow-up's call; until then `PULLS_PER_TICKET` in `economy/config.ts` is 1.
- There are no fractional Tickets, and a Ticket never reveals fewer cards.
- A Ticket pull is a real pull. It counts toward event pull objectives, and it plays the same ceremony as Gems.
- Tickets are never a silent fallback for Gems.

> **Launch-set note.** The Ticket quantities below did not change, so each Ticket is now worth 1 card instead of 5. Saved Tickets are kept 1:1 with no conversion and no refund. This is a real cut in what free and paid Tickets are worth and should be revisited with the Gem pull price.

### Every production Ticket source (ozi, 2026-10-04)

`src/game/box/packAcquisition.test.ts` pins this table, so a new grant fails the test until it is added here.

| Source | Class | Tickets | Pulls | Cards | Frequency |
|---|---|---|---|---|---|
| Journey Day 2 | one-time free | 1 | 1 | 1 | once per account |
| Ranked reward at rating 300 | one-time free | 1 | 1 | 1 | once per account (peak rating) |
| Weekly mission "Complete 5 daily missions" | recurring free | 1 | 1 | 1 | weekly |
| Long Vigil login Day 6 | event | 1 | 1 | 1 | once per event run |
| Starter Pack offer | paid offer (placeholder) | 5 | 5 | 5 | per simulated purchase |
| Growth Pack offer | paid offer (placeholder) | 3 | 3 | 3 | per simulated purchase |
| Saved Summon / Pack Tickets (now Pull Tickets) | legacy save | n (1:1) | n | n | once, whatever the save held |

Nothing else grants Tickets: no daily mission, no other weekly mission, no other event reward, no starting balance, and no first-purchase bonus. The dev tools can grant Tickets, but only in development.

**Recurring free income** is 1 Pull Ticket a week, which is 1 card since the launch set. It comes from playing, not from pulling.

What changed in the migration:
- Journey Day 2 went from 3 Tickets to 1.
- "Open 5 packs" went from 2 to 1.
- "Win 10 Campaign battles" and "Fight 15 battles" went from 1 to 0.
- Long Vigil went from 5 Tickets to 1. The Ticket was removed from login Day 3 and from the "Win 2 Ranked matches", "Claim the free Shop gift 3 times" and "Own 4 featured Undead" rewards. Those four are now progress-only: login Day 3 is a check-in checkpoint, and the other three are objectives with nothing to claim (no empty reward, no Claim button, no replacement currency). The two missions still count toward "Complete N missions" and the event's final reward.

### Saved Summon Tickets: intentional legacy generosity

A Summon Ticket in an old save became one Pack Ticket (then worth a 5-card pack) and is now one Pull Ticket (1 pull = 1 card). Balances are not converted or divided, and no Gems are refunded. This is deliberate while Moonwater is pre-release.

## Economy cleanup (ozi, 2026-10-04)

A small cleanup ahead of the Stage 1 work. It changes no price, Ticket value, Box, Energy number or income total.

- **Pack-gated recurring missions are retired.** No daily or weekly mission asks the player to open (and so buy) packs. Each replacement keeps the reward it replaced:

  | Retired | Replacement | Reward |
  |---|---|---|
  | Daily "Open a pack" | Daily "Win a Ranked battle" | 20 Gems |
  | Weekly "Open 5 packs" | Weekly "Complete 5 daily missions" | 100 Gems + 1 Ticket |

  The weekly mission counts each daily mission the player completes (claimed or not), across the week's days.
- **Gold is no longer purchasable with Gems.** The Shop's 50 Gems → 500 Gold exchange is removed, with no replacement Gold purchase. Gold is becoming an earn-only soft currency (Campaign, Quick Battle, missions, idle, Journey, events, Ranked, the daily Shop gift) and the future Card Trader currency. The placeholder Starter and Growth Pack bundles still include Gold; the monetization pass owns their contents.
- **The Gem Energy refill stays** (35 Gems for up to 20 Energy). Choosing to refill Energy is a fair player choice.
- **Energy pacing may be revisited later**, in its own study: possibly a higher capacity, a slower recharge and a refill that restores a meaningful chunk, without the refill becoming a dominant Gems → Gold route (Energy plays Campaign stages, which pay Gold). Capacity, recharge and the refill are unchanged for now (design note in `src/game/shop/energyRefill.ts`).
- **The Growth Pack no longer depends on historical Mastery.** It used to show only to saves with a historical Ascension/Mastery rank above 0, which no player can raise any more. It now shows once the player has opened a pack and reached Account Level 5 (a placeholder); the Starter Pack shows once the player has opened a pack. The historical Ascension record itself is preserved, untouched (`src/game/offers/eligibility.ts`).

## Paid offers and prices are prototype placeholders

- The Starter Pack (5 Tickets) and Growth Pack (3 Tickets) quantities are placeholders. So are all the Gem bundle amounts and every real-money label in `config/defaults.ts` (`offers.priceLabels`).
- No real money is processed anywhere.
- These values were kept through the migration on purpose, neither normalized to the old Summon value nor rebalanced.

The separate monetization/economy pass owns all of the following:
- the Gem price ladder;
- $1 to $150+ offer tiers;
- first-purchase offers;
- spender segmentation;
- contextual offers;
- high-value bundles;
- Pull Ticket quantities in paid offers;
- set-launch offers;
- Moon Pass;
- free Gem and Ticket income;
- Box cadence;
- Structure Deck pricing.

## Monetization principles (target, not yet implemented)

- Free players can become competitively viable through disciplined resource management and specialization.
- Free players are not expected to comfortably own every archetype or every release.
- Spending strongly increases collection breadth, acquisition speed, flexibility and access to several current decks.
- Heavy spenders have a high spending ceiling. Higher spender tiers may get access to larger and deeper offers.
- A paid player's copy of a card is never mechanically stronger than a free player's copy of the same card.
- Future personalized or contextual offers should vary which product or bundle is offered and its scale. They should not secretly charge different players different prices for the same product.

Offer segmentation is not implemented.

## Launch set prices (2026-10-05)

The launch set ([BOX-ARCHITECTURE.md](BOX-ARCHITECTURE.md)) sets these working values, all in `economy/config.ts`. The economy follow-up may still tune them.

- `BOX_PULL_GEMS = 100` (ozi, 2026-10-05): 1 pull = 100 Gems, a 10-pull = 1,000 Gems. The study showed 30 Gems a pull (the retired 150-Gem, 5-card pack) was far too cheap.
- `PULLS_PER_TICKET = 1`: 1 Pull Ticket = 1 pull = 1 card. Ticket quantities and income are unchanged.
- `STRUCTURE_DECK_GEMS = 900` (ozi, 2026-10-05), one per account, as the economy direction set.

Not touched: real-money prices, bundles, Moon Pass, free Gem income, the Ranked reward economy, Gem bundles and the Energy refill.
