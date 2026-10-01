import type { CardDefinition } from '../types/index.js';
import { TIMING_LABEL, cardEffectLines, type CardEffectLine } from '../cards/effectText.js';
import { getCard } from '../cards/index.js';
import { getCombatCard, hasCombatOverride } from './cards.js';
import { HP_PER_LEGACY_POINT, atkFromPower } from './stats.js';

// Player-facing wording for the card-combat rules: the approved ATK + HP Contribution model that card faces show on
// every surface (cardPresentation.ts pairs these lines into card effects). Two wordings per effect:
//  - the full rule (cardCombatEffectLines): the focus panel and Card Inspect;
//  - the battle line (BATTLE_LINES): every card face, in battle and out of it.
//
//  - Cards the approved balance pass changed (cards.ts) read their own card-combat ability text.
//  - Cards that deal or restore Player HP print the converted amount (1 legacy point = 45 HP).
//  - Every other card reads the live copy (effectText.ts), which already speaks in ATK.

const hp = (legacyPoints: number) => legacyPoints * HP_PER_LEGACY_POINT;

/** Card-combat full lines for unchanged cards whose live copy speaks in legacy HP points. Index-aligned with the card's abilities. */
const HP_LINES: Record<string, string[]> = {
  'inf-flame-imp': [`Deal ${hp(1)} extra damage to the enemy player.`],
  'inf-pit-fiend': [`Deal ${hp(2)} damage to the enemy player.`, 'If an enemy Unit was destroyed this round, gain +30 ATK this round.'],
  'inf-runebreaker': ['Destroy the enemy Continuous Spell in this lane.', 'While another Mage Slayer is in play, enemy Spells can’t affect this Unit.', `The second time the enemy casts a Spell in a round, deal ${hp(2)} damage to the enemy player.`],
  'inf-alpha-hound': ['Gain +15 ATK this round for each allied Unit, including this one.', `If you control 3 Units, deal ${hp(2)} damage to the enemy player.`],
  'kng-light-priest': [`Restore ${hp(3)} HP to your player.`, 'This Unit gains a Shield.', 'Gain +15 ATK this round.'],
  'spl-siege-fire': [`If the enemy has no Unit in this lane, deal ${hp(1)} damage to the enemy player.`],
  'spl-arcane-bolt': [`Deal ${hp(3)} damage to the enemy player.`, `If you already cast a Spell this round, deal ${hp(2)} more.`],
};

/** Full effect lines of a card under card combat, in order (abilities with no text of their own are left out). */
export function cardCombatEffectLines(cardOrId: CardDefinition | string): CardEffectLine[] {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  const card = getCard(id);
  if (hasCombatOverride(id)) {
    // Lines the balance pass kept unchanged are the live ability objects: they read the live curated copy.
    const liveLines = cardEffectLines(card);
    return getCombatCard(id)
      .abilities.filter((ability) => ability.text !== '')
      .map((ability) => {
        const liveIndex = card.abilities.indexOf(ability as (typeof card.abilities)[number]);
        return { trigger: ability.trigger, label: TIMING_LABEL[ability.trigger], text: liveIndex >= 0 ? liveLines[liveIndex].text : ability.text, oncePerRound: !!ability.oncePerRound };
      });
  }
  const lines = cardEffectLines(card);
  const hpLines = HP_LINES[id];
  return hpLines ? lines.map((line, i) => ({ ...line, text: hpLines[i] ?? line.text })) : lines;
}

/**
 * A leading timing phrase that only repeats the label printed before the line ("Before Combat: …" after "Clash").
 * Card surfaces drop it; the card data keeps it. Guard lines keep their "Guard N" keyword.
 */
const REDUNDANT_PREFIX = /^(Before Combat|On Death|On Play|When Destroyed|Round End):\s*/;
const GUARD_PREFIX = /^(Guard \d): Before Combat, /;

export function trimTiming(text: string): string {
  const guard = GUARD_PREFIX.exec(text);
  if (guard) return `${guard[1]}: ${text.slice(guard[0].length)}`;
  const stripped = text.replace(REDUNDANT_PREFIX, '');
  return stripped === text ? text : stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * One effect's battle line: the face line, an optional tighter board line, and an optional label that replaces the
 * timing label when a keyword says more than the timing does ("Guard 2" for a Clash effect, "Your 2nd Spell" for a
 * Spell-count trigger).
 */
export type BattleCopy = string | { face: string; board?: string; label?: string };

/**
 * Battle copy: each effect as a short battle line under its label ("On Play: Adjacent allies +15 ATK."), written to be
 * read at a glance in hand and on the board. The focus panel and Card Inspect keep the full sentences. Conventions,
 * so the short form still says everything that matters in a fight:
 *  - an ATK change with no duration lasts for the rest of the battle; "this round" marks the temporary ones;
 *  - "here" is this lane; "allies" are your other Units; "the enemy here" is the enemy Unit in this lane;
 *  - "gain a … Spell / Undead / Unit" puts that card in your hand from the Graveyard;
 *  - Units have no HP, so "damage" always hits the enemy player and "HP" is your player's;
 *  - "with …" holds while the condition does (a Passive's dot on the board shows whether it does right now);
 *  - the label carries the trigger, so the line never repeats it; no abbreviations beyond ATK and HP.
 * A board line is only given where a phrase stops mattering once the card is in play ("from next round" on a Bypass,
 * whose dot shows when it starts; an On Play condition that has already been checked).
 * Index-aligned with cardCombatEffectLines; a test keeps every card with an effect listed here. Legacy battles read
 * their own lines where the legacy rules differ (cardPresentation.ts LEGACY_LINES).
 */
export const BATTLE_LINES: Record<string, BattleCopy[]> = {
  'inf-flame-imp': ['+45 damage.'],
  'inf-cultist': ['+15 ATK this round.'],
  'inf-pit-fiend': [`Deal ${hp(2)} damage.`, '+30 ATK this round if an enemy fell.'],
  'inf-hellhound': ['Silence the enemy here this round.', 'Enemy here −30 ATK this round.'],
  'inf-blood-demon': ['+15 ATK, up to +45.', '+30 ATK this round if an ally fell.'],
  'inf-infernal-lord': ['All other Units −30 ATK this round.', 'Destroy enemy Continuous Spell here.'],
  'inf-runebreaker': ['Destroy enemy Continuous Spell here.', 'Spell Immune with Mage Slayer ally.', { face: `Deal ${hp(2)} damage.`, label: 'Enemy’s 2nd Spell' }],
  'inf-ash-jackal': ['+30 ATK this round per adjacent Beast.'],
  'inf-packhound': [{ face: 'Summon a Hound Pup, once per round.', label: 'Beast Ally Falls' }],
  'inf-alpha-hound': ['+15 ATK this round per Unit you control.', `With 3 Units, deal ${hp(2)} damage.`],
  'inf-mirage-imp': [{ face: 'Bypass with your Continuous Spell here, from next round.', board: 'Bypass with your Continuous Spell here.' }],
  'und-bone-soldier': ['Return to your deck.', '+15 ATK this round per Graveyard card, up to +60.'],
  'und-dark-priest': [{ face: '+30 ATK this round if losing.', label: 'Guard 2' }, '+30 ATK this round with 3+ Graveyard cards.'],
  'und-mira': [{ face: 'With 4 or fewer in hand, gain weakest Graveyard Undead.', board: 'Gain weakest Graveyard Undead.' }, 'Immune to Unit effects with 3+ Graveyard Undead.'],
  'und-cursed-warrior': ['Return to your hand.'],
  'und-grave-knight': [{ face: '+30 ATK this round if losing.', label: 'Guard 2' }, `Restore ${hp(2)} HP, once per round.`],
  'und-vharos': ['Revive here with 95 ATK.', 'Gain a random Graveyard Undead.'],
  'und-grave-sage': ['Gain a random Graveyard Spell.', { face: 'Adjacent allies gain a Shield.', label: 'Your 2nd Spell' }],
  'und-shade-thief': [{ face: 'Bypass while you have a Continuous Spell, from next round.', board: 'Bypass while you have a Continuous Spell.' }],
  'und-wraith-prince': [{ face: 'Bypass at −15 ATK while you have a Continuous Spell, from next round.', board: 'Bypass at −15 ATK while you have a Continuous Spell.' }, '+15 ATK.'],
  'und-crypt-warden': [{ face: '+30 ATK this round if losing.', label: 'Guard 2' }, 'Gain a Shield with 2+ Graveyard cards.'],
  'kng-royal-guard': ['Adjacent allies +15 ATK.', 'Spell Immune with Kingdom ally.'],
  'kng-light-priest': [`Restore ${hp(3)} HP.`, 'Gain a Shield.', '+15 ATK this round.'],
  'kng-archer': ['+30 ATK this round with your Continuous Spell here.'],
  'kng-battle-captain': ['Adjacent allies +15 ATK this round.', 'Immune to Unit effects with Knight ally.'],
  'kng-paladin': ['Gain a Shield.', { face: '+45 ATK this round if losing.', label: 'Guard 3' }, `If it fell here, restore ${hp(1)} HP.`],
  'kng-apprentice-mage': ['+30 ATK this round.', 'Gain a random Graveyard Spell.'],
  'kng-archmage-vael': ['Your first one-time Spell each round repeats.', { face: `Deal ${hp(2)} damage.`, label: 'Your 2nd Spell' }, 'If hand is empty, gain a Graveyard Spell.'],
  'kng-spellbreaker': ['+30 ATK this round.'],
  'kng-null-templar': ['Ignores the first enemy Spell on it each round.'],
  'wld-forest-wolf': ['+30 ATK if no enemy is here.'],
  'wld-ancient-treant': ['+15 ATK.'],
  'wld-titanroot': ['+30 ATK.'],
  'spl-power-surge': ['Your Unit here +45 ATK this round.'],
  'spl-weakness': ['Enemy here −45 ATK this round.'],
  'spl-execute': [`Destroy the enemy here if it has ${atkFromPower(3)} ATK or less.`],
  'spl-second-chance': ['Gain your strongest Graveyard Unit.'],
  'spl-raise-fallen': ['With 3+ Graveyard Undead, revive the weakest here.'],
  'spl-fireball': ['Enemy here −60 ATK.', 'With their Continuous Spell here, it becomes 50 ATK instead.'],
  'spl-war-cry': ['All allies +15 ATK this round.', 'With 2+ Kingdom Units, +15 more.'],
  'spl-death-wave': ['All enemies −30 ATK this round.'],
  'spl-dispel': ['Destroy enemy Continuous Spell here.'],
  'spl-soul-burn': ['Exile their strongest Graveyard Unit.'],
  'spl-arcane-bolt': [`Deal ${hp(3)} damage.`, `+${hp(2)} damage if you already cast a Spell this round.`],
  'spl-aegis-ward': ['Prevent the next damage to you this round.', 'Shield your Unit here.'],
  'spl-ward-circle': ['Summon a Ward in up to 2 empty lanes.'],
  'spl-stasis-field': ['Enemy here deals no damage this round.', 'It also gets −15 ATK.'],
  'spl-hush': ['Silence the enemy here this round.'],
  'spl-giants-bane': ['If they have more Units, destroy the enemy here.'],
  'spl-blood-pact': ['Destroy your Unit here, then theirs if it has 125 ATK or less.'],
  'spl-battle-banner': ['Your Unit here +15 ATK.'],
  'spl-burning-ground': ['Enemy here −15 ATK.'],
  'spl-growth-totem': ['Your Unit here +15 ATK.'],
  'spl-fortify': ['Your Unit here +15 ATK.'],
  'spl-cursed-ground': ['Your Unit here +15 ATK.'],
  'spl-siege-fire': [`If no enemy is here, deal ${hp(1)} damage.`],
  'spl-grave-totem': ['First ally lost here each round returns to hand.'],
};

/** How many battle lines a card has (tests keep this equal to its effect count). */
export function battleCopyLineCount(id: string): number {
  return BATTLE_LINES[id]?.length ?? 0;
}
