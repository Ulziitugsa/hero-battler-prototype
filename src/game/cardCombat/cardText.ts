import type { CardDefinition, Trigger } from '../types/index.js';
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
        return { trigger: ability.trigger, label: BATTLE_TIMING_LABEL[ability.trigger], text: liveIndex >= 0 ? liveLines[liveIndex].text : ability.text, oncePerRound: !!ability.oncePerRound };
      });
  }
  const lines = cardEffectLines(card).map((line) => ({ ...line, label: BATTLE_TIMING_LABEL[line.trigger] }));
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

// ---------------------------------------------------------------------------------------------------------------
// Battle faces (Battle UX pass): every combat effect a card has, readable on the card itself in hand and on the
// board, so Card Inspect is extra context rather than the only place a rule is written.
// ---------------------------------------------------------------------------------------------------------------

/** Timing labels on battle faces and in-battle Card Inspect: the shared labels, with "Passive" for always-on effects. */
export const BATTLE_TIMING_LABEL: Record<Trigger, string> = { ...EFFECT_TIMING_LABEL, PASSIVE: 'Passive' };

/**
 * A leading timing phrase that only repeats the label printed above the line ("Before Combat: …" under "On Clash").
 * Battle faces drop it; the card data keeps it. Guard lines keep their "Guard N" keyword.
 */
const REDUNDANT_PREFIX = /^(Before Combat|On Death|On Play|When Destroyed|Round End):\s*/;
const GUARD_PREFIX = /^(Guard \d): Before Combat, /;

function trimTiming(text: string): string {
  const guard = GUARD_PREFIX.exec(text);
  if (guard) return `${guard[1]}: ${text.slice(guard[0].length)}`;
  const stripped = text.replace(REDUNDANT_PREFIX, '');
  return stripped === text ? text : stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/**
 * Board wording: the same rule in fewer words, one entry per effect line (index-aligned with cardCombatEffectLines).
 * Cards not listed here use their full line, which is already short. Every entry must say everything its full line
 * says that matters in a fight: amount, target, duration and condition. A test holds the counts in step.
 */
const COMPACT_LINES: Record<string, string[]> = {
  'inf-pit-fiend': [`Deal ${hp(2)} damage to the enemy player.`, '+30 ATK this round if an enemy Unit was destroyed this round.'],
  'inf-hellhound': ['Silence the enemy Unit here this round.', 'Enemy Unit here: −30 ATK this round.'],
  'inf-blood-demon': ['Gain +15 ATK, up to +45.', '+30 ATK this round if an ally died this round.'],
  'inf-infernal-lord': ['Every other Unit gets −30 ATK this round.', 'Destroy the enemy Continuous Spell here.'],
  'inf-runebreaker': ['Destroy the enemy Continuous Spell here.', 'Spell Immune while another Mage Slayer is in play.', `Their 2nd Spell in a round: ${hp(2)} damage to the enemy player.`],
  'inf-ash-jackal': ['+30 ATK this round per adjacent allied Beast.'],
  'inf-packhound': ['If it was a Beast, summon a Hound Pup token in an empty lane.'],
  'inf-alpha-hound': ['+15 ATK this round per allied Unit, itself included.', `With 3 Units: deal ${hp(2)} damage to the enemy player.`],
  'inf-mirage-imp': ['Bypass at full ATK while your Continuous Spell is in this lane. Not on the round it is played.'],
  'und-bone-soldier': ['Return this card to your deck (once per copy).', '+15 ATK this round per Graveyard card (max +60).'],
  'und-dark-priest': ['Guard 2: +30 ATK this round if it would lose its lane.', '+30 ATK this round with 3+ cards in your Graveyard.'],
  'und-mira': ['With 4 or fewer cards in hand, return your weakest Undead from the Graveyard to hand.', 'Immune to enemy Unit effects while 3+ Undead are in your Graveyard.'],
  'und-grave-knight': ['Guard 2: +30 ATK this round if it would lose its lane.', `First each round: restore ${hp(2)} HP to your player.`],
  'und-vharos': ['Revive this Unit in the same lane with 95 ATK.', 'Also return a random Undead from your Graveyard to hand.'],
  'und-grave-sage': ['Return a random Spell from your Graveyard to hand.', 'Your 2nd Spell in a round: adjacent allies gain a Shield.'],
  'und-shade-thief': ['Bypass at full ATK while you control a Continuous Spell. Not on the round it is played.'],
  'und-wraith-prince': ['Bypass with −15 ATK while you control a Continuous Spell. Not on the round it is played.', '+15 ATK for the rest of the battle.'],
  'und-crypt-warden': ['Guard 2: +30 ATK this round if it would lose its lane.', 'Gains a Shield if your Graveyard has 2+ cards.'],
  'kng-royal-guard': ['Adjacent allies +15 ATK for the rest of the battle.', 'Spell Immune while another Kingdom Unit is in play.'],
  'kng-archer': ['+30 ATK this round with your Continuous Spell here.'],
  'kng-battle-captain': ['Adjacent allied Units gain +15 ATK this round.', 'Immune to enemy Unit effects while another Knight is in play.'],
  'kng-paladin': ['This Unit gains a Shield.', 'Guard 3: +45 ATK this round if it would lose its lane.', `If it was in this lane: restore ${hp(1)} HP to your player.`],
  'kng-apprentice-mage': ['Gain +30 ATK this round.', 'Return a random Spell from your Graveyard to hand.'],
  'kng-archmage-vael': ['First one-time Spell each round resolves twice.', `2nd Spell in a round: ${hp(2)} damage to the enemy player.`, 'Empty hand: return a random Graveyard Spell to hand.'],
  'kng-null-templar': ['The first enemy Spell to affect it each round does nothing.'],
  'wld-forest-wolf': ['+30 ATK if the opposing lane is empty when played.'],
  'spl-power-surge': ['Your Unit here gains +45 ATK this round.'],
  'spl-weakness': ['Enemy Unit here: −45 ATK this round.'],
  'spl-execute': [`Destroy the enemy Unit here if it has ${atkFromPower(3)} ATK or less.`],
  'spl-second-chance': ['Return your strongest Graveyard Unit to your hand.'],
  'spl-raise-fallen': ['With 3+ Undead in your Graveyard, revive the weakest here.'],
  'spl-fireball': ['Enemy Unit here: −60 ATK for the rest of the battle.', 'If the enemy has a Continuous Spell here, its ATK becomes 50 instead.'],
  'spl-war-cry': ['All allied Units gain +15 ATK this round.', 'With 2+ Kingdom Units: all allies gain an extra +15 ATK.'],
  'spl-dispel': ['Destroy the enemy Continuous Spell here.'],
  'spl-aegis-ward': ['Prevent your next damage this round (Clash Damage too).', 'Your Unit here gains a Shield.'],
  'spl-stasis-field': ['Enemy Unit here deals no damage this round.', 'It gets −15 ATK for the rest of the battle.'],
  'spl-hush': ['Silence the enemy Unit here this round.'],
  'spl-giants-bane': ['If the enemy has more Units than you, destroy the enemy Unit here.'],
  'spl-blood-pact': ['Destroy your Unit here, then the enemy Unit here if it has 125 ATK or less.'],
  'spl-battle-banner': ['Your Unit here has +15 ATK.'],
  'spl-burning-ground': ['Enemy Unit here: −15 ATK for the rest of the battle.'],
  'spl-growth-totem': ['Your Unit here gains +15 ATK each round.'],
  'spl-fortify': ['Your Unit here gains +15 ATK for the rest of the battle.'],
  'spl-cursed-ground': ['Your Unit here gains +15 ATK for the rest of the battle.'],
  'spl-siege-fire': [`If no enemy Unit is here, deal ${hp(1)} damage to the enemy player.`],
  'spl-grave-totem': ['The first ally destroyed here each round returns to your hand.'],
};

export interface BattleEffectLine {
  trigger: Trigger;
  /** Timing label, e.g. "On Play", "On Clash", "Passive". */
  label: string;
  /** The full rule (hand faces, Card Inspect). */
  text: string;
  /** The same rule in board wording. */
  compact: string;
  oncePerRound: boolean;
  /** Index of the ability this line describes in the card-combat card's own ability list. */
  abilityIndex: number;
}

/** Every effect line of a card in card combat, in order, with both wordings. Empty for a card with no effect. */
export function cardCombatBattleEffects(cardOrId: CardDefinition | string): BattleEffectLine[] {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  const abilities = getCombatCard(id).abilities;
  const visible = abilities.map((ability, index) => ({ ability, index })).filter(({ ability }) => !hasCombatOverride(id) || ability.text !== '');
  const compact = COMPACT_LINES[id];
  return cardCombatEffectLines(id).map((line, i) => {
    const text = trimTiming(line.text);
    return { trigger: line.trigger, label: BATTLE_TIMING_LABEL[line.trigger], text, compact: compact?.[i] ?? text, oncePerRound: line.oncePerRound, abilityIndex: visible[i]?.index ?? i };
  });
}
