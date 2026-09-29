import type { AbilityDefinition, CardDefinition, Trigger } from '../types/index.js';
import { atkDelta, atkFromPower } from './cardFace.js';
import { getCard } from './index.js';

// Player-facing effect copy. The engine's own `abilities[].text` stays as it is (the battle log and older
// tooltips read it); card faces and Card Inspect read this module instead.
//
// Rules for the copy:
// - one line per ability, in the same order as `card.abilities`, so each line gets its trigger's timing label;
// - "Unit", never "Hero"; ATK, never Power (1 Power = 15 ATK, see cardFace.ts);
// - durations are "this round" (until the round ends) or "for the rest of the battle";
// - "Once per round" is added by the UI from `oncePerRound`, so the copy does not repeat it.

/** Timing labels. Only the moments the current cards actually use. */
export const EFFECT_TIMING_LABEL: Record<Trigger, string> = {
  ON_PLAY: 'On Play',
  ROUND_START: 'Round Start',
  BEFORE_COMBAT: 'On Clash',
  AFTER_COMBAT: 'After Clash',
  ON_DEATH: 'When Destroyed',
  ON_ALLY_DEATH: 'Ally Destroyed',
  ON_ENEMY_DEATH: 'Enemy Destroyed',
  ON_DIRECT_DAMAGE: 'Direct Attack',
  ROUND_END: 'Round End',
  ON_ALLY_SPELL_PLAYED: 'You Cast a Spell',
  ON_ENEMY_SPELL_PLAYED: 'Enemy Casts a Spell',
  CONTINUOUS: 'While Active',
  PASSIVE: 'Always',
};

export const EFFECT_TIMING_HELP: Record<Trigger, string> = {
  ON_PLAY: 'When this card is played.',
  ROUND_START: 'At the start of each round.',
  BEFORE_COMBAT: 'Each round, just before the lanes clash.',
  AFTER_COMBAT: 'Each round, right after the lanes clash.',
  ON_DEATH: 'When this Unit is destroyed.',
  ON_ALLY_DEATH: 'When one of your other Units is destroyed.',
  ON_ENEMY_DEATH: 'When an enemy Unit is destroyed.',
  ON_DIRECT_DAMAGE: 'When this Unit hits the enemy player directly.',
  ROUND_END: 'At the end of each round.',
  ON_ALLY_SPELL_PLAYED: 'Whenever you cast a Spell.',
  ON_ENEMY_SPELL_PLAYED: 'Whenever the enemy casts a Spell.',
  CONTINUOUS: 'For as long as this Spell stays in its slot.',
  PASSIVE: 'Works whenever its condition is true.',
};

export type EffectKeyword = 'Shield' | 'Silence' | 'Bypass' | 'Token' | 'Exile' | 'Graveyard' | 'Continuous Spell';

export const KEYWORD_HELP: Record<EffectKeyword, string> = {
  Shield: 'The first time this Unit would be destroyed, it survives instead.',
  Silence: 'A silenced Unit’s effects do nothing for the rest of the round.',
  Bypass: 'Skips the lane clash and attacks the enemy player directly.',
  Token: 'Created during battle. Disappears when destroyed and never enters the Graveyard.',
  Exile: 'Removed from the Graveyard for the rest of the battle.',
  Graveyard: 'Where your destroyed Units and used Spells go.',
  'Continuous Spell': 'Stays in its Spell slot, working every round, until it is destroyed.',
};

const MINUS = '−';
/** "+30 ATK" / "−45 ATK" for a Power change. */
const atk = (powerDelta: number) => `${powerDelta < 0 ? MINUS : '+'}${Math.abs(atkDelta(powerDelta))} ATK`;
/** "100 ATK" for an absolute Power value. */
const atkIs = (power: number) => `${atkFromPower(power)} ATK`;

interface EffectCopy {
  /** A few words for card faces and battlefield chits. */
  summary: string;
  /** One sentence per ability, index-aligned with `card.abilities`. */
  lines: string[];
}

const COPY: Record<string, EffectCopy> = {
  // ---- Kingdom ----------------------------------------------------------------------------------
  'kng-archer': { summary: `${atk(2)} with your Spell here`, lines: [`If your Continuous Spell is in this lane, gain ${atk(2)} this round.`] },
  'kng-royal-guard': {
    summary: `Adjacent allies ${atk(1)}`,
    lines: [`Adjacent allied Units gain ${atk(1)} for the rest of the battle.`, 'While another Kingdom Unit is in play, enemy Spells can’t affect this Unit.'],
  },
  'kng-light-priest': {
    summary: 'Heal 3 · Shield',
    lines: ['Restore 3 HP to yourself.', 'This Unit gains a Shield.', `Gain ${atk(1)} this round.`],
  },
  'kng-battle-captain': {
    summary: `All allies ${atk(1)} each clash`,
    lines: [`All allied Units gain ${atk(1)} this round.`, 'While another Knight is in play, enemy Unit effects can’t affect this Unit.'],
  },
  'kng-paladin': {
    summary: `Shield · ${atk(4)} when losing`,
    lines: ['This Unit gains a Shield.', `If this Unit would lose its lane, gain ${atk(4)} this round.`, 'If this Unit loses its lane, you take 2 less damage from it.'],
  },
  'kng-apprentice-mage': { summary: `${atk(2)} when you cast a Spell`, lines: [`Gain ${atk(2)} this round.`] },
  'kng-archmage-vael': {
    summary: 'First Spell each round casts twice',
    lines: ['The first one-time Spell you cast each round resolves twice.', 'The second time you cast a Spell in a round, deal 2 damage to the enemy player.'],
  },
  'kng-spellbreaker': { summary: `${atk(2)} when the enemy casts`, lines: [`Gain ${atk(2)} this round.`] },
  'kng-null-templar': { summary: 'Ignores the first enemy Spell', lines: ['The first enemy Spell that would affect this Unit each round has no effect.'] },
  'spl-power-surge': { summary: `${atk(3)} this round`, lines: [`Your Unit in this lane gains ${atk(3)} this round.`] },
  'spl-war-cry': {
    summary: `All allies ${atk(2)} this round`,
    lines: [`All allied Units gain ${atk(2)} this round.`, `If you control 2 or more Kingdom Units, all allied Units gain an extra ${atk(1)} this round.`],
  },
  'spl-dispel': { summary: 'Destroy the enemy Spell here', lines: ['Destroy the enemy Continuous Spell in this lane.'] },
  'spl-battle-banner': { summary: `Your Unit here ${atk(2)}`, lines: [`Your Unit in this lane has ${atk(2)}.`] },
  'spl-fortify': { summary: `Your Unit here grows ${atk(1)}`, lines: [`Your Unit in this lane gains ${atk(1)} for the rest of the battle.`] },
  'spl-aegis-ward': { summary: 'Prevent your next damage', lines: ['Prevent the next damage you would take this round.'] },
  'spl-ward-circle': { summary: 'Summon 2 Ward tokens', lines: ['Summon a Ward token in up to 2 of your empty lanes.'] },
  'spl-giants-bane': { summary: 'Destroy if you’re outnumbered', lines: ['If the enemy controls more Units than you, destroy the enemy Unit in this lane.'] },

  // ---- Undead -----------------------------------------------------------------------------------
  'und-bone-soldier': {
    summary: `${atk(1)} per Graveyard card`,
    lines: ['Shuffle this card back into your deck.', `Gain ${atk(1)} this round for each card in your Graveyard.`],
  },
  'und-cursed-warrior': { summary: 'Returns to your hand', lines: ['Return this card to your hand.'] },
  'und-dark-priest': {
    summary: `${atk(1)} when an ally falls`,
    lines: [`Gain ${atk(1)} for the rest of the battle.`, `If your Graveyard has 3 or more cards, gain ${atk(2)} this round.`],
  },
  'und-grave-knight': {
    summary: `${atk(1)} when an enemy falls`,
    lines: [`Gain ${atk(1)} for the rest of the battle.`, 'Restore 2 HP to yourself.'],
  },
  'und-mira': {
    summary: 'Return an Undead from Graveyard',
    lines: ['If your hand has 4 or fewer cards, return your weakest Undead Unit from your Graveyard to your hand.', 'While your Graveyard has 3 or more Undead Units, enemy Unit effects can’t affect this Unit.'],
  },
  'und-vharos': {
    summary: `Revives with ${atkIs(4)}`,
    lines: [`Revive this Unit in the same lane with ${atkIs(4)}.`, 'Also return a random Undead Unit from your Graveyard to your hand.'],
  },
  'und-grave-sage': {
    summary: 'Draw a card · Shield allies',
    lines: ['If your hand has 3 or more cards, draw a card.', 'The second time you cast a Spell in a round, adjacent allied Units gain a Shield.'],
  },
  'und-shade-thief': {
    summary: 'Bypass while you have a Spell',
    lines: ['Bypass: while you control a Continuous Spell, this Unit skips the clash and attacks the enemy player directly at full ATK. Starts the round after it is played.'],
  },
  'und-wraith-prince': {
    summary: 'Bypass · grows on direct hits',
    lines: [
      `Bypass: while you control a Continuous Spell, this Unit skips the clash and attacks the enemy player directly with ${atk(-1)}. Starts the round after it is played.`,
      `Gain ${atk(1)} for the rest of the battle.`,
    ],
  },
  'und-crypt-warden': { summary: 'Shield with 2+ in Graveyard', lines: ['If your Graveyard has 2 or more cards, this Unit gains a Shield.'] },
  'spl-second-chance': { summary: 'Return your strongest fallen', lines: ['Return the strongest Unit in your Graveyard to your hand.'] },
  'spl-raise-fallen': { summary: 'Revive an Undead here', lines: ['If your Graveyard has 3 or more Undead Units, revive the weakest one into this lane.'] },
  'spl-grave-totem': { summary: 'First fallen ally returns', lines: ['The first allied Unit destroyed in this lane each round returns to your hand.'] },
  'spl-cursed-ground': { summary: `Your Unit here ${atk(1)} per kill`, lines: [`Your Unit in this lane gains ${atk(1)} for the rest of the battle.`] },
  'spl-hush': { summary: 'Silence the enemy here', lines: ['Silence the enemy Unit in this lane for the rest of the round.'] },
  'spl-stasis-field': { summary: 'No clash in this lane', lines: ['The enemy Unit in this lane can’t fight this round, so no clash happens here.'] },

  // ---- Infernal ---------------------------------------------------------------------------------
  'inf-flame-imp': { summary: 'Direct hits deal +1 damage', lines: ['Deal 1 extra damage to the enemy player.'] },
  'inf-cultist': { summary: `${atk(1)} each clash`, lines: [`Gain ${atk(1)} this round.`] },
  'inf-pit-fiend': {
    summary: '2 damage when destroyed',
    lines: ['Deal 2 damage to the enemy player.', `If an enemy Unit was destroyed this round, gain ${atk(2)} this round.`],
  },
  'inf-hellhound': {
    summary: `Silence · enemy ${atk(-2)}`,
    lines: ['Silence the enemy Unit in this lane for the rest of the round.', `The enemy Unit in this lane gets ${atk(-2)} this round.`],
  },
  'inf-blood-demon': {
    summary: `${atk(1)} whenever a Unit falls`,
    lines: [`Gain ${atk(1)} for the rest of the battle.`, `Gain ${atk(1)} for the rest of the battle.`, `If an allied Unit was destroyed this round, gain ${atk(3)} this round.`],
  },
  'inf-infernal-lord': {
    summary: `All others ${atk(-2)} · Dispel`,
    lines: [`Every other Unit gets ${atk(-2)} this round.`, 'Destroy the enemy Continuous Spell in this lane.'],
  },
  'inf-runebreaker': {
    summary: 'Destroy the enemy Spell here',
    lines: [
      'Destroy the enemy Continuous Spell in this lane.',
      'While another Mage Slayer is in play, enemy Spells can’t affect this Unit.',
      'The second time the enemy casts a Spell in a round, deal 2 damage to the enemy player.',
    ],
  },
  'inf-ash-jackal': { summary: `${atk(2)} per adjacent Beast`, lines: [`Gain ${atk(2)} this round for each adjacent allied Beast.`] },
  'inf-packhound': { summary: 'A Beast falls: summon a Pup', lines: ['When another allied Beast is destroyed, summon a Hound Pup token in an empty lane.'] },
  'inf-alpha-hound': {
    summary: `${atk(1)} per ally`,
    lines: [`Gain ${atk(1)} this round for each allied Unit, including this one.`, 'If you control 3 Units, deal 2 damage to the enemy player.'],
  },
  'inf-mirage-imp': {
    summary: 'Bypass with your Spell here',
    lines: ['Bypass: while your Continuous Spell is in this lane, this Unit skips the clash and attacks the enemy player directly at full ATK. Starts the round after it is played.'],
  },
  'spl-weakness': { summary: `Enemy here ${atk(-3)}`, lines: [`The enemy Unit in this lane gets ${atk(-3)} this round.`] },
  'spl-fireball': {
    summary: `Enemy here ${atk(-4)}`,
    lines: [`The enemy Unit in this lane gets ${atk(-4)} for the rest of the battle.`, `If the enemy has a Continuous Spell in this lane, that Unit’s ATK becomes ${atkIs(1)} instead.`],
  },
  'spl-soul-burn': { summary: 'Exile the enemy’s strongest fallen', lines: ['Exile the strongest Unit in the enemy’s Graveyard.'] },
  'spl-burning-ground': { summary: `Enemy here ${atk(-1)} each round`, lines: [`The enemy Unit in this lane gets ${atk(-1)} for the rest of the battle.`] },
  'spl-siege-fire': { summary: '1 damage if the lane is open', lines: ['If the enemy has no Unit in this lane, deal 1 damage to the enemy player.'] },
  'spl-arcane-bolt': { summary: '3 damage · 5 after a Spell', lines: ['Deal 3 damage to the enemy player.', 'If you already cast a Spell this round, deal 2 more.'] },
  'spl-blood-pact': {
    summary: 'Sacrifice to destroy the enemy',
    lines: [`Destroy your Unit in this lane, then destroy the enemy Unit in this lane if it has ${atkIs(6)} or less.`],
  },

  // ---- Tokens -----------------------------------------------------------------------------------
  'tok-ward': { summary: 'Reduces damage you take', lines: ['If this token loses its lane, you take 2 less damage from it.'] },
};

export interface CardEffectLine {
  trigger: Trigger;
  label: string;
  text: string;
  oncePerRound: boolean;
}

/** Fallback for cards outside the curated roster: the engine text, with the old vocabulary and the "Trigger:" prefix removed. */
function normalizeEngineText(ability: AbilityDefinition): string {
  const prefix = /^[A-Za-z ]+:\s*/;
  const text = ability.text.replace(prefix, (match) => (match.length <= 20 ? '' : match));
  return text
    .replace(/\bHeroes\b/g, 'Units')
    .replace(/\bHero\b/g, 'Unit')
    .replace(/([+-]?)(\d+) Power\b/g, (_, sign: string, n: string) => `${sign === '-' ? MINUS : sign}${atkDelta(Number(n))} ATK`)
    .replace(/\bPower\b/g, 'ATK')
    .replace(/^./, (first) => first.toUpperCase());
}

export function hasEffectCopy(cardId: string): boolean {
  return cardId in COPY;
}

/** Effect lines for a card, in ability order. Pass `abilities` to describe an evolved (Mastery) ability list; lines beyond the base copy fall back to normalized engine text. */
export function cardEffectLines(card: CardDefinition, abilities: readonly AbilityDefinition[] = card.abilities): CardEffectLine[] {
  return abilities.map((ability) => ({
    trigger: ability.trigger,
    label: EFFECT_TIMING_LABEL[ability.trigger],
    text: copyForAbility(card, ability) ?? normalizeEngineText(ability),
    oncePerRound: !!ability.oncePerRound,
  }));
}

/** Curated copy for one of the card's own base abilities; evolved (Mastery) abilities are new objects and get null. */
function copyForAbility(card: CardDefinition, ability: AbilityDefinition): string | null {
  const copy = COPY[card.id];
  const index = card.abilities.indexOf(ability);
  return copy && index >= 0 ? copy.lines[index] ?? null : null;
}

/** A few words for compact faces: the first effect's timing plus its summary, or '' for a card with no effect. */
export function cardEffectSummary(cardOrId: CardDefinition | string): string {
  const card = typeof cardOrId === 'string' ? getCard(cardOrId) : cardOrId;
  if (card.abilities.length === 0) return '';
  return COPY[card.id]?.summary ?? card.boardText ?? normalizeEngineText(card.abilities[0]);
}

/** Keywords worth explaining in Card Inspect, derived from what the card's effects actually do. */
export function cardKeywords(card: CardDefinition, abilities: readonly AbilityDefinition[] = card.abilities): EffectKeyword[] {
  const found = new Set<EffectKeyword>();
  if (card.spellKind === 'CONTINUOUS') found.add('Continuous Spell');
  if (card.role === 'Token') found.add('Token');
  for (const ability of abilities) {
    for (const action of ability.actions) {
      if (action.type === 'GRANT_SHIELD') found.add('Shield');
      if (action.type === 'SILENCE') found.add('Silence');
      if (action.type === 'GRANT_BYPASS') found.add('Bypass');
      if (action.type === 'SUMMON_TOKEN') found.add('Token');
      if (action.type === 'EXILE_FROM_GRAVEYARD') found.add('Exile');
    }
  }
  return [...found];
}

/** Lower-cased name, summary and effect text, for search boxes (Deck Builder, Collection). */
export function cardSearchText(card: CardDefinition): string {
  return [card.name, card.faction, card.role, ...card.tags, cardEffectSummary(card), ...cardEffectLines(card).flatMap((line) => [line.label, line.text])]
    .join(' ')
    .toLowerCase();
}
