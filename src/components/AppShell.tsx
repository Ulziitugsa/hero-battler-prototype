import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { homeAttentionReady, navDots } from '../game/home/hubState';
import { useCollection } from '../game/collection/useCollection';
import { anyAscensionReady } from '../game/home/hubState';
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
  // One aggregated Home marker covers claimable rewards and Profile access; Cards, Shop, and Ranked each have one marker.
  const owned = useCollection();
  const gift = useSyncExternalStore(subscribeDailyShopGift, getDailyShopGiftState, getDailyShopGiftState);
  const ranked = useSyncExternalStore(subscribeRanked, getRanked, getRanked);
  const hub = useHubState();
  const missions = useMissions();
  const journey = useJourney();
  const liveEvent = useLiveEvent();
  const dots = navDots({ canSummon: false, masteryPoint: false, ascensionReady: anyAscensionReady(owned) });
  useEffect(() => {
    window.scrollTo(0, 0);
    const content = document.querySelector<HTMLElement>('.app-frame-content');
    if (content) content.scrollTop = 0;
  }, [active]);
  const dailyReady = ['daily','weekly'].some(period => listMissions(period as 'daily'|'weekly',missions).some(({def,progress}) => !progress.claimed && progress.count>=def.target));
  const homeReady = homeAttentionReady({masteryPoint:dots.home,missionReward:dailyReady,journeyReward:journey.claimableDays.length>0,idleReward:hub.note?.kind==='idle',eventReward:(liveEvent?.claimable??0)>0});
  const shopReady = !gift.claimed && getGold()<MAX_GOLD;
  const rankedReady = readyRankRewards(ranked).length>0;
  const dotFor: Partial<Record<TabId, string>> = { home: homeReady ? 'Reward ready on Home' : '', heroes: dots.heroes ? 'Card Mastery available' : '', shop: shopReady ? 'Free Shop gift ready' : '', ranked: rankedReady ? 'Rank reward ready' : '' };
  const previousDots = useRef<Record<string, boolean>>({});
  useEffect(()=>{ const states={home:homeReady,heroes:dots.heroes,shop:shopReady,ranked:rankedReady};for(const [destination,visible] of Object.entries(states)){if(visible&&!previousDots.current[destination])track('attention_indicator_shown',{destination});if(!visible&&previousDots.current[destination])track('attention_indicator_cleared',{destination});previousDots.current[destination]=visible;} },[homeReady,dots.heroes,shopReady,rankedReady]);
  return (
    <div className="app-frame">
      <div className="app-frame-content">{children}</div>
      <nav className="hud-arc" aria-label="Main navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`hud-medallion ${active === tab.id ? 'active' : ''}`}
            onClick={() => onNavigate(tab.id)}
          >
            <span className="hud-medallion-chip">
              <Icon name={tab.icon} size={19} />
              {dotFor[tab.id] && <AttentionDot label={dotFor[tab.id]!} />}
            </span>
            <span className="hud-medallion-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
