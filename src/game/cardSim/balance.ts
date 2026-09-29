import { getCard } from '../cards/index.js';
import { type PolicyId, type Rules, BASE_RULES, startingHp } from './engine.js';
import type { CardDefinition } from '../types/index.js';
import { withCardOverrides } from './cardSource.js';
import { ARCANE_CONTROL_V2 } from './controlPass.js';
import { type SimDeck, SIM_DECKS } from './decks.js';
import { BULWARK_SIM_DECK } from './balance/defensive.js';
import { type SeriesResult, type SeriesSummary, mean, runSeries, summarize } from './experiments.js';
import { type MasteryOption, type StatModel, getMasteryOption, getStatModel } from './statModels.js';

// Effect / archetype balance pass (docs/CARD-COMBAT-DESIGN.md). Fixes the approved card-combat baseline in
// one place and defines the measurements the pass is judged by: the nine-archetype matchup matrix and the
// controlled pilot scenarios (how much decisions are worth against how much deck quality is worth).
// scripts/simulate-balance.mjs runs them. Design tool only; nothing in the game reads this.

/** Approved rules: no overflow, a tie destroys both Units, full direct damage, one Graveyard return per card. */
export const APPROVED_RULES: Rules = { ...BASE_RULES, recursionCap: 1 };

/** Approved Mastery: HP Contribution only, +20% at Mastery V. */
export const APPROVED_MASTERY: MasteryOption = getMasteryOption('HP20');

/** Highest printed Power after the re-band (the two Power 7 Legendaries become Power 6). */
export const MAX_PRINTED_POWER = 6;

/**
 * The approved stat model: the recommended baseline (ATK = 80 + 15 x (Power - 3) ± 6, HPC = 3/4 x (210 - ATK)
 * + rarity premium, 45 HP per legacy player-HP point) with printed Power capped at 6.
 */
export function approvedModel(base: StatModel = getStatModel('baseline')): StatModel {
  return {
    ...base,
    id: 'approved',
    label: 'Approved baseline (H, Power 7 re-banded to 6)',
    stats: (card) => base.stats(card.power !== undefined && card.power > MAX_PRINTED_POWER ? { ...card, power: MAX_PRINTED_POWER } : card),
  };
}

/** Decks the balance pass adds: Thread A's rebuilt defensive list and Thread B's 8-Unit Arcane Control. */
export const BALANCE_DECKS: SimDeck[] = [
  BULWARK_SIM_DECK,
  { id: 'arcane-control', label: 'Arcane Control (8U/7S, rebuilt)', group: 'archetype', pilot: 'balanced', cards: ARCANE_CONTROL_V2 },
];

let deckOverrides: Record<string, string[]> = {};

/** Replaces deck lists for the variant under test (id -> cards); {} restores the registered lists. */
export function setDeckOverrides(decks: Record<string, string[]>): void {
  deckOverrides = decks;
}

export function getDeck(id: string): SimDeck {
  const deck = findDeck(id);
  return deckOverrides[id] ? { ...deck, cards: deckOverrides[id] } : deck;
}

function findDeck(id: string): SimDeck {
  const deck = BALANCE_DECKS.find((d) => d.id === id) ?? SIM_DECKS.find((d) => d.id === id);
  if (!deck) throw new Error(`Unknown balance deck: ${id}`);
  return deck;
}

/**
 * The nine archetypes ozi named for the matchup matrix (`core`), plus the two original study lists they replace
 * as reference rows. Defensive = Thread A's Defensive Bulwark, Spell-heavy / Control = Thread B's rebuilt Arcane
 * Control; both are measured on printed cards for "before" too, so before and after compare the same lists.
 * Overall win share is always against the nine core decks.
 */
export const ARCHETYPES: { id: string; label: string; core: boolean }[] = [
  { id: 'aggressive', label: 'Aggressive', core: true },
  { id: 'balanced', label: 'Balanced', core: true },
  { id: 'defensive-bulwark', label: 'Defensive (Bulwark)', core: true },
  { id: 'arcane-control', label: 'Spell-heavy / Control (Arcane Control)', core: true },
  { id: 'starter-kingdom', label: 'Kingdom starter', core: true },
  { id: 'starter-undead', label: 'Undead starter', core: true },
  { id: 'starter-infernal', label: 'Infernal starter', core: true },
  { id: 'high-rarity', label: 'High rarity', core: true },
  { id: 'low-rarity', label: 'Low rarity', core: true },
  { id: 'defensive', label: 'Defensive (original study list)', core: false },
  { id: 'spell-heavy', label: 'Spell-heavy (original study list)', core: false },
];

export const CORE_IDS = ARCHETYPES.filter((a) => a.core).map((a) => a.id);

/** Minimum Units in a 15-card deck (approved). */
export const MIN_UNITS = 8;

export function unitCount(cards: string[]): number {
  return cards.filter((id) => getCard(id).type === 'hero').length;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------------------
// Jobs: every measurement is a list of independent series, so the runner can spread them over processes.
// ---------------------------------------------------------------------------

export interface SeriesJob {
  key: string;
  group: string;
  deckA: string;
  deckB: string;
  pilotA: PolicyId;
  pilotB: PolicyId;
  /** Side A at Mastery V under the approved Mastery (side B stays at Mastery I). */
  masteryA?: boolean;
  label: string;
  games: number;
  seed: number;
}

/** Runs one job, with `cards` installed as simulator card overrides (the variant under test). */
export function runJob(model: StatModel, rules: Rules, job: SeriesJob, cards: CardDefinition[] = []): SeriesResult {
  return withCardOverrides(cards, () => runSeries({
    model,
    rules,
    a: { deck: getDeck(job.deckA).cards, policy: job.pilotA, mastery: job.masteryA ? { option: APPROVED_MASTERY, stage: 5 } : undefined },
    b: { deck: getDeck(job.deckB).cards, policy: job.pilotB },
    games: job.games,
    seed: job.seed,
  }));
}

/** Section G: one series per unordered pair (mirrors included), seats alternating. `pilot` = each deck's pilot. */
export function matrixJobs(group: string, games: number, seed: number, pilot: (deckId: string) => PolicyId = (id) => getDeck(id).pilot, only?: string[]): SeriesJob[] {
  const ids = ARCHETYPES.map((a) => a.id);
  const jobs: SeriesJob[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i; j < ids.length; j++) {
      if (only && !(only.includes(ids[i]) && only.includes(ids[j]))) continue;
      jobs.push({ key: `${group}|${ids[i]}|${ids[j]}`, group, deckA: ids[i], deckB: ids[j], pilotA: pilot(ids[i]), pilotB: pilot(ids[j]), label: 'matrix', games, seed: seed + i * 1_000_003 + j * 10_007 });
    }
  }
  return jobs;
}

/**
 * The fixed pairs for the "modestly stronger deck" scenario: the first deck wins 60-70% of the time when both
 * sides use the search pilot on the approved baseline (before-matrix). Fixed so before and after compare the
 * same decks.
 */
export const MODEST_PAIRS: [string, string][] = [
  ['starter-kingdom', 'aggressive'],
  ['starter-infernal', 'low-rarity'],
  ['low-rarity', 'starter-undead'],
];

/** Batch 2's pairs (strong+random beat weak+good 92% and 76%). Kept for continuity; they are not "modest". */
export const HEADLINE_PAIRS: [string, string][] = [
  ['aggressive', 'balanced'],
  ['starter-infernal', 'starter-undead'],
];

export const RARITY_PAIR: [string, string] = ['high-rarity', 'low-rarity'];

/**
 * Section F. `good` stands in for good decisions ('balanced' matches batch 2; 'expert' is the search pilot).
 *   1. equal deck: good vs random on every archetype (mirror)
 *   2. modestly stronger deck: strong+random vs weak+good, with strong+good vs weak+good as the reference
 *   3. high rarity vs low rarity: high+random vs low+good, with both good as the reference
 */
export function pilotJobs(good: PolicyId, games: number, seed: number): SeriesJob[] {
  const group = `pilots-${good}`;
  const jobs: SeriesJob[] = [];
  const add = (scenario: string, a: string, b: string, pa: PolicyId, pb: PolicyId, label: string) =>
    jobs.push({ key: `${group}|${scenario}|${a}|${b}|${pa}|${pb}`, group, deckA: a, deckB: b, pilotA: pa, pilotB: pb, label: `${scenario}: ${label}`, games, seed });
  for (const id of CORE_IDS) add('1-equal-deck', id, id, good, 'random', 'good vs random, same deck');
  for (const [strong, weak] of [...MODEST_PAIRS, ...HEADLINE_PAIRS]) {
    add('2-stronger-deck', strong, weak, good, good, 'strong+good vs weak+good');
    add('2-stronger-deck', strong, weak, 'random', good, 'strong+random vs weak+good');
    add('2-stronger-deck', strong, weak, 'random', 'random', 'strong+random vs weak+random');
  }
  const [hi, lo] = RARITY_PAIR;
  add('3-high-vs-low-rarity', hi, lo, good, good, 'high+good vs low+good');
  add('3-high-vs-low-rarity', hi, lo, 'random', good, 'high+random vs low+good');
  add('3-high-vs-low-rarity', hi, lo, 'random', 'random', 'high+random vs low+random');
  return jobs;
}

/** M5 vs M1 mirrors under the approved Mastery (+20% HPC at V). */
export function masteryJobs(games: number, seed: number, pilot: PolicyId = 'balanced'): SeriesJob[] {
  return CORE_IDS.map((id) => ({ key: `mastery-${pilot}|${id}`, group: `mastery-${pilot}`, deckA: id, deckB: id, pilotA: pilot, pilotB: pilot, masteryA: true, label: 'M5 vs M1 mirror', games, seed }));
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface MatrixReport {
  /** Row deck's win share against the column deck (draws = half); the diagonal is the mirror's seat-A share. */
  grid: Record<string, Record<string, number>>;
  /** Each archetype's mean win share against the other eight. */
  overall: { deck: string; label: string; units: number; startingHp: number; winShare: number; worst: number; best: number }[];
  pooled: SeriesSummary;
  nearAutoWins: { winner: string; loser: string; share: number }[];
  stallLoops: { deckA: string; deckB: string; stallRate: number; roundsP90: number }[];
}

export function matrixReport(model: StatModel, jobs: SeriesJob[], results: SeriesResult[], autoWin = 0.85): MatrixReport {
  const grid: Record<string, Record<string, number>> = {};
  for (const { id } of ARCHETYPES) grid[id] = {};
  const stallLoops: MatrixReport['stallLoops'] = [];
  jobs.forEach((job, k) => {
    const sum = summarize(results[k]);
    grid[job.deckA][job.deckB] = sum.winShareA;
    if (job.deckA !== job.deckB) grid[job.deckB][job.deckA] = r3(1 - sum.winShareA);
    if (CORE_IDS.includes(job.deckA) && CORE_IDS.includes(job.deckB) && (sum.stallRate > 0.02 || sum.roundsP90 > 16)) stallLoops.push({ deckA: job.deckA, deckB: job.deckB, stallRate: sum.stallRate, roundsP90: sum.roundsP90 });
  });
  const present = new Set(jobs.flatMap((j) => [j.deckA, j.deckB]));
  const overall = ARCHETYPES.filter((a) => present.has(a.id)).map(({ id, label }) => {
    const shares = CORE_IDS.filter((o) => o !== id).map((o) => grid[id][o]);
    const cards = getDeck(id).cards;
    return { deck: id, label, units: unitCount(cards), startingHp: startingHp(model, cards), winShare: r3(mean(shares)), worst: Math.min(...shares), best: Math.max(...shares) };
  }).sort((x, y) => y.winShare - x.winShare);
  const nearAutoWins: MatrixReport['nearAutoWins'] = [];
  for (const a of CORE_IDS) for (const b of CORE_IDS) if (a !== b && grid[a][b] >= autoWin) nearAutoWins.push({ winner: a, loser: b, share: grid[a][b] });
  const core = results.filter((_, k) => CORE_IDS.includes(jobs[k].deckA) && CORE_IDS.includes(jobs[k].deckB));
  return { grid, overall, pooled: summarize(mergeResults(core)), nearAutoWins: nearAutoWins.sort((x, y) => y.share - x.share), stallLoops };
}

export function mergeResults(results: SeriesResult[]): SeriesResult {
  const out: SeriesResult = { games: 0, winsA: 0, winsB: 0, draws: 0, exhausted: 0, capped: 0, seat0Wins: 0, seat1Wins: 0, rounds: [], startHpA: 0, startHpB: 0, directHits: [], winnerDirectHits: [], directDamage: [], effectDamage: [], overflowDamage: [], killShots: {}, ties: 0, clashes: 0, maxHitPct: 0, openLaneRounds: [0, 0, 0], openLaneDamagePct: [0, 0, 0] };
  for (const r of results) {
    out.games += r.games;
    out.winsA += r.winsA;
    out.winsB += r.winsB;
    out.draws += r.draws;
    out.exhausted += r.exhausted;
    out.capped += r.capped;
    out.seat0Wins += r.seat0Wins;
    out.seat1Wins += r.seat1Wins;
    out.rounds.push(...r.rounds);
    out.directHits.push(...r.directHits);
    out.winnerDirectHits.push(...r.winnerDirectHits);
    out.directDamage.push(...r.directDamage);
    out.effectDamage.push(...r.effectDamage);
    out.overflowDamage.push(...r.overflowDamage);
    for (const [k, v] of Object.entries(r.killShots)) out.killShots[k] = (out.killShots[k] ?? 0) + v;
    out.ties += r.ties;
    out.clashes += r.clashes;
    out.maxHitPct = Math.max(out.maxHitPct, r.maxHitPct);
    for (let k = 0; k < 3; k++) {
      out.openLaneRounds[k] += r.openLaneRounds[k];
      out.openLaneDamagePct[k] += r.openLaneDamagePct[k];
    }
  }
  return out;
}
