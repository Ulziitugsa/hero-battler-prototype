import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { MatchStats } from '../game/engine/stats';
import type { XpGrantResult } from '../game/progression/types';
import { useBattleCardDisplay } from './combatDisplay';
import { legacyAtk } from '../game/cards/cardPresentation';
import { ATK_PER_POWER } from '../game/cardCombat/stats';
import { Icon } from './Icon';
import { GoldAmount } from './GoldIcon';
import { GemAmount } from './GemIcon';
import { BalanceStrip } from './feedback/BalanceStrip';
import { flyRewards } from './feedback/rewardBus';
import { finishingBlowText, xpBar, type FinishingBlow, type MissionAdvance, type Outcome, type RankedChange } from './battle/battleOutcome';
import '../styles/battleResult.css';

export interface FriendlyRematchActions {
  onRematch: () => void;
  onLeave: () => void;
  /** True once this side has requested a rematch and is waiting for the other side to also request one. */
  waitingForOpponent: boolean;
}

/** What a mode adds to its result screen: Ranked's rating change. */
export interface BattleResultExtras {
  ranked?: RankedChange;
}

/** The result card waits this long after the last beat of the round, so the final blow lands before it covers the board. */
export const RESULT_ENTER_DELAY_MS = 650;
/** Rewards leave for their counters once the card has settled. */
const REWARD_FLIGHT_DELAY_MS = RESULT_ENTER_DELAY_MS + 650;

const TITLE: Record<Outcome, string> = { victory: 'Victory', defeat: 'Defeat', draw: 'Draw' };
const KICKER: Record<string, string> = { quick: 'Quick Battle', ranked: 'Ranked Trial', friendly: 'Friendly Battle' };
const CREST: Record<Outcome, 'trophy' | 'warning' | 'battle'> = { victory: 'trophy', defeat: 'warning', draw: 'battle' };

/**
 * The end of a Quick, Ranked or Friendly battle: who won and how (the finishing blow, both sides' final HP), what it
 * earned (XP toward the next Account Level, Gold flying into the balance, a Ranked rating change) and what it moved
 * forward (missions). Everything shown is read from the match log and the stores the match already updated; the full
 * statistics table is kept under "Match details". Campaign battles keep their own result sheet on the map.
 */
export function MatchSummary({
  stats,
  outcome,
  mode = 'quick',
  xp,
  gold = 0,
  finish = null,
  hp,
  missions = [],
  extras = {},
  onPlayAgain,
  onExit,
  friendlyRematch,
}: {
  stats: MatchStats;
  outcome: Outcome;
  mode?: string;
  xp?: XpGrantResult | null;
  gold?: number;
  finish?: FinishingBlow | null;
  hp: { player: number; playerMax: number; enemy: number; enemyMax: number };
  missions?: MissionAdvance[];
  extras?: BattleResultExtras;
  /** Absent when the mode has no rematch from here (Ranked returns to its own screen to pick the next rival). */
  onPlayAgain?: () => void;
  onExit: () => void;
  /** Present only for a Friendly Battle match - swaps "Play again"/"Back to menu" for room-aware Rematch/Leave, per "no silent restart, both players must agree". */
  friendlyRematch?: FriendlyRematchActions;
}) {
  // Unit numbers are ATK in every mode: a legacy battle's Power stats show the ATK they read as (cardPresentation.ts
  // legacyAtk), as its cards did. A lost clash costs Clash Damage: the ATK difference in card combat, a legacy battle's
  // own HP amount otherwise.
  const cardCombat = useBattleCardDisplay()?.rules === 'card';
  const maxAtk = cardCombat ? stats.maxPowerReached : legacyAtk(stats.maxPowerReached);
  const atkScale = cardCombat ? 1 : ATK_PER_POWER;
  const gems = xp?.gemsGained ?? 0;
  const bar = xp && xp.gained > 0 ? xpBar(xp) : null;
  const ranked = extras.ranked;
  const rewardsRef = useRef<HTMLDivElement>(null);

  // Gold and Gems were granted the moment the match ended; they leave the rewards row for the balance strip once the
  // card has settled (the strip's counters open on the balance before them and roll up as they land). A layout effect,
  // so the landing time is known before the counters schedule their roll.
  useLayoutEffect(() => {
    if (rewardsRef.current && (gold > 0 || gems > 0)) flyRewards(rewardsRef.current, { gold, gems }, { delayMs: REWARD_FLIGHT_DELAY_MS });
    // Once, for the match this screen opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (value: number, max: number) => `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%`;
  const finishLabel = outcome === 'victory' ? 'Finishing blow' : 'What ended it';

  return (
    <div className="br-backdrop" data-outcome={outcome} style={{ ['--br-delay' as string]: `${RESULT_ENTER_DELAY_MS}ms` } as CSSProperties}>
      <div className="br-card" data-outcome={outcome} role="dialog" aria-modal="true" aria-labelledby="br-title">
        {(gold > 0 || gems > 0) && (
          <div className="br-balances">
            <BalanceStrip arriving={{ gold, gems }} />
          </div>
        )}
        <div className="br-crest" aria-hidden="true">
          <span className="br-crest-rays" />
          <span className="br-crest-disc">
            <Icon name={CREST[outcome]} size={30} />
          </span>
        </div>
        <span className="br-kicker">{KICKER[mode] ?? 'Battle'}</span>
        <h2 id="br-title" className="br-title">
          {TITLE[outcome]}
        </h2>
        <p className="br-sub">
          {stats.playerDeckLabel} vs {stats.enemyDeckLabel} · {stats.roundsPlayed} {stats.roundsPlayed === 1 ? 'round' : 'rounds'}
        </p>

        <div className="br-body">
          {finish && (
            <div className="br-finish br-row" style={{ ['--i' as string]: 0 }}>
              <span className="br-label">
                {finishLabel} · Round {finish.round}
              </span>
              <span className="br-finish-line">
                {finishingBlowText(finish)} <b>−{finish.amount.toLocaleString('en-US')}</b>
              </span>
            </div>
          )}

          <div className="br-duel br-row" style={{ ['--i' as string]: 1 }} aria-label={`Final HP: you ${hp.player} of ${hp.playerMax}, enemy ${hp.enemy} of ${hp.enemyMax}`}>
            {(
              [
                ['You', hp.player, hp.playerMax, 'player'],
                ['Enemy', hp.enemy, hp.enemyMax, 'enemy'],
              ] as const
            ).map(([who, value, max, side]) => (
              <div key={side} className={`br-hp ${side} ${value <= 0 ? 'out' : ''}`}>
                <span className="br-hp-who">{who}</span>
                <span className="br-hp-bar" aria-hidden="true">
                  <span style={{ width: pct(value, max) }} />
                </span>
                <span className="br-hp-num">
                  {value.toLocaleString('en-US')}
                  <small> / {max.toLocaleString('en-US')}</small>
                </span>
              </div>
            ))}
          </div>

          {(bar || gold > 0 || gems > 0) && (
            <div className="br-rewards br-row" ref={rewardsRef} style={{ ['--i' as string]: 2 }}>
              <span className="br-label">Rewards</span>
              <div className="br-reward-chips">
                {xp && xp.gained > 0 && (
                  <span className="xp-gain">
                    <Icon name="power" size={13} />+{xp.gained} XP
                  </span>
                )}
                {gold > 0 && <GoldAmount amount={gold} />}
                {gems > 0 && <GemAmount amount={gems} />}
              </div>
              {bar && (
                <div className={`br-level ${bar.levelUp ? 'up' : ''}`}>
                  <span className="br-level-name">{bar.levelUp ? `Level up · Account Level ${bar.level}` : `Account Level ${bar.level}`}</span>
                  <span
                    className="br-meter"
                    role="progressbar"
                    aria-label="XP toward the next Account Level"
                    aria-valuemin={0}
                    aria-valuemax={bar.max}
                    aria-valuenow={bar.to}
                    style={{ ['--from' as string]: pct(bar.from, bar.max), ['--to' as string]: pct(bar.to, bar.max) } as CSSProperties}
                  >
                    <span />
                  </span>
                  <span className="br-level-num">
                    {bar.to} / {bar.max} XP
                  </span>
                </div>
              )}
            </div>
          )}

          {ranked && (
            <div className={`br-ranked br-row ${ranked.promoted ? 'promoted' : ''}`} style={{ ['--i' as string]: 2 }}>
              <span className="br-label">Ranked rating</span>
              <div className="br-ranked-line">
                <strong className="br-rating">{ranked.after}</strong>
                <span className={`br-delta ${ranked.delta > 0 ? 'up' : ranked.delta < 0 ? 'down' : ''}`}>
                  {ranked.delta > 0 ? `+${ranked.delta}` : ranked.delta < 0 ? `−${-ranked.delta}` : '±0'}
                </span>
                <span className="br-division">
                  {ranked.division} {ranked.tier}
                </span>
              </div>
              <span className="br-meter" aria-hidden="true" style={{ ['--from' as string]: `${ranked.fromProgress}%`, ['--to' as string]: `${ranked.progress}%` } as CSSProperties}>
                <span />
              </span>
              <span className="br-note">
                {ranked.promoted ? `Promoted to ${ranked.division}` : ranked.demoted ? `Down to ${ranked.division}` : ranked.toNext === null ? 'Top division reached' : `${ranked.toNext} rating to ${ranked.nextDivision}`}
                {ranked.rewardReady && <b className="br-ready mw-pop-in"> · Division reward ready</b>}
              </span>
            </div>
          )}

          {missions.length > 0 && (
            <div className="br-missions br-row" style={{ ['--i' as string]: 3 }}>
              <span className="br-label">Missions</span>
              {missions.slice(0, 3).map((m) => (
                <div key={m.id} className={`br-mission ${m.completedNow ? 'done' : ''}`}>
                  <span className="br-mission-title">{m.title}</span>
                  {m.completedNow ? (
                    <span className="br-ready mw-pop-in">Ready to claim</span>
                  ) : (
                    <span className="br-mission-count">
                      {m.count} / {m.target}
                    </span>
                  )}
                  <span className="br-meter thin" aria-hidden="true" style={{ ['--from' as string]: pct(m.from, m.target), ['--to' as string]: pct(m.count, m.target) } as CSSProperties}>
                    <span />
                  </span>
                </div>
              ))}
            </div>
          )}

          <details className="br-details br-row" style={{ ['--i' as string]: 4 }}>
            <summary>Match details</summary>
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
          </details>
        </div>

        <div className="br-actions">
          {friendlyRematch ? (
            <>
              <button type="button" className="br-primary" onClick={friendlyRematch.onRematch} disabled={friendlyRematch.waitingForOpponent}>
                {friendlyRematch.waitingForOpponent ? 'Waiting for opponent…' : 'Rematch'}
              </button>
              <button type="button" className="br-secondary" onClick={friendlyRematch.onLeave}>
                Leave
              </button>
            </>
          ) : onPlayAgain ? (
            <>
              <button type="button" className="br-primary" onClick={onPlayAgain}>
                Play again
              </button>
              <button type="button" className="br-secondary" onClick={onExit}>
                Back to menu
              </button>
            </>
          ) : (
            <button type="button" className="br-primary" onClick={onExit}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
