# Moonwater card revision plan (BAM-inspired patterns)

**Design plan only.** No card, rule, stat, deck list or Box changes here. Nothing is implemented, no PR is open.
Every change in section J needs ozi's explicit go-ahead, and the numbers in it are placeholders for the balance pass
(Codex owns card balance since 2026-10-05).

**Sources read (2026-10-09):**
- The live 116-card roster on master (`launchRoster.ts`, `launchCards.ts`, the faction files, `cardCombat/cards.ts`).
  Wording is quoted from PR #21's natural-sentence faces, which are open and not yet merged.
- Every deck list in `launchDecks.ts` and `archetypeDecks.ts`: 3 starters, 9 optimized, 6 budget, 3 Structure Decks
  and 5 study decks.
- The Box structure in `docs/BOX-ARCHITECTURE.md`.
- The engine's condition and target primitives (`types/index.ts`, `cardCombat/engine.ts`).
- The 120-card set studies: `REPORT.md`, `SECOND-PASS.md` and `FINAL-PASS.md`, plus `legend.csv` from the final pass.

**Missing source.** `docs/design/BAM-PATTERN-STUDY.md` is not on master, on any branch, or in the project files. This
plan therefore takes the BAM effect-family list, the Legendary soup-risk list and the "not allowed" list from ozi's
brief, and quotes nothing else from the study. Once the study is available, sections B and C should be checked
against it. Sections D to J rest on the Moonwater card data alone.

**What is measured and what is inferred.** The deck lists, tags, tag readers and Box contents below were checked
against the code. Legendary home value comes from the earlier simulation (`legend.csv`). Each Legendary's portability
(how well it works outside its archetype) is **inferred from its card text and from the deck lists**: no transplant
simulation exists yet. Section H defines that simulation.

---

## A. Executive summary

1. **The main soup cause is the conditions, not the stats.** Eight of the 13 Legendaries either have no condition or
   use one that every deck meets: "if you have 3 Units", "when one of your Units is destroyed", or "at the end of each
   round". The three Core Legendaries are also free to every player. Infernal Lord, the Hellfire starter Legendary,
   already sits in the **Bloodbound** optimized list, and Dawnshield Paladin sits in the Mage Slayer study deck. That
   is soup in the shipped lists.
2. **Moonwater's race tags work like faction tags.** Human is on all 24 Kingdom Units, Undead on all 28 Undead Units,
   and Demon on all 25 Infernal Units. A "Demon" or "Undead" condition therefore gates a card to a faction, not an
   archetype. The real archetype tags are Knight, Beast, Skeleton and Trickster. Today only Knight (3 cards) and
   Beast (2 cards) are read by any card. **Skeleton, Trickster, Human, Demon and Mage are read by no card at all.**
3. **The low-rarity engines are uneven.**
   - **Already strong:** Vanguard (Knights) and Crusade ("a Spell in this lane").
   - **Engine without a matching payoff:** Hellpack has Beast cards, but its payoffs count "Units".
   - **Weak engines:** Bone Legion, Wither and Bloodbound. Their Commons and Rares use generic conditions ("Graveyard
     has cards", "enemy falls", "ally falls"), so their Legendaries cannot be gated on anything the engine makes.
4. **Recommendation: option 3, a moderate redesign.**
   - Re-gate 9 Legendaries on archetype conditions their own Commons and Rares create.
   - Redirect about 12 low-rarity cards so they create or read those conditions.
   - Add 2 new Commons, for Wither and Bloodbound.
   - Add 3 engine primitives: lasting ATK loss, sacrifice, and tag-filtered targets.
   - No deck-building caps, no stat-model change, and no rework of Vanguard or Crusade.
5. **Drawbacks are used sparingly.** One symmetric drawback goes on a Legendary (The Grave Tyrant), and HP-cost
   drawbacks stay at Bloodbound low rarity. The Core starter anchors get none.

---

## B. Effect families Moonwater should use more

The verdict for each family is relative to the current 116 cards.

| Family | Current use in Moonwater | Verdict | Archetype that should own more of it | Original Moonwater direction |
|---|---|---|---|---|
| **ATK gain** | Everywhere: self +15/+30 this round, auras, "until the battle ends" growth | **Overused generically.** Most gains have no condition or a generic one | All. Gate gains by tag or setup, not by "3 Units" | "Your other Knights get +15 ATK this round." "+15 ATK for each other Beast you have." |
| **ATK reduction** | Weakness, Hellhound, Battlemage, Fireball, Enfeeble, Burning Ground, Plague Mother, Infernal Lord, Death Wave | **Used well, but nothing reads it.** Lasting ATK loss is applied by about 12 cards and checked by none | **Wither** (owner), Hellfire (secondary) | Treat **lasting ATK loss** (ATK lost "until the battle ends") as a state that Wither payoffs read: "If the enemy Unit in this lane has lasting ATK loss, ..." |
| **Damage to player** | Hellfire, Bloodbound, Arcane, Phantoms (direct attacks) | **Overlapping.** Hellfire Warlock's line repeats Archmage Vael's word for word ("2nd Spell this round, 90 damage") | Hellfire (Spell burn), Bloodbound (death burn) | Hellfire burns off Spells you cast. Bloodbound burns off Units you sacrifice. Arcane should move toward card flow, not damage. |
| **Healing** | Light Priest, Grave Sexton, Acolyte, Oath Blade, Paladin, Grave Knight, Blightcaster | **Too generic.** Most heals fire on "enemy falls" or at every Round End | Crusade (Spell in this lane), Vanguard (Knight-gated) | Heals that need archetype setup: "If you have a Spell in play in this lane, restore 45 HP" (already on Acolyte, a good model). |
| **Removal** | Blood Pact, Meteor, Giant's Bane, Dispel, Runebreaker | **About right.** Removal is conditional or costs a Unit | Bloodbound (sacrifice), Hellfire (threshold) | Keep the existing removal. Add removal that is conditional on a state: "If the enemy Unit in this lane has lasting ATK loss, destroy it" (Wither, Epic or higher only). |
| **Immunity** | Mira, Battle Captain, Crusader Champion, Runebreaker, Null Templar | **Used well**, and already gated (another Knight, a Spell in this lane, another Mage Slayer) | Unchanged | Keep. Battle Captain is the model of a tag-gated effect. |
| **Graveyard effects** | Bone Legion recursion, Spell returns (Arcane, Phantoms), exile (Relic Warden, Soul Burn, Grave Tyrant) | **Generic conditions.** "Graveyard has 2+/3+ cards" is met by any deck by round 3–4 | Bone Legion (Undead Units), Arcane (Spells) | "If your Graveyard has 3+ Undead Units" in place of "3+ cards". Exile as a symmetric cost (section G). |
| **Death triggers** | Very common: about 30 Destroyed or Ally Falls lines | **Overused generically.** Units die every round under Clash Damage, so "an ally was destroyed" is not a gate | Bloodbound (your own effect destroyed it), Bone Legion (Skeletons), Hellpack (Beasts, already on Packhound) | "When your own effect destroys one of your Units, ..." and "When another Beast of yours is destroyed, ..." |
| **Drawbacks** | Blood Pact and Dark Ritual (sacrifice), Wraith Prince and Spectral Assassin (lower Bypass ATK) | **Underused**, and only at low and mid rarity | Bloodbound (HP and Unit costs), Wither / Grave Tyrant (symmetric) | Section G. |
| **Type/tag support** | Knight: Battle Captain, Knight-Errant, Pikeman. Beast: Ash Jackal, Packhound | **Badly underused.** 5 of the 10 tags have no reader | Hellpack (Beast), Bone Legion (Skeleton), Phantoms (Trickster), Vanguard (Knight Legendaries) | Section F. |
| **Type/tag hate** | Mage Slayers hate Spells, not Mages. No card reads an enemy tag | **Absent** | Witch-hunter tech, later expansion | One small tech piece per faction, later (section J, phase 2), e.g. "If the enemy Unit in this lane is a Beast, this gets +30 ATK this round." Not in the first PR. |
| **Lane/matchup effects** | Guard ("if this would lose its lane"), "Spell in this lane", "allies next to this", Bypass | **Moonwater's strongest original family.** Lanes are what BAM's columns are not | All | Keep growing it. The new gates in section D lean on it: "Knights next to this", "a Spell in this lane", "the enemy Unit in this lane has lasting ATK loss". |

**Three families to grow:** tag support (Beast, Skeleton, Trickster, and Knight at Legendary), lasting ATK loss as a
state, and sacrifice as Bloodbound's death trigger. **Three to stop growing:** generic ATK gain, generic death
triggers and generic healing.

---

## C. What Moonwater should not copy from BAM

These limits come from ozi's brief and the locked product direction, and they cover every proposal in this plan.

- **No BAM content.** No BAM or Yu-Gi-Oh! card names, exact effects or wording, stat lines, monsters, monster types
  or attributes, themes, art, or distinctive card combinations. No BAM card rebuilt under a new name.
- **Patterns only.** "A tribal payoff reads a tag" or "a removal spell has a cost" are patterns. A specific monster
  with a specific number and text is content.
- **Moonwater's own rules stay.** Three lanes, Clash Damage, ATK plus HP Contribution, no Mana, no Mastery, no unit
  HP, and the deck rules (15 cards, at least 8 Units, at most 2 copies, at most 1 of each Legendary).
- **Moonwater's own tags stay.** Knight, Beast, Skeleton, Trickster, Mage and Mage Slayer, and the faction races
  Human, Undead and Demon. No new tag mirrors a Yu-Gi-Oh! type or attribute.
- **Moonwater's numbers stay.** Steps of 15/30/45 ATK and 45/90 HP. No BAM numbers.
- **No hard deck caps.** Something like "max X Legendaries" is out unless card design fails (ozi's principle 6). This
  plan never needs one.
- **Lane identity stays.** Effects keep to "in this lane", "next to this" and "if this would lose its lane". This
  plan never turns lanes into anything resembling BAM's columns.

---

## D. Legendary soup fix plan

**How to read this section.**
- **Home value** is the win-rate change when the Legendary is removed from its home deck, from the final pass
  (`legend.csv`).
- **Portability** is inferred from the card text. Section H measures it.
- **Proposed wording** follows PR #21 style. Section J has the face text.
- **Size:** minor means a condition swap, moderate means a line is rewritten, major means a new card concept.

### Summary

| Legendary | Source | Home value | Portability (inferred) | Size | Priority |
|---|---|---|---|---|---|
| Infernal Lord | Core (Hellfire, Infernal starter) | not measured | **Very high.** No condition, top-band ATK 129, free to everyone, already in the Bloodbound list | Moderate | 1 |
| Dawnshield Paladin | Core (Vanguard, Kingdom starter) | not measured | **Very high.** Shield, guard and heal with no condition. In the Crusade SD and the Mage Slayer deck | Minor | 1 |
| The Plague Mother | Wither Box | +13 | **High.** Unconditional shrink of every enemy, plus Shield and Guard | Moderate | 1 |
| Kathra, Blood Queen | Bloodbound Box | +17 | **High.** "When one of your Units is destroyed" fires in every deck | Moderate | 1 |
| Vharos, the Undying | Core (Bone Legion, Undead starter) | not measured | **High.** Unconditional self-revive at ATK 130 | Minor | 2 |
| Marshal Aldric | Vanguard Box | +7 | **Medium-high.** Any 3 Units | Minor | 2 |
| Cerberus, Gate Hound | Hellpack Box | +9 | **Medium-high.** Any 3 Units | Minor | 2 |
| The Grave Tyrant | Event (not obtainable yet) | not measured | **High.** Unconditional exile plus growth | Moderate | 3 (before release) |
| Duchess Nyx | Phantoms Box | +11 | **Medium.** Any deck with a Continuous Spell (Crusade, Wither, Phantoms) | Minor | 2 |
| Ignis, Ashen Crown | Hellfire Box | +1 | Low. Weak, not soup | Moderate (identity) | 3 |
| Morwen, Lich Queen | Bone Legion Box | +6 | Low (Undead only), but she shares Paladin's line | Minor | 3 |
| Archmage Vael | Arcane Box | +13 | Low-medium (Spell decks only) | None | — |
| Saint Aveline | Crusade Box | +2 | Low (Attached Spells only) | None | — |

### D1. Infernal Lord (Core, Hellfire)

- **Current card:** ATK 129.
  - "At the end of each round, deal 45 damage to the enemy player."
  - "When this is destroyed, each enemy Unit loses 30 ATK until the battle ends."
- **Current issue:** both lines are unconditional, the ATK is the second highest in the set, and every player owns
  it. It is the best Infernal Unit in any Infernal deck. That is why the Bloodbound list runs it as a second Legendary.
- **Redesign direction:** turn it into a Hellfire Spell payoff that the Infernal starter still meets.
  - "At the end of each round, if you cast a Spell this round, deal 45 damage to the enemy player."
  - Keep the Destroyed line. It is the floor that keeps the card good in the starter.
  - Test option B: the Destroyed line at −15, or −30 only if you cast a Spell this round.
- **Archetype gate:** you cast a Spell this round. The condition already exists in the engine
  (`SPELL_PLAYED_THIS_ROUND`). The Infernal starter has 4 Spells, the Hellfire list 5, and the Bloodbound list 3.
- **Expected impact:** Hellfire keeps most of the value. Bloodbound and Hellpack lose the Round End burn on most
  rounds, so Bloodbound's list should drop it for Blood Demon or Kathra-supporting cards. The starter loses a little.
- **Risk:**
  - The Infernal starter gets weaker against the other two starters (currently 58/42 Kingdom, 50/50 Undead). Re-check
    the starter triangle.
  - The ATK 129 stat is not changed by this plan. If the gate alone does not end the soup, flag the ATK for Codex.

### D2. Dawnshield Paladin (Core, Vanguard)

- **Current card:**
  - Survives destruction once.
  - "Before lanes fight, allies next to this that would lose their lane get +15 ATK this round."
  - "When the enemy Unit in this lane is destroyed, restore 45 HP. Once per round."
- **Current issue:** all three lines help any Unit. It is a free, unconditional defensive Legendary, so it carries
  the Crusade SD and the Mage Slayer deck as easily as Vanguard.
- **Redesign direction:**
  - Keep the Shield. It is the starter anchor's floor.
  - Line 2 becomes "**Knights** next to this that would lose their lane get +15 ATK this round."
  - Line 3 becomes "If you have another Knight, when the enemy Unit in this lane is destroyed, restore 45 HP. Once
    per round."
- **Archetype gate:** Knights. The Kingdom starter has 3 other Knight cards (6 copies). Every card in Vanguard's list is a Knight.
- **Expected impact:** little change in the Kingdom starter and Vanguard. Large loss in Crusade (2 Knight cards),
  Arcane and the Mage Slayer deck.
- **Risk:** low. Needs a tag filter on the "allies that would lose their lane" target (new primitive P3).

### D3. The Plague Mother (Wither Box)

- **Current card:**
  - Survives destruction once.
  - "If this would lose its lane, it gets +15 ATK this round."
  - "At the end of each round, each enemy Unit loses 15 ATK until the battle ends."
- **Current issue:** an unconditional board-wide permanent shrink on a durable body fits any slow deck. Wither should
  feed Wither.
- **Redesign direction:** she starts the effect herself in her own lane, and only spreads it where Wither has
  already worked.
  - "At the end of each round, the enemy Unit in this lane loses 15 ATK until the battle ends. Each other enemy Unit
    that already has lasting ATK loss loses 15 more ATK until the battle ends."
  - Keep the Shield and **drop the Guard line** (ozi's "remove either Shield or Guard").
  - The second pass added Guard because she died before Round End. The sim checks whether Shield alone is enough. If
    not, keep Guard and drop the Shield.
- **Archetype gate:** lasting ATK loss, created by the Wither Commons and Rares (Enfeeble, Rot Ghoul, Stasis Field,
  Blightcaster) and by the new Common in E.
- **Expected impact:** in Wither, close to today's value from round 2. Outside Wither, a single-lane shrink.
- **Risk:**
  - Hellfire also creates lasting ATK loss (Fireball, Inferno, Burning Ground), so Plague Mother stays decent in a
    Hellfire-Wither hybrid. That is a cross-faction deck and acceptable.
  - Needs primitive P1.

### D4. Kathra, Blood Queen (Bloodbound Box)

- **Current card:**
  - "When one of your Units is destroyed, deal 45 damage to the enemy player. This gets +15 ATK until the battle
    ends, up to +45."
  - "When this is destroyed, deal 90 damage to the enemy player."
- **Current issue:** Clash Damage destroys a Unit nearly every round in every deck, so Kathra is a burn engine
  anywhere. Her home value of +17 is the highest in the set.
- **Redesign direction:** split her trigger.
  - "When one of your Units is destroyed, this gets +15 ATK until the battle ends, up to +45." Kept generic: a modest
    body anywhere.
  - "**When your own effect destroys one of your Units**, deal 45 damage to the enemy player." Sacrifice only: the
    payoff.
  - Keep the Destroyed line.
- **Archetype gate:** sacrifice. Your own Spell or Unit effect destroys your Unit: Blood Pact, Dark Ritual, and the
  new Common in E.
- **Expected impact:** Bloodbound keeps the burn only when it sacrifices, so it needs more sacrifice outlets (E).
  Other decks lose most of her damage.
- **Risk:**
  - Bloodbound is a middling deck (53 optimized, 55 budget in the second pass). Without the engine redirects in E it
    drops.
  - Ship the Kathra change and the Bloodbound engine change together, never alone.
  - Needs primitive P2.

### D5. Vharos, the Undying (Core, Bone Legion)

- **Current card:** ATK 130.
  - "When this is destroyed, revive it in this lane with 95 ATK. Once."
  - "When this is destroyed, return your strongest other Undead Unit from your Graveyard to your hand."
- **Current issue:** the revive is unconditional on the set's highest ATK, so it is two bodies in any deck. The second
  line is already gated on Undead.
- **Redesign direction:** "When this is destroyed, if your Graveyard has 2+ other Undead Units, revive it in this lane
  with 95 ATK. Once."
- **Archetype gate:** Undead Units in the Graveyard. That is faction level, which is right for a Core starter anchor.
  The Box Legendaries (Morwen) carry the archetype-level gate.
- **Expected impact:** reliable in Undead decks from mid-game. In non-Undead decks his first death is final, and the
  second line returns nothing.
- **Risk:**
  - Low. The Undead starter reaches 2 Undead Units in the Graveyard by about round 3.
  - The faction-count condition exists (`GRAVEYARD_FACTION_COUNT_AT_LEAST`), but counts cards, not Units. It needs
    the existing `units` flag added.

### D6. Marshal Aldric (Vanguard Box)

- **Current card:**
  - "Before lanes fight, if you have 3 Units, your other Units get +15 ATK this round."
  - "When one of your Units is destroyed, this gets a Shield. Once per round."
- **Current issue:** "3 Units" is met by any board deck: Hellpack, Bone Legion, budget lists.
- **Redesign direction:**
  - "Before lanes fight, your other **Knights** get +15 ATK this round."
  - "When another **Knight** of yours is destroyed, this gets a Shield. Once per round."
- **Archetype gate:** Knights.
- **Expected impact:** at least as strong in Vanguard, where most of the board is Knights. Clearly weaker everywhere
  else.
- **Risk:**
  - Vanguard was 70% in the first pass and 57% in the final pass, and Vanguard vs Bone Legion is tuned at 32/68.
  - Dropping the 3-Unit requirement could make Aldric stronger at home. If it does, keep "if you have 2+ other
    Knights" as the condition.
  - Needs a tag filter on "your other Units" (P3).

### D7. Cerberus, Gate Hound (Hellpack Box)

- **Current card:**
  - "Before lanes fight, if you have 3 Units, each enemy Unit loses 15 ATK this round."
  - "When this is destroyed, summon a Hound Pup (65 ATK) in one of your empty lanes."
- **Current issue:** the second pass cut him from near-mandatory (+20) to +10, but the condition is still any full
  board.
- **Redesign direction:** "Before lanes fight, if you have 2+ other **Beasts**, each enemy Unit loses 15 ATK this
  round." Hound Pups are Beasts and count while alive.
- **Archetype gate:** Beasts.
- **Expected impact:** Hellpack keeps it, since Call the Pack, Packhound, Cinder Jackal and Brimstone Matriarch all
  make Pups. Other decks lose it.
- **Risk:** low. The condition exists (`OTHER_ALLY_TAG_COUNT` as a count basis). A count-at-least condition on a tag
  is new but trivial (P3).

### D8. Duchess Nyx (Phantoms Box)

- **Current card:**
  - "Attacks the enemy player directly while you have a Spell in play. Starts the round after you play this."
  - "At the end of each round, if you have no Spell in play, return a random Spell from your Graveyard to your
    hand."
  - "When this attacks the enemy player directly, it gets +15 ATK until the battle ends, up to +45."
- **Current issue:** her condition is identical to Shade Thief's, a Common. She is a bigger Shade Thief that any
  Continuous-Spell deck can run.
- **Redesign direction:**
  - "Attacks the enemy player directly while you have a Spell in play **and another Trickster**."
  - Optionally make line 3 a Trickster payoff: "When another Trickster of yours attacks the enemy player directly, it
    gets +15 ATK until the battle ends, up to +45."
- **Archetype gate:** a Spell in play plus another Trickster.
- **Expected impact:** Phantoms run 5 to 6 Trickster cards, so they keep her. Crusade and Wither lose her.
- **Risk:** low-medium. Pair this with the Trickster engine change in E, so low-rarity Tricksters reward each other.

### D9. The Grave Tyrant (event)

- **Current card:** "At the end of each round, exile the strongest Unit from the enemy Graveyard. This gets +15 ATK
  until the battle ends, up to +45."
- **Current issue:** unconditional Graveyard hate plus growth, so it is a universal sideboard card. It is not
  obtainable yet, so this is the cheapest moment to fix it.
- **Redesign direction:** pick **Wither payoff with a symmetric drawback**, not a generic Graveyard-hate boss.
  - "At the end of each round, exile the strongest Unit from **each** Graveyard, yours too."
  - "When an enemy Unit with lasting ATK loss is destroyed, this gets +15 ATK until the battle ends, up to +45."
- **Archetype gate:** lasting ATK loss for the growth. The exile cost is something Wither, which has almost no
  recursion, barely notices.
- **Expected impact:** strong in Wither against Bone Legion. Bad in any recursion deck. Weak growth outside Wither.
- **Risk:** low. Needs P1 and a "both Graveyards" exile (P4).

### D10. Ignis, Ashen Crown (Hellfire Box)

Not a soup risk, but an identity risk. At +1 to +2 home value, she is the weakest Legendary.

- **Current issue:** she counts Spells in play, but Hellfire is a one-time Spell deck.
- **Redesign direction:** "At the end of each round, deal 30 damage to the enemy player for each Spell you cast this
  round, up to 90." Replace the "Spell cast +15" line with Hellfire's burn identity.
- **Archetype gate:** one-time Spells cast this round.
- **Risk:**
  - Medium. Arcane casts as many Spells as Hellfire, so this also helps Arcane. Ignis is Infernal and Arcane is
    Kingdom, so a deck with both is a cross-faction deck. Acceptable, but measure it.
  - Needs a "Spells cast this round" count (P5).

### D11. Morwen, Lich Queen (Bone Legion Box)

- **Current card:** Guard 2 (+30). The Paladin line ("allies next to this that would lose their lane get +15 ATK
  this round"). "Before lanes fight, revive your weakest Undead Unit from your Graveyard into one of your empty
  lanes."
- **Current issue:** she shares a whole line with Dawnshield Paladin. Two Legendaries in different factions should
  not print the same effect.
- **Redesign direction:** line 2 becomes "**Skeletons** next to this that would lose their lane get +15 ATK this
  round." This is the same mechanic, gated on Bone Legion's tag.
- **Risk:** the final pass tuned Morwen to put Vanguard vs Bone Legion at 32/68. Re-run that matchup. Lowest priority
  of the Legendary changes.

### D12. Archmage Vael and Saint Aveline

No change. Both are gated on a real deck-building commitment: two Spells a round for Vael, Attached Spells for
Aveline. The only issue is that Hellfire Warlock copies Vael's line 2. Fix that on the Warlock (section J), not on
Vael.

---

## E. Low-rarity engine improvements

Principle: **Commons and Rares create the condition the Legendary pays off. Epics bridge or amplify it.**

### Vanguard (Knight)
- **Status: healthy.** Shieldbearer, Royal Guard, Knight-Errant, Pikeman, Common Knight and Relic Warden. Three cards
  read Knight (Battle Captain, Knight-Errant, Pikeman).
- **Missing:** a Legendary that reads Knight (fixed by D2 and D6).
- **Changes:** none at low rarity.

### Crusade (a Spell in this lane)
- **Status: healthy.** Archer, Acolyte of the Oath, Standard Bearer, Banner Knight and Crusader Champion all read
  "a Spell in play in this lane". This is the cleanest archetype gate in the set.
- **Changes:** none.

### Hellpack (Beast)
- **Status:** the engine exists, but the payoffs don't read it.
  - Engine: Ash Jackal (adjacent Beasts), Packhound (a Beast is destroyed), Pups from Call the Pack, Cinder Jackal and
    Matriarch.
  - Payoffs: Alpha Hound counts all Units, and Matriarch needs "3 Units".
- **Changes:**
  - **Alpha Hound (E):** "+15 ATK this round for each other **Beast** you have."
  - **Brimstone Matriarch (E):** "If you have 2+ other **Beasts**, this gets +15 ATK this round."
  - **Cerberus:** see D7.
- **Note:** Pup tokens count while alive, but a token's death triggers nothing (`engine.ts`: "tokens trigger no death
  effects"). Packhound therefore can't chain off Pups. That is good and intended.

### Bone Legion (Undead / Skeleton)
- **Status:** the engine runs on generic Graveyard size.
  - Dark Priest needs "3+ cards in your Graveyard", and Crypt Warden "2+ cards".
  - Bone Soldier counts all Units in your Graveyard.
  - Skeleton is on 4 cards plus the Skeleton token, and no card reads it.
- **Changes:**
  - **Rattling Horde (C):** "+15 ATK this round for each **Skeleton** you have, this one included." Skeleton tokens
    from Skeletal Legionnaire and Barrow Knight count.
  - **Dark Priest (R, Core):** "If your Graveyard has 3+ **Undead Units**, ..." This is a faction gate and stays
    starter-friendly.
  - **Morwen:** see D11.
  - **Crypt Warden (C, Core):** keep. It is cross-archetype glue in the Wither and Phantoms budget lists, and gating
    it would hurt the budget paths, which are already the weakest (Wither budget 44).
- **No new card.** The Skeleton count sources (Bone Soldier ×2, Rattling Horde ×2, Legionnaire ×2, Bone Dragon and
  tokens) are enough once something reads them.

### Wither (lasting ATK loss)
- **Status: weakest engine.**
  - The enablers are good: Enfeeble (C), Rot Ghoul (C), Stasis Field (R) and Blightcaster (E).
  - But the payoffs read "an enemy Unit is destroyed" (Withering Lich, Blightcaster, Grave Knight), which every deck
    meets.
  - Wither has only 2 Commons, and the Wither budget list is the lowest entry path (44).
- **Changes:**
  - **Withering Lich (E):** "When an enemy Unit **with lasting ATK loss** is destroyed, this gets +15 ATK until the
    battle ends, up to +45."
  - **Grave Knight (R):** replace the generic heal with "Before lanes fight, if the enemy Unit in this lane has lasting
    ATK loss, this gets +15 ATK this round." Keep Guard 2.
  - **Blightcaster (E):** gate the heal: "When an enemy Unit with lasting ATK loss is destroyed, restore 45 HP. Once
    per round."
  - **New Common Unit (Wither Box):** a cheap enabler. "Before lanes fight, the enemy Unit in this lane loses 15 ATK
    until the battle ends." Its name and art come later, from Moonwater's own Wither theme (rot, frost, grave-moss),
    never borrowed.

### Bloodbound (sacrifice)
- **Status:**
  - Demon is a faction tag, so it can't gate Bloodbound.
  - Blood Imp, Blood Demon and Flesh Altar all read "an ally falls", which every deck meets.
  - Real sacrifice exists on only 2 cards: Blood Pact (R) and Dark Ritual (C).
- **Changes:**
  - **Blood Demon (E):** line 2 becomes "Before lanes fight, if your own effect destroyed one of your Units this
    round, this gets +30 ATK this round."
  - **Flesh Altar (E, Lane Spell):** "When your own effect destroys one of your Units, your Unit in this lane gets +15
    ATK until the battle ends, up to +45."
  - **Blood Imp (R):** keep. It is a good sacrifice target.
  - **New Common Spell (Bloodbound Box):** a sacrifice outlet with an upside. "Destroy your Unit in this lane. Your
    other Units get +15 ATK this round." Name and art later, in Moonwater's own blood-pact theme.
- **Ship together:** this group ships with Kathra (D4).

### Phantoms (Trickster)
- **Status:** every Trickster checks the same thing ("a Spell in play"), and nothing reads Trickster. The archetype is
  really "Continuous Spells", which Crusade and Wither also play.
- **Changes:**
  - **Shade Thief (C) and Spectral Assassin (R):** "attacks the enemy player directly while you have a Spell in play
    **or another Trickster**." The low-rarity Tricksters enable each other, and the Legendary needs both (D8).
  - **Ghost Lantern (C):** "Your Unit in this lane has +15 ATK, or +30 if it is a Trickster." This is a cheap tag
    reader.
- **Risk:** the "or another Trickster" change makes Phantoms less dependent on Spells and could push it up. It was
  58% optimized and 48% budget in the second pass. Sim first.

### Hellfire (Spells cast, damage)
- **Status:** the engine is real (Spells cast, burn), with no tag. Hellfire Warlock copies Vael's line.
- **Changes:**
  - **Hellfire Warlock (E):** replace "If it is your 2nd Spell this round, deal 90 damage" with a Hellfire-only line,
    e.g. "When you cast a one-time Spell, deal 45 damage to the enemy player if they already took damage this round."
    That needs a "took damage this round" condition, so the cheaper alternative is "Once per round, when you cast a
    one-time Spell, deal 45 damage to the enemy player."
  - **Ignis:** see D10.

### Arcane (Spells cast, card flow)
- **Status: healthy.** Its gate is Spells. The Mage tag is unread and doesn't need to be (section F).
- **Changes:** none.

### Witch-hunter tech (Mage Slayer)
- **Status:** fine as tech.
- **Changes:** none in the first PR. Phase-2 type hate goes here (section J).

---

## F. Tag usage plan

| Tag | Cards | Read by today | Keep or remove | Should be read by |
|---|---|---|---|---|
| **Knight** | 16 (Vanguard 9, Crusade 2, Witch-hunter 2, Bone Legion 1, Wither 1, bridge 1) | Battle Captain, Knight-Errant, Pikeman | **Keep**, the Vanguard archetype tag | + Dawnshield Paladin (D2), Marshal Aldric (D6) |
| **Beast** | 8, all Hellpack, plus the Hound Pup token | Ash Jackal, Packhound | **Keep**, the Hellpack archetype tag | + Cerberus (D7), Alpha Hound, Brimstone Matriarch |
| **Undead** | 28, every Undead Unit, plus Ashen Revenant | Bonecaller (tag). Raise Fallen, Mira, Vharos and Morwen through the faction | **Keep as the faction race.** Gate Core anchors on it, not Box Legendaries | Vharos (D5), Dark Priest |
| **Skeleton** | 4 (Bone Soldier, Rattling Horde, Skeletal Legionnaire, Bone Dragon) plus the Skeleton token | **No card** | **Keep**, as the Bone Legion archetype tag | Rattling Horde, Morwen (D11) |
| **Demon** | 26, every Infernal Unit, plus Ashen Revenant | **No card** | **Keep as the faction race.** Never use it as the Bloodbound gate, which is sacrifice (D4) | Nothing for now. A possible phase-2 hate target (a Kingdom tech card) |
| **Trickster** | 7 (6 Phantoms, plus Mirage Imp) | **No card** | **Keep**, as the Phantoms archetype tag | Duchess Nyx (D8), Shade Thief, Spectral Assassin, Ghost Lantern |
| **Human** | 24, every Kingdom Unit | **No card** | **Keep as the faction race**, with no reader. Removing it has no gameplay value and changes the type line on 24 cards | Nothing |
| **Mage** | 11, across Arcane, Hellfire, Wither, Bone Legion and the bridge | **No card** | **Keep as flavor.** It spans 4 archetypes, so a Mage payoff would be a bridge, not a gate. Its best use is as a **hate target** | Phase 2: a Mage Slayer reads an enemy Mage ("If the enemy Unit in this lane is a Mage, ..."). The condition exists (`ENEMY_TAG_PRESENT`) |
| **Mage Slayer** | 3 (Runebreaker, Spellbreaker, Null Templar) | Runebreaker | **Keep**, the tech tag | Unchanged |

**Rules for future cards:**
- A Box Legendary is gated on an archetype tag (Knight, Beast, Skeleton, Trickster) or an archetype state (lasting ATK
  loss, sacrifice, a Spell in this lane, Spells cast).
- A Core Legendary may be gated at faction level (Undead, Spells cast), because it anchors a starter.
- Human, Undead and Demon never gate an archetype payoff.

---

## G. Drawback recommendations

**Where drawbacks make sense:**
1. **The Grave Tyrant: a symmetric exile (D9).** Wither ignores it, and recursion decks (Bone Legion, Arcane Spell
   returns) hate it. It taxes portability without hurting the home deck.
2. **Bloodbound low rarity: HP and Unit costs.** The new sacrifice Common is a Unit-cost card.
   - One HP-cost Rare is a reasonable later addition: "Your player loses 45 HP. Give your Unit in this lane +45 ATK
     this round. If your own effect destroyed one of your Units this round, you lose no HP."
   - The home deck turns the cost off. A goodstuff deck pays it.
3. **Existing drawbacks stay as they are.** Wraith Prince and Spectral Assassin's lower Bypass ATK, and Blood Pact and
   Dark Ritual's sacrifice.

**Where drawbacks do not make sense:**
- **The Core starter anchors** (Paladin, Vharos, Infernal Lord). New players meet them first, and a drawback in a
  starter deck feels bad. Gate them instead (D1, D2, D5).
- **Vanguard and Crusade.** Their identity is clean formation and Spell-in-lane play, and they are already well gated.
- **Plague Mother** (ozi's example: "weakens itself unless the enemy is already weakened"). The lane-seed redesign
  (D3) does the same job without making her feel bad at home. Keep the self-weaken as a fallback if D3 is too strong.
- **Kathra.** Gating her damage on sacrifice (D4) taxes portability enough. An HP drawback on top would hurt Bloodbound
  itself, since the deck already spends Units.
- **More than one drawback per archetype at Epic or higher.** Don't add them.

---

## H. Legendary transplant and soup test plan

Defined here, not run. The tests run on the **production resolver and card AI** (`src/game/cardCombat/simulate.ts`)
through a new script modelled on `scripts/simulate-deck-matrix.mjs`. The study-only `cardSim` is not used. The test
script must be design tooling that nothing in the game reads.

### H1. Field and settings
- **Field (21 decks):**
  - 9 optimized lists, 6 budget lists, 3 Structure Decks and 3 starters, all from `LAUNCH_DECKS`.
  - The 5 study decks in `archetypeDecks.ts` (General Goodstuff included) are reported separately, outside the
    field average.
- **Games:** 100 per ordered pair, both seats, with a fixed seed (new constant; record it in the report). The output
  must be byte-identical for the same arguments.
- **Pilot:** the production card AI. Report a random-pilot run as a skill check, as earlier passes did.
- **Run order:** every test runs twice.
  - **Before:** the current roster.
  - **After:** the section J candidate set applied as a simulator-only override, like `cardSim/overrides.ts`.
- **Event cards** (The Grave Tyrant, Ashen Revenant, Night Courier, Pack Warden, Oath of Vengeance, Arcane Knight)
  run in a second pass marked "event", because players can't own them yet.

### H2. All-Legendary deck
- **Deck:** the 12 obtainable Legendaries, plus the 2 Units and 1 Spell that score best as filler. Choose them by the
  greedy search in H3, limited to Commons.
- **Variant:** add The Grave Tyrant and use 1 filler.
- **Pass:** field win rate at or below 45%, and below every optimized list.

### H3. Best Legendary soup deck
- **Search:** a greedy hill-climb over all obtainable cards.
  - Start from General Goodstuff.
  - At each step, try every legal one-card swap and keep the one with the best field win rate (40 games per pair
    during the search, 100 for the final).
  - Stop after 20 steps without a gain.
  - Deck rules are enforced: 15 cards, at least 8 Units, at most 2 copies, at most 1 of each Legendary.
- **Soup filter:** a deck counts as soup if it has 4+ Legendaries from 3+ archetypes. Run the search twice:
  unconstrained, and constrained to that soup shape.
- **Pass:**
  - The best soup deck stays at or below the median optimized list.
  - The unconstrained search's best deck is an archetype deck: 70%+ of its non-Legendary cards from one archetype.

### H4. Transplant matrix (one Legendary into every other archetype)
- **For each Legendary L and each deck D** (9 optimized, 6 budget, 3 SDs, 3 starters):
  - If L is not in D, swap L for D's lowest-value non-Legendary Unit (by single-card ablation in D), so the Unit count
    holds.
  - If L is already in D (its home deck), measure L's removal the same way.
  - Record the delta in D's field win rate.
- **Report:** a 13 × 21 delta grid, and per Legendary the home delta, the median away delta, the maximum away delta
  and the **portability ratio** (max away ÷ home).
- **Pass, per Legendary:**
  - Home delta of +5 or more.
  - Median away delta of +2 or less.
  - Maximum away delta of half the home delta or less, or +4, whichever is larger.
- **Core anchors:** pass if the starter delta is at least +4 and the maximum away delta outside their faction is +3
  or less.

### H5. High-rarity goodstuff deck
- **Deck:** only Epics and Legendaries, any archetype, built by the H3 search.
- **Pass:** at or below the median optimized list, and at least 3 points below the best optimized list.

### H6. Health checks (must not regress)
- **Optimized:** 47–59%.
- **Budget and SD:** 44–56%. The Bone Legion SD is at least 48% (ozi's floor 51–55, inside sample noise).
- **Starter triangle:** each pair inside 35/65.
- **Vanguard vs Bone Legion:** 25–35% (ozi's target).
- **Matchups:** no new matchup beyond 25/75 at 200 games per seat.
- **Game length:** median at most 11, p90 at most 15 (the accepted pacing), with no stalls.
- **Gate activation (new log metric):** the share of games where each gated Legendary line fires at least once.
  - At home: 60% or more.
  - Away: report the number. Low is the goal.

### H7. Output
Write `docs/design/` or project-file CSVs:
- `field.csv`, `transplant-grid.csv`, `soup-search.csv`, `activation.csv`, `health.json`.
- A one-page summary: before and after, pass or fail per row.

---

## I. Recommended next implementation scope

**Option 3: a moderate Legendary and low-rarity engine redesign.**

- **Why not 1 (no changes):** soup is visible in the shipped lists (Infernal Lord in Bloodbound, Paladin in the Mage
  Slayer deck), and half the tags are decorative.
- **Why not 2 (wording only):** the problem is in the conditions themselves. Rewording "3 Units" can't make it a Beast
  gate.
- **Why not 4 (major redesign):**
  - Vanguard, Crusade and Arcane already work.
  - The launch set shipped 4 days ago with art, Boxes and Structure Decks built around it.
  - The final balance pass reached 47–59 optimized and 45–55 budget.
  - A wider redesign throws that away for little gain.

**Scope of option 3:**
- 9 Legendary changes (5 minor condition swaps, 4 rewritten lines), plus 2 optional ones (Ignis, Morwen).
- About 12 Common, Rare and Epic redirects in 5 archetypes (Hellpack, Bone Legion, Wither, Bloodbound, Phantoms),
  plus the Hellfire Warlock line.
- 2 new Commons (Wither, Bloodbound). The roster goes to 118 cards: Wither Box +4 copies (to 31), Bloodbound Box +4
  copies (to 34).
  - New cards enter a Box at its next restock, so players' opened Box state is not changed.
  - To stay at 116, cut a cross-listed card from each Box instead. That is ozi's call.
- 5 engine primitives:

  | Id | Primitive |
  |---|---|
  | P1 | Lasting ATK loss: a per-Unit flag set by any "until the battle ends" ATK loss, a condition on the lane enemy, and a target filter "each enemy Unit with lasting ATK loss" |
  | P2 | Sacrifice: a death-event flag "destroyed by its owner's own effect", plus a condition and a trigger that read it |
  | P3 | Tag filters: on ally targets (other Knights, Knights next to this that would lose their lane), and a count-at-least condition on a tag |
  | P4 | Exile from both Graveyards |
  | P5 | Count of Spells cast this round (Ignis; optional) |

- Card text for every changed card, in PR #21 style. Add "lasting ATK loss" to the How to Play glossary.

**Order:**
1. Primitives with unit tests.
2. Legendaries plus the engine pieces, one archetype at a time, simulated with the H tests after each.
3. Card text.
4. One combined push (Vercel builds cost ozi).

Merge stays ozi's call.

---

## J. Concrete candidate changes for a later PR

Not changed yet. "Now" quotes the live card (PR #21 wording). "Proposed" is the candidate face text. Numbers are
placeholders until the H tests.

### J1. Legendaries

| # | Card | Rarity / source | Now (short) | Proposed | Gate | Primitive | Size |
|---|---|---|---|---|---|---|---|
| 1 | Infernal Lord | L / Core | Round End: 45 damage. Destroyed: each enemy −30 until the battle ends | "At the end of each round, if you cast a Spell this round, deal 45 damage to the enemy player." Destroyed line kept (option B: −15) | Spell cast | existing | Moderate |
| 2 | Dawnshield Paladin | L / Core | Shield. Allies next to this that would lose get +15. Heal 45 on lane kill | "Survives destruction once." "Before lanes fight, Knights next to this that would lose their lane get +15 ATK this round." "If you have another Knight, when the enemy Unit in this lane is destroyed, restore 45 HP. Once per round." | Knight | P3 | Minor |
| 3 | The Plague Mother | L / Wither | Shield. Guard +15. Round End: each enemy −15 until the battle ends | "Survives destruction once." "At the end of each round, the enemy Unit in this lane loses 15 ATK until the battle ends. Each other enemy Unit with lasting ATK loss loses 15 more ATK until the battle ends." | Lasting ATK loss | P1 | Moderate |
| 4 | Kathra, Blood Queen | L / Bloodbound | Ally falls: 45 damage and +15 (up to +45). Destroyed: 90 damage | "When one of your Units is destroyed, this gets +15 ATK until the battle ends, up to +45." "When your own effect destroys one of your Units, deal 45 damage to the enemy player." "When this is destroyed, deal 90 damage to the enemy player." | Sacrifice | P2 | Moderate |
| 5 | Vharos, the Undying | L / Core | Destroyed: revive at 95 once. Return strongest other Undead | "When this is destroyed, if your Graveyard has 2+ other Undead Units, revive it in this lane with 95 ATK. Once." Line 2 kept | Undead Units in Graveyard | existing (+`units`) | Minor |
| 6 | Marshal Aldric | L / Vanguard | 3 Units: others +15. Ally falls: Shield | "Before lanes fight, your other Knights get +15 ATK this round." "When another Knight of yours is destroyed, this gets a Shield. Once per round." | Knight | P3 | Minor |
| 7 | Cerberus, Gate Hound | L / Hellpack | 3 Units: each enemy −15 this round. Destroyed: Pup | "Before lanes fight, if you have 2+ other Beasts, each enemy Unit loses 15 ATK this round." Pup line kept | Beast | P3 | Minor |
| 8 | Duchess Nyx | L / Phantoms | Direct attack while a Spell is in play. Spell return. Grows on direct attack | "Attacks the enemy player directly while you have a Spell in play and another Trickster. Starts the round after you play this." Other lines kept | Trickster plus Spell | existing (`ALLY_TAG_PRESENT`) | Minor |
| 9 | The Grave Tyrant | L / event | Round End: exile strongest enemy Graveyard Unit, +15 (up to +45) | "At the end of each round, exile the strongest Unit from each Graveyard, yours too." "When an enemy Unit with lasting ATK loss is destroyed, this gets +15 ATK until the battle ends, up to +45." | Lasting ATK loss plus symmetric cost | P1, P4 | Moderate |
| 10 | Ignis, Ashen Crown | L / Hellfire | Round End: 45 per Spell in play. Spell cast: +15 | "At the end of each round, deal 30 damage to the enemy player for each Spell you cast this round, up to 90." | Spells cast | P5 | Moderate (optional) |
| 11 | Morwen, Lich Queen | L / Bone Legion | Guard. Paladin's line. Revive | Line 2: "Before lanes fight, Skeletons next to this that would lose their lane get +15 ATK this round." | Skeleton | P3 | Minor (optional) |

### J2. Commons, Rares and Epics

| # | Card | Rarity / Box | Now (short) | Proposed | Role |
|---|---|---|---|---|---|
| 12 | Alpha Hound | E / Hellpack | +15 per other Unit | "+15 ATK this round for each other Beast you have." | Beast payoff |
| 13 | Brimstone Matriarch | E / Hellpack | 3 Units: +15 | "If you have 2+ other Beasts, this gets +15 ATK this round." | Beast payoff |
| 14 | Rattling Horde | C / Bone Legion | +15 per Undead Unit you have | "+15 ATK this round for each Skeleton you have, this one included." | Skeleton reader |
| 15 | Dark Priest | R / Core | Graveyard 3+ cards: +15 | "If your Graveyard has 3+ Undead Units, this gets +15 ATK this round." | Faction gate |
| 16 | Withering Lich | E / Wither | Enemy falls: +15 (up to +45) | "When an enemy Unit with lasting ATK loss is destroyed, this gets +15 ATK until the battle ends, up to +45." | Wither payoff |
| 17 | Grave Knight | R / Wither | Guard +30. Enemy falls: heal 45 | Guard kept. "Before lanes fight, if the enemy Unit in this lane has lasting ATK loss, this gets +15 ATK this round." | Wither engine |
| 18 | Blightcaster | E / Wither | Round End lane −15. Enemy falls: heal 45 | Heal gated: "When an enemy Unit with lasting ATK loss is destroyed, restore 45 HP. Once per round." | Wither bridge |
| 19 | **New Common Unit** | C / Wither | — | "Before lanes fight, the enemy Unit in this lane loses 15 ATK until the battle ends." Original name and art TBD | Wither enabler, budget path |
| 20 | Blood Demon | E / Bloodbound | Ally falls +15. Clash +30 if an ally died | Line 2: "Before lanes fight, if your own effect destroyed one of your Units this round, this gets +30 ATK this round." | Sacrifice payoff |
| 21 | Flesh Altar | E / Bloodbound | Ally falls: lane Unit +15 (up to +45) | "When your own effect destroys one of your Units, your Unit in this lane gets +15 ATK until the battle ends, up to +45." | Sacrifice amplifier |
| 22 | **New Common Spell** | C / Bloodbound | — | "Destroy your Unit in this lane. Your other Units get +15 ATK this round." Original name and art TBD | Sacrifice outlet |
| 23 | Shade Thief | C / Phantoms | Direct attack while a Spell is in play | "...while you have a Spell in play or another Trickster." | Trickster enabler |
| 24 | Spectral Assassin | R / Phantoms | Direct attack at −30 while a Spell is in play | "...while you have a Spell in play or another Trickster." | Trickster enabler |
| 25 | Ghost Lantern | C / Phantoms | Lane Unit +15 | "Your Unit in this lane has +15 ATK, or +30 if it is a Trickster." | Trickster reader |
| 26 | Hellfire Warlock | E / Hellfire | 2nd Spell: 90 damage (same as Vael) | "When you cast a one-time Spell, deal 45 damage to the enemy player. Once per round." | Separates Hellfire from Arcane |

### J3. Deck lists to rebuild after the changes
- **Bloodbound optimized:** drop Infernal Lord, and add the new Common Spell plus a second sacrifice card.
- **Bloodbound budget:** add the new Common Spell.
- **Wither budget:** add the new Common Unit.
- **Mage Slayer study deck:** review Paladin.
- **Every other list:** check after the H tests.
- **Structure Decks:** keep their 2 debut cards each.

### J4. Phase 2, not in the first PR
- **Type-hate tech:** one Common or Rare per faction that reads an enemy tag in the same lane. Examples:
  - a Mage Slayer that gets +30 if the enemy Unit in this lane is a Mage;
  - a Kingdom hunter that gets +30 against a Beast;
  - an Undead card that drains a Knight.
  These need `ENEMY_TAG_PRESENT` scoped to the lane. Release them with a later Box or event, once the archetype gates
  are proven.
- **A Bloodbound HP-cost Rare** (section G).

---

## Final judgment

**Fix the generic Legendaries and, in the same change, add BAM-inspired low-rarity engine pieces.** That is option 3,
and it is neither "keep the cards as they are" nor a wider archetype redesign.

- **Why not only fix the Legendaries.** Gating a Legendary on a condition its own Commons don't make just makes the
  Legendary bad. Kathra needs sacrifice outlets, Plague Mother needs lasting ATK loss makers, and Nyx needs Tricksters
  that care about each other. The Legendary fix and the engine fix are one change per archetype, and should ship that
  way.
- **Why not keep the cards as they are.**
  - Two free Core Legendaries already appear outside their archetype in the shipped deck lists.
  - Half the tags are decorative.
  - Three archetypes (Bone Legion, Wither, Bloodbound) have no low-rarity way to build the condition their payoff
    should need.
- **Why not a wider redesign.**
  - Vanguard, Crusade and Arcane already follow the rule this plan wants: Commons create the condition and the
    Legendary pays it off.
  - The launch set and its balance band are four days old.
  - The fix fits in about 24 card edits, 2 new Commons and 5 small engine primitives. No deck caps, no stat-model
    change, and no new tags.

The BAM lesson is structural, and it is the one ozi named: **cheap cards build the archetype's condition, and the
rare cards pay off only that condition.** Every proposal above uses Moonwater's own tags, lanes and numbers.

**Before any of this is built:**
- Run the "before" half of section H on the current roster, so the soup risk is measured and not only inferred.
- Check this plan against BAM-PATTERN-STUDY.md once it is available.
- Get ozi's go-ahead, and agree with Codex who owns the numbers.
