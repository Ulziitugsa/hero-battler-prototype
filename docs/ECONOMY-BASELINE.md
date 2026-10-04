# Economy baseline: Pack Tickets and monetization principles

This is the starting point for the future monetization and economy pass. It records where Pack Tickets come from after the Summon → Pack migration (PR #13) and the principles that pass should follow. **Nothing here is a final price or quantity.**

## Pack Tickets

- **1 Pack Ticket = 1 pack = 5 cards** of the current Box (`buyBoxPacks(count, box, 'tickets')`).
- There are no fractional Tickets, and a Ticket never reveals fewer cards.
- A Ticket opening is a real pack opening. It counts toward "Open a pack", "Open 5 packs" and event pack objectives, and it plays the same ceremony as Gems.
- Tickets are never a silent fallback for Gems.

### Every production Ticket source (ozi, 2026-10-04)

`src/game/box/packAcquisition.test.ts` pins this table, so a new grant fails the test until it is added here.

| Source | Class | Tickets | Packs | Cards | Frequency |
|---|---|---|---|---|---|
| Journey Day 2 | one-time free | 1 | 1 | 5 | once per account |
| Ranked reward at rating 300 | one-time free | 1 | 1 | 5 | once per account (peak rating) |
| Weekly mission "Open 5 packs" | recurring free | 1 | 1 | 5 | weekly |
| Long Vigil login Day 6 | event | 1 | 1 | 5 | once per event run |
| Starter Pack offer | paid offer (placeholder) | 5 | 5 | 25 | per simulated purchase |
| Growth Pack offer | paid offer (placeholder) | 3 | 3 | 15 | per simulated purchase |
| Saved Summon Tickets | legacy save | n (1:1) | n | 5n | once, whatever the save held |

Nothing else grants Tickets: no daily mission, no other weekly mission, no other event reward, no starting balance, and no first-purchase bonus. The dev tools can grant Tickets, but only in development.

**Recurring free income** is 1 Pack Ticket a week, which is 5 cards.

What changed in the migration:
- Journey Day 2 went from 3 Tickets to 1.
- "Open 5 packs" went from 2 to 1.
- "Win 10 Campaign battles" and "Fight 15 battles" went from 1 to 0.
- Long Vigil went from 5 Tickets to 1. The Ticket was removed from login Day 3 and from the "Win 2 Ranked matches", "Claim the free Shop gift 3 times" and "Own 4 featured Undead" rewards. Those four now grant nothing, and no replacement currency was added. The two missions still count toward the event's "Complete N missions" milestones.

### Saved Summon Tickets: intentional legacy generosity

A Summon Ticket in an old save becomes one Pack Ticket, worth 5 cards instead of 1. Balances are not converted or divided, and no Gems are refunded. This is deliberate while Moonwater is pre-release.

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
