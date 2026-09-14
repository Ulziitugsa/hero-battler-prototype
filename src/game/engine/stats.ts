import type { GameEvent, LaneId, Side } from '../types';
import { getCard } from '../cards';

export interface CardPlayStat {
  drawn: number;
  played: number;
  /** 1 if the side that played this card won the match, else 0 - summed across many saved matches by the Playtest Stats screen. */
  winsWhenPlayed: number;
}

export interface MatchStats {
  playerDeckLabel: string;
  enemyDeckLabel: string;
  roundsPlayed: number;
  winner: Side | 'draw' | null;
  finalPlayerHp: number;
  finalEnemyHp: number;
  totalDirectDamage: number;
  /** Combat overflow (winner Power - loser Power), tracked separately from totalDirectDamage since it
   * comes from a different event (OVERFLOW_DAMAGE) and is now a major share of match damage. */
  totalOverflowDamage: number;
  cardsDrawn: number;
  cardsPlayed: number;
  heroesPlayed: number;
  spellsPlayed: number;
  continuousSpellsPlayed: number;
  heroesDestroyed: number;
  heroesRevived: number;
  avgRoundsHeroStaysOnBoard: number;
  maxPowerReached: number;
  permanentPowerGained: number;
  temporaryPowerModified: number;
  graveyardSizePlayer: number;
  graveyardSizeEnemy: number;
  fullBoardStates: number;
  /** Per-card counts for this one match - the Playtest Stats screen sums these across saved matches. */
  perCard: Record<string, CardPlayStat>;
}

/** Derives end-of-match stats purely from the accumulated event log plus the final Graveyard/HP totals. */
export function computeMatchStats(
  events: GameEvent[],
  finalPlayerHp: number,
  finalEnemyHp: number,
  finalGraveyardSizes: { player: number; enemy: number },
  deckLabels: { player: string; enemy: string } = { player: 'Unknown', enemy: 'Unknown' },
): MatchStats {
  let roundsPlayed = 0;
  let winner: Side | 'draw' | null = null;
  let totalDirectDamage = 0;
  let totalOverflowDamage = 0;
  let heroesPlayed = 0;
  let spellsPlayed = 0;
  let continuousSpellsPlayed = 0;
  let heroesDestroyed = 0;
  let heroesRevived = 0;
  let maxPowerReached = 0;
  let permanentPowerGained = 0;
  let temporaryPowerModified = 0;
  let fullBoardStates = 0;
  let cardsDrawn = 0;

  let currentRound = 1;
  const bornRound = new Map<string, number>(); // instanceId -> round it entered play
  let lifespanTotal = 0;
  let lifespanCount = 0;

  const occupiedLanes: Record<Side, Set<LaneId>> = { player: new Set(), enemy: new Set() };

  // Per-side, per-card raw counts, folded into `perCard` (and win credit) once we know the winner.
  const drawnBySide: Record<Side, Map<string, number>> = { player: new Map(), enemy: new Map() };
  const playedBySide: Record<Side, Map<string, number>> = { player: new Map(), enemy: new Map() };
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

  for (const event of events) {
    switch (event.type) {
      case 'ROUND_START':
        currentRound = event.round;
        break;
      case 'ROUND_END':
        roundsPlayed += 1;
        break;
      case 'DRAW':
        if (!event.fizzled && event.cardId) {
          cardsDrawn += 1;
          bump(drawnBySide[event.side], event.cardId);
        }
        break;
      case 'ON_PLAY':
        if (event.zone === 'hero') {
          heroesPlayed += 1;
          bornRound.set(event.instanceId, currentRound);
          maxPowerReached = Math.max(maxPowerReached, getCard(event.cardId).power ?? 0);
          occupiedLanes[event.side].add(event.lane);
          if (occupiedLanes[event.side].size === 3) fullBoardStates += 1;
        } else {
          continuousSpellsPlayed += 1;
        }
        bump(playedBySide[event.side], event.cardId);
        break;
      case 'SPELL_RESOLVED':
        if (!event.fizzled) {
          spellsPlayed += 1;
          bump(playedBySide[event.side], event.cardId);
        }
        break;
      case 'HERO_DESTROYED': {
        heroesDestroyed += 1;
        const born = bornRound.get(event.instanceId);
        if (born !== undefined) {
          lifespanTotal += currentRound - born + 1;
          lifespanCount += 1;
        }
        occupiedLanes[event.side].delete(event.lane);
        break;
      }
      case 'REVIVED':
        heroesRevived += 1;
        bornRound.set(event.instanceId, currentRound);
        maxPowerReached = Math.max(maxPowerReached, getCard(event.cardId).power ?? 0);
        occupiedLanes[event.side].add(event.lane);
        if (occupiedLanes[event.side].size === 3) fullBoardStates += 1;
        break;
      case 'POWER_CHANGED':
        maxPowerReached = Math.max(maxPowerReached, event.to);
        if (event.permanent) {
          if (event.to > event.from) permanentPowerGained += event.to - event.from;
        } else {
          temporaryPowerModified += Math.abs(event.to - event.from);
        }
        break;
      case 'DIRECT_DAMAGE':
        totalDirectDamage += event.amount;
        break;
      case 'OVERFLOW_DAMAGE':
        totalOverflowDamage += event.amount;
        break;
      case 'MATCH_END':
        winner = event.winner;
        break;
      default:
        break;
    }
  }

  spellsPlayed += continuousSpellsPlayed;

  const perCard: Record<string, CardPlayStat> = {};
  const ensure = (cardId: string) => {
    if (!perCard[cardId]) perCard[cardId] = { drawn: 0, played: 0, winsWhenPlayed: 0 };
    return perCard[cardId];
  };
  for (const side of ['player', 'enemy'] as Side[]) {
    for (const [cardId, count] of drawnBySide[side]) ensure(cardId).drawn += count;
    for (const [cardId, count] of playedBySide[side]) {
      const stat = ensure(cardId);
      stat.played += count;
      if (winner === side) stat.winsWhenPlayed += 1;
    }
  }

  return {
    playerDeckLabel: deckLabels.player,
    enemyDeckLabel: deckLabels.enemy,
    roundsPlayed,
    winner,
    finalPlayerHp,
    finalEnemyHp,
    totalDirectDamage,
    totalOverflowDamage,
    cardsDrawn,
    cardsPlayed: heroesPlayed + spellsPlayed,
    heroesPlayed,
    spellsPlayed,
    continuousSpellsPlayed,
    heroesDestroyed,
    heroesRevived,
    avgRoundsHeroStaysOnBoard: lifespanCount > 0 ? Math.round((lifespanTotal / lifespanCount) * 10) / 10 : 0,
    maxPowerReached,
    permanentPowerGained,
    temporaryPowerModified,
    graveyardSizePlayer: finalGraveyardSizes.player,
    graveyardSizeEnemy: finalGraveyardSizes.enemy,
    fullBoardStates,
    perCard,
  };
}
