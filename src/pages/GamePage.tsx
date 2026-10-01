import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { CombatModelId, DeployPlay, GameEvent, GameState, HandCard as HandCardModel, HeroInstance, LaneId, MasteryLoadout, PlayerAction, SpellZoneInstance } from '../game/types';
import { LANES } from '../game/types';
import { getCard } from '../game/cards';
import { createMatch } from '../game/engine/match';
import { beginRound, resolveRound, spellHasAValidTarget, validateDeployment } from '../game/engine/resolveRound';
import { withEffectivePowers } from '../game/engine/power';
import { legacyPassiveEffectStates } from '../game/engine/abilities';
import { makeSeed } from '../game/engine/rng';
import { combatStats } from '../game/combatV2/model';
import { chooseAiAction } from '../game/ai/simpleAI';
import { beginCardRound, cardAtk, cardSpellHasTarget, createCardMatch, matchHpContribution, passiveEffectStates, resolveCardRound, validateCardDeployment, withEffectiveAtk } from '../game/cardCombat/engine';
import { chooseCardAiAction } from '../game/cardCombat/ai';
import { getCombatCard } from '../game/cardCombat/cards';
import { stagesFromAscensionRanks } from '../game/cardCombat/mastery';
import { CombatDisplayContext, type BattleCardDisplay } from '../components/combatDisplay';
import { BattleLogPanel } from '../components/battleInfo/BattleDock';
import { CardFocusPanel } from '../components/card/CardFocusPanel';
import { legacyAtk, type CardRules } from '../game/cards/cardPresentation';
import { ATK_PER_POWER } from '../game/cardCombat/stats';
import { battleLogEntries } from '../components/battleInfo/battleLog';
import { focusDetails, type BattleFocus } from '../components/battleInfo/focusDetails';
import { clashCalloutForStep } from '../components/animation/chitEffects';
import { computeMatchStats, type MatchStats } from '../game/engine/stats';
import { saveRecentMatch } from '../game/engine/localMatchHistory';
import { SideHeader } from '../components/SideHeader';
import { Battlefield } from '../components/Battlefield';
import { OpponentHand } from '../components/OpponentHand';
import { Hand } from '../components/Hand';
import { CardInspect, type InspectBattleCopy, type InspectContext } from '../components/card/CardInspect';
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
import { battlePowerBonusForLevel } from '../game/heroLevel/battlePower';
import { Icon } from '../components/Icon';
import { useAnimationController } from '../components/animation/useAnimationController';
import { summarizeBattle, type BattleMode } from '../game/events/battleSummary';
import { track } from '../analytics/track';
import { resolveDuration } from '../components/animation/timing';
import type { AnimationSpeed } from '../components/animation/types';
import type { FriendlyRematchActions } from '../components/MatchSummary';
import type { RemoteOpponentController } from '../net/friendlyTypes';
import { isCurrentCardResolver, matchResolver } from '../game/combat/resolver';
import '../styles/battleCardHosts.css';

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
  enemyAscensions?: Record<string, number>;
  /** The player's Hero Levels for the cards in their deck (cardId -> level), captured at setup. Omit for all Level 1. */
  playerHeroLevels?: Record<string, number>;
  enemyHeroLevels?: Record<string, number>;
  /**
   * The resolver a local battle plays: card combat (src/game/cardCombat), the production rules, unless a development
   * build asked for an old engine (game/combat/combatModel.ts). A Friendly Battle ignores this and plays whatever
   * resolver built its `initialState`.
   */
  combatModel?: CombatModelId;
  /** Legacy resolver only (developer comparisons): a fixed Starting HP for both sides. */
  startingHp?: number;
  /** Card combat: a fixed Starting HP for one side in place of its deck's total (a Campaign boss pool or challenge rule). */
  startingHpOverride?: Partial<Record<'player' | 'enemy', number>>;
  /** Card combat: the opponent's Card Mastery stage per card id (Ranked tiers). Omit for Mastery I. Changes HP Contribution only. */
  enemyMasteryStages?: Record<string, number>;
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
  /** Which local mode this match belongs to, reported on the battle_completed analytics event. Omit for Quick Battle. */
  battleMode?: BattleMode;
}

/** Overlays this round's not-yet-locked plays onto the real board, Deploy-phase display only. A
 * staged one-time Spell gets the same floating preview treatment as a Hero or Continuous Spell -
 * it renders right where it will resolve (Battle Screen v8) rather than in a separate pending list. */
function buildPreviewZones(
  heroZones: GameState['player']['heroZones'],
  spellZones: GameState['player']['spellZones'],
  pendingPlays: DeployPlay[],
  heroLevels: Record<string, number> = {},
  heroAscensions: Record<string, number> = {},
  combatModel: CombatModelId = 'legacy',
): { heroZones: GameState['player']['heroZones']; spellZones: GameState['player']['spellZones'] } {
  const previewHero = { ...heroZones };
  const previewSpell = { ...spellZones };
  for (const play of pendingPlays) {
    const card = getCard(play.cardId);
    if (card.type === 'hero') {
      const v2Stats = combatModel === 'v2' ? combatStats(play.cardId, heroLevels[play.cardId] ?? 1, heroAscensions[play.cardId] ?? 0) : null;
      // Card combat: a Unit enters at its printed ATK (Level and Mastery never change ATK there).
      const cardModeAtk = combatModel === 'card' ? cardAtk(play.cardId) : null;
      const pendingHero: HeroInstance = {
        instanceId: `pending-${play.handId}`,
        cardId: play.cardId,
        faction: card.faction,
        name: card.name,
        shortName: card.shortName,
        // Matches makeHeroInstance's own Battle Power calculation, so the Deploy-phase preview never
        // shows a number Reveal is about to contradict for a levelled Hero.
        power: cardModeAtk ?? v2Stats?.attack ?? (card.power ?? 0) + battlePowerBonusForLevel(heroLevels[play.cardId] ?? 1),
        ...(v2Stats ? { hp: v2Stats.maxHp, maxHp: v2Stats.maxHp, combatShield: 0 } : {}),
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

export function GamePage({ playerDeck, enemyDeck, playerDeckLabel, enemyDeckLabel, onExit, playerMastery, playerAscensions, enemyAscensions, playerHeroLevels, enemyHeroLevels, startingHp, startingHpOverride, enemyMasteryStages, onMatchEnd, remoteOpponent, initialState, initialEvents, friendlyRematch, combatModel: requestedModel = 'card', battleMode = 'quick' }: GamePageProps) {
  // A match handed in ready-made (Friendly Battle) plays the resolver that built it; it says which in its own state.
  const combatModel: CombatModelId = initialState ? (initialState.combatModel ?? 'legacy') : requestedModel;
  const cardMode = combatModel === 'card';
  // A Friendly match built by a different card-resolver version can't be played by this build: show why, play nothing.
  const rulesMismatch = !!initialState && cardMode && !isCurrentCardResolver(initialState);
  // The rules every card in this battle describes: card combat's, or a legacy resolver's (v2 included). The card faces,
  // focus panel, log and Card Inspect are the same in every mode; only their wording and numbers follow the rules.
  const rules: CardRules = cardMode ? 'card' : 'legacy';

  function buildMatch(matchSeed: number): { state: GameState; events: GameEvent[] } {
    if (cardMode) {
      // Card combat: Starting HP is each deck's own Unit HP Contributions (cardCombat/stats.ts deckStartingHp, the
      // Deck Builder's helper). The player's Card Mastery raises their HP Contribution only; the opponent plays its own
      // deck at its own Mastery (Mastery I unless a Ranked tier sets it) and never copies the player's Mastery or HP.
      const built = createCardMatch({ seed: matchSeed, playerDeck, enemyDeck, playerMastery: stagesFromAscensionRanks(playerAscensions), enemyMastery: enemyMasteryStages, startingHpOverride });
      return { state: built.nextState, events: built.events };
    }
    return createMatch({
      seed: matchSeed,
      playerDeck,
      enemyDeck,
      startingHp,
      masteries: playerMastery ? { player: playerMastery } : undefined,
      ascensions: (playerAscensions && Object.keys(playerAscensions).length > 0) || (enemyAscensions && Object.keys(enemyAscensions).length > 0) ? { ...(playerAscensions ? { player: playerAscensions } : {}), ...(enemyAscensions ? { enemy: enemyAscensions } : {}) } : undefined,
      heroLevels: (playerHeroLevels && Object.keys(playerHeroLevels).length > 0) || (enemyHeroLevels && Object.keys(enemyHeroLevels).length > 0) ? { ...(playerHeroLevels ? { player: playerHeroLevels } : {}), ...(enemyHeroLevels ? { enemy: enemyHeroLevels } : {}) } : undefined,
      combatModel,
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
  const [inspect, setInspect] = useState<{ cardId: string; context: InspectContext; battle: InspectBattleCopy } | null>(null);
  // The dock over the hand apron: the card a tap picked out, or the battle log, one at a time and between rounds only
  // (while a round resolves the dock shows the live log instead). The log stays open from round to round until it is
  // closed; a card's panel shows over it.
  const [focus, setFocus] = useState<BattleFocus | null>(null);
  const [logOpen, setLogOpen] = useState(false);

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
    setFocus(null);
    setLogOpen(false);
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
      if (!remoteOpponent) saveRecentMatch(seed, stats, matchResolver(next));
      // Event missions count local battles from this one summary (game/events); Friendly Battle stays out.
      if (!remoteOpponent) track('battle_completed', summarizeBattle(next.status, merged, battleMode));
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
      // Friendly Battle's server already began the next round (its events were part of this reveal); beginning it again
      // here would re-fire Round Start effects on the client only. Local battles begin it now.
      const begun = remoteOpponent ? { nextState: next, events: [] } : cardMode ? beginCardRound(next) : beginRound(next);
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
    if (phase !== 'DEPLOY' || rulesMismatch) return;
    const localAction = { plays: pendingPlays };
    const validation = cardMode ? validateCardDeployment(gameState, 'player', localAction) : validateDeployment(gameState, 'player', localAction);
    if (!validation.legal) {
      console.warn('Blocked an illegal deployment:', validation.reason);
      return;
    }
    setPendingPlays([]);
    setSelectedHand(null);
    setFocus(null);
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

    const ai = cardMode ? chooseCardAiAction(gameState, 'enemy', gameState.rngState) : chooseAiAction(gameState, 'enemy', gameState.rngState);
    const result = cardMode ? resolveCardRound(gameState, localAction, ai.action, ai.nextRngState) : resolveRound(gameState, localAction, ai.action, ai.nextRngState);
    setLastAiAction(ai.action);
    setBaseStateForReveal(gameState);
    setRevealEvents(result.events);
    setPendingNextState(result.nextState);
    setPhase('REVEALING');
  }

  const usedHandIds = new Set(pendingPlays.map((p) => p.handId));

  function selectForPlacement(hand: HandCardModel) {
    if (phase !== 'DEPLOY') return;
    // A tap selects the card and opens its focus panel; tapping the card the panel shows puts it back.
    const shown = focus?.kind === 'hand' && focus.handId === hand.handId;
    if (shown && selectedHand?.handId === hand.handId) {
      setSelectedHand(null);
      setFocus(null);
      return;
    }
    setSelectedHand(hand);
    setFocus({ kind: 'hand', handId: hand.handId, cardId: hand.cardId });
  }

  /** A tap on a Unit or a Spell on the board opens its focus panel, and a second tap closes it. */
  function toggleFocus(next: BattleFocus) {
    setFocus((prev) => (prev && prev.kind === next.kind && 'instanceId' in prev && 'instanceId' in next && prev.instanceId === next.instanceId ? null : next));
  }

  function closeFocus() {
    // Closing a hand card's panel puts the card back as well.
    if (focus?.kind === 'hand' && selectedHand?.handId === focus.handId) setSelectedHand(null);
    setFocus(null);
  }

  function toggleLog() {
    if (phase !== 'DEPLOY') return;
    if (logShown) {
      setLogOpen(false);
      return;
    }
    setLogOpen(true);
    setFocus(null);
  }

  // Placement IS targeting - a single Hero/Spell click or drop commits the whole play; there is no
  // separate "choose a target" step for a normal card.
  function commitPlacement(lane: LaneId) {
    if (!selectedHand) return;
    setPendingPlays((prev) => [...prev, { handId: selectedHand.handId, cardId: selectedHand.cardId, lane }]);
    setSelectedHand(null);
    setFocus(null);
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
    if (!spellTargetOk(card.id, lane)) return;
    commitPlacement(lane);
  }

  function handleRemovePending(handId: string) {
    setPendingPlays((prev) => prev.filter((p) => p.handId !== handId));
  }

  // Card combat checks the card-combat definition against ATK (Stasis Field, Execute's threshold, ...).
  function spellTargetOk(cardId: string, lane: LaneId): boolean {
    return cardMode ? cardSpellHasTarget(gameState, 'player', getCombatCard(cardId), lane) : spellHasAValidTarget(gameState, 'player', getCard(cardId), lane);
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
            if (!spellTargetOk(selectedCard.id, l)) return false;
            return true;
          }),
        )
      : new Set<LaneId>();

  const displayState = isRevealing ? anim.displayState : gameState;
  const hpFxFor = (side: 'player' | 'enemy') => anim.visuals.hpFx.find((fx) => fx.side === side) ?? null;

  const preview = phase === 'DEPLOY' ? buildPreviewZones(displayState.player.heroZones, displayState.player.spellZones, pendingPlays, playerHeroLevels, playerAscensions, combatModel) : null;

  // Tapping a card on the board - like every other board interaction - is locked out while the round is resolving,
  // so a mid-animation tap can never race the animation queue or open stale card data. A tap opens the card's focus
  // panel (Card Inspect is one more tap away, on the panel); a staged play is taken back instead.
  function handlePlayerChitClick(hero: HeroInstance) {
    if (isRevealing) return;
    if (hero.instanceId.startsWith('pending-')) handleRemovePending(hero.instanceId.replace('pending-', ''));
    else toggleFocus({ kind: 'unit', side: 'player', instanceId: hero.instanceId });
  }

  function handlePlayerSpellChitClick(spell: SpellZoneInstance) {
    if (isRevealing) return;
    if (spell.instanceId.startsWith('pending-')) handleRemovePending(spell.instanceId.replace('pending-', ''));
    else toggleFocus({ kind: 'spell', side: 'player', instanceId: spell.instanceId });
  }

  function handleEnemyChitClick(hero?: HeroInstance, spell?: SpellZoneInstance) {
    if (isRevealing) return;
    if (hero) toggleFocus({ kind: 'unit', side: 'enemy', instanceId: hero.instanceId });
    else if (spell) toggleFocus({ kind: 'spell', side: 'enemy', instanceId: spell.instanceId });
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
  const playerBoardState = cardMode ? withEffectiveAtk({ ...displayState, player: playerZonesForDisplay }, 'player') : withEffectivePowers({ ...displayState, player: playerZonesForDisplay }, 'player');
  const enemyBoardState = cardMode ? withEffectiveAtk(displayState, 'enemy') : withEffectivePowers(displayState, 'enemy');
  const clashCallout = isRevealing ? clashCalloutForStep(anim.currentStep, revealEvents, displayState) : null;
  // Which conditional always-on effects are live on the board as shown (pending plays included).
  const shownState = { ...displayState, player: playerZonesForDisplay };
  const passiveFor = cardMode ? passiveEffectStates : legacyPassiveEffectStates;
  const passiveStates = new Map([...passiveFor(shownState, 'player'), ...passiveFor(shownState, 'enemy')]);
  const hpContributionOf = (cardId: string, owner: 'player' | 'enemy') => matchHpContribution(gameState, owner, cardId);
  const rankOf = (cardId: string, owner: 'player' | 'enemy') => gameState.ascensions?.[owner]?.[cardId] ?? 0;

  // How every card in this battle reads (combatDisplay.ts): card combat's live ATK and HP Contribution, or, in a legacy
  // battle, the ATK a Unit's live Power reads as and the copy's Card Mastery effects (no HP Contribution there).
  const display: BattleCardDisplay = {
    rules,
    unitAtk: (unit) => (cardMode ? unit.power : legacyAtk(unit.power)),
    handAtk: (cardId) => {
      const card = getCard(cardId);
      if (cardMode || card.type !== 'hero') return undefined;
      return legacyAtk((card.power ?? 0) + battlePowerBonusForLevel(gameState.heroLevels?.player?.[cardId] ?? 1));
    },
    tempAtk: (unit) => (cardMode ? unit.tempPower : unit.tempPower * ATK_PER_POWER),
    masteryRank: (cardId, owner, unit) => (cardMode ? 0 : (unit?.ascension ?? rankOf(cardId, owner))),
    masteryStage: (cardId, owner) => (cardMode ? (gameState.cardCombat?.masteryStage[owner][cardId] ?? 1) : rankOf(cardId, owner) + 1),
    ...(cardMode ? { hpContribution: hpContributionOf } : {}),
    passiveStates: (instanceId) => passiveStates.get(instanceId),
  };

  // The dock. Between rounds: the focus panel for the card a tap picked out (read from the board as shown), else the
  // battle log when it is open; either way the hand peeks out under it. While a round resolves: the live log, each line
  // appearing as playback reaches the events it describes.
  const focusInfo = phase === 'DEPLOY' && focus ? focusDetails(focus, shownState, fullLog, { rules, hpContribution: cardMode ? hpContributionOf : undefined }) : null;
  const historyLog = useMemo(() => (logOpen ? battleLogEntries(fullLog, undefined, rules) : []), [logOpen, fullLog, rules]);
  const revealLog = useMemo(() => battleLogEntries(revealEvents, baseStateForReveal ?? undefined, rules), [revealEvents, baseStateForReveal, rules]);
  let revealedUntil = anim.isDone ? revealEvents.length - 1 : -1;
  if (!anim.isDone) for (let i = 0; i <= Math.min(anim.stepIndex, anim.steps.length - 1); i++) revealedUntil = Math.max(revealedUntil, anim.steps[i].maxEventIndex);
  const liveLog = isRevealing ? revealLog.filter((entry) => entry.until <= revealedUntil) : [];
  const logShown = phase === 'DEPLOY' && !focusInfo && logOpen;
  const dockOpen = !!focusInfo || logShown;

  /** Card Inspect for a card in this battle: the copy as these rules play it. */
  function inspectCard(cardId: string, owner: 'player' | 'enemy', atk?: number) {
    const unit = getCard(cardId).type === 'hero';
    setInspect({
      cardId,
      context: owner === 'enemy' ? 'opponent' : 'battle',
      battle: {
        rules,
        owner,
        ...(unit && atk !== undefined ? { atk } : {}),
        ...(unit && cardMode ? { hpContribution: hpContributionOf(cardId, owner), masteryStage: display.masteryStage(cardId, owner) } : {}),
        ...(!cardMode ? { masteryRank: display.masteryRank(cardId, owner) } : {}),
      },
    });
  }

  function inspectFocused() {
    if (!focusInfo) return;
    setInspect({
      cardId: focusInfo.cardId,
      context: focusInfo.owner === 'enemy' ? 'opponent' : 'battle',
      battle: {
        rules,
        owner: focusInfo.owner,
        ...(focusInfo.kind === 'unit' && focusInfo.atk !== undefined ? { atk: focusInfo.atk } : {}),
        ...(focusInfo.hpContribution !== undefined ? { hpContribution: focusInfo.hpContribution } : {}),
        masteryStage: focusInfo.masteryStage,
        masteryRank: focusInfo.masteryRank,
      },
    });
  }

  // Status band above the hand (Battle Screen v8 / design source of truth section 9): during
  // resolution it's a static "Resolving", never a scrolling play-by-play of each event.
  let hint: string;
  if (phase === 'WAITING_FOR_OPPONENT') hint = 'Waiting for opponent';
  else if (isRevealing) hint = 'Resolving';
  else if (pendingPlays.length > 0 && !selectedHand) hint = 'Ready to fight';
  else if (selectedCard) hint = selectedCard.type === 'hero' ? 'Tap a Unit slot' : 'Tap a Spell slot';
  else hint = 'Tap a card';

  // Every CSS animation keyframe reads its pace from this one variable (see global.css's "Combat
  // animations" section) - the single point where the currently-playing step's resolved duration
  // (speed setting + reduced motion, both handled in timing.ts) reaches the DOM.
  const stepMs = anim.currentStep ? resolveDuration(anim.currentStep.timingCategory, animationSpeed, anim.reducedMotion) : 300;

  return (
    <CombatDisplayContext.Provider value={display}>
    <div className="app-shell">
      <div className="battle-stage" style={{ '--step-ms': `${Math.max(stepMs, 1)}ms` } as CSSProperties}>
        <div className="battle-scene card-faces">
          <div className="battle-sky" aria-hidden="true" />
          <div className="battle-terrace" aria-hidden="true" />
          <div className="battle-glow left" aria-hidden="true" />
          <div className="battle-glow right" aria-hidden="true" />
          <div className="battle-band" aria-hidden="true" />

          <TopControls seed={seed} animationSpeed={animationSpeed} onNewMatch={() => restartWithSeed(makeSeed())} onReplaySameSeed={() => restartWithSeed(seed)} onSetAnimationSpeed={setAnimationSpeed} hideNewMatch={!!remoteOpponent} />
          <button type="button" className="mobile-debug-toggle" onClick={() => setMobileDebugOpen(true)} aria-label="Open developer panel">
            <Icon name="bug" size={14} />
          </button>

          <SideHeader side="enemy" name="Enemy" rank={enemyDeckLabel} hp={displayState.enemy.hp} maxHp={displayState.enemy.maxHp} hpFx={hpFxFor('enemy')} onClose={onExit} />
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
            clashCallout={clashCallout}
            vfxCues={anim.visuals.vfx}
            stageShake={anim.visuals.stageShake && !anim.reducedMotion}
            interactionDisabled={isRevealing}
            onHeroSlotClick={handleHeroLaneClick}
            onHeroChitClick={handlePlayerChitClick}
            onSpellSlotClick={handleSpellLaneClick}
            onSpellChitClick={handlePlayerSpellChitClick}
            onEnemyHeroChitClick={(h) => handleEnemyChitClick(h)}
            onEnemySpellChitClick={(s) => handleEnemyChitClick(undefined, s)}
            canFight={phase === 'DEPLOY'}
            fighting={isRevealing}
            onFight={handleFight}
            focusedId={focusInfo && focus && focus.kind !== 'hand' ? focus.instanceId : null}
          />

          <SideHeader
            side="player"
            name="You"
            rank={playerDeckLabel}
            hp={displayState.player.hp}
            maxHp={displayState.player.maxHp}
            hpFx={hpFxFor('player')}
            graveyardPulse={anim.visuals.graveyardPulse === 'player'}
            deckCount={displayState.player.deck.length}
            graveyardCount={displayState.player.graveyard.length}
            graveyardDisabled={isRevealing}
            onGraveyardClick={() => setGraveyardOpen(true)}
            onLogClick={toggleLog}
            logOpen={logShown}
            badge={playerMastery && !cardMode ? <MasteryBadge loadout={playerMastery} toast={masteryToast} /> : undefined}
          />

          {/* The hint sits under the enemy bar, clear of the hand cards' art and ATK. */}
          <div className="battle-hint">{hint}</div>
          <div className="hand-apron">
            {rulesMismatch && (
              <div role="alert" style={{ color: '#e66', textAlign: 'center', fontSize: 13 }}>
                This match was started on a different version of Moonwater. Update the game to keep playing.
              </div>
            )}
            {submitError && phase === 'DEPLOY' && (
              <div style={{ color: '#e66', textAlign: 'center', fontSize: 13 }}>
                {submitError}{' '}
                <button type="button" onClick={() => setSubmitError(null)}>
                  Dismiss
                </button>
              </div>
            )}
            {phase === 'DEPLOY' ? (
              <Hand peek={dockOpen} hand={gameState.player.hand} selectedHandId={selectedHand?.handId ?? null} usedHandIds={usedHandIds} onSelect={selectForPlacement} onInspect={(cardId) => inspectCard(cardId, 'player', display.handAtk(cardId))} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
            ) : (
              <div className="hand-fan" />
            )}
            {focusInfo && <CardFocusPanel layout="dock" details={focusInfo} onClose={closeFocus} onInspect={inspectFocused} />}
            {logShown && <BattleLogPanel entries={historyLog} live={false} onClose={() => setLogOpen(false)} />}
            {isRevealing && <BattleLogPanel entries={liveLog} live round={baseStateForReveal?.round} />}
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
              onInspect={(cardId, side) => inspectCard(cardId, side)}
            />
          )}

          {inspect && <CardInspect cardId={inspect.cardId} context={inspect.context} battle={inspect.battle} onClose={() => setInspect(null)} />}
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
    </CombatDisplayContext.Provider>
  );
}
