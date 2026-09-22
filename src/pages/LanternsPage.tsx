import { useState } from 'react';
import { Icon } from '../components/Icon';
import { CollectibleCard } from '../components/CollectibleCard';
import { LANTERN_TRIALS, canPlayTrial, loadLanternProgress } from '../game/story/lanterns';
import '../styles/lanterns.css';

export function LanternsPage({ onBack, onFight, result, initialTrialId }: { onBack: () => void; onFight: (id: string, deck: string[], label: string) => void; result?: string | null; initialTrialId?: string | null }) {
  const [cleared] = useState(loadLanternProgress);
  const [selected, setSelected] = useState(() => {
    const previous = LANTERN_TRIALS.findIndex(t => t.id === initialTrialId);
    return previous >= 0 ? previous : Math.min(cleared.length, LANTERN_TRIALS.length - 1);
  });
  const trial = LANTERN_TRIALS[selected];
  const unlocked = canPlayTrial(trial.id, cleared);
  const done = cleared.includes(trial.id);
  return <main className="lantern-page">
    <header className="lantern-nav"><button onClick={onBack} aria-label="Back to Home"><Icon name="back" size={20} /></button><span>Embervale · Stories</span><span>{cleared.length} / 3</span></header>
    <div className="lantern-cover"><span>A tale from the Ashen Road</span><h1>Lanterns<br />of the Lost</h1><p>The dead are not invading.<br />They are keeping watch.</p></div>
    <div className="lantern-body">
      {result && <p className="lantern-result" role="status">{result}</p>}
      <p className="lantern-intro">Three battles. Three pieces of a buried truth. A permanent story adventure, played with your battle deck.</p>
      <nav className="lantern-chapters" aria-label="Story chapters">{LANTERN_TRIALS.map((t, i) => <button key={t.id} onClick={() => setSelected(i)} aria-pressed={i === selected}><span>{cleared.includes(t.id) ? '✓' : `0${i + 1}`}</span>{t.name}{!canPlayTrial(t.id, cleared) && <Icon name="lock" size={12} />}</button>)}</nav>
      <section className="lantern-trial"><div className="lantern-portrait"><CollectibleCard cardId={trial.cardId} compact /></div><div><span className="lantern-subtitle">{trial.subtitle}</span><h2>{trial.name}</h2><p>{trial.briefing}</p></div></section>
      <aside className="lantern-tactic"><Icon name="battle" size={17} /><p>{trial.tactic}</p></aside>
      {done && <section className="lantern-ending"><span>After the battle</span><p>{trial.ending}</p></section>}
      <button className="lantern-fight" disabled={!unlocked} onClick={() => onFight(trial.id, [...trial.deck], trial.name)}>{unlocked ? done ? 'Replay this watch' : 'Take the watch' : 'Complete the previous chapter'} <Icon name={unlocked ? 'battle' : 'lock'} size={18} /></button>
      <p className="lantern-footnote">No energy cost · Story progress saved on this device</p>
    </div>
  </main>;
}
