import { lazy, Suspense, useRef, useState } from 'react';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
const PixelPreviewPage = lazy(() => import('./pages/PixelPreviewPage').then(m => ({ default: m.PixelPreviewPage })));
const FriendlyBattlePage = lazy(() => import('./pages/FriendlyBattlePage').then(m => ({ default: m.FriendlyBattlePage })));
import { BattleSetupPage, type DeckChoice } from './pages/BattleSetupPage';
import { DecksPage } from './pages/DecksPage';
import { HeroesPage } from './pages/HeroesPage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SummonPage } from './pages/SummonPage';
import { LanternsPage } from './pages/LanternsPage';
import { completeLanternTrial } from './game/story/lanterns';
import { CampaignPage } from './pages/campaign/CampaignPage';
import { AppShell, type TabId } from './components/AppShell';
import { recordBattleResult, type BattleResultOutcome } from './game/campaign/progress';
import { getActiveDeck } from './game/engine/activeDeck';
import { getEquippedLoadout } from './game/progression/account';
import { ascensionRanksFor } from './game/ascension/store';
import { heroLevelsFor } from './game/heroLevel/store';
import type { MasteryLoadout } from './game/types';
import { WorldBackdrop } from './components/WorldBackdrop';
import { AnalyticsDebugPanel } from './components/AnalyticsDebugPanel';
import { isDebugPanelEnabled, track } from './analytics/track';
import './styles/moonwaterGame.css';

export default function App() {
  return <div className="moon-game"><WorldBackdrop /><Suspense fallback={<p role="status" style={{ padding: 32 }}>Opening Moonwater…</p>}><GameApp /></Suspense>{isDebugPanelEnabled() && <AnalyticsDebugPanel />}</div>;
}

function GameApp() {
  const [tab, setTab] = useState<TabId>('home');
  const [showPixelPreview, setShowPixelPreview] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).has('pixelPreview'));
  const [showFriendly, setShowFriendly] = useState(() => new URLSearchParams(window.location.search).has('friendly'));
  const [showStats, setShowStats] = useState(false);
  const [showBattleSetup, setShowBattleSetup] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  // Home's Continue Campaign lands straight on the chapter map; other entries start at region select.
  const [campaignOnMap, setCampaignOnMap] = useState(false);
  const [showSummon, setShowSummon] = useState(false);
  const [showLanterns, setShowLanterns] = useState(false);
  const [lanternTrialId, setLanternTrialId] = useState<string | null>(null);
  const [storySaveFailed, setStorySaveFailed] = useState(false);
  const [storyResult, setStoryResult] = useState<string | null>(null);
  const [lastStoryTrial, setLastStoryTrial] = useState<string | null>(null);
  const [battleSetup, setBattleSetup] = useState<{ player: DeckChoice; enemy: DeckChoice; id: number; startingHp?: number; mastery: MasteryLoadout | null; ascensions: Record<string, number>; heroLevels: Record<string, number> } | null>(null);
  // Which Campaign node the in-progress battle belongs to, if any - set only by startCampaignBattle,
  // never by Quick Battle, so Quick Battle can never touch Campaign state (see progress.ts's own note).
  const [campaignNodeId, setCampaignNodeId] = useState<string | null>(null);
  const [pendingCampaignResult, setPendingCampaignResult] = useState<BattleResultOutcome | null>(null);
  const battleCounter = useRef(0);

  if (showPixelPreview) return <PixelPreviewPage onBack={() => { setShowPixelPreview(false); window.history.replaceState(null, '', window.location.pathname); }} />;

  if (showFriendly) return <FriendlyBattlePage onBack={() => { setShowFriendly(false); window.history.replaceState(null, '', window.location.pathname); }} />;

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
        startingHp={battleSetup.startingHp}
        playerMastery={battleSetup.mastery}
        playerAscensions={battleSetup.ascensions}
        playerHeroLevels={battleSetup.heroLevels}
        onMatchEnd={
          campaignNodeId
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
        }}
      />
    );
  }

  // Developer-only Playtest Stats is reached from Profile, not the main nav - kept full-screen with
  // its own back button so it never looks like part of the everyday player experience.
  if (showStats) return <StatsPage onBack={() => setShowStats(false)} />;

  // Battle Setup is reached from Home's Fight seal, not a HUD tab (Home Screen v3) - it renders
  // full-screen, same as an in-progress match, with its own way back to Home.
  if (showBattleSetup) return <BattleSetupPage onStartBattle={startBattle} onBack={() => setShowBattleSetup(false)} />;

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
      />
    );
  }

  // Summon, like Campaign, is a full-screen destination reached from Home - the player picks what to open in Heroes/Decks afterwards.
  if (showSummon) return <SummonPage onBack={() => setShowSummon(false)} />;
  if (showLanterns) return <><LanternsPage result={storyResult} initialTrialId={lastStoryTrial} onBack={() => setShowLanterns(false)} onFight={(id, deck, label) => {
    const active = getActiveDeck();
    setStorySaveFailed(false);
    setStoryResult(null);
    setLanternTrialId(id);
    setLastStoryTrial(id);
    setShowLanterns(false);
    startBattle({ label: active.label, cardIds: active.cardIds }, { label, cardIds: deck });
  }} />{storySaveFailed && <p role="alert">Your browser could not save this story result. Enable local storage before replaying.</p>}</>;

  function startBattle(player: DeckChoice, enemy: DeckChoice) {
    battleCounter.current += 1;
    setShowBattleSetup(false);
    setBattleSetup({ player, enemy, id: battleCounter.current, mastery: getEquippedLoadout(), ascensions: ascensionRanksFor(player.cardIds), heroLevels: heroLevelsFor(player.cardIds) });
  }

  function startCampaignBattle(nodeId: string, player: DeckChoice, enemy: DeckChoice, startingHp?: number) {
    battleCounter.current += 1;
    setShowCampaign(false);
    setCampaignNodeId(nodeId);
    track('campaign_node_started', { nodeId });
    setBattleSetup({ player, enemy, id: battleCounter.current, startingHp, mastery: getEquippedLoadout(), ascensions: ascensionRanksFor(player.cardIds), heroLevels: heroLevelsFor(player.cardIds) });
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
        onOpenSummon={() => setShowSummon(true)}
        onOpenLanterns={() => setShowLanterns(true)}
        onOpenPixelPreview={() => setShowPixelPreview(true)}
      />
    );
  } else if (tab === 'heroes') {
    screen = <HeroesPage onOpenDecks={() => setTab('decks')} />;
  } else if (tab === 'decks') {
    screen = <DecksPage />;
  } else {
    screen = <ProfilePage onOpenStats={() => setShowStats(true)} />;
  }

  return (
    <AppShell active={tab} onNavigate={setTab}>
      {screen}
    </AppShell>
  );
}
