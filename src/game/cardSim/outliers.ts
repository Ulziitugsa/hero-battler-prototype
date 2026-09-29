import type { AbilityDefinition, CardDefinition } from '../types/index.js';
import { getCard as getLiveCard } from '../cards/index.js';
import { BASE_RULES, type Rules } from './engine.js';

// Balance pass, Thread D: Graveyard recursion, growth and token outliers. Sim-only card rewrites and rule
// presets, measured by scripts/simulate-outliers.mjs. Nothing here changes the live cards or the live game.
//
// Power numbers stay in legacy units (the stat model converts +1 Power to +15 ATK and 1 player-HP point to
// 45 HP), so every rewrite below is expressible with the existing effect primitives.

function card(id: string, patch: Partial<CardDefinition>): CardDefinition {
  return { ...getLiveCard(id), ...patch };
}

function withAbilities(id: string, abilities: AbilityDefinition[], boardText: string): CardDefinition {
  return card(id, { abilities, boardText });
}

// ---------------------------------------------------------------------------
// Approved by ozi (2026-09-29): Power 7 Legendaries re-band to Power 6. Part of every baseline here.
// ---------------------------------------------------------------------------

export const APPROVED_REBAND: CardDefinition[] = [card('inf-infernal-lord', { power: 6 }), card('und-vharos', { power: 6 })];

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** The approved rule baseline: no overflow, tie destroys both, one Graveyard return per card per match (per name, as PR #7 measures it). */
export const APPROVED_RULES: Rules = { ...BASE_RULES, recursionCap: 1 };

/** Growth cap: permanent effects can raise a Unit at most +45 ATK (3 legacy Power) above the ATK it entered with. */
export const GROWTH_CAP_ATK = 45;

/**
 * Thread D's proposed rules: approved baseline, the one Graveyard return counted per physical copy (the natural
 * reading of "each card may return once"), and the +45 ATK growth cap. Tokens keep today's battle-only model;
 * the 'oneCombat' fade was measured and is not needed (see the report).
 */
export const PROPOSED_RULES: Rules = { ...APPROVED_RULES, recursionScope: 'copy', growthCap: GROWTH_CAP_ATK };

// ---------------------------------------------------------------------------
// Card rewrites
// ---------------------------------------------------------------------------

/**
 * Bone Soldier: "+1 Power this round per card in your Graveyard" is unbounded (the Graveyard reaches 6-10 cards,
 * so a Common swings +90 to +150 ATK). Keep the scaling, cap it at +3 (+45 ATK). With today's primitives that is
 * three stacked thresholds; production would add a `max` to CHANGE_POWER_BY_COUNT.
 */
export function boneSoldierCapped(maxStacks: number): CardDefinition {
  const steps: AbilityDefinition[] = Array.from({ length: maxStacks }, (_, i) => ({
    trigger: 'BEFORE_COMBAT' as const,
    conditions: [{ type: 'GRAVEYARD_COUNT_AT_LEAST' as const, count: i + 1 }],
    actions: [{ type: 'CHANGE_POWER' as const, amount: 1, duration: 'UNTIL_ROUND_END' as const, target: 'SELF' as const }],
    text: i === 0 ? `Before Combat: gain +1 Power this round for each card in your Graveyard (up to +${maxStacks}).` : '',
  }));
  return withAbilities(
    'und-bone-soldier',
    [{ trigger: 'ON_DEATH', actions: [{ type: 'RETURN_TO_DECK' }], text: 'On Death: Return this card to your Deck.' }, ...steps],
    `Death:Return; +1/Grave (max ${maxStacks})`,
  );
}

/** Proposed: +15 ATK per Graveyard card, up to +45. */
export const BONE_SOLDIER = boneSoldierCapped(3);

/** Rejected alternative (first draft): a flat +30 ATK once the Graveyard holds 3 cards. Over-nerfs the Undead Starter. */
export const BONE_SOLDIER_FLAT = withAbilities(
  'und-bone-soldier',
  [
    { trigger: 'ON_DEATH', actions: [{ type: 'RETURN_TO_DECK' }], text: 'On Death: Return this card to your Deck.' },
    {
      trigger: 'BEFORE_COMBAT',
      conditions: [{ type: 'GRAVEYARD_COUNT_AT_LEAST', count: 3 }],
      actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }],
      text: 'Before Combat: if your Graveyard holds 3 or more cards, gain +2 Power this round.',
    },
  ],
  'Death:Return; +2 w/3+ Grave',
);

/** Blood Demon: grew on every death on both sides plus a +3 burst. Keeps the ally-death theme and a smaller burst; growth is bounded by the global cap. */
export const BLOOD_DEMON = withAbilities(
  'inf-blood-demon',
  [
    {
      trigger: 'ON_ALLY_DEATH',
      actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'SELF' }],
      text: 'When another allied Hero dies, gain +1 Power (up to +3).',
    },
    {
      trigger: 'BEFORE_COMBAT',
      conditions: [{ type: 'ALLY_DIED_THIS_ROUND' }],
      actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }],
      text: 'Before Combat: if an allied Hero died this round, gain +2 Power this round.',
    },
  ],
  'Ally dies:+1 (max 3); +2 rnd',
);

/** Legendary Paladin, line 3: overflow reduction does nothing without overflow. Option A: drop the line. */
export const PALADIN_TWO_LINES = withAbilities('kng-paladin', getLiveCard('kng-paladin').abilities.slice(0, 2), 'Shield; +4 losing');

/** Option B: replace line 3 with "when this Unit wins its lane, restore 45 HP (once per round)". */
export const PALADIN_HEAL_ON_WIN = withAbilities(
  'kng-paladin',
  [
    ...getLiveCard('kng-paladin').abilities.slice(0, 2),
    {
      trigger: 'ON_ENEMY_DEATH',
      oncePerRound: true,
      conditions: [{ type: 'DEATH_IN_SELF_LANE' }],
      actions: [{ type: 'PLAYER_HEAL', amount: 1 }],
      text: 'When the enemy Hero in this lane dies, heal your player for 1 (once per round).',
    },
  ],
  'Shield; +4 losing; win: Heal1',
);

/** Ward token: its only line was overflow reduction, which does nothing without overflow. A plain 70-ATK blocker. */
export const WARD_TOKEN = withAbilities('tok-ward', [], 'Token');

// ---------------------------------------------------------------------------
// Variants measured by the study
// ---------------------------------------------------------------------------

export interface OutlierVariant {
  id: string;
  label: string;
  rules: Rules;
  cards: CardDefinition[];
}

const base = APPROVED_REBAND;

/** Card rewrites in the proposal (APPROVED_REBAND not included). */
export const PROPOSED_CARDS: CardDefinition[] = [BONE_SOLDIER, BLOOD_DEMON, PALADIN_HEAL_ON_WIN, WARD_TOKEN];

export const OUTLIER_VARIANTS: OutlierVariant[] = [
  { id: 'approved', label: 'Approved baseline (once per name, Power 7 -> 6)', rules: APPROVED_RULES, cards: base },
  { id: 'approved-per-copy', label: 'Approved, recursion counted per copy', rules: { ...APPROVED_RULES, recursionScope: 'copy' }, cards: base },
  { id: 'uncapped-recursion', label: 'Reference: unlimited recursion', rules: { ...APPROVED_RULES, recursionCap: null }, cards: base },
  { id: 'growth-cap', label: '+ growth cap +45 ATK', rules: { ...APPROVED_RULES, growthCap: GROWTH_CAP_ATK }, cards: base },
  { id: 'token-fade', label: '+ tokens fade after one Combat', rules: { ...APPROVED_RULES, tokenLifetime: 'oneCombat' }, cards: [...base, WARD_TOKEN] },
  { id: 'bone-soldier-flat', label: '+ Bone Soldier flat +30 at 3+ Graveyard', rules: APPROVED_RULES, cards: [...base, BONE_SOLDIER_FLAT] },
  { id: 'bone-soldier', label: '+ Bone Soldier +15 per Graveyard card, max +45', rules: APPROVED_RULES, cards: [...base, BONE_SOLDIER] },
  { id: 'bone-soldier-60', label: '+ Bone Soldier +15 per Graveyard card, max +60', rules: APPROVED_RULES, cards: [...base, boneSoldierCapped(4)] },
  { id: 'blood-demon', label: '+ Blood Demon rewrite + growth cap', rules: { ...APPROVED_RULES, growthCap: GROWTH_CAP_ATK }, cards: [...base, BLOOD_DEMON] },
  { id: 'paladin-2', label: '+ Paladin line 3 dropped', rules: APPROVED_RULES, cards: [...base, PALADIN_TWO_LINES] },
  { id: 'paladin-heal', label: '+ Paladin line 3 = heal 45 on lane win', rules: APPROVED_RULES, cards: [...base, PALADIN_HEAL_ON_WIN] },
  { id: 'proposed', label: 'Thread D proposal (per-copy return, growth cap, Bone Soldier, Blood Demon, Paladin heal, plain Ward)', rules: PROPOSED_RULES, cards: [...base, ...PROPOSED_CARDS] },
  { id: 'proposed-per-name', label: 'Thread D proposal, return counted per name', rules: { ...PROPOSED_RULES, recursionScope: 'name' }, cards: [...base, ...PROPOSED_CARDS] },
  { id: 'proposed+token-fade', label: 'Thread D proposal + tokens fade after one Combat', rules: { ...PROPOSED_RULES, tokenLifetime: 'oneCombat' }, cards: [...base, ...PROPOSED_CARDS] },
];

export function getOutlierVariant(id: string): OutlierVariant {
  const v = OUTLIER_VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown outlier variant: ${id}`);
  return v;
}

// ---------------------------------------------------------------------------
// Stress decks: each one concentrates one outlier so its loop shows up clearly against the field.
// ---------------------------------------------------------------------------

function expand(entries: [string, number][]): string[] {
  return entries.flatMap(([id, n]) => Array.from({ length: n }, () => id));
}

export const STRESS_DECKS: { id: string; label: string; cards: string[] }[] = [
  {
    id: 'stress-recursion',
    label: 'Undead recursion (9U/6S)',
    cards: expand([
      ['und-cursed-warrior', 2],
      ['und-bone-soldier', 2],
      ['und-mira', 2],
      ['und-vharos', 1],
      ['und-crypt-warden', 2],
      ['spl-grave-totem', 2],
      ['spl-second-chance', 2],
      ['spl-raise-fallen', 2],
    ]),
  },
  {
    id: 'stress-growth',
    label: 'Growth (10U/5S)',
    cards: expand([
      ['inf-blood-demon', 2],
      ['und-dark-priest', 2],
      ['und-grave-knight', 2],
      ['und-bone-soldier', 2],
      ['kng-common-knight', 2],
      ['spl-fortify', 2],
      ['spl-cursed-ground', 2],
      ['spl-power-surge', 1],
    ]),
  },
  {
    id: 'stress-tokens',
    label: 'Tokens and blockers (10U/5S)',
    cards: expand([
      ['inf-packhound', 2],
      ['inf-alpha-hound', 2],
      ['inf-ash-jackal', 2],
      ['kng-paladin', 1],
      ['kng-royal-guard', 2],
      ['kng-common-knight', 1],
      ['spl-ward-circle', 2],
      ['spl-aegis-ward', 2],
      ['spl-power-surge', 1],
    ]),
  },
];
