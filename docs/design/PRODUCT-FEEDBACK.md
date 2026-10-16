# Moonwater product feedback layer

Polish Pass 1 (2026-10-14). The shell around the game - loading, taps, rewards, navigation state, battle moments and
rarity - shares one feedback layer instead of per-screen one-off animations. This is how to use it and the rules it
keeps. Nothing in it changes combat, balance, the economy, Box contents or save data.

## Principles

1. **Every action answers immediately.** A tap squashes the control at once; a claim shows what was gained at the
   place it was earned.
2. **Rewards travel.** A reward leaves the control that earned it and lands on the counter that holds it; the counter
   swells and rolls up as it arrives.
3. **State, never decoration.** A badge, a breathing glow or a callout only ever renders from real state. If the state
   does not exist, there is no marker (see "Missing state" below).
4. **One rhythm.** Durations and easings come from tokens; battle beat pacing stays in
   `components/animation/timing.ts`.
5. **Reduced motion keeps the meaning.** Nothing travels, squashes or loops, but every state change is still visible
   (labels, colour, a static glow).

## Pieces

| Piece | Where | Use it for |
| --- | --- | --- |
| Motion tokens | `styles/feedback/tokens.css` | `--mw-dur-*`, `--mw-ease-*`, `--mw-press-scale`, feedback colours |
| Press feedback | `styles/feedback/press.css` | Automatic for every button in `.moon-game`. Tune with `--mw-press-scale` or `.mw-press-soft` / `.mw-press-deep` / `.mw-press-none`. A control with its own `:active` scale must be in press.css's opt-out list (a test enforces it) so two squashes never multiply |
| Motion utilities | `styles/feedback/motion.css` | `.mw-enter`, `.mw-stagger` (+ `--i`), `.mw-pop-in`, `.mw-attention`, `.mw-glow-pulse`, `.mw-float-number`, `.mw-shake` |
| Rarity presence | `styles/feedback/rarity.css` | Wrap a card face: `<span class="mw-rarity" data-rarity="epic">`. Add `.mw-rarity-reveal` for a just-revealed card |
| Reward bus | `components/feedback/rewardBus.ts` | `flyReward({ kind, amount, from })`, `flyRewards(from, { gold, gems, tickets, cards })` |
| Flight layer | `components/feedback/RewardFlightLayer.tsx` | Mounted once in `App.tsx`; draws every flight |
| Counters | `components/feedback/BalanceCounter.tsx`, `useCountUp.ts`, `useRewardTarget.ts` | `GoldBalance` / `GemBalance` / `TicketBalance` already use them; any element can be a landing spot with `useRewardTarget(kind)`. Animation frames only smooth a roll: a timer lands the final value, and a hidden page shows it at once |
| Sheet balances | `components/feedback/BalanceStrip.tsx` | Inside a sheet that covers the header, so claims land in view. Tickets hide at zero unless a claimable reward in the sheet pays them |
| Nav state | `components/AppShell.tsx`, `styles/feedback/nav.css` | Dots from real state only; the Cards medallion is the landing spot for card rewards |
| Loading | `index.html` (inline styles; `vite.config.ts` moves the app stylesheets after the boot markup, and lazy screens' stylesheets after those), `components/MoonwaterLoading.tsx`, `platform/bootSplash.ts` | Static boot screen before JS; same scene for lazy-screen loads (only after 180 ms) |
| Battle | `components/animation/battleCallouts.ts`, `components/battle/*`, `styles/feedback/battle.css` | Round / Fight banner, event callouts, HP chunk drain |

### Announcing a reward

```tsx
<button onClick={(event) => {
  const source = event.currentTarget;
  const result = claimSomething();          // the store changes first, as before
  if (result.ok) flyRewards(source, { gold: result.gold, gems: result.gems });
}}>Claim</button>
```

The bus is presentation only. If the control unmounts on claim (a Claim button replaced by a check), pass the rect's
centre as a point captured before the claim. With no layer mounted (tests) or no counter on screen, a flight shows its
label only and delays nothing.

## Battle feedback

* **Round banner** - "Round N / Deploy" when a round opens, "Fight!" when cards are revealed (skipped at Instant speed).
  It never takes a tap and never holds up play.
* **Clash lean** - each lunge (global.css `chitLungeEnemy/Player`) now opens with a short wind-up.
* **Callouts** (`battleCalloutForStep`): `Direct Attack -N` / `Big Hit -N` (unopposed attack), `Burn -N` (effect damage
  to a player), `Big Hit -N` (Clash or overflow damage of at least 20% of the damaged side's max HP), `Revived`, a
  resolved Spell's name (or "... fizzled"). HP callouts sit on the HP bar from its midpoint (the numeral is on the left), so
  they never reach the Spell row or a card; lane callouts over the lane, so they never cover the clash line's own ATK
  read-out. The round banner fills only the band between the two Unit rows.
* **HP** - the bar drops at once while a pale chunk lingers and drains after it; the numeral rolls.
* Existing combat VFX (impact bursts, shatter + cracks on destruction, floaters, stage shake) are unchanged.

## Missing state (deliberately not faked)

* **Sacrifice** callout: `HERO_DESTROYED` does not record what caused a destruction. The resolver knows
  (`byOwnEffect` in `cardCombat/engine.ts`) but does not log it. Adding it is a resolver event change, out of scope for
  a polish pass.
* **Decks** tab badge: there is no "deck needs attention" state (an incomplete or invalid active deck cannot be saved).
* **Ranked / Shop / Home** dots already existed and are unchanged; **Cards** gained a "new cards" dot backed by
  `game/collection/collectionSeen.ts` (one additive storage key; old saves start as "seen now"). Only a card's first
  copy counts as new (`cardMarks.firstObtainedAt`, an additive field); a duplicate is not, matching Pull Results.
* Quick Battle rewards (`MatchSummary` / `XpSummary`) have no on-screen counter to fly to; they keep their text.
* Campaign stage rewards (`StageResultSheet`) are not wired yet (see follow-ups).

## Where to take screenshots

At 390x844 portrait: the boot screen (load with JS paused, or a sandboxed iframe), Home top (campaign + featured card),
Home after claiming Idle Gold / a Journey day (label + counter), Shop daily gift, a 10-pull's Pull Results, a battle at
round start (banner) and mid-reveal (callout beside an HP bar), and the bottom nav with a "new cards" dot.
