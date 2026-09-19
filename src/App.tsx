import { useRef, useState } from 'react';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { BattleSetupPage, type DeckChoice } from './pages/BattleSetupPage';
import { DecksPage } from './pages/DecksPage';
import { HeroesPage } from './pages/HeroesPage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';
import { CampaignPage } from './pages/campaign/CampaignPage';
import { AppShell, type TabId } from './components/AppShell';
import { recordBattleResult, type BattleResultOutcome } from './game/campaign/progress';
import { getActiveDeck } from './game/engine/activeDeck';

export default function App() {
  const [tab, setTab] = useState<TabId>('home');
  const [showStats, setShowStats] = useState(false);
  const [showBattleSetup, setShowBattleSetup] = useState(false);
  const [showCampaign, setShowCampaign] = useState(false);
  const [battleSetup, setBattleSetup] = useState<{ player: DeckChoice; enemy: DeckChoice; id: number; startingHp?: number } | null>(null);
  // Which Campaign node the in-progress battle belongs to, if any - set only by startCampaignBattle,
  // never by Quick Battle, so Quick Battle can never touch Campaign state (see progress.ts's own note).
  const [campaignNodeId, setCampaignNodeId] = useState<string | null>(null);
  const [pendingCampaignResult, setPendingCampaignResult] = useState<BattleResultOutcome | null>(null);
  const battleCounter = useRef(0);

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
        onMatchEnd={
          campaignNodeId
            ? (status, stats, events) => {
                const playerDeckFaction = getActiveDeck().faction;
                setPendingCampaignResult(recordBattleResult(campaignNodeId, status, stats, events, playerDeckFaction));
              }
            : undefined
        }
        onExit={() => {
          setBattleSetup(null);
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
        onExit={() => setShowCampaign(false)}
        onFightNode={startCampaignBattle}
        pendingResult={pendingCampaignResult}
        onConsumedResult={() => setPendingCampaignResult(null)}
      />
    );
  }

  function startBattle(player: DeckChoice, enemy: DeckChoice) {
    battleCounter.current += 1;
    setShowBattleSetup(false);
    setBattleSetup({ player, enemy, id: battleCounter.current });
  }

  function startCampaignBattle(nodeId: string, player: DeckChoice, enemy: DeckChoice, startingHp?: number) {
    battleCounter.current += 1;
    setShowCampaign(false);
    setCampaignNodeId(nodeId);
    setBattleSetup({ player, enemy, id: battleCounter.current, startingHp });
  }

  let screen;
  if (tab === 'home') {
    screen = (
      <HomePage
        onOpenBattleSetup={() => setShowBattleSetup(true)}
        onOpenCampaign={() => setShowCampaign(true)}
        onStartQuickBattle={startBattle}
        onOpenDecks={() => setTab('decks')}
        onOpenProfile={() => setTab('profile')}
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
