import { getCard } from '../cards/index.js';
import { PLAYTEST_ROSTER } from '../cards/roster.js';
import { choosePlays } from './ai.js';
import { type CardCounters, type MatchResult, type PolicyId, type Rules, type SideSetup, BASE_RULES, playMatch, sideStatTable, startingHp } from './engine.js';
import { type SimDeck, SIM_DECKS, getSimDeck } from './decks.js';
import { type MasteryOption, type MasterySetup, type StatModel, MASTERY_OPTIONS, STAT_MODELS, getStatModel, scaledModel } from './statModels.js';

// Experiment suites for docs/CARD-COMBAT-SIMULATION.md. Every function is deterministic for a given
// seed and game count; scripts/simulate-card-combat.mjs runs them and writes the raw tables.

export interface SeriesSpec {
  model: StatModel;
  rules?: Rules;
  a: SideSetup;
  b: SideSetup;
  games: number;
  seed: number;
  cardStats?: Map<string, CardCounters>;
}

export interface SeriesResult {
  games: number;
  winsA: number;
  winsB: number;
  draws: number;
  exhausted: number;
  capped: number;
  seat0Wins: number;
  seat1Wins: number;
  rounds: number[];
  startHpA: number;
  startHpB: number;
  /** Per match: unit direct hits by both sides, and by the winner. */
  directHits: number[];
  winnerDirectHits: number[];
  directDamage: number[];
  effectDamage: number[];
  overflowDamage: number[];
  killShots: Record<string, number>;
  ties: number;
  clashes: number;
  maxHitPct: number;
  openLaneRounds: [number, number, number];
  openLaneDamagePct: [number, number, number];
}

function emptySeries(games: number): SeriesResult {
  return {
    games,
    winsA: 0,
    winsB: 0,
    draws: 0,
    exhausted: 0,
    capped: 0,
    seat0Wins: 0,
    seat1Wins: 0,
    rounds: [],
    startHpA: 0,
    startHpB: 0,
    directHits: [],
    winnerDirectHits: [],
    directDamage: [],
    effectDamage: [],
    overflowDamage: [],
    killShots: {},
    ties: 0,
    clashes: 0,
    maxHitPct: 0,
    openLaneRounds: [0, 0, 0],
    openLaneDamagePct: [0, 0, 0],
  };
}

/** Plays `games` matches, alternating seats so seat order cancels out: even games put A in seat 0. */
export function runSeries(spec: SeriesSpec): SeriesResult {
  const out = emptySeries(spec.games);
  for (let i = 0; i < spec.games; i++) {
    const aFirst = i % 2 === 0;
    const sides: [SideSetup, SideSetup] = aFirst ? [spec.a, spec.b] : [spec.b, spec.a];
    const m = playMatch({ model: spec.model, rules: spec.rules ?? BASE_RULES, sides, seed: spec.seed + i * 7919, cardStats: spec.cardStats }, choosePlays);
    absorb(out, m, aFirst);
  }
  return out;
}

function absorb(out: SeriesResult, m: MatchResult, aFirst: boolean): void {
  const aSeat = aFirst ? 0 : 1;
  out.startHpA = m.startHp[aSeat];
  out.startHpB = m.startHp[1 - aSeat];
  if (m.winner === null) {
    out.draws++;
    if (m.endReason === 'exhausted') out.exhausted++;
    if (m.endReason === 'cap') out.capped++;
  } else {
    if (m.winner === aSeat) out.winsA++;
    else out.winsB++;
    if (m.winner === 0) out.seat0Wins++;
    else out.seat1Wins++;
    out.winnerDirectHits.push(m.totals[m.winner].directHits);
  }
  if (m.killShot) out.killShots[m.killShot] = (out.killShots[m.killShot] ?? 0) + 1;
  out.rounds.push(m.rounds);
  out.directHits.push(m.totals[0].directHits + m.totals[1].directHits);
  out.directDamage.push(m.totals[0].directDamage + m.totals[1].directDamage);
  out.effectDamage.push(m.totals[0].effectDamage + m.totals[1].effectDamage);
  out.overflowDamage.push(m.totals[0].overflowDamage + m.totals[1].overflowDamage);
  out.ties += m.ties;
  out.clashes += m.clashes;
  for (const t of m.totals) {
    out.maxHitPct = Math.max(out.maxHitPct, t.maxHitPct);
    for (let k = 0; k < 3; k++) {
      out.openLaneRounds[k] += t.openLaneRounds[k];
      out.openLaneDamagePct[k] += t.openLaneDamagePct[k];
    }
  }
}

function merge(results: SeriesResult[]): SeriesResult {
  const out = emptySeries(0);
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

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Win share of A with draws counted as half, and a 95% normal-approximation half-width. */
export function winShare(r: SeriesResult): { share: number; ci95: number } {
  const n = r.games;
  const share = n === 0 ? 0 : (r.winsA + 0.5 * r.draws) / n;
  return { share: r3(share), ci95: r3(1.96 * Math.sqrt((share * (1 - share)) / Math.max(1, n))) };
}

export interface SeriesSummary {
  games: number;
  winShareA: number;
  ci95: number;
  drawRate: number;
  stallRate: number;
  roundsMean: number;
  roundsMedian: number;
  roundsP10: number;
  roundsP90: number;
  directHitsMean: number;
  winnerDirectHitsMean: number;
  directDamageMean: number;
  effectDamageMean: number;
  overflowDamageMean: number;
  killShotDirectPct: number;
  killShotEffectPct: number;
  killShotOverflowPct: number;
  tieRate: number;
  seat0WinRate: number;
  maxHitPct: number;
  oneLaneHitPct: number;
  twoLaneHitPct: number;
  threeLaneHitPct: number;
  oneLaneRounds: number;
  twoLaneRounds: number;
  threeLaneRounds: number;
}

export function summarize(r: SeriesResult): SeriesSummary {
  const decided = r.winsA + r.winsB;
  const kills = Object.values(r.killShots).reduce((a, b) => a + b, 0) || 1;
  const { share, ci95 } = winShare(r);
  return {
    games: r.games,
    winShareA: share,
    ci95,
    drawRate: r3(r.draws / Math.max(1, r.games)),
    stallRate: r3((r.exhausted + r.capped) / Math.max(1, r.games)),
    roundsMean: r1(mean(r.rounds)),
    roundsMedian: quantile(r.rounds, 0.5),
    roundsP10: quantile(r.rounds, 0.1),
    roundsP90: quantile(r.rounds, 0.9),
    directHitsMean: r1(mean(r.directHits)),
    winnerDirectHitsMean: r1(mean(r.winnerDirectHits)),
    directDamageMean: Math.round(mean(r.directDamage)),
    effectDamageMean: Math.round(mean(r.effectDamage)),
    overflowDamageMean: Math.round(mean(r.overflowDamage)),
    killShotDirectPct: r3((r.killShots.direct ?? 0) / kills),
    killShotEffectPct: r3((r.killShots.effect ?? 0) / kills),
    killShotOverflowPct: r3((r.killShots.overflow ?? 0) / kills),
    tieRate: r3(r.ties / Math.max(1, r.clashes)),
    seat0WinRate: r3(r.seat0Wins / Math.max(1, decided)),
    maxHitPct: r3(r.maxHitPct),
    oneLaneHitPct: r3(r.openLaneDamagePct[0] / Math.max(1, r.openLaneRounds[0])),
    twoLaneHitPct: r3(r.openLaneDamagePct[1] / Math.max(1, r.openLaneRounds[1])),
    threeLaneHitPct: r3(r.openLaneDamagePct[2] / Math.max(1, r.openLaneRounds[2])),
    oneLaneRounds: r.openLaneRounds[0],
    twoLaneRounds: r.openLaneRounds[1],
    threeLaneRounds: r.openLaneRounds[2],
  };
}

// ---------------------------------------------------------------------------
// Deck profiles (Starting HP)
// ---------------------------------------------------------------------------

export interface DeckProfile {
  model: string;
  deck: string;
  units: number;
  spells: number;
  startingHp: number;
  avgAtk: number;
  minAtk: number;
  maxAtk: number;
  avgHpc: number;
  /** Direct hits of this deck's average ATK needed to empty this deck's own Starting HP. */
  hitsToKillSelf: number;
}

export function deckProfiles(model: StatModel, decks: SimDeck[] = SIM_DECKS): DeckProfile[] {
  return decks.map((deck) => {
    const table = sideStatTable(model, deck.cards);
    const unitIds = deck.cards.filter((id) => getCard(id).type === 'hero');
    const atks = unitIds.map((id) => table.get(id)!.atk);
    const hp = startingHp(model, deck.cards);
    const avgAtk = mean(atks);
    return {
      model: model.id,
      deck: deck.id,
      units: unitIds.length,
      spells: deck.cards.length - unitIds.length,
      startingHp: hp,
      avgAtk: r1(avgAtk),
      minAtk: Math.min(...atks),
      maxAtk: Math.max(...atks),
      avgHpc: r1(mean(unitIds.map((id) => table.get(id)!.hpc))),
      hitsToKillSelf: r1(hp / avgAtk),
    };
  });
}

/** Printed stats of every roster Unit under a model (for the report's range tables). */
export function rosterStats(model: StatModel): { cardId: string; rarity: string; power: number; atk: number; hpc: number; abilities: number }[] {
  return [...new Set(PLAYTEST_ROSTER)]
    .map(getCard)
    .filter((c) => c.type === 'hero')
    .map((c) => ({ cardId: c.id, rarity: c.rarity, power: c.power ?? 0, ...model.stats(c), abilities: c.abilities.length }));
}

/** Chance two random roster Units tie on printed ATK (uniform over distinct cards). */
export function rosterTieChance(model: StatModel): number {
  const atks = rosterStats(model).map((c) => c.atk);
  let ties = 0;
  let pairs = 0;
  for (let i = 0; i < atks.length; i++) for (let j = 0; j < atks.length; j++) {
    pairs++;
    if (atks[i] === atks[j]) ties++;
  }
  return r3(ties / pairs);
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

export interface MatchupRow {
  model: string;
  variant: string;
  deckA: string;
  deckB: string;
  pilotA: PolicyId;
  pilotB: PolicyId;
  startHpA: number;
  startHpB: number;
  summary: SeriesSummary;
}

export function runMatrix(model: StatModel, decks: SimDeck[], gamesPerPair: number, seed: number, opts: { rules?: Rules; variant?: string; cardStats?: Map<string, CardCounters>; includeMirrors?: boolean } = {}): { rows: MatchupRow[]; pooled: SeriesResult } {
  const rows: MatchupRow[] = [];
  const all: SeriesResult[] = [];
  for (let i = 0; i < decks.length; i++) {
    for (let j = i; j < decks.length; j++) {
      if (i === j && !opts.includeMirrors) continue;
      const a = decks[i];
      const b = decks[j];
      const res = runSeries({ model, rules: opts.rules, a: { deck: a.cards, policy: a.pilot }, b: { deck: b.cards, policy: b.pilot }, games: gamesPerPair, seed: seed + i * 1_000_003 + j * 10_007, cardStats: opts.cardStats });
      all.push(res);
      rows.push({ model: model.id, variant: opts.variant ?? 'base', deckA: a.id, deckB: b.id, pilotA: a.pilot, pilotB: b.pilot, startHpA: res.startHpA, startHpB: res.startHpB, summary: summarize(res) });
    }
  }
  return { rows, pooled: merge(all) };
}

/** Each deck's average win share across the matrix (draws = half). */
export function deckStandings(rows: MatchupRow[]): { deck: string; winShare: number; games: number }[] {
  const acc = new Map<string, { w: number; n: number }>();
  const add = (deck: string, share: number, n: number) => {
    const e = acc.get(deck) ?? { w: 0, n: 0 };
    e.w += share * n;
    e.n += n;
    acc.set(deck, e);
  };
  for (const row of rows) {
    if (row.deckA === row.deckB) continue;
    add(row.deckA, row.summary.winShareA, row.summary.games);
    add(row.deckB, 1 - row.summary.winShareA, row.summary.games);
  }
  return [...acc.entries()].map(([deck, e]) => ({ deck, winShare: r3(e.w / e.n), games: e.n })).sort((x, y) => y.winShare - x.winShare);
}

// ---------------------------------------------------------------------------
// Controlled experiments
// ---------------------------------------------------------------------------

function flatOption(id: string, atkPct: number, hpcPct: number): MasteryOption {
  return { id, label: id, atkPct: [0, 0, 0, 0, atkPct], hpcPct: [0, 0, 0, 0, hpcPct], effectStages: [] };
}

export interface MirrorRow {
  model: string;
  experiment: string;
  deck: string;
  label: string;
  pilotA: PolicyId;
  pilotB: PolicyId;
  summary: SeriesSummary;
}

/** Same deck both sides; side A's Units get +x% ATK and/or HPC. Measures how raw stat edges become wins. */
export function statPremiumSweep(model: StatModel, deckIds: string[], premiums: { atk: number; hpc: number }[], games: number, seed: number, rules?: Rules): MirrorRow[] {
  const rows: MirrorRow[] = [];
  for (const deckId of deckIds) {
    const deck = getSimDeck(deckId);
    for (const p of premiums) {
      const mastery: MasterySetup = { option: flatOption(`+${p.atk}%ATK +${p.hpc}%HPC`, p.atk, p.hpc), stage: 5 };
      const res = runSeries({ model, rules, a: { deck: deck.cards, policy: 'balanced', mastery }, b: { deck: deck.cards, policy: 'balanced' }, games, seed });
      rows.push({ model: model.id, experiment: 'stat-premium', deck: deckId, label: mastery.option.id, pilotA: 'balanced', pilotB: 'balanced', summary: summarize(res) });
    }
  }
  return rows;
}

/** Mastery V (A) vs Mastery I (B) mirrors for each Mastery option; also M1 with good decisions vs M5 played randomly. */
export function masteryMirrors(model: StatModel, deckIds: string[], games: number, seed: number, options: MasteryOption[] = MASTERY_OPTIONS, rules?: Rules): MirrorRow[] {
  const rows: MirrorRow[] = [];
  for (const deckId of deckIds) {
    const deck = getSimDeck(deckId);
    for (const option of options) {
      const m5: MasterySetup = { option, stage: 5 };
      const same = runSeries({ model, rules, a: { deck: deck.cards, policy: 'balanced', mastery: m5 }, b: { deck: deck.cards, policy: 'balanced' }, games, seed });
      rows.push({ model: model.id, experiment: 'mastery-M5-vs-M1', deck: deckId, label: option.id, pilotA: 'balanced', pilotB: 'balanced', summary: summarize(same) });
      const misplayed = runSeries({ model, rules, a: { deck: deck.cards, policy: 'random', mastery: m5 }, b: { deck: deck.cards, policy: 'balanced' }, games, seed });
      rows.push({ model: model.id, experiment: 'mastery-M5-random-vs-M1-balanced', deck: deckId, label: option.id, pilotA: 'random', pilotB: 'balanced', summary: summarize(misplayed) });
    }
  }
  return rows;
}

/**
 * Mastery V vs Mastery I across DIFFERENT decks (not mirrors): for each ordered pair, A's win share with every
 * card at Mastery V minus A's win share at Mastery I against the same Mastery I opponent. Mirrors overstate
 * any ATK step because identical cards tie; this is the edge a maxed collection has in ordinary matchmaking.
 */
export function masteryCross(model: StatModel, deckIds: string[], games: number, seed: number, options: MasteryOption[] = MASTERY_OPTIONS, rules?: Rules): { option: string; label: string; pairs: number; meanDelta: number; minDelta: number; maxDelta: number; meanShareM5: number }[] {
  const decks = deckIds.map(getSimDeck);
  const base = new Map<string, number>();
  for (const a of decks) for (const b of decks) {
    if (a.id === b.id) continue;
    base.set(`${a.id}|${b.id}`, summarize(runSeries({ model, rules, a: { deck: a.cards, policy: 'balanced' }, b: { deck: b.cards, policy: 'balanced' }, games, seed })).winShareA);
  }
  return options.map((option) => {
    const deltas: number[] = [];
    const shares: number[] = [];
    for (const a of decks) for (const b of decks) {
      if (a.id === b.id) continue;
      const share = summarize(runSeries({ model, rules, a: { deck: a.cards, policy: 'balanced', mastery: { option, stage: 5 } }, b: { deck: b.cards, policy: 'balanced' }, games, seed })).winShareA;
      shares.push(share);
      deltas.push(share - (base.get(`${a.id}|${b.id}`) ?? 0));
    }
    return { option: option.id, label: option.label, pairs: deltas.length, meanDelta: r3(mean(deltas)), minDelta: r3(Math.min(...deltas)), maxDelta: r3(Math.max(...deltas)), meanShareM5: r3(mean(shares)) };
  });
}

/** Deck quality vs decision quality: strong/weak deck crossed with balanced/random pilots. */
export function skillProxy(model: StatModel, strongId: string, weakId: string, games: number, seed: number, rules?: Rules): MirrorRow[] {
  const strong = getSimDeck(strongId);
  const weak = getSimDeck(weakId);
  const cases: [PolicyId, PolicyId, string][] = [
    ['balanced', 'balanced', 'strong+good vs weak+good'],
    ['random', 'balanced', 'strong+random vs weak+good'],
    ['balanced', 'random', 'strong+good vs weak+random'],
    ['random', 'random', 'strong+random vs weak+random'],
  ];
  const rows: MirrorRow[] = cases.map(([pa, pb, label]) => {
    const res = runSeries({ model, rules, a: { deck: strong.cards, policy: pa }, b: { deck: weak.cards, policy: pb }, games, seed });
    return { model: model.id, experiment: 'skill-proxy', deck: `${strongId} vs ${weakId}`, label, pilotA: pa, pilotB: pb, summary: summarize(res) };
  });
  for (const deckId of [strongId, weakId]) {
    const deck = getSimDeck(deckId);
    const res = runSeries({ model, rules, a: { deck: deck.cards, policy: 'balanced' }, b: { deck: deck.cards, policy: 'random' }, games, seed });
    rows.push({ model: model.id, experiment: 'skill-proxy', deck: `${deckId} mirror`, label: 'good vs random, same deck', pilotA: 'balanced', pilotB: 'random', summary: summarize(res) });
  }
  return rows;
}

/** AI style matchups on one fixed deck (isolates play style from deck contents). */
export function styleMatrix(model: StatModel, deckId: string, games: number, seed: number, rules?: Rules): MirrorRow[] {
  const deck = getSimDeck(deckId);
  const styles: PolicyId[] = ['aggressive', 'balanced', 'defensive', 'random'];
  const rows: MirrorRow[] = [];
  for (let i = 0; i < styles.length; i++) for (let j = i + 1; j < styles.length; j++) {
    const res = runSeries({ model, rules, a: { deck: deck.cards, policy: styles[i] }, b: { deck: deck.cards, policy: styles[j] }, games, seed });
    rows.push({ model: model.id, experiment: 'style-matrix', deck: deckId, label: `${styles[i]} vs ${styles[j]}`, pilotA: styles[i], pilotB: styles[j], summary: summarize(res) });
  }
  return rows;
}

/** Decks with k Units (k = 3..15) vs the Balanced deck: Starting HP and win share. */
export function unitCountSweep(model: StatModel, games: number, seed: number, rules?: Rules): { units: number; startingHp: number; summary: SeriesSummary }[] {
  const unitPool = ['kng-royal-guard', 'und-grave-knight', 'und-crypt-warden', 'inf-packhound', 'kng-null-templar', 'inf-pit-fiend', 'kng-common-knight', 'kng-archer'];
  const spellPool = ['spl-power-surge', 'spl-weakness', 'spl-aegis-ward', 'spl-stasis-field', 'spl-arcane-bolt', 'spl-giants-bane', 'spl-war-cry', 'spl-hush'];
  const balanced = getSimDeck('balanced');
  const out: { units: number; startingHp: number; summary: SeriesSummary }[] = [];
  for (let k = 3; k <= 15; k++) {
    const units = Array.from({ length: k }, (_, i) => unitPool[Math.floor(i / 2) % unitPool.length]);
    const spells = Array.from({ length: 15 - k }, (_, i) => spellPool[Math.floor(i / 2) % spellPool.length]);
    const deck = [...units, ...spells];
    const res = runSeries({ model, rules, a: { deck, policy: 'balanced' }, b: { deck: balanced.cards, policy: 'balanced' }, games, seed });
    out.push({ units: k, startingHp: startingHp(model, deck), summary: summarize(res) });
  }
  return out;
}

/** Legal random decks (8-13 Units) in a round-robin; reports each card's win share when included and its clash record. */
export function randomDeckOutliers(model: StatModel, deckCount: number, gamesPerPair: number, seed: number, rules?: Rules): { cardId: string; rarity: string; decks: number; winShareWhenIncluded: number; played: number; clashWinRate: number; tieRate: number; directDamagePerPlay: number; effectDamagePerPlay: number; healPerPlay: number }[] {
  let rng = seed >>> 0;
  const next = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const roster = [...new Set(PLAYTEST_ROSTER)];
  const units = roster.filter((id) => getCard(id).type === 'hero');
  const spells = roster.filter((id) => getCard(id).type === 'spell');
  const pick = (pool: string[], n: number) => {
    const counts = new Map<string, number>();
    const out: string[] = [];
    while (out.length < n) {
      const id = pool[Math.floor(next() * pool.length)];
      const limit = getCard(id).rarity === 'legendary' ? 1 : 2;
      if ((counts.get(id) ?? 0) >= limit) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      out.push(id);
    }
    return out;
  };
  const decks: SimDeck[] = Array.from({ length: deckCount }, (_, i) => {
    const u = 8 + Math.floor(next() * 6);
    return { id: `rand-${i}`, label: `Random ${i}`, group: 'study', pilot: 'balanced', cards: [...pick(units, u), ...pick(spells, 15 - u)] };
  });
  const cardStats = new Map<string, CardCounters>();
  const { rows } = runMatrix(model, decks, gamesPerPair, seed, { cardStats, rules });
  const standing = new Map(deckStandings(rows).map((s) => [s.deck, s.winShare]));
  const inclusion = new Map<string, { w: number; n: number }>();
  for (const deck of decks) {
    for (const id of new Set(deck.cards)) {
      const e = inclusion.get(id) ?? { w: 0, n: 0 };
      e.w += standing.get(deck.id) ?? 0.5;
      e.n += 1;
      inclusion.set(id, e);
    }
  }
  return roster.map((id) => {
    const c = cardStats.get(id) ?? { played: 0, clashWins: 0, clashLosses: 0, clashTies: 0, directDamage: 0, effectDamage: 0, heal: 0 };
    const e = inclusion.get(id) ?? { w: 0, n: 0 };
    const clashes = c.clashWins + c.clashLosses + c.clashTies;
    return {
      cardId: id,
      rarity: getCard(id).rarity,
      decks: e.n,
      winShareWhenIncluded: r3(e.n ? e.w / e.n : 0),
      played: c.played,
      clashWinRate: r3(clashes ? c.clashWins / clashes : 0),
      tieRate: r3(clashes ? c.clashTies / clashes : 0),
      directDamagePerPlay: r1(c.played ? c.directDamage / c.played : 0),
      effectDamagePerPlay: r1(c.played ? c.effectDamage / c.played : 0),
      healPerPlay: r1(c.played ? c.heal / c.played : 0),
    };
  }).sort((x, y) => y.winShareWhenIncluded - x.winShareWhenIncluded);
}

export { STAT_MODELS, getStatModel, scaledModel };
