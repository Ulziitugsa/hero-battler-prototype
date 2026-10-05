import type { AbilityDefinition, CardDefinition, Faction, Trigger } from '../types/index.js';
import { getCard } from './index.js';
import { KEYWORD_HELP, TIMING_HELP, TIMING_LABEL, cardEffectLines, type EffectKeyword } from './effectText.js';
import { BATTLE_LINES, cardCombatEffectLines, trimTiming, type BattleCopy } from '../cardCombat/cardText.js';
import { getCombatCard, isAttachedSpell } from '../cardCombat/cards.js';
import { LAUNCH_NEW_CARD_IDS } from './launchCards.js';
import { atkFromPower, printedStats } from '../cardCombat/stats.js';
import { CARD_ASCENSIONS } from '../ascension/definitions.js';
import { effectiveAbilities } from '../ascension/effective.js';

// The card presentation model: what every card surface in Moonwater reads to describe a card. Hand, board, Spell zones,
// Collection, Deck Builder, Shop, Box contents, pack results, events, the focus panel and Card Inspect all print the
// same effects, in the same order, under the same labels. Nothing outside this module (and the copy tables it reads)
// writes effect wording.
//
// Every effect has two explicit wordings, authored side by side (never one cut down from the other):
//  - `compact`: the battle line on every card face ("Passive: Adjacent allies +15 ATK.");
//  - `full`: the full rule, in the focus panel and Card Inspect.
//
// Two rule sets exist while the legacy resolver still plays some modes:
//  - 'card': the approved card-combat model (ATK + HP Contribution, the balance pass). Every surface outside battle, and
//    card-combat battles, read this one.
//  - 'legacy': the live card files as the legacy resolver plays them, plus the copy's Card Mastery abilities. Legacy
//    battles read this one, so a card in play never claims a number the battle won't use. Their ATK is the Power band
//    (15 x Power + 35, cardFace.ts atkFromPower), and their damage and healing are legacy HP points.
// Where the two agree, the legacy rules reuse the card-combat lines; LEGACY_LINES and MASTERY_LINES cover the rest.

export type CardRules = 'card' | 'legacy';

export interface CardEffect {
  trigger: Trigger;
  /** What every surface prints before the effect: the timing label ("Round End", "Clash"), or a keyword that says more ("Guard 2", "Your 2nd Spell"). */
  label: string;
  /** The trigger's own timing label, also where `label` is a keyword (Card Inspect shows both). */
  timing: string;
  /** What the timing means. */
  help: string;
  /** The battle line on every card face. */
  compact: string;
  /** The board's wording: the battle line, or a tighter one where part of it no longer matters once in play. */
  board: string;
  /** The full rule (focus panel, Card Inspect), without the timing phrase or keyword the label already shows. */
  full: string;
  oncePerRound: boolean;
  /** Index of the ability in the rules' own ability list (a board Unit's live Passive states are keyed by it). */
  abilityIndex: number;
  /** Added or rewritten by Card Mastery (legacy battles only: card combat's Mastery raises HP Contribution only). */
  mastery: boolean;
}

export interface CardEffectOptions {
  /** Which rules to describe. Defaults to card combat. */
  rules?: CardRules;
  /** Legacy rules only: the copy's Card Mastery (Ascension) rank, 0 for none. */
  masteryRank?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Legacy battle lines: index-aligned with the live card's own abilities, for every card whose legacy rules differ
// from the card-combat ones (the balance-pass overrides and the cards that deal or restore Player HP).
// ---------------------------------------------------------------------------------------------------------------

const LEGACY_LINES: Record<string, BattleCopy[]> = {
  'inf-flame-imp': ['+1 damage.'],
  'inf-pit-fiend': ['Deal 2 damage.', '+30 ATK this round if an enemy fell.'],
  'inf-blood-demon': ['+15 ATK.', '+15 ATK.', '+45 ATK this round if an ally fell.'],
  'inf-runebreaker': ['Destroy enemy Continuous Spell here.', 'Spell Immune with Mage Slayer ally.', { face: 'Deal 2 damage.', label: 'Enemy’s 2nd Spell' }],
  'inf-alpha-hound': ['+15 ATK this round per Unit you control.', 'With 3 Units, deal 2 damage.'],
  'und-bone-soldier': ['Return to your deck.', '+15 ATK this round per Graveyard card.'],
  'und-dark-priest': ['+15 ATK.', '+30 ATK this round with 3+ Graveyard cards.'],
  'und-grave-knight': ['+15 ATK.', 'Restore 2 HP, once per round.'],
  'und-grave-sage': [{ face: 'With 3+ cards in hand, draw a card.', board: 'Draw a card.' }, { face: 'Adjacent allies gain a Shield.', label: 'Your 2nd Spell' }],
  'und-crypt-warden': ['Gain a Shield with 2+ Graveyard cards.'],
  'kng-light-priest': ['Restore 3 HP.', 'Gain a Shield.', '+15 ATK this round.'],
  'kng-battle-captain': ['All allies +15 ATK this round.', 'Immune to Unit effects with Knight ally.'],
  'kng-paladin': ['Gain a Shield.', { face: '+60 ATK this round if losing.', label: 'Guard 4' }, 'You take 2 less damage when it loses.'],
  'kng-apprentice-mage': ['+30 ATK this round.'],
  'kng-archmage-vael': ['Your first one-time Spell each round repeats.', { face: 'Deal 2 damage.', label: 'Your 2nd Spell' }],
  'spl-war-cry': ['All allies +30 ATK this round.', 'With 2+ Kingdom Units, +15 more.'],
  'spl-battle-banner': ['Your Unit here +30 ATK.'],
  'spl-aegis-ward': ['Prevent the next damage to you this round.'],
  'spl-stasis-field': ['No clash here this round.'],
  'spl-siege-fire': ['If no enemy is here, deal 1 damage.'],
  'spl-arcane-bolt': ['Deal 3 damage.', '+2 damage if you already cast a Spell this round.'],
  'tok-ward': ['You take 2 less damage when it loses.'],
};

/** Card Mastery (Ascension) abilities, which only the legacy resolver plays: both wordings, by card and rank. */
const MASTERY_LINES: Record<string, { face: string; full: string }> = {
  'kng-royal-guard:1': { face: 'Spell Immune with another ally.', full: 'While another allied Unit is in play, enemy Spells can’t affect this Unit.' },
  'kng-royal-guard:2': { face: 'Adjacent allies gain a Shield.', full: 'Adjacent allied Units gain a Shield.' },
  'kng-royal-guard:3': { face: 'Adjacent allies +15 ATK this round.', full: 'Adjacent allied Units gain +15 ATK this round.' },
  'kng-battle-captain:1': { face: 'Gain a Shield.', full: 'This Unit gains a Shield.' },
  'kng-battle-captain:2': { face: 'All allies +15 ATK this round.', full: 'All allied Units gain +15 ATK this round.' },
  'kng-battle-captain:3': { face: 'Spell Immune with Knight ally.', full: 'While another Knight is in play, enemy Spells can’t affect this Unit.' },
  'und-bone-soldier:1': { face: '+15 ATK this round with 2+ Graveyard Undead.', full: 'If your Graveyard has 2 or more Undead Units, gain +15 ATK this round.' },
  'und-bone-soldier:2': {
    face: 'With 3 or fewer in hand, gain weakest Graveyard Unit of 95 ATK or less.',
    full: 'If your hand has 3 or fewer cards, return your weakest Unit with 95 ATK or less from your Graveyard to your hand.',
  },
  'und-bone-soldier:3': { face: 'Immune to Unit effects with 4+ Graveyard Undead.', full: 'While your Graveyard has 4 or more Undead Units, enemy Unit effects can’t affect this Unit.' },
  'und-grave-knight:1': { face: 'Restore 2 HP, once per round.', full: 'Restore 2 HP to your player.' },
  'und-grave-knight:2': { face: 'Gain a Shield.', full: 'This Unit gains a Shield.' },
  'und-grave-knight:3': { face: '+30 ATK this round if an enemy fell.', full: 'If an enemy Unit was destroyed this round, gain +30 ATK this round.' },
  'inf-hellhound:1': { face: 'If no enemy is here, deal 1 damage.', full: 'If the enemy has no Unit in this lane, deal 1 damage to the enemy player.' },
  'inf-hellhound:2': { face: '+1 damage.', full: 'Deal 1 extra damage to the enemy player.' },
  'inf-hellhound:3': { face: '+15 ATK this round with Infernal ally.', full: 'While another Infernal Unit is in play, gain +15 ATK this round.' },
  'inf-pit-fiend:1': { face: 'Deal 1 damage.', full: 'Deal 1 damage to the enemy player.' },
  'inf-pit-fiend:2': { face: 'Deal 1 damage if an ally fell.', full: 'If an allied Unit was destroyed this round, deal 1 damage to the enemy player.' },
  'inf-pit-fiend:3': { face: '+15 ATK this round with 2+ Infernal Units.', full: 'While you control two or more Infernal Units, gain +15 ATK this round.' },
};

const MASTERY_COPY = new Map<AbilityDefinition, { face: string; full: string }>();
for (const def of CARD_ASCENSIONS) {
  for (const rank of def.ranks) {
    const copy = MASTERY_LINES[`${def.cardId}:${rank.rank}`];
    if (copy) for (const mod of rank.modifiers) MASTERY_COPY.set(mod.ability, copy);
  }
}

// ---------------------------------------------------------------------------------------------------------------

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function buildEffect(trigger: Trigger, fullLine: string, copy: BattleCopy | undefined, oncePerRound: boolean, abilityIndex: number, mastery: boolean): CardEffect {
  const trimmed = trimTiming(fullLine);
  const face = typeof copy === 'string' ? copy : (copy?.face ?? trimmed);
  const label = (typeof copy === 'object' && copy.label) || TIMING_LABEL[trigger];
  // A keyword label ("Guard 2") already says what the full rule's own keyword prefix does.
  const full = trimmed.startsWith(`${label}: `) ? capitalize(trimmed.slice(label.length + 2)) : trimmed;
  return {
    trigger,
    label,
    timing: TIMING_LABEL[trigger],
    help: TIMING_HELP[trigger],
    compact: face,
    board: (typeof copy === 'object' && copy.board) || face,
    full,
    oncePerRound,
    abilityIndex,
    mastery,
  };
}

function cardRuleEffects(id: string): CardEffect[] {
  const abilities = getCombatCard(id).abilities;
  // Stacked thresholds share one line (Ignis): only abilities with text of their own are listed.
  const listed = abilities.map((ability, index) => ({ ability, index })).filter(({ ability }) => ability.text !== '');
  const copy = BATTLE_LINES[id];
  return cardCombatEffectLines(id).map((line, i) => buildEffect(line.trigger, line.text, copy?.[i], line.oncePerRound, listed[i]?.index ?? i, false));
}

function legacyRuleEffects(id: string, masteryRank: number): CardEffect[] {
  const card = getCard(id);
  const abilities = effectiveAbilities(id, masteryRank);
  const lines = cardEffectLines(card, abilities);
  const copy = LEGACY_LINES[id] ?? BATTLE_LINES[id];
  return abilities.map((ability, index) => {
    const base = card.abilities.indexOf(ability);
    if (base >= 0) return buildEffect(ability.trigger, lines[index].text, copy?.[base], !!ability.oncePerRound, index, false);
    const mastery = MASTERY_COPY.get(ability);
    return buildEffect(ability.trigger, mastery?.full ?? lines[index].text, mastery?.face, !!ability.oncePerRound, index, true);
  });
}

const memo = new Map<string, CardEffect[]>();

/**
 * Every effect of a card, in order, with both wordings. Empty for a card with no effect. The arrays are shared between
 * callers: read them, never change them.
 */
export function cardEffects(cardOrId: CardDefinition | string, options: CardEffectOptions = {}): readonly CardEffect[] {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId.id;
  const rules = options.rules ?? 'card';
  const rank = rules === 'legacy' ? Math.max(0, Math.floor(options.masteryRank ?? 0)) : 0;
  const key = `${id}|${rules}|${rank}`;
  let effects = memo.get(key);
  if (!effects) {
    effects = rules === 'legacy' && !LAUNCH_NEW_CARD_IDS.has(id) ? legacyRuleEffects(id, rank) : cardRuleEffects(id);
    memo.set(key, effects);
  }
  return effects;
}

/** The compact line for what a Card Mastery rank adds to a card under the legacy rules (the Mastery panel), or null. */
export function masteryRankCopy(cardId: string, rank: number): string | null {
  return MASTERY_LINES[`${cardId}:${rank}`]?.face ?? null;
}

/** True when the legacy rules of this card read differently from its card-combat rules (tests, the report). */
export function hasLegacyLines(cardId: string): boolean {
  return cardId in LEGACY_LINES;
}

/** True when every Card Mastery ability of this card has authored copy (tests). */
export function hasMasteryCopy(ability: AbilityDefinition): boolean {
  return MASTERY_COPY.has(ability);
}

// ---------------------------------------------------------------------------------------------------------------
// Identity: the words for a card's type and faction, the keywords Card Inspect explains, and search text.
// ---------------------------------------------------------------------------------------------------------------

export const FACTION_NAME: Record<Faction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal', wildborn: 'Wildborn' };
export const RARITY_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' } as const;

/** "Unit", "Token", "Spell", "Continuous Spell" or "Attached Spell" (a Continuous Spell that belongs to one Unit). */
export function cardKind(card: CardDefinition): string {
  if (card.type === 'hero') return card.role === 'Token' || card.tags.includes('Token') ? 'Token' : 'Unit';
  return card.spellKind === 'CONTINUOUS' ? (isAttachedSpell(card.id) ? 'Attached Spell' : 'Continuous Spell') : 'Spell';
}

/** "Unit · Knight", "Continuous Spell". */
export function cardTypeLine(card: CardDefinition): string {
  const kind = cardKind(card);
  return kind === 'Unit' && card.role ? `Unit · ${card.role}` : kind;
}

/** "Epic · Kingdom · Unit · Knight": rarity, faction and type, the line under a card's name (focus panel, Card Inspect). */
export function cardIdentity(card: CardDefinition): string {
  return [RARITY_NAME[card.rarity], FACTION_NAME[card.faction] ?? card.faction, cardTypeLine(card)].join(' · ');
}

/**
 * A Unit's printed ATK under these rules: the approved card ATK, or, in a legacy battle, the ATK its Power reads as
 * (the Power band: 15 x Power + 35, so two Units that tie in Power show the same ATK and the higher Power always shows
 * the higher ATK). Null for a Spell.
 */
export function printedAtk(cardOrId: CardDefinition | string, rules: CardRules = 'card'): number | null {
  const card = typeof cardOrId === 'string' ? getCard(cardOrId) : cardOrId;
  if (card.type !== 'hero') return null;
  return rules === 'legacy' ? legacyAtk(card.power ?? 1) : (printedStats(card)?.atk ?? null);
}

/** Legacy battles: the ATK a Unit's live Power reads as. */
export function legacyAtk(power: number): number {
  return atkFromPower(Math.max(0, power));
}

/** Keywords worth explaining in Card Inspect, from what the card's effects actually do. */
export function cardKeywords(cardOrId: CardDefinition | string, options: CardEffectOptions = {}): EffectKeyword[] {
  const card = typeof cardOrId === 'string' ? getCard(cardOrId) : cardOrId;
  const legacy = options.rules === 'legacy';
  const abilities: readonly { actions: readonly { type: string; immunity?: string }[] }[] = legacy ? effectiveAbilities(card.id, options.masteryRank ?? 0) : getCombatCard(card.id).abilities;
  const effects = cardEffects(card, options);
  const found = new Set<EffectKeyword>();
  if (card.spellKind === 'CONTINUOUS') found.add(isAttachedSpell(card.id) ? 'Attached Spell' : 'Continuous Spell');
  if (cardKind(card) === 'Token') found.add('Token');
  if (effects.some((effect) => /^Guard \d/.test(effect.label))) found.add('Guard');
  for (const ability of abilities) {
    for (const action of ability.actions) {
      if (action.type === 'GRANT_SHIELD') found.add('Shield');
      if (action.type === 'GRANT_IMMUNITY' && action.immunity === 'SPELL') found.add('Spell Immune');
      if (action.type === 'SILENCE') found.add('Silence');
      if (action.type === 'GRANT_BYPASS') found.add('Bypass');
      if (action.type === 'SUMMON_TOKEN') found.add('Token');
      if (action.type === 'EXILE_FROM_GRAVEYARD') found.add('Exile');
    }
  }
  if (effects.some((effect) => /Graveyard/.test(effect.full))) found.add('Graveyard');
  const order = Object.keys(KEYWORD_HELP) as EffectKeyword[];
  return [...found].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * Lower-cased name (and short name), rarity, faction, type, traits and every effect's label and both wordings, exactly
 * as the cards print them: the search boxes' text (Collection, Deck Builder).
 */
export function cardSearchText(cardOrId: CardDefinition | string): string {
  const card = typeof cardOrId === 'string' ? getCard(cardOrId) : cardOrId;
  return [
    card.name,
    card.shortName,
    RARITY_NAME[card.rarity],
    FACTION_NAME[card.faction] ?? card.faction,
    cardTypeLine(card),
    ...card.tags,
    ...cardEffects(card).flatMap((effect) => [effect.label, effect.compact, effect.full]),
  ]
    .join(' ')
    .toLowerCase();
}

export { KEYWORD_HELP, TIMING_HELP, TIMING_LABEL, type EffectKeyword };
