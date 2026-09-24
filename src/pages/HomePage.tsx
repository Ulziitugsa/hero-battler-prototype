import { useEffect, useState } from 'react';
import { CardDetail } from '../components/CardDetail';
import { CollectibleCard } from '../components/CollectibleCard';
import { GemBalance } from '../components/GemIcon';
import { GoldBalance } from '../components/GoldIcon';
import { HowToPlaySheet } from '../components/HowToPlaySheet';
import { getCard } from '../game/cards';
import { getActiveDeck } from '../game/engine/activeDeck';
import { useHubState } from '../game/home/useHubState';
import { useAccount } from '../game/progression/useAccount';
import { claimIdleReward } from '../game/campaign/idleRewards';
import { track } from '../analytics/track';
import { HubNoteLine } from './home/HomeSections';
import { MissionsSheet } from '../components/MissionsSheet';
import { useMissions } from '../game/missions/useMissions';
import { anyMissionClaimable } from '../game/missions/store';
import { JourneySheet } from '../components/JourneySheet';
import { useJourney } from '../game/journey/useJourney';

interface HomeProps {
  onOpenBattleSetup: () => void; onOpenCampaign: () => void; onOpenDecks: () => void;
  onOpenHeroes: () => void; onOpenProfile: () => void; onOpenSummon: () => void;
  onOpenFriendly: () => void; onOpenLanterns: () => void; onOpenPixelPreview: () => void;
}
const SPOTLIGHT = ['inf-flame-imp', 'kng-paladin', 'und-grave-knight'];

export function HomePage(props: HomeProps) {
  const hub = useHubState();
  const account = useAccount();
  const deck = getActiveDeck();
  const [inspect, setInspect] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const missions = useMissions();
  const missionsReady = anyMissionClaimable(missions);
  const journey = useJourney();
  useEffect(() => {
    if (hub.note?.kind === 'idle') track('idle_reward_available', { gold: hub.note.gold, atCap: hub.note.atCap });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per distinct note, not on every render
  }, [hub.note?.kind === 'idle' ? hub.note.gold : null]);
  return <main className="moon-home">
    <header className="moon-home-header"><button className="moon-quiet" onClick={props.onOpenProfile}>Wanderer <span>· Level {account.level}</span></button><span className="moon-brand">EMBER<span>VALE</span></span><div className="moon-home-tools"><GoldBalance /><GemBalance /><button className="moon-quiet" onClick={() => setHelp(true)} aria-label="How to play">?</button></div></header>
    <div className="moon-home-main">
      <section className="moon-welcome"><span className="moon-eyebrow">A PLACE BETWEEN ADVENTURES</span><h1>Meet me at<br /><em>Moonwater.</em></h1><p>Leave a light on for the ones<br />who haven’t found their way home.</p><span className="moon-location">✦ THE LANTERN COAST <span>· BLUE HOUR</span></span>
        <button className="moon-primary moon-adventure" onClick={props.onOpenCampaign}>{hub.campaign.status === 'fresh' ? 'Begin your adventure' : hub.campaign.status === 'complete' ? 'Revisit the Ashen Road' : 'Continue your adventure'} <span>→</span></button><small>{hub.campaign.nextName ?? hub.campaign.region} · {hub.campaign.cleared}/{hub.campaign.total} stages</small>
      </section>
      <section className="moon-spotlight" aria-label="Discover companions"><div className="moon-section-line"><span>STORIES WAITING TO BE FOUND</span><button onClick={props.onOpenHeroes}>Your collection →</button></div><div className="moon-home-cards">{SPOTLIGHT.map(id => <button key={id} className="moon-inspect-card" onClick={() => setInspect(id)} aria-label={`Inspect ${getCard(id).name}`}><CollectibleCard cardId={id} /></button>)}</div><p className="moon-home-quote">Some answer a call. Others have been waiting for you.</p><button className="moon-primary" onClick={props.onOpenSummon}>✦ Visit the moonwell</button><small>Discover companions · view banners & rates</small></section>
    </div>
    <section className="moon-destinations" aria-label="Your next adventure"><button onClick={props.onOpenLanterns}><span className="moon-destination-icon">☾</span><span><small>STORY ADVENTURE</small><strong>Lanterns of the Lost</strong><em>Three battles. One forgotten promise.</em></span><b>↗</b></button><button onClick={props.onOpenBattleSetup}><span className="moon-destination-icon">⚔</span><span><small>THE TRAINING GROUNDS</small><strong>Quick battle</strong><em>Practice against a rival formation.</em></span><b>↗</b></button><button onClick={props.onOpenFriendly}><span className="moon-destination-icon">⚔</span><span><small>THE DUELING PIER</small><strong>Friendly battle</strong><em>Invite a friend. Bring your best formation.</em></span><b>↗</b></button><button onClick={props.onOpenDecks}><span className="moon-destination-icon">◇</span><span><small>YOUR FORMATION</small><strong>{deck.label}</strong><em>{deck.cardIds.length} cards · manage your deck</em></span><b>↗</b></button></section>
    {hub.note && <HubNoteLine note={hub.note} onOpenProfile={props.onOpenProfile} onOpenDecks={props.onOpenDecks} onOpenHeroes={props.onOpenHeroes} onClaimIdle={() => { claimIdleReward(); hub.refreshIdle(); }} />}
    <footer className="moon-home-footer"><span>☾ Moonwater village</span>{import.meta.env.DEV && <button onClick={props.onOpenPixelPreview}>Character studies</button>}<button className="moon-quiet" onClick={() => setMissionsOpen(true)}>Missions{missionsReady ? ' •' : ''}</button>{!journey.complete && <button className="moon-quiet" onClick={() => setJourneyOpen(true)}>Day {journey.currentDay}{journey.claimableDays.length > 0 ? ' •' : ''}</button>}<span>Energy {hub.energy.current}/{hub.energy.max}</span></footer>
    {inspect && <CardDetail cardId={inspect} onClose={() => setInspect(null)} />}{help && <HowToPlaySheet onClose={() => setHelp(false)} />}{missionsOpen && <MissionsSheet onClose={() => setMissionsOpen(false)} />}{journeyOpen && <JourneySheet onClose={() => setJourneyOpen(false)} />}
  </main>;
}
