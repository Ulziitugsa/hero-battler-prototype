import type { CardDefinition, Rarity } from '../types/index.js';

// Candidate stat models for the card-combat simulation (docs/CARD-COMBAT-SIMULATION.md).
//
// A model turns a card definition into the two printed numbers - ATK and HP Contribution (HPC) - and
// says how the existing Power-denominated effects translate into the new scale:
//   - `atkStep`: ATK per 1 legacy Power, used for every "+N Power" / "-N Power" effect.
//   - `atkFromPower(p)`: the ATK a fixed-Power effect (Revive at Power 4, Hound Pup token at 2, a
//     "set Power to 1") lands on, and the Power-0 "destroyed" threshold.
//   - `hpUnit`: HP per legacy player-HP point, for PLAYER_DAMAGE / PLAYER_HEAL (legacy match HP was 20).
// Nothing here is read by the live game. It is design data for the simulator only.

export interface CardStats {
  atk: number;
  hpc: number;
}

export interface StatModel {
  id: string;
  label: string;
  description: string;
  atkStep: number;
  hpUnit: number;
  atkFromPower: (power: number) => number;
  stats: (card: CardDefinition) => CardStats;
}

const clampPower = (card: CardDefinition): number => Math.max(1, card.power ?? 1);

/** Deterministic per-card offset in [-spread, +spread], from the card id only, so it is stable across runs. */
export function cardJitter(cardId: string, spread: number): number {
  let h = 2166136261;
  for (let i = 0; i < cardId.length; i++) {
    h ^= cardId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 10007) / 10006; // [0, 1]
  return Math.round((unit * 2 - 1) * spread);
}

export interface LinearSpec {
  id: string;
  label: string;
  description: string;
  /** ATK at Power 3 and the ATK per Power step of printed stats. */
  atkAt3: number;
  atkPerPower: number;
  /** ATK per legacy Power for effects ("+2 Power" = +2 x atkStep). Defaults to atkPerPower. */
  atkStep?: number;
  /** HPC at Power 3 and the HPC change per Power step (negative = high-ATK cards contribute less HP). */
  hpcAt3: number;
  hpcStep: number;
  hpcFloor?: number;
  hpUnit: number;
  /** Optional per-card ATK jitter to break exact ties between cards of the same Power. */
  atkJitter?: number;
}

export function linearModel(spec: LinearSpec): StatModel {
  const atkFromPower = (p: number) => spec.atkAt3 + spec.atkPerPower * (p - 3);
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    atkStep: spec.atkStep ?? spec.atkPerPower,
    hpUnit: spec.hpUnit,
    atkFromPower,
    stats: (card) => {
      const p = clampPower(card);
      const atk = atkFromPower(p) + (spec.atkJitter ? cardJitter(card.id, spec.atkJitter) : 0);
      const hpc = Math.max(spec.hpcFloor ?? 1, spec.hpcAt3 + spec.hpcStep * (p - 3));
      return { atk, hpc };
    },
  };
}

// Legacy match HP was 20 and a direct hit dealt Power (~4.5 on average), so one legacy HP point is about
// a quarter of an average hit. On a ~110 ATK scale that is ~25 HP; Thread C also proposes 55 (the same
// share of Starting HP rather than of a hit). 25 is the default; 55 is run as a sensitivity check.
export const DEFAULT_HP_UNIT = 25;

/** Rarity premium on the ATK+HPC budget in the rarity-budget model. Deliberately small: rarity buys effects, not raw stats. */
export const RARITY_BUDGET_PREMIUM: Record<Rarity, number> = { common: 0, rare: 4, epic: 8, legendary: 12 };
/** Budget removed per triggered ability, so vanilla bodies are the most stat-efficient cards. */
export const EFFECT_TAX_PER_ABILITY = 6;

function abilityWeight(card: CardDefinition): number {
  return Math.min(3, card.abilities.length);
}

/**
 * Rarity budget: every Unit gets ATK + HPC = 210 + rarity premium - effect tax, split so ATK follows
 * Power (80 + 15/step, the same bands as the spec's Model 1) and HPC takes the rest. A Legendary is a
 * little more efficient overall but cannot be the best on both axes, because the split is fixed-sum.
 * A small per-card jitter breaks exact ATK ties between different cards.
 */
function rarityBudgetModel(): StatModel {
  const atkFromPower = (p: number) => 80 + 15 * (p - 3);
  return {
    id: 'rarity-budget',
    label: 'F. Rarity budget (ATK 80-140 ±, ATK+HPC = 210 + rarity - effects)',
    description: 'Model 4 of the spec. Fixed-sum ATK + HPC budget per card with a small rarity premium and a tax per effect; per-card ATK jitter of ±4.',
    atkStep: 15,
    hpUnit: DEFAULT_HP_UNIT,
    atkFromPower,
    stats: (card) => {
      const p = clampPower(card);
      const budget = 210 + RARITY_BUDGET_PREMIUM[card.rarity] - EFFECT_TAX_PER_ABILITY * abilityWeight(card);
      const extra = budget - 210;
      const atk = atkFromPower(p) + Math.round(extra / 2) + cardJitter(card.id, 4);
      const hpc = Math.max(40, budget - atk);
      return { atk, hpc };
    },
  };
}

/** Rarity premium in the recommended baseline: HP Contribution only, the low-leverage axis (see the stat-premium sweep). */
export const BASELINE_RARITY_HPC: Record<Rarity, number> = { common: 0, rare: 4, epic: 8, legendary: 11 };
/** HP per legacy player-HP point in the baseline: a typical baseline deck's Starting HP (~900) / the legacy 20. */
export const BASELINE_HP_UNIT = 45;

/**
 * H. Recommended baseline. ATK keeps the legacy Power bands at 15 ATK per Power (80-140) so every existing
 * effect converts 1:1, plus a fixed per-card offset of up to ±6 so different cards almost never tie.
 * HPC = 3/4 x (210 - ATK) + a small rarity premium, so a bigger body always gives up Starting HP and rarity
 * never buys ATK. The 3/4 scale puts an 11-Unit deck near 900 HP (about 9 average hits).
 */
export function baselineHpc(atk: number, rarity: Rarity): number {
  return Math.max(45, Math.round(0.75 * (210 - atk)) + BASELINE_RARITY_HPC[rarity]);
}

function baselineModel(): StatModel {
  const atkFromPower = (p: number) => 80 + 15 * (p - 3);
  return {
    id: 'baseline',
    label: 'H. Recommended baseline (ATK 80-140 ±6, HPC = 3/4 x (210 - ATK) + rarity HP)',
    description: 'ATK = 80 + 15 x (Power - 3) + per-card offset (±6). HPC = 0.75 x (210 - ATK) + rarity premium (C 0 / R 4 / E 8 / L 11), minimum 45. Player-HP effects at 45 HP per legacy point.',
    atkStep: 15,
    hpUnit: BASELINE_HP_UNIT,
    atkFromPower,
    stats: (card) => {
      const atk = atkFromPower(clampPower(card)) + cardJitter(card.id, 6);
      return { atk, hpc: baselineHpc(atk, card.rarity) };
    },
  };
}

export const STAT_MODELS: StatModel[] = [
  linearModel({
    id: 'preview',
    label: 'A. Current preview (ATK 85-145, HPC 115-75)',
    description: 'The formula printed on card faces today: ATK = 40 + 15 x Power, HPC = max(45, 145 - 10 x Power).',
    atkAt3: 85,
    atkPerPower: 15,
    hpcAt3: 115,
    hpcStep: -10,
    hpcFloor: 45,
    hpUnit: DEFAULT_HP_UNIT,
  }),
  linearModel({
    id: 'spec-80-140',
    label: 'B. Spec Model 1 (ATK 80-140, HPC 130-70)',
    description: 'ATK = 80 + 15 x (Power - 3), HPC = 130 - 15 x (Power - 3).',
    atkAt3: 80,
    atkPerPower: 15,
    hpcAt3: 130,
    hpcStep: -15,
    hpUnit: DEFAULT_HP_UNIT,
  }),
  linearModel({
    id: 'wide-100-180',
    label: 'C. Spec Model 2 (ATK 100-180, HPC 160-80)',
    description: 'ATK = 100 + 20 x (Power - 3), HPC = 160 - 20 x (Power - 3).',
    atkAt3: 100,
    atkPerPower: 20,
    hpcAt3: 160,
    hpcStep: -20,
    hpUnit: DEFAULT_HP_UNIT,
  }),
  linearModel({
    id: 'tight-atk',
    label: 'D. Spec Model 3 (ATK 100-140 tight, HPC 140-60 wide)',
    description: 'ATK = 100 + 10 x (Power - 3), HPC = 140 - 20 x (Power - 3).',
    atkAt3: 100,
    atkPerPower: 10,
    hpcAt3: 140,
    hpcStep: -20,
    hpUnit: DEFAULT_HP_UNIT,
  }),
  linearModel({
    id: 'granular',
    label: 'E. Model B + per-card ATK jitter (±6)',
    description: 'Model B with a fixed per-card ATK offset of up to ±6, so different cards of one Power rarely tie.',
    atkAt3: 80,
    atkPerPower: 15,
    hpcAt3: 130,
    hpcStep: -15,
    hpUnit: DEFAULT_HP_UNIT,
    atkJitter: 6,
  }),
  rarityBudgetModel(),
  linearModel({
    id: 'flat-hpc',
    label: 'G. Current ATK, flat HPC 100',
    description: 'Control: every Unit contributes 100 HP, so Starting HP only depends on the Unit count.',
    atkAt3: 85,
    atkPerPower: 15,
    hpcAt3: 100,
    hpcStep: 0,
    hpUnit: DEFAULT_HP_UNIT,
  }),
  baselineModel(),
];

export function getStatModel(id: string): StatModel {
  const model = STAT_MODELS.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown stat model: ${id}`);
  return model;
}

/** A copy of `model` with HPC multiplied (Starting HP scale sweep) and/or a different player-HP effect unit. */
export function scaledModel(model: StatModel, opts: { hpcScale?: number; hpUnit?: number; suffix?: string }): StatModel {
  const hpcScale = opts.hpcScale ?? 1;
  return {
    ...model,
    id: `${model.id}${opts.suffix ?? ''}`,
    label: `${model.label}${opts.suffix ?? ''}`,
    hpUnit: opts.hpUnit ?? model.hpUnit,
    stats: (card) => {
      const base = model.stats(card);
      return { atk: base.atk, hpc: Math.round(base.hpc * hpcScale) };
    },
  };
}

// ---------------------------------------------------------------------------
// Card Mastery options (Thread D, /mnt/project-files/moonwater/combat-sim/thread-d/mastery-options.json)
// ---------------------------------------------------------------------------

export interface MasteryOption {
  id: string;
  label: string;
  /** Cumulative % of the Mastery I value, per stage 1..5. */
  atkPct: [number, number, number, number, number];
  hpcPct: [number, number, number, number, number];
  /** Stages that add one use of the generic effect stand-in ("+10% ATK this clash when not winning"). */
  effectStages: number[];
}

export const MASTERY_OPTIONS: MasteryOption[] = [
  { id: 'M0', label: 'Effect only (control)', atkPct: [0, 0, 0, 0, 0], hpcPct: [0, 0, 0, 0, 0], effectStages: [3, 5] },
  { id: 'MA', label: 'HP-led (+3% ATK, +10% HPC)', atkPct: [0, 0, 0, 3, 3], hpcPct: [0, 5, 5, 10, 10], effectStages: [3, 5] },
  { id: 'MA-HP', label: 'MA without the ATK step (+10% HPC)', atkPct: [0, 0, 0, 0, 0], hpcPct: [0, 5, 5, 10, 10], effectStages: [3, 5] },
  { id: 'MB', label: 'Split (+8% ATK, +10% HPC)', atkPct: [0, 3, 3, 6, 8], hpcPct: [0, 0, 0, 5, 10], effectStages: [3, 5] },
  { id: 'MX', label: 'Stress (+15% ATK, +20% HPC)', atkPct: [0, 5, 5, 10, 15], hpcPct: [0, 0, 0, 10, 20], effectStages: [3, 5] },
  { id: 'HP10', label: '+10% HPC only, no effect stages', atkPct: [0, 0, 0, 0, 0], hpcPct: [0, 5, 5, 10, 10], effectStages: [] },
  { id: 'HP20', label: '+20% HPC only, no effect stages', atkPct: [0, 0, 0, 0, 0], hpcPct: [0, 5, 10, 15, 20], effectStages: [] },
  { id: 'STATS-ONLY-MB', label: 'MB stats, no effect stand-in', atkPct: [0, 3, 3, 6, 8], hpcPct: [0, 0, 0, 5, 10], effectStages: [] },
];

export function getMasteryOption(id: string): MasteryOption {
  const option = MASTERY_OPTIONS.find((m) => m.id === id);
  if (!option) throw new Error(`Unknown mastery option: ${id}`);
  return option;
}

export interface MasterySetup {
  option: MasteryOption;
  /** Stage 1..5 for every card of this side. */
  stage: number;
}

export function masteredStats(base: CardStats, mastery: MasterySetup | undefined): CardStats {
  if (!mastery || mastery.stage <= 1) return base;
  const i = Math.min(5, Math.max(1, Math.floor(mastery.stage))) - 1;
  return {
    atk: Math.round(base.atk * (1 + mastery.option.atkPct[i] / 100)),
    hpc: Math.round(base.hpc * (1 + mastery.option.hpcPct[i] / 100)),
  };
}

/** Uses of the "+10% ATK this clash" stand-in a card gets at this stage (per card id, per match). */
export function masteryEffectCharges(mastery: MasterySetup | undefined): number {
  if (!mastery) return 0;
  return mastery.option.effectStages.filter((s) => s <= mastery.stage).length;
}
