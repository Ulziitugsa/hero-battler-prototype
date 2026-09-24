import { useEffect, useState, type CSSProperties } from 'react';
import type { DeployPlay, GameEvent, GameState, HandCard as HandCardModel, HeroInstance, LaneId, MasteryLoadout, PlayerAction, SpellZoneInstance } from '../game/types';
import { LANES } from '../game/types';
import { getCard } from '../game/cards';
import { createMatch } from '../game/engine/match';
import { beginRound, resolveRound, spellHasAValidTarget, validateDeployment } from '../game/engine/resolveRound';
import { withEffectivePowers } from '../game/engine/power';
import { makeSeed } from '../game/engine/rng';
import { chooseAiAction } from '../game/ai/simpleAI';
import { computeMatchStats, type MatchStats } from '../game/engine/stats';
import { saveRecentMatch } from '../game/engine/localMatchHistory';
import { SideHeader } from '../components/SideHeader';
import { Battlefield } from '../components/Battlefield';
import { OpponentHand } from '../components/OpponentHand';
import { Hand } from '../components/Hand';
import { CardDetail } from '../components/CardDetail';
import { GraveyardSheet } from '../components/GraveyardSheet';
import { DebugPanel } from '../components/DebugPanel';
import { TopControls } from '../components/TopControls';
import { MatchSummary } from '../components/MatchSummary';
import { MasteryBadge } from '../components/MasteryBadge';
import { masteryToastFrom, type MasteryToast } from '../components/masteryToast';
import { grantQuickBattleXp } from '../game/progression/rewards';
import type { XpGrantResult } from '../game/progression/types';
import { grantGold } from '../game/economy/economy';
import { quickBattleGold } from '../game/economy/rewards';
import { battlePowerBonusForLevel } from '../game/heroLevel/config';
import { Icon } from '../components/Icon';
import { useAnimationController } from '../components/animation/useAnimationController';
import { resolveDuration } from '../components/animation/timing';
import type { AnimationSpeed } from '../components/animation/types';
import type { FriendlyRematchActions } from '../components/MatchSummary';
import type { RemoteOpponentController } from '../net/friendlyTypes';

export type { AnimationSpeed };
type Phase = 'DEPLOY' | 'REVEALING' | 'WAITING_FOR_OPPONENT' | 'MATCH_END';

export interface GamePageProps {
  playerDeck: string[];
  enemyDeck: string[];
  playerDeckLabel: string;
  enemyDeckLabel: string;
  onExit: () => void;
  /** The player's equipped Mastery, captured when the battle was set up. Omit/null for none. */
  playerMastery?: MasteryLoadout | null;
  /** The player's Ascension ranks for the cards in their deck (cardId -> rank), captured at setup. Omit for all Base. */
  playerAscensions?: Record<string, number>;
  /** The player's Hero Levels for the cards in their deck (cardId -> level), captured at setup. Omit for all Level 1. */
  playerHeroLevels?: Record<string, number>;
  /** Overrides the match's starting HP (both sides) - used by Campaign's challenge nodes. Omit for the default STARTING_HP. */
  startingHp?: number;
  /** Fires once, the instant this match reaches MATCH_END - before the player dismisses the summary
   * screen. Campaign uses this to record node progress independent of how/when the player exits;
   * Quick Battle never passes it, so it never touches Campaign state. */
  onMatchEnd?: (status: GameState['status'], stats: MatchStats, events: GameEvent[]) => void;
  /**
   * Friendly Battle only (src/net/useFriendlyRoom.ts). When set, replaces the local AI opponent with a
   * real remote player: handleFight submits to and awaits this controller instead of calling
   * chooseAiAction+resolveRound locally, and initialState/initialEvents (below) are required alongside it
   * so this component never builds its own AI match. GamePage never knows or cares whether it's rendering
   * for the room's host or guest - that's handled entirely by the net layer before anything reaches here.
   */
  remoteOpponent?: RemoteOpponentController;
  /** Required together with remoteOpponent - the match's starting state, already built server-side (api/create-match.ts) and oriented for this viewer. */
  initialState?: GameState;
  initialEvents?: GameEvent[];
  /** Friendly Battle only - swaps MatchSummary's "Play again"/"Back to menu" for room-aware Rematch/Leave. */
  friendlyRematch?: FriendlyRematchActions;
}

/** Overlays this round's not-yet-locked plays onto the real board, Deploy-phase display only. A
 * staged one-time Spell gets the same floating preview treatment as a Hero or Continuous Spell -
 * it renders right where it will resolve (Battle Screen v8) rather than in a separate pending list. */
function buildPreviewZones(
  heroZones: GameState['player']['heroZones'],
  spellZones: GameState['player']['spellZones'],
  pendingPlays: DeployPlay[],
  heroLevels: Record<string, number> = {},
): { heroZones: GameState['player']['heroZones']; spellZones: GameState['player']['spellZones'] } {
  const previewHero = { ...heroZones };
  const previewSpell = { ...spellZones };
  for (const play of pendingPlays) {
    const card = getCard(play.cardId);
    if (card.type === 'hero') {
      const pendingHero: HeroInstance = {
        instanceId: `pending-${play.handId}`,
        cardId: play.cardId,
        faction: card.faction,
        name: card.name,
        shortName: card.shortName,
        // Matches makeHeroInstance's own Battle Power calculation, so the Deploy-phase preview never
        // shows a number Reveal is about to contradict for a levelled Hero.
        power: (card.power ?? 0) + battlePowerBonusForLevel(heroLevels[play.cardId] ?? 1),
        tempPower: 0,
        shielded: false,
        silenced: false,
        usedThisRound: false,
      };
      previewHero[play.lane] = pendingHero;
    } else {
      const pendingSpell: SpellZoneInstance = {
        instanceId: `pending-${play.handId}`,
        cardId: play.cardId,
        faction: card.faction,
        name: card.name,
        shortName: card.shortName,
        usedThisRound: false,
      };
      previewSpell[play.lane] = pendingSpell;
    }
  }
  return { heroZones: previewHero, spellZones: previewSpell };
}

export function GamePage({ playerDeck, enemyDeck, playerDeckLabel, enemyDeckLabel, onExit, playerMastery, playerAscensions, playerHeroLevels, startingHp, onMatchEnd, remoteOpponent, initialState, initialEvents, friendlyRematch }: GamePageProps) {
  function buildMatch(matchSeed: number) {
    return createMatch({
      seed: matchSeed,
      playerDeck,
      enemyDeck,
      startingHp,
      masteries: playerMastery ? { player: playerMastery } : undefined,
      ascensions: playerAscensions && Object.keys(playerAscensions).length > 0 ? { player: playerAscensions } : undefined,
      heroLevels: playerHeroLevels && Object.keys(playerHeroLevels).length > 0 ? { player: playerHeroLevels } : undefined,
    });
  }

  const [seed, setSeed] = useState(() => makeSeed());
  const [gameState, setGameState] = useState<GameState>(() => initialState ?? buildMatch(seed).state);
  const [fullLog, setFullLog] = useState<GameEvent[]>(() => initialEvents ?? buildMatch(seed).events);
  const [phase, setPhase] = useState<Phase>(() => initialState && initialState.status !== 'IN_PROGRESS' ? 'MATCH_END' : 'DEPLOY');
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>('1x');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [pendingPlays, setPendingPlays] = useState<DeployPlay[]>([]);
  const [selectedHand, setSelectedHand] = useState<HandCardModel | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);

  const [revealEvents, setRevealEvents] = useState<GameEvent[]>([]);
  const [baseStateForReveal, setBaseStateForReveal] = useState<GameState | null>(null);
  const [pendingNextState, setPendingNextState] = useState<GameState | null>(null);
  const [lastAiAction, setLastAiAction] = useState<PlayerAction | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(() => initialState && initialState.status !== 'IN_PROGRESS' ? computeMatchStats(initialEvents ?? [], initialState.player.hp, initialState.enemy.hp, { player: initialState.player.graveyard.length, enemy: initialState.enemy.graveyard.length }, { player: playerDeckLabel ?? 'You', enemy: enemyDeckLabel ?? 'Friend' }) : null);
  const [mobileDebugOpen, setMobileDebugOpen] = useState(false);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  // Presentation-only: the last Mastery trigger (label shown briefly) and the Quick Battle XP result.
  const [masteryToast, setMasteryToast] = useState<MasteryToast | null>(null);
  const [xpResult, setXpResult] = useState<XpGrantResult | null>(null);
  const [goldResult, setGoldResult] = useState(0);

  useEffect(() => {
    if (!masteryToast) return;
    const t = window.setTimeout(() => setMasteryToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [masteryToast]);

  // The presentation layer: plays revealEvents back as a sequence of animation beats. The engine
  // itself (resolveRound, above) already fully decided the round synchronously - this hook only
  // explains it visually, on its own timer, never mutating game state. See components/animation.
  const isRevealing = phase === 'REVEALING';
  const anim = useAnimationController({ events: revealEvents, baseState: baseStateForReveal ?? gameState, speed: animationSpeed, active: isRevealing });

  function restartWithSeed(newSeed: number) {
    const built = buildMatch(newSeed);
    setSeed(newSeed);
    setGameState(built.state);
    setFullLog(built.events);
    setPhase('DEPLOY');
    setPendingPlays([]);
    setSelectedHand(null);
    setRevealEvents([]);
    setBaseStateForReveal(null);
    setPendingNextState(null);
    setLastAiAction(null);
    setMatchStats(null);
    setMasteryToast(null);
    setXpResult(null);
    setGoldResult(0);
  }

  // Once the animation queue finishes playing revealEvents, hand off to the next round - using the
  // engine's own pendingNextState (resolveRound's real result), never a locally-replayed
  // reconstruction, so the settled board is always byte-identical to what the engine decided.
  useEffect(() => {
    if (!isRevealing || !anim.isDone) return;
    const next = pendingNextState;
    if (!next) return;
    if (next.status !== 'IN_PROGRESS') {
      const merged = [...fullLog, ...revealEvents];
      const stats = computeMatchStats(
        merged,
        next.player.hp,
        next.enemy.hp,
        { player: next.player.graveyard.length, enemy: next.enemy.graveyard.length },
        { player: playerDeckLabel, enemy: enemyDeckLabel },
      );
      // Friendly Battle grants 0 XP/rewards and isn't tracked in local match history - it's an isolated
      // networking experiment, not a progression-affecting mode (see docs/FRIENDLY-BATTLE.md).
      if (!remoteOpponent) saveRecentMatch(seed, stats);
      setFullLog(merged);
      setMatchStats(stats);
      setGameState(next);
      setPhase('MATCH_END');
      // Quick Battle grants its small XP/Gold here; a Campaign battle grants its own inside recordBattleResult.
      if (!onMatchEnd && !remoteOpponent) {
        setXpResult(grantQuickBattleXp(next.status));
        const goldAmount = quickBattleGold(next.status === 'PLAYER_WIN' ? 'win' : next.status === 'DRAW' ? 'draw' : 'loss');
        setGoldResult(goldAmount > 0 ? grantGold(goldAmount, 'quickBattle').gained : 0);
      }
      if (onMatchEnd) {
        // A Campaign battle owns its own post-match moment - the carved StageResultSheet back on
        // the map, which already covers win/loss/rewards. Hand off straight to it instead of
        // showing this screen's plain, developer-facing MatchSummary first and making the player
        // click through two different "you won" screens in a row for the same result.
        onMatchEnd(next.status, stats, merged);
        onExit();
      }
    } else {
      const begun = beginRound(next);
      const toast = masteryToastFrom(begun.events);
      if (toast) setMasteryToast(toast);
      setFullLog([...fullLog, ...revealEvents, ...begun.events]);
      setGameState(begun.nextState);
      setPhase('DEPLOY');
    }
    setPendingNextState(null);
    setRevealEvents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRevealing, anim.isDone]);

  function handleFight() {
    if (phase !== 'DEPLOY') return;
    const localAction = { plays: pendingPlays };
    const validation = validateDeployment(gameState, 'player', localAction);
    if (!validation.legal) {
      console.warn('Blocked an illegal deployment:', validation.reason);
      return;
    }
    setPendingPlays([]);
    setSelectedHand(null);
    setSubmitError(null);

    if (remoteOpponent) {
      setPhase('WAITING_FOR_OPPONENT');
      remoteOpponent
        .submitAndAwaitRound(localAction)
        .then((outcome) => {
          if (outcome.kind === 'opponent-left') {
            setOpponentLeft(true);
            return;
          }
          setLastAiAction(null);
          setBaseStateForReveal(gameState);
          setRevealEvents(outcome.result.events);
          setPendingNextState(outcome.result.nextState);
          setPhase('REVEALING');
        })
        .catch((err) => {
          // Never leave the player stranded on "Waiting for opponent" - surface it and let them retry.
          console.error('Friendly Battle round submission failed:', err);
          setSubmitError(err instanceof Error ? err.message : 'Something went wrong submitting your action.');
          setPhase('DEPLOY');
        });
      return;
    }

    const ai = chooseAiAction(gameState, 'enemy', gameState.rngState);
    const result = resolveRound(gameState, localAction, ai.action, ai.nextRngState);
    setLastAiAction(ai.action);
    setBaseStateForReveal(gameState);
    setRevealEvents(result.events);
    setPendingNextState(result.nextState);
    setPhase('REVEALING');
  }

  const usedHandIds = new Set(pendingPlays.map((p) => p.handId));

  function selectForPlacement(hand: HandCardModel) {
    if (phase !== 'DEPLOY') return;
    setSelectedHand((prev) => (prev?.handId === hand.handId ? null : hand));
  }

  // Placement IS targeting - a single Hero/Spell click or drop commits the whole play; there is no
  // separate "choose a target" step for a normal card.
  function commitPlacement(lane: LaneId) {
    if (!selectedHand) return;
    setPendingPlays((prev) => [...prev, { handId: selectedHand.handId, cardId: selectedHand.cardId, lane }]);
    setSelectedHand(null);
  }

  function handleHeroLaneClick(lane: LaneId) {
    if (!selectedHand || phase !== 'DEPLOY') return;
    const card = getCard(selectedHand.cardId);
    if (card.type !== 'hero') return;
    if (gameState.player.heroZones[lane] !== null) return;
    if (pendingPlays.some((p) => p.lane === lane && getCard(p.cardId).type === 'hero')) return;
    commitPlacement(lane);
  }

  function handleSpellLaneClick(lane: LaneId) {
    if (!selectedHand || phase !== 'DEPLOY') return;
    const card = getCard(selectedHand.cardId);
    if (card.type !== 'spell') return;
    if (card.spellKind === 'CONTINUOUS' && gameState.player.spellZones[lane] !== null) return;
    if (pendingPlays.some((p) => p.lane === lane && getCard(p.cardId).type === 'spell')) return;
    if (!spellHasAValidTarget(gameState, 'player', card, lane)) return;
    commitPlacement(lane);
  }

  function handleRemovePending(handId: string) {
    setPendingPlays((prev) => prev.filter((p) => p.handId !== handId));
  }

  const selectedCard = selectedHand ? getCard(selectedHand.cardId) : null;

  const targetableHeroLanes =
    selectedCard && selectedCard.type === 'hero'
      ? new Set(LANES.filter((l) => gameState.player.heroZones[l] === null && !pendingPlays.some((p) => p.lane === l && getCard(p.cardId).type === 'hero')))
      : new Set<LaneId>();

  const targetableSpellLanes =
    selectedCard && selectedCard.type === 'spell'
      ? new Set(
          LANES.filter((l) => {
            if (pendingPlays.some((p) => p.lane === l && getCard(p.cardId).type === 'spell')) return false;
            if (selectedCard.spellKind === 'CONTINUOUS' && gameState.player.spellZones[l] !== null) return false;
            if (!spellHasAValidTarget(gameState, 'player', selectedCard, l)) return false;
            return true;
          }),
        )
      : new Set<LaneId>();

  const displayState = isRevealing ? anim.displayState : gameState;
  const hpFxFor = (side: 'player' | 'enemy') => anim.visuals.hpFx.find((fx) => fx.side === side) ?? null;

  const preview = phase === 'DEPLOY' ? buildPreviewZones(displayState.player.heroZones, displayState.player.spellZones, pendingPlays, playerHeroLevels) : null;

  // Tapping a chit to inspect it - like every other board interaction - is locked out while the round
  // is resolving, so a mid-animation tap can never race the animation queue or open stale card data.
  function handlePlayerChitClick(hero: HeroInstance) {
    if (isRevealing) return;
    if (hero.instanceId.startsWith('pending-')) handleRemovePending(hero.instanceId.replace('pending-', ''));
    else setInspectCardId(hero.cardId);
  }

  function handlePlayerSpellChitClick(spell: SpellZoneInstance) {
    if (isRevealing) return;
    if (spell.instanceId.startsWith('pending-')) handleRemovePending(spell.instanceId.replace('pending-', ''));
    else setInspectCardId(spell.cardId);
  }

  function handleEnemyChitClick(cardId: string) {
    if (isRevealing) return;
    setInspectCardId(cardId);
  }

  function handleDragStart(hand: HandCardModel) {
    if (phase !== 'DEPLOY') return;
    setSelectedHand(hand);
  }

  function handleDragEnd() {
    setSelectedHand(null);
  }

  // Board chits always show effective Power (base + any active Continuous Spell overlay, e.g. Battle
  // Banner) - never the raw stored value - computed fresh against whatever's currently shown,
  // preview included, so a pending Hero already reflects a Continuous Spell sitting in its lane.
  const playerZonesForDisplay = preview ? { ...displayState.player, heroZones: preview.heroZones, spellZones: preview.spellZones } : displayState.player;
  const playerBoardState = withEffectivePowers({ ...displayState, player: playerZonesForDisplay }, 'player');
  const enemyBoardState = withEffectivePowers(displayState, 'enemy');

  // Status band above the hand (Battle Screen v8 / design source of truth section 9): during
  // resolution it's a static "Resolving", never a scrolling play-by-play of each event.
  let hint: string;
  if (phase === 'WAITING_FOR_OPPONENT') hint = 'Waiting for opponent';
  else if (isRevealing) hint = 'Resolving';
  else if (pendingPlays.length > 0 && !selectedHand) hint = 'Ready to fight';
  else if (selectedCard) hint = selectedCard.type === 'hero' ? 'Tap a hero slot' : 'Tap a spell slot';
  else hint = 'Tap a card';

  // Every CSS animation keyframe reads its pace from this one variable (see global.css's "Combat
  // animations" section) - the single point where the currently-playing step's resolved duration
  // (speed setting + reduced motion, both handled in timing.ts) reaches the DOM.
  const stepMs = anim.currentStep ? resolveDuration(anim.currentStep.timingCategory, animationSpeed, anim.reducedMotion) : 300;

  return (
    <div className="app-shell">
      <div className="battle-stage" style={{ '--step-ms': `${Math.max(stepMs, 1)}ms` } as CSSProperties}>
        <div className="battle-scene">
          <div className="battle-sky" aria-hidden="true" />
          <div className="battle-terrace" aria-hidden="true" />
          <div className="battle-glow left" aria-hidden="true" />
          <div className="battle-glow right" aria-hidden="true" />
          <div className="battle-band" aria-hidden="true" />

          <TopControls seed={seed} animationSpeed={animationSpeed} onNewMatch={() => restartWithSeed(makeSeed())} onReplaySameSeed={() => restartWithSeed(seed)} onSetAnimationSpeed={setAnimationSpeed} hideNewMatch={!!remoteOpponent} />
          <button type="button" className="mobile-debug-toggle" onClick={() => setMobileDebugOpen(true)} aria-label="Open developer panel">
            <Icon name="bug" size={14} />
          </button>

          <SideHeader side="enemy" name="Enemy" rank={enemyDeckLabel} hp={displayState.enemy.hp} hpFx={hpFxFor('enemy')} onClose={onExit} />
          <OpponentHand count={displayState.enemy.hand.length} />

          <Battlefield
            enemyState={enemyBoardState}
            playerState={playerBoardState}
            targetableHeroLanes={targetableHeroLanes}
            targetableSpellLanes={targetableSpellLanes}
            hasSelection={!!selectedHand}
            heroAnimById={anim.visuals.heroChit}
            spellAnimById={anim.visuals.spellChit}
            clashLane={anim.visuals.clashLane}
            vfxCues={anim.visuals.vfx}
            stageShake={anim.visuals.stageShake && !anim.reducedMotion}
            interactionDisabled={isRevealing}
            onHeroSlotClick={handleHeroLaneClick}
            onHeroChitClick={handlePlayerChitClick}
            onSpellSlotClick={handleSpellLaneClick}
            onSpellChitClick={handlePlayerSpellChitClick}
            onEnemyHeroChitClick={(h) => handleEnemyChitClick(h.cardId)}
            onEnemySpellChitClick={(s) => handleEnemyChitClick(s.cardId)}
            canFight={phase === 'DEPLOY'}
            fighting={isRevealing}
            onFight={handleFight}
          />

          <SideHeader
            side="player"
            name="You"
            rank={playerDeckLabel}
            hp={displayState.player.hp}
            hpFx={hpFxFor('player')}
            graveyardPulse={anim.visuals.graveyardPulse === 'player'}
            deckCount={displayState.player.deck.length}
            graveyardCount={displayState.player.graveyard.length}
            graveyardDisabled={isRevealing}
            onGraveyardClick={() => setGraveyardOpen(true)}
            badge={playerMastery ? <MasteryBadge loadout={playerMastery} toast={masteryToast} /> : undefined}
          />

          <div className="hand-apron">
            <div className="battle-hint">{hint}</div>
            {submitError && phase === 'DEPLOY' && (
              <div style={{ color: '#e66', textAlign: 'center', fontSize: 13 }}>
                {submitError}{' '}
                <button type="button" onClick={() => setSubmitError(null)}>
                  Dismiss
                </button>
              </div>
            )}
            {phase === 'DEPLOY' ? (
              <Hand hand={gameState.player.hand} selectedHandId={selectedHand?.handId ?? null} usedHandIds={usedHandIds} onSelect={selectForPlacement} onInspect={setInspectCardId} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
            ) : (
              <div className="hand-fan" />
            )}
          </div>

          {mobileDebugOpen && (
            <div className="overlay-backdrop debug-drawer-backdrop" onClick={() => setMobileDebugOpen(false)}>
              <div className="debug-drawer" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn btn-icon btn-sm debug-drawer-close" onClick={() => setMobileDebugOpen(false)} aria-label="Close developer panel">
                  <Icon name="close" size={16} />
                </button>
                <DebugPanel seed={seed} state={gameState} lastAiAction={lastAiAction} fullLog={fullLog} />
              </div>
            </div>
          )}

          {graveyardOpen && (
            <GraveyardSheet
              playerGraveyard={displayState.player.graveyard}
              enemyGraveyard={displayState.enemy.graveyard}
              onClose={() => setGraveyardOpen(false)}
              onInspect={(cardId) => setInspectCardId(cardId)}
            />
          )}

          {inspectCardId && <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />}
          {phase === 'MATCH_END' && matchStats && <MatchSummary stats={matchStats} xp={xpResult} gold={goldResult} onPlayAgain={() => restartWithSeed(makeSeed())} onExit={onExit} friendlyRematch={friendlyRematch} />}

          {/* Friendly Battle only - deliberately minimal/unstyled (see docs/FRIENDLY-BATTLE.md: "keep
              styling minimal, reuse existing components" - Codex owns the visual pass). */}
          {phase === 'WAITING_FOR_OPPONENT' && !opponentLeft && (
            <div className="overlay-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'rgba(20,20,30,0.9)', color: '#fff', padding: '24px 32px', borderRadius: 12, textAlign: 'center' }}>
                <p>Waiting for opponent…</p>
              </div>
            </div>
          )}
          {opponentLeft && (
            <div className="overlay-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'rgba(20,20,30,0.9)', color: '#fff', padding: '24px 32px', borderRadius: 12, textAlign: 'center' }}>
                <p>The other player left the match.</p>
                <button type="button" onClick={onExit}>
                  Back to menu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DebugPanel seed={seed} state={gameState} lastAiAction={lastAiAction} fullLog={fullLog} />
    </div>
  );
}
