import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { homeAttentionReady, navDots } from '../game/home/hubState';
import { getDailyShopGiftState, subscribeDailyShopGift } from '../game/shop/dailyGift';
import { AttentionDot } from './AttentionIndicator';
import { getRanked, readyRankRewards, subscribeRanked } from '../game/ranked/store';
import { useHubState } from '../game/home/useHubState';
import { useMissions } from '../game/missions/useMissions';
import { useJourney } from '../game/journey/useJourney';
import { listMissions } from '../game/missions/store';
import { getGold } from '../game/economy/economy';
import { MAX_GOLD } from '../game/economy/config';
import { track } from '../analytics/track';
import { useLiveEvent } from '../game/events/useLiveEvent';
import { useCardMarks } from '../game/collection/useCardMarks';
import { getCollectionSeenAt, markCollectionSeen, newCardIds, subscribeCollectionSeen } from '../game/collection/collectionSeen';
import { useRewardTarget } from './feedback/useRewardTarget';

// Battle is no longer a HUD destination - it's reached via the Fight seal on Home, which is built
// into that screen rather than the arc (see Home Screen v3). Battle Setup renders full-screen,
// outside this shell, same as an in-progress match.
export type TabId = 'home' | 'heroes' | 'shop' | 'decks' | 'ranked' | 'profile';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'heroes', label: 'Cards', icon: 'cards' },
  { id: 'shop', label: 'Shop', icon: 'shop' },
  { id: 'decks', label: 'Decks', icon: 'decks' },
  { id: 'ranked', label: 'Ranked', icon: 'battle' },
];

/**
 * The persistent app frame: content area + the Moonwater HUD navigation. Only wraps the main tab screens - an in-progress Battle, Battle Setup, and
 * modals render full-screen outside this shell, since combat shouldn't compete with navigation
 * chrome for vertical space on a small phone.
 */
export function AppShell({ active, onNavigate, children }: { active: TabId; onNavigate: (tab: TabId) => void; children: ReactNode }) {
  // One aggregated Home marker covers claimable rewards and Profile access; Shop and Ranked each have one marker.
  const gift = useSyncExternalStore(subscribeDailyShopGift, getDailyShopGiftState, getDailyShopGiftState);
  const ranked = useSyncExternalStore(subscribeRanked, getRanked, getRanked);
  const hub = useHubState();
  const missions = useMissions();
  const journey = useJourney();
  const liveEvent = useLiveEvent();
  const marks = useCardMarks();
  const collectionSeenAt = useSyncExternalStore(subscribeCollectionSeen, getCollectionSeenAt, getCollectionSeenAt);
  const dots = navDots({ canOpenPack: false, masteryPoint: false });
  // Card rewards (a Box pull, a Journey card) fly to the Cards medallion.
  const cardsTarget = useRewardTarget<HTMLSpanElement>('cards');
  useEffect(() => {
    window.scrollTo(0, 0);
    const content = document.querySelector<HTMLElement>('.app-frame-content');
    if (content) content.scrollTop = 0;
  }, [active]);
  // Opening Cards is looking at the collection: whatever was new has now been seen.
  useEffect(() => {
    if (active === 'heroes') markCollectionSeen();
  }, [active, marks]);
  const dailyReady = ['daily','weekly'].some(period => listMissions(period as 'daily'|'weekly',missions).some(({def,progress}) => !progress.claimed && progress.count>=def.target));
  const homeReady = homeAttentionReady({masteryPoint:dots.home,missionReward:dailyReady,journeyReward:journey.claimableDays.length>0,idleReward:hub.note?.kind==='idle',eventReward:(liveEvent?.claimable??0)>0});
  const shopReady = !gift.claimed && getGold()<MAX_GOLD;
  const rankedReady = readyRankRewards(ranked).length>0;
  const newCards = active === 'heroes' ? 0 : newCardIds(marks, collectionSeenAt).length;
  const dotFor: Partial<Record<TabId, string>> = { home: homeReady ? 'Reward ready on Home' : '', shop: shopReady ? 'Free Shop gift ready' : '', ranked: rankedReady ? 'Rank reward ready' : '', heroes: newCards > 0 ? `${newCards} new ${newCards === 1 ? 'card' : 'cards'} in your collection` : '' };
  // A claimable reward is gold; something new to look at is teal. Neither is ever shown without real state behind it.
  const dotState: Partial<Record<TabId, 'ready' | 'new'>> = { heroes: 'new' };
  const previousDots = useRef<Record<string, boolean>>({});
  useEffect(()=>{ const states={home:homeReady,shop:shopReady,ranked:rankedReady};for(const [destination,visible] of Object.entries(states)){if(visible&&!previousDots.current[destination])track('attention_indicator_shown',{destination});if(!visible&&previousDots.current[destination])track('attention_indicator_cleared',{destination});previousDots.current[destination]=visible;} },[homeReady,shopReady,rankedReady]);
  return (
    <div className="app-frame">
      <div className="app-frame-content">{children}</div>
      <nav className="hud-arc" aria-label="Main navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`hud-medallion ${active === tab.id ? 'active' : ''} ${dotFor[tab.id] ? 'has-attention' : ''}`}
            onClick={() => onNavigate(tab.id)}
            aria-current={active === tab.id ? 'page' : undefined}
          >
            <span className="hud-medallion-chip" ref={tab.id === 'heroes' ? cardsTarget : undefined}>
              <Icon name={tab.icon} size={19} />
              {dotFor[tab.id] && <AttentionDot label={dotFor[tab.id]!} state={dotState[tab.id] ?? 'ready'} />}
            </span>
            <span className="hud-medallion-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
