import { choosePlays } from './ai.js';
import { withCardOverrides } from './cardSource.js';
import { type MatchResult, type PolicyId, type SideIndex, type SideSetup, playMatch, startingHp } from './engine.js';
import { mean, quantile } from './experiments.js';
import type { OutlierVariant } from './outliers.js';
import type { StatModel } from './statModels.js';

// Thread D study runner: a round-robin over a deck field under one outlier variant, keeping the per-side
// counters the shared experiments drop (Graveyard returns, permanent growth, tokens). Deterministic per seed.

export interface FieldDeck {
  id: string;
  pilot: PolicyId;
  cards: string[];
}

export interface DeckOutlierStats {
  variant: string;
  deck: string;
  startingHp: number;
  games: number;
  winShare: number;
  returnsPerMatch: number;
  peakGainMean: number;
  peakGainMax: number;
  /** Share of matches where one of this deck's Units gained 90+ ATK permanently. */
  bigGrowthRate: number;
  growthClippedPerMatch: number;
  tokensSummonedPerMatch: number;
  tokenClashesPerMatch: number;
  tokensFadedPerMatch: number;
}

export interface PairShare {
  variant: string;
  deckA: string;
  deckB: string;
  winShareA: number;
  drawRate: number;
}

export interface FieldSummary {
  variant: string;
  games: number;
  roundsMean: number;
  roundsMedian: number;
  roundsP90: number;
  roundsMax: number;
  drawRate: number;
  stallRate: number;
  directHitsPerMatch: number;
  returnsPerMatch: number;
  tokensSummonedPerMatch: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

interface Acc {
  w: number;
  n: number;
  returns: number[];
  peak: number[];
  clipped: number;
  summoned: number;
  tokenClashes: number;
  faded: number;
}

export function fieldStudy(model: StatModel, variant: OutlierVariant, decks: FieldDeck[], gamesPerPair: number, seed: number): { decks: DeckOutlierStats[]; pairs: PairShare[]; summary: FieldSummary } {
  return withCardOverrides(variant.cards, () => {
    const acc = new Map<string, Acc>(decks.map((d) => [d.id, { w: 0, n: 0, returns: [], peak: [], clipped: 0, summoned: 0, tokenClashes: 0, faded: 0 }]));
    const pairs: PairShare[] = [];
    const rounds: number[] = [];
    let draws = 0;
    let stalls = 0;
    let directHits = 0;
    let returns = 0;
    let summoned = 0;
    for (let i = 0; i < decks.length; i++) {
      for (let j = i + 1; j < decks.length; j++) {
        const a = decks[i];
        const b = decks[j];
        let shareA = 0;
        let pairDraws = 0;
        for (let g = 0; g < gamesPerPair; g++) {
          const aFirst = g % 2 === 0;
          const sa: SideSetup = { deck: a.cards, policy: a.pilot };
          const sb: SideSetup = { deck: b.cards, policy: b.pilot };
          const m: MatchResult = playMatch({ model, rules: variant.rules, sides: aFirst ? [sa, sb] : [sb, sa], seed: seed + i * 1_000_003 + j * 10_007 + g * 7919 }, choosePlays);
          const seatA: SideIndex = aFirst ? 0 : 1;
          const seatB: SideIndex = aFirst ? 1 : 0;
          const scoreA = m.winner === null ? 0.5 : m.winner === seatA ? 1 : 0;
          shareA += scoreA;
          if (m.winner === null) {
            pairDraws++;
            draws++;
          }
          if (m.endReason !== 'hp') stalls++;
          rounds.push(m.rounds);
          directHits += m.totals[0].directHits + m.totals[1].directHits;
          for (const [deck, seat, score] of [[a, seatA, scoreA], [b, seatB, 1 - scoreA]] as const) {
            const e = acc.get(deck.id)!;
            const t = m.totals[seat];
            e.w += score;
            e.n++;
            e.returns.push(t.returns);
            e.peak.push(t.peakGain);
            e.clipped += t.growthClipped;
            e.summoned += t.tokensSummoned;
            e.tokenClashes += t.tokenClashes;
            e.faded += t.tokensFaded;
            returns += t.returns;
            summoned += t.tokensSummoned;
          }
        }
        pairs.push({ variant: variant.id, deckA: a.id, deckB: b.id, winShareA: r3(shareA / gamesPerPair), drawRate: r3(pairDraws / gamesPerPair) });
      }
    }
    const games = rounds.length;
    const deckRows = decks.map((d): DeckOutlierStats => {
      const e = acc.get(d.id)!;
      return {
        variant: variant.id,
        deck: d.id,
        startingHp: startingHp(model, d.cards),
        games: e.n,
        winShare: r3(e.w / Math.max(1, e.n)),
        returnsPerMatch: r1(mean(e.returns)),
        peakGainMean: r1(mean(e.peak)),
        peakGainMax: Math.max(0, ...e.peak),
        bigGrowthRate: r3(e.peak.filter((p) => p >= 90).length / Math.max(1, e.n)),
        growthClippedPerMatch: r1(e.clipped / Math.max(1, e.n)),
        tokensSummonedPerMatch: r1(e.summoned / Math.max(1, e.n)),
        tokenClashesPerMatch: r1(e.tokenClashes / Math.max(1, e.n)),
        tokensFadedPerMatch: r1(e.faded / Math.max(1, e.n)),
      };
    });
    return {
      decks: deckRows,
      pairs,
      summary: {
        variant: variant.id,
        games,
        roundsMean: r1(mean(rounds)),
        roundsMedian: quantile(rounds, 0.5),
        roundsP90: quantile(rounds, 0.9),
        roundsMax: Math.max(...rounds),
        drawRate: r3(draws / games),
        stallRate: r3(stalls / games),
        directHitsPerMatch: r1(directHits / games),
        returnsPerMatch: r1(returns / games),
        tokensSummonedPerMatch: r1(summoned / games),
      },
    };
  });
}
