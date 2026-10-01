import type { MatchStats } from '../game/engine/stats';
import type { XpGrantResult } from '../game/progression/types';
import { XpSummary } from './XpSummary';
import { useBattleCardDisplay } from './combatDisplay';
import { legacyAtk } from '../game/cards/cardPresentation';
import { ATK_PER_POWER } from '../game/cardCombat/stats';

export interface FriendlyRematchActions {
  onRematch: () => void;
  onLeave: () => void;
  /** True once this side has requested a rematch and is waiting for the other side to also request one. */
  waitingForOpponent: boolean;
}

export function MatchSummary({
  stats,
  xp,
  gold = 0,
  onPlayAgain,
  onExit,
  friendlyRematch,
}: {
  stats: MatchStats;
  xp?: XpGrantResult | null;
  gold?: number;
  onPlayAgain: () => void;
  onExit: () => void;
  /** Present only for a Friendly Battle match - swaps "Play again"/"Back to menu" for room-aware Rematch/Leave, per "no silent restart, both players must agree". */
  friendlyRematch?: FriendlyRematchActions;
}) {
  const title = stats.winner === 'player' ? 'You win' : stats.winner === 'enemy' ? 'You lose' : 'Draw';
  // Unit numbers are ATK in every mode: a legacy battle's Power stats show the ATK they read as (cardPresentation.ts
  // legacyAtk), as its cards did. A lost clash costs Clash Damage: the ATK difference in card combat, a legacy battle's
  // own HP amount otherwise.
  const cardCombat = useBattleCardDisplay()?.rules === 'card';
  const maxAtk = cardCombat ? stats.maxPowerReached : legacyAtk(stats.maxPowerReached);
  const atkScale = cardCombat ? 1 : ATK_PER_POWER;
  return (
    <div className="summary-overlay">
      <div className="summary-card">
        <h2>{title}</h2>
        <div className="subtitle">
          {stats.playerDeckLabel} vs {stats.enemyDeckLabel} - {stats.roundsPlayed} rounds - final HP: you {stats.finalPlayerHp}, enemy {stats.finalEnemyHp}
        </div>
        <XpSummary xp={xp ?? null} gold={gold} />
        <div className="summary-stats">
          <span className="k">Rounds played</span>
          <span className="v">{stats.roundsPlayed}</span>
          <span className="k">Total direct damage</span>
          <span className="v">{stats.totalDirectDamage}</span>
          <span className="k">Total Clash Damage</span>
          <span className="v">{cardCombat ? stats.totalClashDamage : stats.totalOverflowDamage}</span>
          <span className="k">Cards drawn</span>
          <span className="v">{stats.cardsDrawn}</span>
          <span className="k">Cards played</span>
          <span className="v">{stats.cardsPlayed}</span>
          <span className="k">Units played</span>
          <span className="v">{stats.heroesPlayed}</span>
          <span className="k">Spells played</span>
          <span className="v">{stats.spellsPlayed}</span>
          <span className="k">Continuous Spells played</span>
          <span className="v">{stats.continuousSpellsPlayed}</span>
          <span className="k">Units defeated</span>
          <span className="v">{stats.heroesDestroyed}</span>
          <span className="k">Units revived</span>
          <span className="v">{stats.heroesRevived}</span>
          <span className="k">Avg rounds a unit stays</span>
          <span className="v">{stats.avgRoundsHeroStaysOnBoard}</span>
          <span className="k">Max ATK reached</span>
          <span className="v">{maxAtk}</span>
          <span className="k">Permanent ATK gained</span>
          <span className="v">{stats.permanentPowerGained * atkScale}</span>
          <span className="k">Temporary ATK changes</span>
          <span className="v">{stats.temporaryPowerModified * atkScale}</span>
          <span className="k">Graveyard size (you / enemy)</span>
          <span className="v">
            {stats.graveyardSizePlayer} / {stats.graveyardSizeEnemy}
          </span>
          <span className="k">Full-board moments</span>
          <span className="v">{stats.fullBoardStates}</span>
        </div>
        <div className="summary-actions">
          {friendlyRematch ? (
            <>
              <button type="button" onClick={friendlyRematch.onRematch} disabled={friendlyRematch.waitingForOpponent}>
                {friendlyRematch.waitingForOpponent ? 'Waiting for opponent…' : 'Rematch'}
              </button>
              <button type="button" onClick={friendlyRematch.onLeave}>
                Leave
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onPlayAgain}>
                Play again
              </button>
              <button type="button" onClick={onExit}>
                Back to menu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
