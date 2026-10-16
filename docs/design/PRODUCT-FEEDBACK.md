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
| Rarity presence | `styles/feedback/rarity.css` | Wrap a card face: `<span class="mw-rarity" data-rarity="epic">`. Add `.mw-rarity-reveal` for a just-revealed card, `.mw-rarity-static` in a grid of many cards (same light, no loops) |
| Reward bus | `components/feedback/rewardBus.ts` | `flyReward({ kind, amount, from })`, `flyRewards(from, { gold, gems, tickets, cards }, { delayMs })`. `delayMs` lets a result screen finish opening first; the counter waits for it too. Both return flight ids: a screen that can close before its flights land passes them to `cancelRewardFlights` on unmount (the result card and the Campaign result sheet do) |
| Flight layer | `components/feedback/RewardFlightLayer.tsx` | Mounted once in `App.tsx`; draws every flight |
| Counters | `components/feedback/BalanceCounter.tsx`, `useCountUp.ts`, `useRewardTarget.ts` | `GoldBalance` / `GemBalance` / `TicketBalance` already use them; any element can be a landing spot with `useRewardTarget(kind)`. Animation frames only smooth a roll: a timer lands the final value, and a hidden page shows it at once |
| Sheet balances | `components/feedback/BalanceStrip.tsx` | Inside a sheet that covers the header, so claims land in view. Tickets hide at zero unless a claimable reward in the sheet pays them. With `arriving={{ gold, gems }}` (a screen that opens on rewards already granted, like a battle result) the counters open on the balance before them and roll up as they land |
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

## Battle result (Polish Pass 2)

`components/MatchSummary.tsx` and `styles/battleResult.css` end every Quick, Ranked and Friendly battle (Campaign keeps
its own sheet on the map). The card waits `RESULT_ENTER_DELAY_MS` after the round's last beat so the final blow is seen
landing, and the beaten side's HP plate drains of colour under it. Everything on it is read, never invented
(`components/battle/battleOutcome.ts`, pure and tested):

* **How it ended** - the last damage the losing player took, from the log: a Direct Attack, a Clash (winner beat loser)
  or a card's effect, with its round. A draw has no single finishing blow and shows none.
* **Final HP** of both sides.
* **Rewards** - XP, with the Account Level bar filling from where it was; Gold and Gems fly into the card's own balances.
* **Ranked** - the rating, its change, the division bar, the next division, a promotion, and a Division reward that just
  became claimable. (Ranked used to return straight to its tab with no result shown.)
* **Missions** this battle moved forward (the missions store at match start against now); one it completed says
  "Ready to claim".
* The full statistics table is folded under "Match details". Ranked has no "Play again": its next rival is chosen on its
  own screen.

Campaign's `StageResultSheet` flies its Gold and Gems into balances on the sheet the same way.

## Collection and decks (Polish Pass 2)

* **Cards screen** - owned Rare and up wear their rarity, held still (`.mw-rarity-static`). Cards whose first copy arrived
  since the last visit carry a New tag and lead the list for that visit, and the counter says how many are new. Each
  rarity filter shows collected / total within the faction filter.
* **Pull Results** - Done sends the cards from the middle of the grid down to the Cards tab (it used to hop sideways from
  the Done button).
* **Deck builder** - an added card's chit pops in and scrolls into view and the count answers; a refused add (deck full,
  no more copies) shakes the count beside its reason.

## Interaction refinement (Polish Pass 4)

* **Clash Damage beat** - while a clash's damage lands on the HP bar, the lane shows the result: the beaten Unit dims
  (it leaves on the next beat) and the winner stands lit (`chit-beaten` / `chit-victor`, chitEffects.ts). The lane no
  longer sits still for most of a second with the loser looking alive. No timing changed.
* **Drag to place** - battle hand cards are dragged with the pointer (touch, pen or mouse), not HTML drag-and-drop, which
  on a phone only starts on a long press (the gesture that opens Inspect). A copy follows the finger, the card left
  behind fades, the slot under it lights and letting go places the card exactly as tapping that slot would. Tap to
  select and long-press to inspect are unchanged.
* **Card Inspect** - the card rises into place (Epic and Legendary land with their rarity flash) and wears its rarity's
  still glow. About a quarter second; paging replays it; closing stays instant.
* **Box ceremony** - an Epic or Legendary is on the stage, sealed, from its telegraph: it gathers its tier's light,
  trembles as the seal breaks, then turns over. That stretch used to show an empty sky. The timeline (and so the
  length of a ceremony) is unchanged; tap and Skip work as before. The stage heading names the tier the light already
  shows ("An Epic card rises").
* **Ranked Division rewards** - Claim flies the Gold, Gems and Ticket the wallet actually gained into balances shown in
  the rewards panel (the Ranked tab has no header balances). The balances stay for the visit once a reward was ready.
* **Result screens** - Play again (or Continue) before the rewards have landed calls the flights off
  (`cancelRewardFlights`) instead of leaving coins flying at a card that has closed.
* **Labels** stay inside the screen when the control that earned them is at its edge.
* **Sheets** - Missions, Journey, Offers and the Campaign stage sheet rise in like How to play (260ms, off under reduced
  motion).

## Missing state (deliberately not faked)

* **Sacrifice** callout: `HERO_DESTROYED` does not record what caused a destruction. The resolver knows
  (`byOwnEffect` in `cardCombat/engine.ts`) but does not log it. Adding it is a resolver event change, out of scope for
  a polish pass.
* **Decks** tab badge: there is no "deck needs attention" state (an incomplete or invalid active deck cannot be saved).
* **Ranked / Shop / Home** dots already existed and are unchanged; **Cards** gained a "new cards" dot backed by
  `game/collection/collectionSeen.ts` (one additive storage key; old saves start as "seen now"). Only a card's first
  copy counts as new (`cardMarks.firstObtainedAt`, an additive field); a duplicate is not, matching Pull Results.
* Quick Battle and Campaign rewards fly to balances on their result screens (Pass 2).

## Where to take screenshots

At 390x844 portrait: the boot screen (load with JS paused, or a sandboxed iframe), Home top (campaign + featured card),
Home after claiming Idle Gold / a Journey day (label + counter), Shop daily gift, a 10-pull's Pull Results, a battle at
round start (banner) and mid-reveal (callout beside an HP bar), and the bottom nav with a "new cards" dot.
