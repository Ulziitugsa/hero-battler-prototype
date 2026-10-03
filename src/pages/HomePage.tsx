import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { CardViewer } from '../components/card/CardViewer';
import { GemBalance } from '../components/GemIcon';
import { GoldBalance } from '../components/GoldIcon';
import { TicketBalance } from '../components/TicketIcon';
import { HowToPlaySheet } from '../components/HowToPlaySheet';
import { MissionsSheet } from '../components/MissionsSheet';
import { JourneySheet } from '../components/JourneySheet';
import { getCard } from '../game/cards';
import { getActiveDeck } from '../game/engine/activeDeck';
import { useHubState } from '../game/home/useHubState';
import { useAccount } from '../game/progression/useAccount';
import { claimIdleReward, idleRewardCycleId } from '../game/campaign/idleRewards';
import { CHAPTER_1 } from '../game/campaign/chapter1';
import { DIFFICULTY_LABEL, findNode, getCurrentNodeId, isNodeCleared, loadProgress } from '../game/campaign/progress';
import { deckStartingHp } from '../game/cardCombat/stats';
import { dismissRefundNotice, pendingRefundNotice } from '../game/save/migrations';
import { track } from '../analytics/track';
import { listMissions } from '../game/missions/store';
import type { MissionsState } from '../game/missions/store';
import { useMissions } from '../game/missions/useMissions';
import { useJourney } from '../game/journey/useJourney';
import { useEconomy } from '../game/economy/useEconomy';
import { loadSelectedBanner } from '../game/summon/selectedBanner';
import { getBanner } from '../game/summon/banners';
import { SUMMON_CONFIG } from '../game/summon/config';
import { pityDisplay } from '../game/summon/view';
import { JOURNEY_DAYS } from '../game/journey/definitions';
import { MAX_LEVEL, xpToNextLevel } from '../game/progression/config';
import { CardArtwork } from '../components/CardArtwork';
import { getDailyShopGiftState, subscribeDailyShopGift } from '../game/shop/dailyGift';
import { HomeEventBanner } from '../components/HomeEventBanner';

interface HomeProps {
  onOpenBattleSetup: () => void; onOpenCampaign: () => void; onOpenDecks: () => void;
  onOpenHeroes: () => void; onOpenProfile: () => void; onOpenShop: () => void; onOpenSummon: () => void;
  onOpenFriendly: () => void; onOpenLanterns: () => void; onOpenPixelPreview: () => void;
  /** Opens the live event page; Home shows its single event banner only while an event is running. */
  onOpenEvent?: () => void;
}

function claimableCount(state: MissionsState, period: 'daily' | 'weekly'): number {
  return listMissions(period, state).filter(({ def, progress }) => !progress.claimed && progress.count >= def.target).length;
}

function rewardLabel(node: (typeof CHAPTER_1.nodes)[number]): string | null {
  const reward = node.encounter?.firstClearReward ?? node.reward;
  return reward ? `${reward.label}${reward.count && reward.count > 1 ? ` ×${reward.count}` : ''}` : null;
}

export function HomePage(props: HomeProps) {
  const hub = useHubState();
  const account = useAccount();
  const deck = getActiveDeck();
  const [inspect, setInspect] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [idleClaimedGold, setIdleClaimedGold] = useState(0);
  const [refund, setRefund] = useState(() => pendingRefundNotice());
  const closeMissions = useCallback(() => setMissionsOpen(false), []);
  const closeJourney = useCallback(() => setJourneyOpen(false), []);
  const missions = useMissions();
  const dailyReady = claimableCount(missions, 'daily');
  const weeklyReady = claimableCount(missions, 'weekly');
  const dailyRows = listMissions('daily', missions);
  const dailyAllClaimed = dailyRows.length > 0 && dailyRows.every(({ progress }) => progress.claimed);
  const journey = useJourney();
  const economy = useEconomy();
  const dailyShopGift = useSyncExternalStore(subscribeDailyShopGift, getDailyShopGiftState, getDailyShopGiftState);
  const progress = loadProgress();
  const mainRoadNodes = CHAPTER_1.nodes.filter(node => !node.optional);
  const mainRoadCleared = mainRoadNodes.filter(node => isNodeCleared(node.id, progress)).length;
  const currentNode = hub.campaign.nextName ? findNode(getCurrentNodeId(progress) ?? '') : undefined;
  const currentStep = currentNode ? mainRoadNodes.indexOf(currentNode) + 1 : mainRoadNodes.length;
  const nextEncounter = currentNode ? (currentNode.encounter ? currentNode : CHAPTER_1.nodes.slice(CHAPTER_1.nodes.indexOf(currentNode)).find(n => !n.optional && n.encounter)) : undefined;
  // The active deck's real Starting HP (the battle's own helper: printed HP Contributions) and the next fight's authored
  // difficulty. No single-number deck rating: one number can't capture what a deck does in a lane.
  const startingHp = deckStartingHp(deck.cardIds).total;
  const nextDifficulty = nextEncounter?.encounter?.difficulty;
  const nextReward = (() => {
    const start = currentNode ? CHAPTER_1.nodes.indexOf(currentNode) : CHAPTER_1.nodes.length;
    for (const node of CHAPTER_1.nodes.slice(start)) {
      if (node.optional || isNodeCleared(node.id, progress)) continue;
      const label = rewardLabel(node);
      if (!label) continue;
      const distance = CHAPTER_1.nodes.slice(start, CHAPTER_1.nodes.indexOf(node) + 1).filter(n => !n.optional && !!n.encounter).length;
      return { label, distance, cardId: node.encounter?.firstClearReward.cardId ?? node.reward?.cardId };
    }
    return null;
  })();
  const banner = getBanner(loadSelectedBanner());
  const bannerPity = banner ? (economy.summon.pity[banner.id] ?? 0) : 0;
  const pity = pityDisplay(bannerPity);
  const summonReady = economy.tickets > 0 || economy.gems >= SUMMON_CONFIG.singleCost;
  const pityContext = pity.remaining <= 12;
  const featureCard = [...deck.cardIds].map(getCard).filter(card => card.type === 'hero').sort((a, b) => {
    const rarity: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
    return rarity[b.rarity] - rarity[a.rarity] || (b.power ?? 0) - (a.power ?? 0);
  })[0]?.id ?? deck.cardIds[0];
  const featureDefinition = featureCard ? getCard(featureCard) : null;
  const xpNeed = xpToNextLevel(account.level);
  const xpPct = account.level >= MAX_LEVEL ? 100 : Math.round(account.xp / xpNeed * 100);
  const DIFFICULTY_TONE = { easy: 'favoured', fair: 'even', hard: 'challenging' } as const;
  const returnState = journey.claimableDays.length > 0
    ? { key: `journey-${journey.claimableDays.join('-')}`, label: 'A Journey reward is ready to claim.' }
    : hub.note?.kind === 'idle'
      ? { key: `idle-${idleRewardCycleId()}`, label: `${hub.idle.availableGold.toLocaleString()} Idle Gold is ready to claim.` }
      : dailyReady + weeklyReady > 0
        ? { key: `missions-${missions.dayKey}-${missions.weekKey}-${dailyReady}-${weeklyReady}`, label: 'Mission rewards are ready to claim.' }
        : summonReady
          ? { key: `summon-${economy.tickets}-${economy.summon.history[0]?.at ?? 0}`, label: economy.tickets > 1 ? `${economy.tickets} Summon Tickets are ready to use.` : economy.tickets === 1 ? 'A Summon Ticket is ready to use.' : 'A Summon is available.' }
          : hub.note?.kind === 'recent'
            ? { key: `card-${hub.note.cardId}`, label: `${getCard(hub.note.cardId).name} joined your collection.` }
            : null;
  const returnSeen = (() => { try { return returnState ? localStorage.getItem(`moonwater:return-state:${returnState.key}`) === '1' : true; } catch { return false; } })();
  const nextJourneyDay = JOURNEY_DAYS.find(day => day.day === journey.currentDay + 1);
  const sessionGoalsComplete = dailyAllClaimed && dailyReady + weeklyReady === 0 && journey.claimableDays.length === 0 && hub.idle.availableGold === 0 && !summonReady;

  useEffect(() => {
    if (hub.note?.kind === 'idle') track('idle_reward_available', { gold: hub.note.gold, atCap: hub.note.atCap });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.note?.kind === 'idle' ? hub.note.gold : null]);
  useEffect(() => {
    if (!returnState || returnSeen) return;
    try { localStorage.setItem(`moonwater:return-state:${returnState.key}`, '1'); } catch { /* best effort */ }
    track('return_state_shown', { state: returnState.key });
  // A return-state is acknowledged once per distinct underlying ready state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnState?.key]);
  useEffect(() => {
    if (!sessionGoalsComplete) return;
    try {
      if (sessionStorage.getItem('moonwater:session-goals-reached') === '1') return;
      sessionStorage.setItem('moonwater:session-goals-reached', '1');
    } catch { /* best effort */ }
    track('session_goal_state_reached', { source: 'home' });
  }, [sessionGoalsComplete]);
  useEffect(() => {
    if (idleClaimedGold <= 0) return;
    const timeout = window.setTimeout(() => setIdleClaimedGold(0), 2600);
    return () => window.clearTimeout(timeout);
  }, [idleClaimedGold]);

  const rewardDistance = nextReward?.distance === 0 ? 'Ready ahead' : nextReward?.distance === 1 ? 'Next battle' : nextReward ? `${nextReward.distance} battles away` : '';
  const continueLabel = hub.campaign.status === 'fresh' ? 'Begin Campaign' : hub.campaign.status === 'complete' ? 'Replay Campaign' : 'Continue Campaign';

  return <main className="moon-home moon-home-hub">
    <header className="moon-home-header">
      <button type="button" className="moon-player-identity" onClick={props.onOpenProfile} aria-label={`Wanderer, account level ${account.level}. Open profile`}>
        <span className="moon-player-avatar"><span aria-hidden="true">☾</span><i>{account.level}</i></span>
        <span className="moon-player-copy"><strong>Wanderer</strong><small>Wayfarer · Account Level {account.level}</small><span className="moon-xp-track" role="progressbar" aria-valuemin={0} aria-valuemax={xpNeed} aria-valuenow={account.xp} aria-label="Account experience"><i style={{ width: `${xpPct}%` }} /></span></span>
      </button>
      <div className="moon-home-tools" role="group" aria-label="Balances">{economy.tickets > 0 && <TicketBalance />}<GoldBalance /><GemBalance /><button className="moon-help-button" onClick={() => setHelp(true)} aria-label="How to play">?</button></div>
    </header>

    <section className="home-campaign" aria-labelledby="home-campaign-title">
      <div className="home-campaign-scene" aria-hidden="true" />
      <div className="home-campaign-top"><div className="home-campaign-heading"><span className="home-kicker">{hub.campaign.chapterLine.replace(/^The /, '').replace(' · Chapter ', ' · Ch. ')}</span><h1 id="home-campaign-title">{currentNode?.name ?? hub.campaign.region}</h1><span className="home-stage-count">Step {Math.min(currentStep, mainRoadNodes.length)} <i>of</i> {mainRoadNodes.length}</span></div>
        {featureCard && featureDefinition && <button type="button" className={`home-feature-card ${featureDefinition.faction}`} onClick={() => setInspect(featureCard)} aria-label={`View ${featureDefinition.name}, featured card`}><span className="home-feature-wash"/><CardArtwork cardId={featureCard} className="home-feature-art"/><span className="home-feature-caption"><small>FEATURED CARD</small><strong>{featureDefinition.shortName}</strong></span></button>}
      </div>
      <div className="home-progress" role="progressbar" aria-label="Campaign chapter progress" aria-valuemin={0} aria-valuemax={mainRoadNodes.length} aria-valuenow={mainRoadCleared}><span style={{ width: `${mainRoadNodes.length ? mainRoadCleared / mainRoadNodes.length * 100 : 0}%` }} /></div>
      <div className="home-power-line"><span>Starting HP <strong>{startingHp.toLocaleString()}</strong></span>{nextDifficulty && <span>Next battle <b className={`home-power-read ${DIFFICULTY_TONE[nextDifficulty]}`}>{DIFFICULTY_LABEL[nextDifficulty]}</b></span>}<span className="home-energy">Energy {hub.energy.current}/{hub.energy.max}</span></div>
      {nextReward && <div className="home-target-reward"><span className="home-reward-spark" aria-hidden="true">✦</span><span><small>NEXT CAMPAIGN REWARD · {rewardDistance.toUpperCase()}</small><strong>{nextReward.label}</strong></span>{nextReward.cardId && <span className="home-reward-art" aria-hidden="true"><CardArtwork cardId={nextReward.cardId} /></span>}</div>}
      <button className="home-continue" onClick={props.onOpenCampaign}><span>{continueLabel}</span><b aria-hidden="true">→</b></button>
      {refund && (
        <button type="button" className="home-return-note" onClick={() => { dismissRefundNotice(); setRefund(null); }} aria-label="Dismiss the card Level refund note">
          Card Levels are retired: {refund.gold.toLocaleString('en-US')} Gold you put into them is back in your purse. ✕
        </button>
      )}
      {returnState && !returnSeen && (returnState.key.startsWith('card-')
        ? <button type="button" className="home-return-note" onClick={props.onOpenHeroes} aria-label={`${returnState.label} View collection`}>{returnState.label} · View collection →</button>
        : <p className="home-return-note" role="status">{returnState.label}</p>)}
    </section>

    <section className="home-secondary-actions" aria-label="Other battles"><button onClick={props.onOpenBattleSetup}><span aria-hidden="true">⚔</span><strong>Quick Battle</strong><small>Practice</small></button><span className="home-action-divider" aria-hidden="true"/><button onClick={props.onOpenFriendly}><span aria-hidden="true">◇</span><strong>Friendly Battle</strong><small>Play with a friend</small></button></section>

    <button className="home-formation" onClick={props.onOpenDecks}><span className="home-formation-icon" aria-hidden="true">▤</span><span><small>ACTIVE DECK</small><strong>{deck.label}</strong></span><span className="home-formation-meta">{deck.cardIds.length} cards · Edit →</span></button>

    {props.onOpenEvent && <HomeEventBanner onOpen={props.onOpenEvent} />}

    <section className="home-reward-rail" aria-label="Rewards and destinations">
      <button className={dailyReady + weeklyReady > 0 ? 'is-ready' : 'is-passive'} onClick={() => setMissionsOpen(true)}><span className="home-rail-icon">✦</span><strong>Missions</strong><small>{dailyReady + weeklyReady ? `${dailyReady + weeklyReady} ready` : 'Daily · Weekly'}</small>{dailyReady + weeklyReady > 0 && <i>READY</i>}</button>
      <button className={journey.claimableDays.length > 0 ? 'is-ready' : 'is-passive'} onClick={() => setJourneyOpen(true)}><span className="home-rail-icon">☾</span><strong>Journey</strong><small>{journey.claimableDays.length ? `${journey.claimableDays.length} ready` : nextJourneyDay ? `Tomorrow · ${nextJourneyDay.rewardTickets ? `${nextJourneyDay.rewardTickets} Ticket${nextJourneyDay.rewardTickets === 1 ? '' : 's'}` : nextJourneyDay.title}` : `Day ${journey.currentDay} of 7`}</small>{journey.claimableDays.length > 0 && <i>READY</i>}</button>
      <button className={hub.idle.availableGold > 0 ? 'is-ready' : 'is-passive'} disabled={hub.idle.availableGold <= 0} onClick={() => { const result = claimIdleReward(); hub.refreshIdle(); if (result.gold > 0) setIdleClaimedGold(result.gold); }}><span className="home-rail-icon">◈</span><strong>Idle Gold</strong><small>{hub.idle.availableGold > 0 ? `${hub.idle.availableGold.toLocaleString()} to claim` : 'Accruing'}</small>{hub.idle.availableGold > 0 && <i>READY</i>}</button>
      <button className={summonReady ? 'is-ready' : 'is-passive'} onClick={props.onOpenSummon}><span className="home-rail-icon">✧</span><strong>Moonwell</strong><small>{economy.tickets > 0 ? `${economy.tickets} ticket${economy.tickets === 1 ? '' : 's'}` : summonReady ? 'Summon ready' : pityContext ? `${pity.remaining} pulls to guarantee` : 'Summon'}</small>{summonReady && <i>READY</i>}</button>
    </section>
    {sessionGoalsComplete && <p className="home-session-calm" role="status">Daily rewards claimed · Idle Gold will keep accumulating.</p>}

    {idleClaimedGold > 0 && <div className="moon-claim-feedback" role="status">+{idleClaimedGold.toLocaleString()} Gold collected</div>}

    <nav className="home-quiet-links" aria-label="More"><small>MORE</small><span>{!dailyShopGift.claimed && <button className="home-shop-gift-link" onClick={props.onOpenShop}>Free Shop gift · Ready</button>}<button className="home-collection-link" onClick={props.onOpenHeroes}>Collection</button>{import.meta.env.DEV && <button className="home-dev-link" onClick={props.onOpenPixelPreview}>Pixel art preview · dev</button>}</span></nav>
    <footer className="moon-home-footer"><span>☾ Moonwater village</span><span>{hub.campaign.chapterLine}</span></footer>
    {inspect && <CardViewer cardId={inspect} context="other" onClose={() => setInspect(null)} />}{help && <HowToPlaySheet onClose={() => setHelp(false)} />}{missionsOpen && <MissionsSheet onClose={closeMissions} />}{journeyOpen && <JourneySheet onClose={closeJourney} />}
  </main>;
}
