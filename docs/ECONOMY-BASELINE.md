# Economy baseline: Pack Tickets and monetization principles

This is the starting point for the future monetization and economy pass. It records where Pack Tickets come from after the Summon → Pack migration (PR #13) and the principles that pass should follow. **Nothing here is a final price or quantity.**

## Pack Tickets

- **1 Pack Ticket = 1 pack = 5 cards** of the current Box (`buyBoxPacks(count, box, 'tickets')`).
- There are no fractional Tickets, and a Ticket never reveals fewer cards.
- A Ticket opening is a real pack opening. It counts toward event pack objectives, and it plays the same ceremony as Gems. (No recurring mission counts pack openings any more; see "Recurring missions" below.)
- Tickets are never a silent fallback for Gems.

### Every production Ticket source (ozi, 2026-10-04)

`src/game/box/packAcquisition.test.ts` pins this table, so a new grant fails the test until it is added here.

| Source | Class | Tickets | Packs | Cards | Frequency |
|---|---|---|---|---|---|
| Journey Day 2 | one-time free | 1 | 1 | 5 | once per account |
| Ranked reward at rating 300 | one-time free | 1 | 1 | 5 | once per account (peak rating) |
| Weekly mission "Complete 5 daily missions" | recurring free | 1 | 1 | 5 | weekly |
| Long Vigil login Day 6 | event | 1 | 1 | 5 | once per event run |
| Starter Pack offer | paid offer (placeholder) | 5 | 5 | 25 | per simulated purchase |
| Growth Pack offer | paid offer (placeholder) | 3 | 3 | 15 | per simulated purchase |
| Saved Summon Tickets | legacy save | n (1:1) | n | 5n | once, whatever the save held |

Nothing else grants Tickets: no daily mission, no other weekly mission, no other event reward, no starting balance, and no first-purchase bonus. The dev tools can grant Tickets, but only in development.

**Recurring free income** is 1 Pack Ticket a week, which is 5 cards.

What changed in the migration:
- Journey Day 2 went from 3 Tickets to 1.
- "Open 5 packs" went from 2 to 1 (and was later retired; its Ticket moved to "Complete 5 daily missions").
- "Win 10 Campaign battles" and "Fight 15 battles" went from 1 to 0.
- Long Vigil went from 5 Tickets to 1. The Ticket was removed from login Day 3 and from the "Win 2 Ranked matches", "Claim the free Shop gift 3 times" and "Own 4 featured Undead" rewards. Those four are now progress-only: login Day 3 is a check-in checkpoint, and the other three are objectives with nothing to claim (no empty reward, no Claim button, no replacement currency). The two missions still count toward "Complete N missions" and the event's final reward.

### Saved Summon Tickets: intentional legacy generosity

A Summon Ticket in an old save becomes one Pack Ticket, worth 5 cards instead of 1. Balances are not converted or divided, and no Gems are refunded. This is deliberate while Moonwater is pre-release.

## Economy cleanup (PR #15)

A small cleanup ahead of the economy pass. No price, income rate or offer value changed.

### Recurring missions: pack-gated missions retired

No recurring mission asks the player to open, and so pay for, packs. The two pack missions were replaced by play objectives with the same rewards:

| Retired | Replacement | Reward (unchanged) |
|---|---|---|
| Daily "Open a pack" (`pack_opened` ×1) | Daily "Win a Ranked battle" (`ranked_match_won` ×1) | 20 Gems |
| Weekly "Open 5 packs" (`pack_opened` ×5) | Weekly "Complete 5 daily missions" (`daily_mission_completed` ×5) | 100 Gems + 1 Pack Ticket |

The weekly Pack Ticket still has exactly one recurring source. Each daily mission counts once a day toward "Complete 5 daily missions", so a player who finishes their dailies on 1 to 5 days of a week earns it. Event pack objectives (Long Vigil) are unchanged.

### Gold is earn-only

The Shop's **50 Gems → 500 Gold** exchange is removed, and there is no replacement Gold purchase. Gold comes from play (Campaign, idle reward, missions, the daily Shop gift, events) and from paid bundles that already include it. It is the intended currency of the future Card Trader.

### Gem Energy refill stays

The Shop's Energy refill (35 Gems → up to 20 Energy, capped at 60) is unchanged. Choosing to buy more play is fine. Energy pacing will be studied separately and may move toward a higher capacity, a slower recharge and a refill that restores a meaningful chunk. That change must not make Energy a dominant Gems → Gold route (Gems → Energy → Campaign wins → Gold). See `game/shop/energyRefill.ts`.

### Offer visibility uses current progression

The Growth Pack used to appear only once a card had an Ascension (historical Mastery) rank, which players can no longer earn. It now appears after **5 Campaign stages are cleared** (`game/offers/eligibility.ts`). The Starter Pack appears after a first pack or the same Campaign progress, and Gem bundles after a first pack, as before.

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
- Pack Ticket quantities in paid offers;
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
