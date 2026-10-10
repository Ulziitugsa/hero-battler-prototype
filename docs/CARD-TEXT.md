# Moonwater card text standard

Card rules text is simple, consistent and readable in basic English. Flavor lives in names and art; rules text uses the
game words below and nothing else. The text is `BATTLE_LINES` in `src/game/cardCombat/cardText.ts` (face, board and full
line of every effect); `src/game/cards/cardTextStandard.test.ts` checks labels and banned words. The pass that set this
standard (2026-10-07: short faces, clearer faces, then natural-sentence faces the same day) is the project file `moonwater/card-text/WORDING-PLAN.md`.

## Two registers

**Card face = one natural sentence per effect that a player understands without Inspect.** **Focus panel and Card
Inspect = the full plain-English explanation.** Each effect has a `face` line (hand, Collection tile, board, Spell zone,
Card Inspect's card) and a `full` line (focus panel, Card Inspect rules list, battle log). A face says what happens, to
whom, when and for how long. It prints no timing label and never leans on a keyword or shortcut.

| | Card face | Full line |
| --- | --- | --- |
| Royal Guard | `Allies next to this get +15 ATK.` | `Passive: Allies next to this Unit have +15 ATK.` |
| Shieldbearer | `If this would lose its lane, it gets +30 ATK this round.` | `Guard 2: If this Unit would lose its lane, give it +30 ATK this round.` |
| Duchess Nyx | `If you have a Spell in play, this attacks the enemy player directly, starting next round.` | `Passive: Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit.` |
| Archmage Vael | `When you cast your 2nd Spell in a round, deal 90 damage to the enemy player.` | `When you cast a Spell: If it is your 2nd Spell this round, deal 90 damage to the enemy player.` |
| Enfeeble | `Enemy Unit in this lane loses 30 ATK this round and 15 ATK until the battle ends.` | `Give the enemy Unit in this lane −30 ATK this round and −15 ATK until the battle ends.` |

Card-face words (ozi, 2026-10-07):

- When: the sentence opens with it. `Before lanes fight, ...` (Clash; it happens even with no enemy Unit, so never
  "when this fights"), `At the start of each round, ...`, `At the end of each round, ...`, `When this is destroyed, ...`,
  `When an ally is destroyed, ...`, `When an enemy Unit is destroyed, ...`, `When you cast a Spell, ...`,
  `When the enemy casts a Spell, ...`, `When this attacks the enemy player directly, ...`. A Passive needs no opener
  (`Allies next to this get +15 ATK.`, `While you have another Knight, ...`).
- ATK: `this gets +15 ATK this round.` / `Your Unit in this lane gets +15 ATK.` / `Enemy Unit in this lane loses 15 ATK
  until the battle ends.` Every gain or loss that is not always on says `this round` or `until the battle ends`; never
  "for the battle" or "every round".
- Lanes: `in this lane`, never "here". `one of your empty lanes` for Summon and Revive.
- Neighbours: `allies next to this`, never "adjacent".
- Keywords are spelled out: Shield = `Survives destruction once.`; Guard 1 / 2 = `If this would lose its lane, it gets
  +15 / +30 ATK this round.`; Bypass = `this attacks the enemy player directly`. The panels and the glossary keep the
  keyword names.
- Attached Spells: `The Unit with this Spell gets +15 ATK.`; never "Attached Unit".
- Damage names its target: `deal 90 damage to the enemy player`. `return a random Spell to your hand` is from your
  Graveyard. `the enemy cast or has a Spell` = the enemy cast a Spell this round or has a Spell in play.
- `cardTextStandard.test.ts` checks these: no timing label, no `Shield` / `Guard`, `Bypass`, `adjacent`, `here`,
  `Attached Unit`, `if losing`, `when this fights`, `for the battle`, `every round`, `−15` or `an empty lane` on a face;
  damage says `enemy player`; a face sentence is at most 130 characters and a card's whole face at most 280.

## Card text size

Card-face rules text is set `--gc-text-shift` (2px) smaller than each view's `--gc-fs` on every card view at once
(`src/styles/gameCard.css`): hand 8px, board 7.5px, Collection tile 8px, Spell zone 7.5px, Card Inspect 10.5px, and
never below 7px on the tightest fit. Change that one token to resize all card text together; 2px is the most ozi
allowed (2026-10-07).

## Shape

- One sentence per effect, each on its own line: `Before lanes fight, this gets +15 ATK this round.` (full:
  `Clash: Give this Unit +15 ATK this round.`)
- One-time Spells read as instructions: `Destroy the enemy Spell in this lane.` A second effect that depends on the
  first says so: `If you do, then draw 1 card.`
- The focus panel and Card Inspect print the timing label (or the keyword) and the full rule.
- A board line (a Unit on the board, a Spell in its Spell zone) may drop what being in play already says: "starting
  next round" on a direct attack, "in this lane" for a Spell sitting in that lane.
- Old replays (legacy rules) keep their labelled faces.

## How a round works

`ROUND_STEPS` in `src/game/cards/effectText.ts`, shown in How to Play and checked against the resolver by
`src/game/cardCombat/roundOrder.test.ts` (`beginCardRound` and `resolveCardRound` in `cardCombat/engine.ts`):

1. **Round Start.** Round Start effects happen, lane by lane from left to right, your cards before the enemy's. Then
   each player draws back up to 3 cards.
2. **Play.** Both players play cards at the same time. When you press FIGHT, all cards are shown together, and each
   Attached Spell goes onto the Unit in its lane.
3. **Spells.** Spells resolve lane by lane, from left to right. In a lane where both players cast a Spell, the player
   with initiative goes first: you in odd rounds (1, 3, 5), the enemy in even rounds. Effects that react to a Spell
   happen right after it. Units destroyed by Spells are removed before the next step.
4. **Before lanes fight (Clash).** Clash effects happen, lane by lane from left to right, the player with initiative
   first in each lane. They happen even in a lane with no enemy Unit. "Would lose its lane" is checked here.
5. **Lanes fight**, from left to right. Higher ATK wins and the loser is destroyed (its player takes the difference);
   equal ATK destroys both; a Unit facing an empty lane, or one that attacks directly, hits the enemy player. After all
   three lanes, "When this is destroyed" and ally/enemy-destroyed effects happen.
6. **Round End.** After Combat and Round End effects happen, lane by lane from left to right, your cards before the
   enemy's. Then every "this round" change ends.
7. **Win check.** A player at 0 HP loses; both at 0 HP in the same round is a draw.

**A destroyed Spell stops working at once.** If the enemy has a Spell that gives +15 ATK and you cast a Spell that
destroys it, the enemy Unit fights without the +15 that round: Spells resolve before lanes fight, and a Lane or
Attached Spell's bonus is read live, not stored. ATK a Spell already gave "until the battle ends" (Cursed Ground, Growth
Totem) stays. The same holds for a Spell destroyed by a Clash effect (Runebreaker), as long as it happens before that
lane fights.

## Labels (focus panel and Card Inspect)

| Label | Meaning |
| --- | --- |
| Passive | Always on while this card is in play. |
| Round Start / Round End | At the start / end of each round. |
| Clash | Each round, just before the lanes fight (also when the lane has no enemy Unit). The face says `Before lanes fight, ...` |
| Destroyed | When this Unit is destroyed: it loses or ties a fight, or an effect destroys it. |
| Ally Falls / Enemy Falls | When one of your other Units / an enemy Unit is destroyed. |
| When you cast a Spell / When the enemy casts a Spell | Each time a Spell is cast. The face says `When you cast a Spell, ...` or `When you cast your 2nd Spell in a round, ...` where the full line is `If it is your 2nd Spell this round, ...` |
| Direct Attack | When this Unit hits the enemy player directly. |

## Templates (full line)

| Effect | Text |
| --- | --- |
| ATK this round | Give this Unit +15 ATK this round. |
| ATK until the battle ends | Give this Unit +15 ATK until the battle ends. |
| Repeating growth (capped by the engine) | Give this Unit +15 ATK until the battle ends, up to +45. |
| Count | Give this Unit +15 ATK this round for each Unit in your Graveyard, up to +45. |
| Condition | If you have 3 Units, give this Unit +15 ATK this round. |
| While in play | Allies next to this Unit have +15 ATK. / Your Unit in this lane has +15 ATK. / The Unit with this Spell has +15 ATK. |
| ATK loss | Give the enemy Unit in this lane −30 ATK this round. / Give each enemy Unit −15 ATK until the battle ends. |
| Damage | Deal 45 damage to the enemy player. |
| Heal | Restore 45 HP. |
| Draw | Draw 1 card. |
| Shield | Give your Unit in this lane a Shield. (Shield: it survives the first time it would be destroyed.) |
| Return | Return this card to your deck once. / Return a random Spell from your Graveyard to your hand. |
| Revive | Revive your weakest Undead Unit from your Graveyard into an empty lane. |
| Summon | Summon a Hound Pup in an empty lane. |
| Exile | Exile the strongest Unit from the enemy Graveyard. |
| Spell repeat | If the first Spell you cast each round is a one-time Spell, it happens twice. |
| Bypass | Attacks the enemy player directly (Bypass) while you have a Spell in play. Starts the round after you play this Unit. |

## Words

- Targets (full line): this Unit; your Unit in this lane; the enemy Unit in this lane; allies next to this Unit; your
  Units / your other Units; each enemy Unit; the Unit with this Spell; the enemy player. Never "here", "adjacent",
  "allied" or "control".
- Durations: every ATK change says "this round" or "until the battle ends", on the face and the full line. A
  Passive's "has +15 ATK" lasts while its source is in play.
- Once: "Once per round.", "Once per battle.", or "once" for a card that returns itself. Printed on the card.
- Spell conditions, one phrase each: if you cast a Spell this round; if the enemy cast a Spell this round; if you have a
  Spell in play; if the enemy has a Spell in play; if you have a Spell in play in this lane.
- Card types: Unit, Spell (one-time), Lane Spell, Attached Spell. "Spell in play" is a Lane Spell or Attached Spell on
  the battlefield ("Continuous Spell" is only the umbrella word in the rules data).
- Graveyard counts say "Units" when Spells don't count and "cards" when they do, exactly as the resolver counts.
  Thresholds read "3+".
- Summon makes a token in an empty lane; Revive moves a Unit from the Graveyard into a lane; Return goes to hand or deck.
- Avoid: may, nearby, empower, weaken, curse, restore strength, fallen, grave, died, gain (a card), "if losing" (say
  "would lose its lane").

## Glossary

`CARD_GLOSSARY` in `src/game/cards/effectText.ts`, shown under "Card words" in How to Play (Bypass: "This Unit skips
the fight and attacks the enemy player directly."; Guard: "If this Unit would lose its lane, it gets ATK this round.
Guard 1 = +15. Guard 2 = +30."; Shield: "This Unit survives the first time it would be destroyed."; Attached Spell: "A
Spell placed on a Unit. It stays while that Unit stays."). Keyword and timing help in
Card Inspect reads the same definitions (`KEYWORD_HELP`, `TIMING_HELP`).
