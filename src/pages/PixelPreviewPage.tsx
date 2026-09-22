import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SummonFilm } from '../components/SummonFilm';
import { MoonwellVoyage } from '../components/MoonwellVoyage';
import '../styles/moonwellVoyage.css';
import { buildTimeline, viewAt } from '../game/summon/sequence';
import type { Rarity } from '../game/types';
import { useDialogFocus } from '../components/useDialogFocus';
import { CardArtwork } from '../components/CardArtwork';
import '../styles/pixelPreview.css';

const companions = [
  { id: 'pip', name: 'Pip', title: 'Keeper of little fires', type: 'Ember familiar', rarity: 'Rare', color: '#efb264', power: '240', text: 'Even the smallest flame can guide someone home.', skill: 'Warmth', detail: 'An ember tucked beneath his scarf never goes out. Lost travellers follow his tail through the reeds.', sheet: '/art/pixel/pip-sheet.png' },
  { id: 'selene', name: 'Selene', title: 'The moon’s last oath', type: 'Moon knight', rarity: 'Epic', color: '#aca6ec', power: '680', text: 'She keeps her promise long after the kingdom sleeps.', skill: 'Moonveil', detail: 'Each night she lights the abandoned watchtower. Somewhere across the water, another light still answers.', sheet: '/art/pixel/selene-sheet.png' },
  { id: 'aldren', name: 'Aldren', title: 'Crown of the old wood', type: 'Ancient guardian', rarity: 'Legendary', color: '#7bd4b2', power: '920', text: 'Before there were kings, there were roots.', skill: 'Rootbound', detail: 'A crown grown over a thousand winters. He kneels only to listen to the earth beneath his armour.', sheet: '/art/pixel/aldren-sheet.png' },
] as const;
type Companion = typeof companions[number];

function PixelCard({ hero, large = false, motion = true }: { hero: Companion; large?: boolean; motion?: boolean }) {
  return <div className={`px-card ${large ? 'px-card-large' : ''}`} style={{ '--hero': hero.color } as CSSProperties}>
    <div className="px-card-top"><span>✦ {hero.rarity}</span><span>☾ I</span></div>
    <div className="px-portrait px-portrait-live" role="img" aria-label={`${hero.name}, ${hero.type}`}><CardArtwork companion={hero.id} animated={motion} /></div>
    <div className="px-card-copy"><span className="px-kind">{hero.type}</span><h3>{hero.name}</h3><p>{hero.title}</p><div className="px-card-foot"><span>{hero.skill}</span><strong>⚔ {hero.power}</strong></div></div>
  </div>;
}

function SummonPreview({ hero, motion, onClose }: { hero: Companion; motion: boolean; onClose: () => void }) {
  const tier = hero.rarity.toLowerCase() as Rarity;
  const timeline = useMemo(() => buildTimeline([{ rarity: tier, mainFeatured: true }]), [tier]);
  const [step, setStep] = useState(() => motion ? 0 : timeline.length - 1);
  const view = viewAt(timeline, step, 1);
  const revealed = view.phase === 'emerge' || view.phase === 'reveal' || view.isResult;
  const finishIntro = useCallback(() => setStep(s => s === 0 ? 1 : s), []);
  const ref = useDialogFocus(onClose);
  useEffect(() => { if (!motion || view.isResult || step === 0) return; const timer = window.setTimeout(() => setStep(s => Math.min(s + 1, timeline.length - 1)), view.ms); return () => window.clearTimeout(timer); }, [motion, view.isResult, view.ms, step, timeline]);
  return <div className={`px-summon ${revealed ? 'px-revealed' : 'px-charging'}`} role="dialog" aria-modal="true" aria-label="Moonwell summon preview" ref={ref} tabIndex={-1}>
    <div className="px-summon-heading"><span className="px-eyebrow">THE MOONWELL</span><h2 aria-live="polite">{revealed ? 'An old friend. A new story.' : 'Across the midnight sky…'}</h2></div>
    <SummonFilm active={motion && step === 0} onFinished={finishIntro} /><div className="px-voyage-stage"><MoonwellVoyage phase={view.phase} tier={tier} duration={view.ms} /></div>
    {revealed ? <div className="px-reveal-card"><PixelCard hero={hero} large motion={motion} /></div> : <div className="px-voyage-space" />}
    <div className="px-summon-bottom"><p>{revealed ? hero.text : 'Every oath opens a new story.'}</p><button className="px-primary" onClick={revealed ? onClose : () => setStep(timeline.length - 1)}>{revealed ? 'Return to Moonwater' : 'Skip reveal'}</button><small>Art preview · no gems spent or cards granted</small></div>
  </div>;
}

export function PixelPreviewPage({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState(1);
  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [summoning, setSummoning] = useState(false);
  const hero = companions[selected];
  return <main className={`px-world ${motion ? '' : 'px-still'}`}>
    <div className="px-landscape" aria-hidden="true" /><div className="px-world-shade" aria-hidden="true" />
    <div className="px-stars" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--i': i, left: `${(i * 37 + 7) % 100}%`, top: `${(i * 19 + 5) % 80}%` } as CSSProperties} />)}</div>
    <div className="px-mist" aria-hidden="true" />
    <header className="px-header"><button onClick={onBack}>← Back to game</button><span>EMBER<span className="px-brand-gold">VALE</span></span><button aria-pressed={motion} onClick={() => setMotion(!motion)}>Motion {motion ? 'on' : 'off'}</button></header>
    <div className="px-layout">
      <section className="px-intro"><span className="px-eyebrow">A PLACE BETWEEN ADVENTURES</span><h1>Meet me at<br /><em>Moonwater.</em></h1><p>Leave a light on for the ones<br />who haven’t found their way home.</p><div className="px-location"><span>✦</span> THE LANTERN COAST <i /> BLUE HOUR</div></section>
      <section className="px-collection" aria-label="Companion art preview"><div className="px-section-title"><span>THREE STORIES WAITING</span><span>01 — 03</span></div><div className="px-cards">{companions.map((card, index) => <button key={card.id} className={`px-card-select ${selected === index ? 'is-selected' : ''}`} aria-pressed={selected === index} aria-label={`Select ${card.name}`} onClick={() => setSelected(index)}><PixelCard hero={card} motion={motion} /></button>)}</div>
      <div className="px-companion-note" aria-live="polite"><span style={{ color: hero.color }}>✦ {hero.name}’s story</span><p>{hero.detail}</p></div>
      <div className="px-actions"><button className="px-primary" onClick={() => setSummoning(true)}>✦ Call {hero.name} from the moonwell</button><span>Free art preview</span></div></section>
    </div><footer className="px-footer"><span>☾ Moonwater village</span><span>Pixel-art direction · work in progress</span></footer>
    {summoning && <SummonPreview hero={hero} motion={motion} onClose={() => setSummoning(false)} />}
  </main>;
}

