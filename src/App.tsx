import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
const PixelPreviewPage = lazy(() => import('./pages/PixelPreviewPage').then(m => ({ default: m.PixelPreviewPage })));
const BattleCardLabPage = lazy(() => import('./pages/BattleCardLabPage').then(m => ({ default: m.BattleCardLabPage })));
const BattleSceneLabPage = lazy(() => import('./pages/BattleSceneLabPage').then(m => ({ default: m.BattleSceneLabPage })));
const FriendlyBattlePage = lazy(() => import('./pages/FriendlyBattlePage').then(m => ({ default: m.FriendlyBattlePage })));
import { BattleSetupPage, type DeckChoice } from './pages/BattleSetupPage';
import { DecksPage } from './pages/DecksPage';
import { HeroesPage } from './pages/HeroesPage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ShopPage, type ShopView } from './pages/ShopPage';
import { SummonPage } from './pages/SummonPage';
import { LanternsPage } from './pages/LanternsPage';
import { EventPage } from './pages/EventPage';
import { completeLanternTrial } from './game/story/lanterns';
import { CampaignPage } from './pages/campaign/CampaignPage';
import { AppShell, type TabId } from './components/AppShell';
import { recordBattleResult, type BattleResultOutcome } from './game/campaign/progress';
import { getActiveDeck } from './game/engine/activeDeck';
import { getEquippedLoadout } from './game/progression/account';
import type { MasteryLoadout } from './game/types';
import { WorldBackdrop } from './components/WorldBackdrop';
import { AnalyticsDebugPanel } from './components/AnalyticsDebugPanel';
import { isDebugPanelEnabled, track } from './analytics/track';
import './styles/moonwaterGame.css';
import { installLifecycleBridge } from './platform/lifecycle';
import { registerBackButton } from './platform/backButton';
import { runBackInterceptor } from './platform/backInterceptors';
import { configureStatusBar } from './platform/statusBar';
import { App as NativeApp } from '@capacitor/app';
import './styles/moonwaterPolish.css';
import { MoonwaterLoading } from './components/MoonwaterLoading';
import { RankedPage } from './pages/RankedPage';
import { chooseRankedOpponent, getRanked, recordRankedMatch } from './game/ranked/store';
import { CombatV2LabPage } from './pages/CombatV2LabPage';
import { type CombatModel, type LocalBattleMode, combatModelForMode } from './game/combat/combatModel';

export default function App() {
  return <div className="moon-game"><WorldBackdrop /><Suspense fallback={<MoonwaterLoading />}><GameApp /></Suspense>{isDebugPanelEnabled() && <AnalyticsDebugPanel />}</div>;
}

function GameApp() {
  const [tab, setTabState] = useState<TabId>('home');
  const [showPixelPreview, setShowPixelPreview] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).has('pixelPreview'));
  const [showBattleCardLab, setShowBattleCardLab] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).has('battleCardLab'));
  const [battleScene, setBattleScene] = useState(() => (import.meta.env.DEV ? new URLSearchParams(window.location.search).get('battleScene') : null));
  const [showFriendly, setShowFriendly] = useState(() => new URLSearchParams(window.location.search).has('friendly'));
  const [showStats, setShowStats] = useState(false);
  const [showCombatLab, setShowCombatLab] = useState(false);
  const [showBattleSetup, setShowBattleSetup] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  // Home's Continue Campaign lands straight on the chapter map; other entries start at region select.
  const [campaignOnMap, setCampaignOnMap] = useState(false);
  const [showSummon, setShowSummon] = useState(false);
  const [showLanterns, setShowLanterns] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  // Shop sub-view to open on the next visit (an event's featured Box or Structure Deck). Keyed so it remounts.
  const [shopEntry, setShopEntry] = useState<{ view: ShopView; key: number }>({ view: { kind: 'main' }, key: 0 });
  // Leaving the Shop forgets the event's entry view, so the next Shop visit opens on the main page.
  const setTab = (next: TabId) => {
    if (next !== 'shop') setShopEntry(prev => (prev.view.kind === 'main' ? prev : { view: { kind: 'main' }, key: prev.key }));
    setTabState(next);
  };
  const [lanternTrialId, setLanternTrialId] = useState<string | null>(null);
  const [storySaveFailed, setStorySaveFailed] = useState(false);
  const [storyResult, setStoryResult] = useState<string | null>(null);
  const [lastStoryTrial, setLastStoryTrial] = useState<string | null>(null);
  // One local battle. Every mode plays card combat (game/combat/combatModel.ts); `combatModel` is only ever something
  // else in a development build that asked for an old engine. Both sides play their deck lists at printed card values:
  // no stored Mastery / Ascension rank or Level of either side is passed to a battle.
  const [battleSetup, setBattleSetup] = useState<{ player: DeckChoice; enemy: DeckChoice; id: number; mode: LocalBattleMode; combatModel: CombatModel; mastery: MasteryLoadout | null; startingHpOverride?: Partial<Record<'player' | 'enemy', number>>; rankedOpponentLabel?: string } | null>(null);
  // Which Campaign node the in-progress battle belongs to, if any - set only by startCampaignBattle,
  // never by Quick Battle, so Quick Battle can never touch Campaign state (see progress.ts's own note).
  const [campaignNodeId, setCampaignNodeId] = useState<string | null>(null);
  const [pendingCampaignResult, setPendingCampaignResult] = useState<BattleResultOutcome | null>(null);
  const battleCounter = useRef(0);

  useEffect(() => {
    void configureStatusBar();
    return installLifecycleBridge();
  }, []);

  // The handler reads current state; keep it in a ref so the native listener is registered once.
  const backHandler = useRef<() => void>(() => {});
  backHandler.current = () => {
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'));
    const topDialog = dialogs.reverse().find((dialog) => dialog.getClientRects().length > 0);
    if (topDialog) {
      const target = document.activeElement instanceof HTMLElement && topDialog.contains(document.activeElement)
        ? document.activeElement
        : topDialog;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return;
    }
    if (battleSetup) {
      setBattleSetup(null);
      if (lanternTrialId) { setLanternTrialId(null); setShowLanterns(true); }
      if (campaignNodeId) { setCampaignNodeId(null); setShowCampaign(true); }
      return;
    }
    if (showFriendly) { setShowFriendly(false); window.history.replaceState(null, '', window.location.pathname); return; }
    if (showPixelPreview) { setShowPixelPreview(false); window.history.replaceState(null, '', window.location.pathname); return; }
    if (showStats) { setShowStats(false); return; }
    if (showCombatLab) { setShowCombatLab(false); setTab('profile'); return; }
    if (showBattleSetup) { setShowBattleSetup(false); return; }
    if (showCampaign) { setShowCampaign(false); setCampaignOnMap(false); return; }
    if (showSummon) { setShowSummon(false); return; }
    if (showLanterns) { setShowLanterns(false); return; }
    if (showEvent) { setShowEvent(false); return; }
    // A tab's own sub-view (Shop → Box / Structure Deck) steps back inside the tab first.
    if (runBackInterceptor()) return;
    if (tab !== 'home') { setTab('home'); return; }
    void NativeApp.exitApp();
  };
  useEffect(() => registerBackButton(() => backHandler.current()), []);

  if (showBattleCardLab) return <BattleCardLabPage onBack={() => { setShowBattleCardLab(false); window.history.replaceState(null, '', window.location.pathname); }} />;
  if (battleScene) return <BattleSceneLabPage scene={battleScene} onBack={() => { setBattleScene(null); window.history.replaceState(null, '', window.location.pathname); }} />;
  if (showPixelPreview) return <PixelPreviewPage onBack={() => { setShowPixelPreview(false); window.history.replaceState(null, '', window.location.pathname); }} />;

  if (showFriendly) return <FriendlyBattlePage onBack={() => { setShowFriendly(false); window.history.replaceState(null, '', window.location.pathname); }} />;
  // Combat V2 is experimental and superseded: its lab is a dev-build tool only, never reachable in production.
  if (import.meta.env.DEV && showCombatLab) return <CombatV2LabPage onBack={() => { setShowCombatLab(false); setTab('profile'); }} />;

  // An in-progress match renders full-screen, outside the bottom-nav shell entirely - combat
  // shouldn't compete with navigation chrome for space on a small phone (see README "Battle
  // Responsiveness"). Returning from it goes back to whichever tab was active before, or - for a
  // Campaign battle - back to the Campaign map with the node's result waiting to be shown.
  if (battleSetup) {
    return (
      <GamePage
        key={battleSetup.id}
        playerDeck={battleSetup.player.cardIds}
        enemyDeck={battleSetup.enemy.cardIds}
        playerDeckLabel={battleSetup.player.label}
        enemyDeckLabel={battleSetup.enemy.label}
        startingHpOverride={battleSetup.startingHpOverride}
        playerMastery={battleSetup.mastery}
        combatModel={battleSetup.combatModel}
        battleMode={battleSetup.mode === 'quickBattle' ? 'quick' : battleSetup.mode}
        onMatchEnd={
          battleSetup.rankedOpponentLabel
            ? (status) => {
                const result = status === 'PLAYER_WIN' ? 'win' : status === 'DRAW' ? 'draw' : 'loss';
                const before = recordRankedMatch(result, battleSetup.rankedOpponentLabel!);
                track(result === 'win' ? 'ranked_match_won' : 'ranked_match_lost', { opponent: battleSetup.rankedOpponentLabel });
                track('ranked_rating_changed', { rating: before.rating, result });
              }
            : campaignNodeId
            ? (status, stats, events) => {
                const playerDeckFaction = getActiveDeck().faction;
                setPendingCampaignResult(recordBattleResult(campaignNodeId, status, stats, events, playerDeckFaction));
              }
            : lanternTrialId ? (status) => {
                if (status === 'PLAYER_WIN') setStorySaveFailed(!completeLanternTrial(lanternTrialId));
                setStoryResult(status === 'PLAYER_WIN' ? 'Watch held. A new piece of the story is revealed.' : status === 'DRAW' ? 'The watch ends in a draw. Try again when you are ready.' : 'The road is lost, but your story is not over. Adjust your deck and try again.');
              } : undefined
        }
        onExit={() => {
          setBattleSetup(null);
          if (lanternTrialId) { setLanternTrialId(null); setShowLanterns(true); }
          if (campaignNodeId) {
            setCampaignNodeId(null);
            setShowCampaign(true);
          }
          if (battleSetup.rankedOpponentLabel) setTab('ranked');
        }}
      />
    );
  }

  // Developer-only Playtest Stats is reached from Profile, not the main nav - kept full-screen with
  // its own back button so it never looks like part of the everyday player experience.
  if (showStats) return <StatsPage onBack={() => setShowStats(false)} />;

  // Battle Setup is reached from Home's Fight seal, not a HUD tab (Home Screen v3) - it renders
  // full-screen, same as an in-progress match, with its own way back to Home.
  if (showBattleSetup) return <BattleSetupPage onStartBattle={(player, enemy) => startBattle('quickBattle', player, enemy)} onBack={() => setShowBattleSetup(false)} />;

  // Campaign, like Battle, runs without the bottom HUD arc - its own carved back medallion returns
  // to Home (Campaign Screen.dc.html's own "Open points" note).
  if (showCampaign) {
    return (
      <CampaignPage
        openOnMap={campaignOnMap}
        onExit={() => {
          setShowCampaign(false);
          setCampaignOnMap(false);
        }}
        onFightNode={startCampaignBattle}
        pendingResult={pendingCampaignResult}
        onConsumedResult={() => setPendingCampaignResult(null)}
        onRecoveryDestination={(destination) => {
          setShowCampaign(false);
          setCampaignOnMap(false);
          if (destination === 'home') setTab('home');
          if (destination === 'heroes') setTab('heroes');
          if (destination === 'decks') setTab('decks');
        }}
      />
    );
  }

  // Summon, like Campaign, is a full-screen destination reached from Home - the player picks what to open in Heroes/Decks afterwards.
  if (showSummon) return <SummonPage onBack={() => setShowSummon(false)} />;
  // The live event page, like Summon, is a full-screen destination reached from Home's event banner.
  if (showEvent) return <EventPage onBack={() => setShowEvent(false)} onOpenShop={(product) => { setShowEvent(false); setShopEntry(prev => ({ view: product.kind === 'box' ? { kind: 'box', id: product.id } : { kind: 'structure-deck', id: product.id }, key: prev.key + 1 })); setTab('shop'); }} />;
  if (showLanterns) return <><LanternsPage result={storyResult} initialTrialId={lastStoryTrial} onBack={() => setShowLanterns(false)} onFight={(id, deck, label) => {
    const active = getActiveDeck();
    setStorySaveFailed(false);
    setStoryResult(null);
    setLanternTrialId(id);
    setLastStoryTrial(id);
    setShowLanterns(false);
    startBattle('story', { label: active.label, cardIds: active.cardIds }, { label, cardIds: deck });
  }} />{storySaveFailed && <p role="alert">Your browser could not save this story result. Enable local storage before replaying.</p>}</>;

  function startBattle(mode: LocalBattleMode, player: DeckChoice, enemy: DeckChoice, extra: { startingHpOverride?: Partial<Record<'player' | 'enemy', number>>; rankedOpponentLabel?: string } = {}) {
    battleCounter.current += 1;
    setShowBattleSetup(false);
    // `mastery` is the account Tactic loadout, which only the dev-only legacy resolver reads; card combat ignores it.
    setBattleSetup({ player, enemy, id: battleCounter.current, mode, combatModel: combatModelForMode(mode), mastery: getEquippedLoadout(), ...extra });
  }

  function startCampaignBattle(nodeId: string, player: DeckChoice, enemy: DeckChoice, startingHpOverride: Partial<Record<'player' | 'enemy', number>>) {
    setShowCampaign(false);
    setCampaignNodeId(nodeId);
    track('campaign_node_started', { nodeId });
    startBattle('campaign', player, enemy, { startingHpOverride });
  }

  let screen;
  if (tab === 'home') {
    screen = (
      <HomePage
        onOpenFriendly={() => { setShowFriendly(true); window.history.replaceState(null, '', '?friendly'); }}
        onOpenBattleSetup={() => setShowBattleSetup(true)}
        onOpenCampaign={() => {
          setCampaignOnMap(true);
          setShowCampaign(true);
        }}
        onOpenDecks={() => setTab('decks')}
        onOpenHeroes={() => setTab('heroes')}
        onOpenProfile={() => setTab('profile')}
        onOpenShop={() => setTab('shop')}
        onOpenSummon={() => setShowSummon(true)}
        onOpenLanterns={() => setShowLanterns(true)}
        onOpenEvent={() => setShowEvent(true)}
        onOpenPixelPreview={() => setShowPixelPreview(true)}
      />
    );
  } else if (tab === 'heroes') {
    screen = <HeroesPage onOpenDecks={() => setTab('decks')} />;
  } else if (tab === 'shop') {
    screen = <ShopPage key={shopEntry.key} initialView={shopEntry.view} />;
  } else if (tab === 'decks') {
    screen = <DecksPage />;
  } else if (tab === 'ranked') {
    screen = <RankedPage onBattle={() => {
      const player = getActiveDeck();
      const ranked = getRanked();
      // The rival comes from the division's own deck pool, at printed card values (game/ranked/tiers.ts).
      const rival = chooseRankedOpponent(ranked);
      track('ranked_match_started', { rating: ranked.rating, opponent: rival.deck.name });
      startBattle('ranked', { label: player.label, cardIds: player.cardIds }, { label: `${rival.tier.division} · ${rival.deck.name}`, cardIds: rival.deck.cardIds }, { rankedOpponentLabel: rival.deck.name });
    }} />;
  } else {
    screen = <ProfilePage onOpenStats={() => setShowStats(true)} onOpenCombatLab={import.meta.env.DEV ? () => setShowCombatLab(true) : undefined} />;
  }

  return (
    <AppShell active={tab} onNavigate={setTab}>
      {screen}
    </AppShell>
  );
}
