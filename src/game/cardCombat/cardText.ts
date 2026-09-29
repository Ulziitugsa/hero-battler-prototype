import type { CardDefinition } from '../types/index.js';
import { EFFECT_TIMING_LABEL, cardEffectLines, cardEffectSummary, hasEffectCopy, type CardEffectLine } from '../cards/effectText.js';
import { getCard } from '../cards/index.js';
import { getCombatCard, hasCombatOverride } from './cards.js';
import { HP_PER_LEGACY_POINT, atkFromPower } from './stats.js';

// Player-facing effect copy for card combat: what Card Inspect, hand cards and board chits say while a card
// plays under the ATK + HP Contribution model.
//
//  - Cards the approved balance pass changed (cards.ts) read their own card-combat ability text.
//  - Cards that deal or restore Player HP print the converted amount (1 legacy point = 45 HP).
//  - Every other card reads the live copy (effectText.ts), which already speaks in ATK.

const hp = (legacyPoints: number) => legacyPoints * HP_PER_LEGACY_POINT;

/** Card-combat lines for unchanged cards whose live copy speaks in legacy HP points. Index-aligned with the card's abilities. */
const HP_LINES: Record<string, { summary: string; lines: string[] }> = {
  'inf-flame-imp': { summary: `Direct hits deal +${hp(1)}`, lines: [`Deal ${hp(1)} extra damage to the enemy player.`] },
  'inf-pit-fiend': { summary: `${hp(2)} damage when destroyed`, lines: [`Deal ${hp(2)} damage to the enemy player.`, 'If an enemy Unit was destroyed this round, gain +30 ATK this round.'] },
  'inf-runebreaker': {
    summary: 'Destroy the enemy Spell here',
    lines: ['Destroy the enemy Continuous Spell in this lane.', 'While another Mage Slayer is in play, enemy Spells can’t affect this Unit.', `The second time the enemy casts a Spell in a round, deal ${hp(2)} damage to the enemy player.`],
  },
  'inf-alpha-hound': { summary: '+15 ATK per ally', lines: ['Gain +15 ATK this round for each allied Unit, including this one.', `If you control 3 Units, deal ${hp(2)} damage to the enemy player.`] },
  'kng-light-priest': { summary: `Heal ${hp(3)} · Shield`, lines: [`Restore ${hp(3)} HP to your player.`, 'This Unit gains a Shield.', 'Gain +15 ATK this round.'] },
  'spl-siege-fire': { summary: `${hp(1)} damage if the lane is open`, lines: [`If the enemy has no Unit in this lane, deal ${hp(1)} damage to the enemy player.`] },
  'spl-arcane-bolt': { summary: `${hp(3)} damage · ${hp(5)} after a Spell`, lines: [`Deal ${hp(3)} damage to the enemy player.`, `If you already cast a Spell this round, deal ${hp(2)} more.`] },
  'spl-execute': { summary: `Destroy an enemy with ${atkFromPower(3)} ATK or less`, lines: [`Destroy the enemy Unit in this lane if it has ${atkFromPower(3)} ATK or less.`] },
};

/** Short face copy for the cards the balance pass changed. */
const OVERRIDE_SUMMARY: Record<string, string> = {
  'und-dark-priest': 'Guard 2 · +30 ATK with 3+ in Graveyard',
  'und-grave-knight': `Guard 2 · Heal ${hp(2)} when an enemy falls`,
  'spl-stasis-field': 'Enemy here deals no damage',
  'spl-aegis-ward': 'Prevent your next damage · Shield',
  'und-grave-sage': 'Return a Spell · Shield allies',
  'kng-apprentice-mage': '+30 ATK when you cast a Spell',
  'kng-archmage-vael': 'First Spell each round casts twice',
  'kng-battle-captain': 'Adjacent allies +15 ATK each clash',
  'und-bone-soldier': '+15 ATK per Graveyard card (max +60)',
  'inf-blood-demon': '+15 ATK whenever an ally falls',
  'kng-paladin': `Shield · Guard 3 · Heal ${hp(1)}`,
  'und-crypt-warden': 'Guard 2 · Shield with 2+ in Graveyard',
  'spl-battle-banner': 'Your Unit here +15 ATK',
  'spl-war-cry': 'All allies +15 ATK this round',
};

/** Effect lines Card Inspect shows for a card played under card combat. */
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
        return { trigger: ability.trigger, label: EFFECT_TIMING_LABEL[ability.trigger], text: liveIndex >= 0 ? liveLines[liveIndex].text : ability.text, oncePerRound: !!ability.oncePerRound };
      });
  }
  const lines = cardEffectLines(card);
  const hpLines = HP_LINES[id];
  return hpLines ? lines.map((line, i) => ({ ...line, text: hpLines.lines[i] ?? line.text })) : lines;
}

/** A few words for compact faces in card combat. */
export function cardCombatEffectSummary(cardOrId: CardDefinition | string): string {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  if (getCombatCard(id).abilities.length === 0) return '';
  // Cards without curated copy fall back to their first effect line, not the legacy board text.
  return OVERRIDE_SUMMARY[id] ?? HP_LINES[id]?.summary ?? (hasEffectCopy(id) ? cardEffectSummary(id) : (cardCombatEffectLines(id)[0]?.text ?? ''));
}
