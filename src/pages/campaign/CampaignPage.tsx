import { useEffect, useRef, useState } from 'react';
import type { DeckChoice } from '../BattleSetupPage';
import { CHAPTER_1 } from '../../game/campaign/chapter1';
import { REGIONS } from '../../game/campaign/regions';
import { loadProgress, isNodeCleared, isNodeUnlocked, getCurrentNodeId, findNode, clearNonBattleNode, type BattleResultOutcome, type CampaignProgress } from '../../game/campaign/progress';
import { loadEnergy, spendEnergy, formatCountdown, type EnergyState } from '../../game/campaign/energy';
import { chapterWorldArtUrl } from '../../game/campaign/art';
import { getActiveDeck } from '../../game/engine/activeDeck';
import { STARTER_DECKS, STARTER_DECK_NAMES } from '../../game/cards/starterDecks';
import { campaignEnemyDeck } from '../../game/campaign/encounterDecks';
import type { CampaignNodeDef, CampaignNodeType } from '../../game/campaign/types';
import { Icon, type IconName } from '../../components/Icon';
import { StagePreviewSheet } from './StagePreviewSheet';
import { StoryBeatSheet } from './StoryBeatSheet';
import { RewardClaimSheet } from './RewardClaimSheet';
import { StageResultSheet } from './StageResultSheet';

const NODE_ICON: Record<CampaignNodeType, IconName> = { battle: 'battle', story: 'spell', reward: 'trophy', challenge: 'warning', elite: 'power', boss: 'graveyard' };

// The painted world is the design's own 0-1200 x 0-844 coordinate space (Campaign Screen.dc.html's
// "isWorld" canvas) - node x/y and every background prop below are lifted straight from it. Every
// position is expressed as a percentage of these two constants (never a raw px), so the whole scene
// re-scales cleanly inside the aspect-locked stage instead of needing a fixed pixel viewport.
const TRACK_W = 1200;
const TRACK_H = 844;
const pctX = (x: number) => `${(x / TRACK_W) * 100}%`;
const pctY = (y: number) => `${(y / TRACK_H) * 100}%`;

const ASH_DOTS = Array.from({ length: 7 }, (_, i) => ({ left: 30 + i * 95, top: 40 + ((i * 71) % 260), dur: 9 + i * 1.3, delay: i * 1.4 }));

export interface CampaignPageProps {
  onExit: () => void;
  onFightNode: (nodeId: string, player: DeckChoice, enemy: DeckChoice, startingHp?: number) => void;
  /** The last completed Campaign battle's outcome, or null between battles. Set by App.tsx from
   * GamePage's onMatchEnd; consumed (cleared) once this page has shown/dismissed its result sheet. */
  pendingResult: BattleResultOutcome | null;
  /** Open straight on the chapter map (Home's Continue Campaign) instead of region select. */
  openOnMap?: boolean;
  onConsumedResult: () => void;
}

export function CampaignPage({ onExit, onFightNode, pendingResult, onConsumedResult, openOnMap = false }: CampaignPageProps) {
  const [view, setView] = useState<'regions' | 'map'>(pendingResult || openOnMap ? 'map' : 'regions');
  const [, setProgressTick] = useState(0);
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const [energy, setEnergy] = useState<EnergyState>(() => loadEnergy());
  // The chapter's actual last node is a claim (reward-chapter-seal), not a battle - so "chapter
  // complete" can be reached by claiming a reward, not only by winning the boss. This holds a
  // synthetic result for that path; StageResultSheet only reads node/won/reward/chapterComplete, so a
  // real BattleResultOutcome and this claim-sourced one render identically.
  const [claimResult, setClaimResult] = useState<BattleResultOutcome | null>(null);
  const roadRef = useRef<HTMLDivElement>(null);
  // Mouse-drag panning state - a ref, not state, since it updates on every pointermove and must
  // never trigger a re-render. null when no mouse drag is in progress.
  const dragRef = useRef<{ startX: number; startScrollLeft: number; moved: boolean; pointerId: number } | null>(null);
  // Separate from dragRef because the click event that ends a drag fires *after* pointerup already
  // clears dragRef - this is what the capture-phase click handler below actually reads.
  const wasDraggingRef = useRef(false);

  // Re-reads localStorage fresh every render (cheap - a small JSON blob) - refresh() below forces a
  // re-render after a write via setProgressTick, so this always picks up the latest saved progress.
  const progress: CampaignProgress = loadProgress();
  const currentNodeId = getCurrentNodeId(progress);
  const clearedCount = CHAPTER_1.nodes.filter((n) => isNodeCleared(n.id, progress)).length;
  const currentNodeForVeil = currentNodeId ? findNode(currentNodeId) : null;
  // Where the grey ash veil begins - just ahead of the current node, so everything behind the player
  // reads as reclaimed/lit and everything still to walk reads as cold and ash-covered. Once the chapter
  // is complete (no current node left) the veil sits past the end of the track entirely.
  const ashLeftUnits = currentNodeForVeil ? Math.max(80, currentNodeForVeil.x - 70) : TRACK_W + 80;
  const ashLeftPct = (ashLeftUnits / TRACK_W) * 100;

  // Real-time Energy display - the lantern's countdown and the stage sheet's blocked state both read
  // from this, refreshed every second while Campaign is open (energy.ts itself recomputes from the
  // persisted timestamp, so this timer is presentation-only, not the source of truth).
  useEffect(() => {
    const id = setInterval(() => setEnergy(loadEnergy()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (view !== 'map' || !roadRef.current) return;
    const targetId = currentNodeId ?? CHAPTER_1.nodes[CHAPTER_1.nodes.length - 1].id;
    const el = roadRef.current.querySelector(`[data-node-id="${targetId}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [view, currentNodeId]);

  // The road only ever scrolls horizontally (overflow-x: auto), which native touch swipe and
  // trackpad horizontal gestures already drive directly - but a plain vertical mouse wheel does
  // nothing on a horizontal-only scroller by default in every browser. Redirect vertical wheel
  // delta into scrollLeft so a mouse-and-wheel desktop tester can pan the road too; deltaX-led
  // input (trackpad shift-scroll, a horizontal wheel) is left alone since it's already correct.
  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.currentTarget.scrollLeft += e.deltaY;
  }

  // Click-and-drag panning - touch already scrolls natively (overflow-x: auto) and doesn't need
  // this, so it's skipped for touch/pen pointers; a mouse has no swipe gesture at all, and not every
  // mouse has a usable horizontal scroll input, so dragging the road directly is the one interaction
  // guaranteed to work for every pointer type without relying on a specific piece of hardware.
  //
  // Pointer capture is deliberately NOT taken on pointerdown - only once real movement crosses the
  // threshold below. Capturing eagerly on every mousedown (including a plain press on a node button)
  // makes Chrome retarget the resulting click event to the capturing element instead of the button
  // under the pointer, so the button's onClick silently never fires - a plain click on any node
  // stopped working entirely when capture was taken up front. Waiting for confirmed drag intent
  // keeps an ordinary click completely untouched by any of this.
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    dragRef.current = { startX: e.clientX, startScrollLeft: e.currentTarget.scrollLeft, moved: false, pointerId: e.pointerId };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved) {
      // A few px of jitter between mousedown and mouseup is normal on a real click - only commit to
      // "this is a drag" (and only then start actually moving the road) past a real threshold.
      if (Math.abs(dx) <= 6) return;
      drag.moved = true;
      e.currentTarget.setPointerCapture(drag.pointerId);
    }
    e.currentTarget.scrollLeft = drag.startScrollLeft - dx;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag?.moved) {
      e.currentTarget.releasePointerCapture(drag.pointerId);
      wasDraggingRef.current = true;
    }
    dragRef.current = null;
  }

  // A drag that actually moved the road would otherwise also fire the node button's click under the
  // pointer on release - swallow just that one synthetic click, in the capture phase so it never
  // reaches the node's own onClick, then clear the flag so the next real click works normally.
  function handleClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (wasDraggingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      wasDraggingRef.current = false;
    }
  }

  function refresh() {
    setProgressTick((t) => t + 1);
  }

  function openNode(node: CampaignNodeDef) {
    if (!isNodeUnlocked(node, progress)) return;
    setOpenNodeId(node.id);
  }

  const openNode_ = openNodeId ? findNode(openNodeId) : null;

  function handleFight() {
    if (!openNode_?.encounter) return;
    const encounter = openNode_.encounter;
    setEnergy(spendEnergy(encounter.energyCost));
    const activeDeck = getActiveDeck();
    const playerChoice: DeckChoice = { label: activeDeck.label, cardIds: activeDeck.cardIds };
    const enemyChoice: DeckChoice = { label: encounter.foeName || STARTER_DECK_NAMES[encounter.enemyDeckFaction], cardIds: campaignEnemyDeck(openNode_.id) ?? STARTER_DECKS[encounter.enemyDeckFaction] };
    setOpenNodeId(null);
    onFightNode(openNode_.id, playerChoice, enemyChoice, encounter.startingHp);
  }

  function handleStoryDone() {
    if (!openNodeId) return;
    clearNonBattleNode(openNodeId);
    setOpenNodeId(null);
    refresh();
  }

  function handleClaimReward() {
    if (!openNodeId) return;
    const { node, chapterComplete, cardGrant, starterProgress, gems } = clearNonBattleNode(openNodeId);
    setOpenNodeId(null);
    // A claim gets a result sheet when it completes the chapter or handed over a card (so the player sees what they got).
    if (node.reward && (chapterComplete || cardGrant)) {
      setClaimResult({ node, won: true, isFirstClear: true, objectivesMet: [], reward: { firstClear: true, def: node.reward }, cardGrant, starterProgress, xp: null, gems, chapterComplete });
    }
    refresh();
  }

  function handleResultContinue() {
    if (pendingResult) onConsumedResult();
    if (claimResult) setClaimResult(null);
    refresh();
  }

  const activeResult = pendingResult ?? claimResult;
  const worldArtUrl = chapterWorldArtUrl(CHAPTER_1.id);

  if (view === 'regions') {
    const region1 = REGIONS[0];
    return (
      <div className="campaign-shell">
        <div className="campaign-screen">
          <button type="button" className="campaign-back-medallion" onClick={onExit} aria-label="Back to Home">
            <Icon name="back" size={17} />
          </button>
          <div className="campaign-regions-header">
            <span className="campaign-regions-title">Campaign</span>
            <span className="campaign-regions-sub">Region 1 of 9 · The Ashen Road</span>
          </div>

          <div className="campaign-region-plate open" onClick={() => setView('map')}>
            {/* A crop of the chapter's own painted world (src/game/campaign/art.ts) instead of a
                flat placeholder gradient once real art exists, so this vista reads as a preview of
                the same place the map opens into, not an unrelated stand-in. */}
            <div
              className={`campaign-region-plate-art ${region1.faction} ${worldArtUrl ? 'has-art' : ''}`}
              style={worldArtUrl ? { backgroundImage: `url(${worldArtUrl})` } : undefined}
            />
            <div className="campaign-region-plate-badge open">
              <span className="campaign-region-plate-dot" />
              <span>{clearedCount > 0 ? 'Travelling here' : 'Open'}</span>
            </div>
            <div className="campaign-region-plate-text">
              <div className="campaign-region-plate-name">
                <span className="campaign-sigil sm kingdom" />
                <span>{region1.name}</span>
              </div>
              <span className="campaign-region-plate-blurb">{region1.blurb}</span>
            </div>
            <div className="campaign-region-plate-status">
              <span>
                Chapter 1 of 1 · {clearedCount} of {CHAPTER_1.nodes.length} nodes
              </span>
              <span className="campaign-region-plate-travel">
                <span>Travel</span>
                <Icon name="back" size={13} className="campaign-flip" />
              </span>
            </div>
          </div>

          <div className="campaign-region-locked-list">
            {REGIONS.slice(1).map((r) => (
              <div className="campaign-region-locked-row" data-faction={r.faction} key={r.id}>
                <span className="campaign-region-locked-icon">
                  <Icon name="lock" size={16} />
                </span>
                <div className="campaign-region-locked-text">
                  <span>{r.name}</span>
                  <span>{r.requires}</span>
                </div>
              </div>
            ))}
          </div>
          <span className="campaign-region-journey-note">Nine regions run the length of the realm, each one opening the next. Only Region 1 is real right now - the rest are placeholders.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell campaign-world-shell">
      <div className="campaign-world-stage">
        <div className="campaign-world-scene">
          <div
            className="campaign-world-viewport"
            ref={roadRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClickCapture={handleClickCapture}
          >
            <div className="campaign-world-track">
              {/* CSS-painted fallback scene - always rendered, but only actually visible for a
                  chapter with no real art yet. A real background (src/game/campaign/art.ts) layers
                  directly on top and visually replaces it, same art-over-placeholder pattern
                  src/game/cards/art.ts uses for card art. Kept in its own filtered wrapper so the
                  saturation boost tuned for flat CSS gradients at this render size never touches a
                  real painted image, which already carries its own colour grading. */}
              <div className="campaign-fallback-scene" aria-hidden="true">
                <div className="campaign-sky" />
                <div className="campaign-sun-glow" />

                <div className="campaign-ridge campaign-ridge-a" />
                <div className="campaign-ridge campaign-ridge-b" />
                <div className="campaign-ridge campaign-ridge-c" />

                <div className="campaign-ground" />
                <div className="campaign-ground-seam" />

                {/* Broken Palisade, near the road's start. */}
                <div className="campaign-wall-stub" style={{ left: pctX(80) }}>
                  <span className="campaign-wall-stub-shadow" />
                  <span className="campaign-wall-stub-stakes" />
                  <span className="campaign-wall-stub-broken" />
                </div>

                {/* The watchtower, still burning - a landmark on the cleared (lit) side of the road. */}
                <div className="campaign-watchtower" style={{ left: pctX(150) }}>
                  <span className="campaign-watchtower-shadow" />
                  <span className="campaign-watchtower-body" />
                  <span className="campaign-watchtower-cap" />
                  <span className="campaign-watchtower-window" />
                </div>

                {/* The barrow gate - visible on the skyline well before the boss node is reached. */}
                <div className="campaign-boss-gate" style={{ left: pctX(945) }}>
                  <span className="campaign-boss-gate-glow" />
                  <span className="campaign-boss-gate-pillar left" />
                  <span className="campaign-boss-gate-pillar right" />
                  <span className="campaign-boss-gate-lintel" />
                  <span className="campaign-boss-gate-mist" />
                  <span className="campaign-boss-gate-shadow" />
                </div>

                <div className="campaign-fg" />
              </div>

              {worldArtUrl && <div className="campaign-world-art-image" style={{ backgroundImage: `url(${worldArtUrl})` }} aria-hidden="true" />}

              {/* The road itself, carved into the ground - a hand-drawn curve, not a straight
                  join-the-dots line, including the dashed spur where the challenge branches off. */}
              <svg className="campaign-road-svg" viewBox={`0 0 ${TRACK_W} ${TRACK_H}`}>
                <path d="M0 604C60 624 150 612 232 560 314 508 330 616 386 552 442 490 472 596 506 582 566 556 540 528 578 542 640 566 622 572 658 574 722 578 706 530 748 536 792 542 792 560 830 558 884 556 898 500 952 490" className="campaign-road-line-shadow" />
                <path d="M0 604C60 624 150 612 232 560 314 508 330 616 386 552 442 490 472 596 506 582 566 556 540 528 578 542 640 566 622 572 658 574 722 578 706 530 748 536 792 542 792 560 830 558 884 556 898 500 952 490" className="campaign-road-line" />
                <path d="M952 490C990 482 1020 494 1062 498" className="campaign-road-line-shadow" />
                <path d="M952 490C990 482 1020 494 1062 498" className="campaign-road-line" />
                <path d="M0 600C60 620 150 608 232 556 314 504 330 612 386 548" className="campaign-road-highlight" />
                <path d="M404 566C418 596 416 622 424 640" className="campaign-road-spur-shadow" />
                <path d="M404 566C418 596 416 622 424 640" className="campaign-road-spur" />
              </svg>

              {/* Cleared territory behind the player reads warm and lit; ahead of them, a cold grey
                  ash veil with drifting motes - the world carries the progress instead of a counter. */}
              <div className="campaign-warm-glow" style={{ width: `${ashLeftPct}%` }} aria-hidden="true" />
              <div className="campaign-ash-veil" style={{ left: `${ashLeftPct}%` }} aria-hidden="true" />
              <div className="campaign-ash-particles" style={{ left: `${ashLeftPct}%` }} aria-hidden="true">
                {ASH_DOTS.map((d, i) => (
                  <span key={i} className="campaign-ash-dot" style={{ left: d.left, top: d.top, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }} />
                ))}
              </div>

              <div className="campaign-bottom-vignette" aria-hidden="true" />

              {CHAPTER_1.nodes.map((node) => {
                const cleared = isNodeCleared(node.id, progress);
                const unlocked = isNodeUnlocked(node, progress);
                const current = node.id === currentNodeId;
                const status = current ? 'current' : cleared ? 'cleared' : unlocked ? 'open' : 'locked';
                const showName = current || node.type === 'elite' || node.type === 'boss' || node.type === 'challenge';
                const maxSeals = node.encounter?.objectives.length ?? 0;
                const earnedSeals = (progress.objectivesMet[node.id] ?? []).length;
                return (
                  <button
                    type="button"
                    key={node.id}
                    data-node-id={node.id}
                    className={`campaign-node ${node.type} ${status}`}
                    style={{ left: pctX(node.x), top: pctY(node.y) }}
                    onClick={() => openNode(node)}
                    disabled={!unlocked}
                  >
                    {(current || cleared) && <span className={`campaign-node-glow ${current ? '' : 'dim'}`} aria-hidden="true" />}
                    <span className="campaign-node-disc">
                      <Icon name={NODE_ICON[node.type]} size={node.type === 'boss' || node.type === 'elite' ? 20 : 16} />
                      {cleared && (
                        <span className="campaign-node-cleared-mark" aria-hidden="true">
                          <Icon name="check" size={9} />
                        </span>
                      )}
                    </span>
                    <span className="campaign-node-cairn" aria-hidden="true" />
                    {cleared && maxSeals > 0 && (
                      <span className="campaign-node-seals" aria-hidden="true">
                        {Array.from({ length: maxSeals }, (_, i) => (
                          <span key={i} className={`campaign-node-seal ${i < earnedSeals ? 'on' : ''}`} />
                        ))}
                      </span>
                    )}
                    {showName && <span className="campaign-node-name">{node.name}</span>}
                    {node.type === 'boss' && <span className="campaign-node-caption">Boss{status === 'locked' ? ' · locked' : status === 'cleared' ? ' · defeated' : ''}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="campaign-world-header">
            <button type="button" className="campaign-back-medallion" onClick={() => setView('regions')} aria-label="Back to region select">
              <Icon name="back" size={17} />
            </button>
            <div className="campaign-map-title">
              <span>{CHAPTER_1.name}</span>
              <span>{CHAPTER_1.meta}</span>
            </div>
            <div className="campaign-lantern">
              <div className="campaign-lantern-case">
                <span className="campaign-lantern-fill" style={{ height: `${Math.max(8, Math.round((energy.current / energy.max) * 100))}%` }} />
              </div>
              <span className="campaign-lantern-value">{energy.current}</span>
              <span className="campaign-lantern-max">/ {energy.max}</span>
              <span className="campaign-lantern-regen">{energy.current >= energy.max ? 'Full' : `+1 in ${formatCountdown(energy.msUntilNextTick)}`}</span>
            </div>
          </div>

          <div className="campaign-world-footer">
            <div className="campaign-footer-bar">
              <span className="campaign-footer-fill" style={{ width: `${Math.round((clearedCount / CHAPTER_1.nodes.length) * 100)}%` }} />
              {CHAPTER_1.nodes.map((node, i) => (
                <span key={node.id} className={`campaign-footer-dot ${isNodeCleared(node.id, progress) ? 'cleared' : node.id === currentNodeId ? 'current' : ''}`} style={{ left: `${(i / (CHAPTER_1.nodes.length - 1)) * 100}%` }} />
              ))}
            </div>
            <span className="campaign-footer-label">
              {clearedCount} of {CHAPTER_1.nodes.length} cleared{currentNodeId ? '' : ' · chapter complete'}
            </span>
          </div>

          {openNode_?.type && ['battle', 'elite', 'boss', 'challenge'].includes(openNode_.type) && <StagePreviewSheet node={openNode_} cleared={isNodeCleared(openNode_.id, progress)} onFight={handleFight} onClose={() => setOpenNodeId(null)} />}
          {openNode_?.type === 'story' && openNode_.story && <StoryBeatSheet story={openNode_.story} onDone={handleStoryDone} />}
          {openNode_?.type === 'reward' && <RewardClaimSheet node={openNode_} onClaim={handleClaimReward} />}
          {activeResult && <StageResultSheet outcome={activeResult} onContinue={handleResultContinue} />}
        </div>
      </div>
    </div>
  );
}
