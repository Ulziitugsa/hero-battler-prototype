import { useRef, useState } from 'react';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { BattleSetupPage, type DeckChoice } from './pages/BattleSetupPage';
import { DeckBuilderPage } from './pages/DeckBuilderPage';
import { CollectionPage } from './pages/CollectionPage';
import { StatsPage } from './pages/StatsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AppShell, type TabId } from './components/AppShell';

export default function App() {
  const [tab, setTab] = useState<TabId>('home');
  const [showStats, setShowStats] = useState(false);
  const [showBattleSetup, setShowBattleSetup] = useState(false);
  const [battleSetup, setBattleSetup] = useState<{ player: DeckChoice; enemy: DeckChoice; id: number } | null>(null);
  const battleCounter = useRef(0);

  // An in-progress match renders full-screen, outside the bottom-nav shell entirely - combat
  // shouldn't compete with navigation chrome for space on a small phone (see README "Battle
  // Responsiveness"). Returning from it goes back to whichever tab was active before.
  if (battleSetup) {
    return (
      <GamePage
        key={battleSetup.id}
        playerDeck={battleSetup.player.cardIds}
        enemyDeck={battleSetup.enemy.cardIds}
        playerDeckLabel={battleSetup.player.label}
        enemyDeckLabel={battleSetup.enemy.label}
        onExit={() => setBattleSetup(null)}
      />
    );
  }

  // Developer-only Playtest Stats is reached from Profile, not the main nav - kept full-screen with
  // its own back button so it never looks like part of the everyday player experience.
  if (showStats) return <StatsPage onBack={() => setShowStats(false)} />;

  // Battle Setup is reached from Home's Fight seal, not a HUD tab (Home Screen v3) - it renders
  // full-screen, same as an in-progress match, with its own way back to Home.
  if (showBattleSetup) return <BattleSetupPage onStartBattle={startBattle} onBack={() => setShowBattleSetup(false)} />;

  function startBattle(player: DeckChoice, enemy: DeckChoice) {
    battleCounter.current += 1;
    setShowBattleSetup(false);
    setBattleSetup({ player, enemy, id: battleCounter.current });
  }

  let screen;
  if (tab === 'home') {
    screen = (
      <HomePage
        onOpenBattleSetup={() => setShowBattleSetup(true)}
        onStartQuickBattle={startBattle}
        onOpenDecks={() => setTab('decks')}
        onOpenProfile={() => setTab('profile')}
      />
    );
  } else if (tab === 'heroes') {
    screen = <CollectionPage />;
  } else if (tab === 'decks') {
    screen = <DeckBuilderPage />;
  } else {
    screen = <ProfilePage onOpenStats={() => setShowStats(true)} />;
  }

  return (
    <AppShell active={tab} onNavigate={setTab}>
      {screen}
    </AppShell>
  );
}
