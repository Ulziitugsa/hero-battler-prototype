import { useEffect, useState } from 'react';
import type { DeployPlay, GameEvent, GameState, HandCard as HandCardModel, HeroInstance, LaneId, PlayerAction, SpellZoneInstance } from '../game/types';
import { LANES } from '../game/types';
import { getCard } from '../game/cards';
import { createMatch } from '../game/engine/match';
import { beginRound, resolveRound, spellHasAValidTarget, validateDeployment } from '../game/engine/resolveRound';
import { replayUpTo } from '../game/engine/replay';
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
import { Icon } from '../components/Icon';
import { chitFxFromEvent, hpFxFromEvent } from '../components/eventPresentation';

export type AnimationSpeed = '1x' | '2x' | 'instant';
type Phase = 'DEPLOY' | 'REVEALING' | 'MATCH_END';

export interface GamePageProps {
  playerDeck: string[];
  enemyDeck: string[];
  playerDeckLabel: string;
  enemyDeckLabel: string;
  onExit: () => void;
}

/** Overlays this round's not-yet-locked plays onto the real board, Deploy-phase display only. A
 * staged one-time Spell gets the same floating preview treatment as a Hero or Continuous Spell -
 * it renders right where it will resolve (Battle Screen v8) rather than in a separate pending list. */
function buildPreviewZones(
  heroZones: GameState['player']['heroZones'],
  spellZones: GameState['player']['spellZones'],
  pendingPlays: DeployPlay[],
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
        power: card.power ?? 0,
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

export function GamePage({ playerDeck, enemyDeck, playerDeckLabel, enemyDeckLabel, onExit }: GamePageProps) {
  function buildMatch(matchSeed: number) {
    return createMatch({ seed: matchSeed, playerDeck, enemyDeck });
  }

  const [seed, setSeed] = useState(() => makeSeed());
  const [gameState, setGameState] = useState<GameState>(() => buildMatch(seed).state);
  const [fullLog, setFullLog] = useState<GameEvent[]>(() => buildMatch(seed).events);
  const [phase, setPhase] = useState<Phase>('DEPLOY');
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>('1x');

  const [pendingPlays, setPendingPlays] = useState<DeployPlay[]>([]);
  const [selectedHand, setSelectedHand] = useState<HandCardModel | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);

  const [revealEvents, setRevealEvents] = useState<GameEvent[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [baseStateForReveal, setBaseStateForReveal] = useState<GameState | null>(null);
  const [pendingNextState, setPendingNextState] = useState<GameState | null>(null);
  const [lastAiAction, setLastAiAction] = useState<PlayerAction | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [mobileDebugOpen, setMobileDebugOpen] = useState(false);
  const [graveyardOpen, setGraveyardOpen] = useState(false);

  function restartWithSeed(newSeed: number) {
    const built = buildMatch(newSeed);
    setSeed(newSeed);
    setGameState(built.state);
    setFullLog(built.events);
    setPhase('DEPLOY');
    setPendingPlays([]);
    setSelectedHand(null);
    setRevealEvents([]);
    setRevealIndex(0);
    setBaseStateForReveal(null);
    setPendingNextState(null);
    setLastAiAction(null);
    setMatchStats(null);
  }

  // Drives FIGHT playback: steps revealIndex forward on a timer, then hands off to the next round.
  useEffect(() => {
    if (phase !== 'REVEALING') return;

    if (revealIndex >= revealEvents.length) {
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
        saveRecentMatch(seed, stats);
        setFullLog(merged);
        setMatchStats(stats);
        setGameState(next);
        setPhase('MATCH_END');
      } else {
        const begun = beginRound(next);
        setFullLog([...fullLog, ...revealEvents, ...begun.events]);
        setGameState(begun.nextState);
        setPhase('DEPLOY');
      }
      setPendingNextState(null);
      setRevealEvents([]);
      setRevealIndex(0);
      return;
    }

    if (animationSpeed === 'instant') {
      setRevealIndex(revealEvents.length);
      return;
    }
    const delay = animationSpeed === '2x' ? 260 : 550;
    const timer = setTimeout(() => setRevealIndex((i) => i + 1), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revealIndex, animationSpeed]);

  function handleFight() {
    if (phase !== 'DEPLOY') return;
    const validation = validateDeployment(gameState, 'player', { plays: pendingPlays });
    if (!validation.legal) {
      console.warn('Blocked an illegal deployment:', validation.reason);
      return;
    }
    const ai = chooseAiAction(gameState, 'enemy', gameState.rngState);
    const result = resolveRound(gameState, { plays: pendingPlays }, ai.action, ai.nextRngState);
    setLastAiAction(ai.action);
    setBaseStateForReveal(gameState);
    setRevealEvents(result.events);
    setRevealIndex(0);
    setPendingNextState(result.nextState);
    setPendingPlays([]);
    setSelectedHand(null);
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

  const isRevealing = phase === 'REVEALING';
  const currentEvent = isRevealing && revealIndex > 0 ? revealEvents[revealIndex - 1] : null;
  const displayState = isRevealing && baseStateForReveal ? replayUpTo(baseStateForReveal, revealEvents, revealIndex - 1) : gameState;

  const chitFx = currentEvent ? chitFxFromEvent(currentEvent) : null;
  const hpFxSide = currentEvent ? hpFxFromEvent(currentEvent) : null;
  const fxByInstanceId = new Map<string, { kind: 'dmg' | 'buf'; text: string }>();
  if (chitFx) fxByInstanceId.set(chitFx.instanceId, chitFx.fx);

  const preview = phase === 'DEPLOY' ? buildPreviewZones(displayState.player.heroZones, displayState.player.spellZones, pendingPlays) : null;

  function handlePlayerChitClick(hero: HeroInstance) {
    if (hero.instanceId.startsWith('pending-')) handleRemovePending(hero.instanceId.replace('pending-', ''));
    else setInspectCardId(hero.cardId);
  }

  function handlePlayerSpellChitClick(spell: SpellZoneInstance) {
    if (spell.instanceId.startsWith('pending-')) handleRemovePending(spell.instanceId.replace('pending-', ''));
    else setInspectCardId(spell.cardId);
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
  if (isRevealing) hint = 'Resolving';
  else if (pendingPlays.length > 0 && !selectedHand) hint = 'Ready to fight';
  else if (selectedCard) hint = selectedCard.type === 'hero' ? 'Tap a hero slot' : 'Tap a spell slot';
  else hint = 'Tap a card';

  return (
    <div className="app-shell">
      <div className="battle-stage">
        <div className="battle-scene">
          <div className="battle-sky" aria-hidden="true" />
          <div className="battle-terrace" aria-hidden="true" />
          <div className="battle-glow left" aria-hidden="true" />
          <div className="battle-glow right" aria-hidden="true" />
          <div className="battle-band" aria-hidden="true" />

          <TopControls seed={seed} animationSpeed={animationSpeed} onNewMatch={() => restartWithSeed(makeSeed())} onReplaySameSeed={() => restartWithSeed(seed)} onSetAnimationSpeed={setAnimationSpeed} />
          <button type="button" className="mobile-debug-toggle" onClick={() => setMobileDebugOpen(true)} aria-label="Open developer panel">
            <Icon name="bug" size={14} />
          </button>

          <SideHeader side="enemy" name="Enemy" rank={enemyDeckLabel} hp={displayState.enemy.hp} hpFlash={hpFxSide === 'enemy'} onClose={onExit} />
          <OpponentHand count={displayState.enemy.hand.length} />

          <Battlefield
            enemyState={enemyBoardState}
            playerState={playerBoardState}
            targetableHeroLanes={targetableHeroLanes}
            targetableSpellLanes={targetableSpellLanes}
            hasSelection={!!selectedHand}
            fxByInstanceId={fxByInstanceId}
            onHeroSlotClick={handleHeroLaneClick}
            onHeroChitClick={handlePlayerChitClick}
            onSpellSlotClick={handleSpellLaneClick}
            onSpellChitClick={handlePlayerSpellChitClick}
            onEnemyHeroChitClick={(h) => setInspectCardId(h.cardId)}
            onEnemySpellChitClick={(s) => setInspectCardId(s.cardId)}
            canFight={phase === 'DEPLOY'}
            fighting={isRevealing}
            onFight={handleFight}
          />

          <SideHeader
            side="player"
            name="You"
            rank={playerDeckLabel}
            hp={displayState.player.hp}
            hpFlash={hpFxSide === 'player'}
            deckCount={displayState.player.deck.length}
            graveyardCount={displayState.player.graveyard.length}
            onGraveyardClick={() => setGraveyardOpen(true)}
          />

          <div className="hand-apron">
            <div className="battle-hint">{hint}</div>
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
          {phase === 'MATCH_END' && matchStats && <MatchSummary stats={matchStats} onPlayAgain={() => restartWithSeed(makeSeed())} onExit={onExit} />}
        </div>
      </div>

      <DebugPanel seed={seed} state={gameState} lastAiAction={lastAiAction} fullLog={fullLog} />
    </div>
  );
}
