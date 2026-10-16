import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { getBackground } from '../game/backgrounds/definitions';
import { getSelectedBackgroundId, subscribeBackground } from '../game/backgrounds/store';

export function WorldBackdrop() {
  const backgroundId = useSyncExternalStore(subscribeBackground, getSelectedBackgroundId, getSelectedBackgroundId);
  const selected = getBackground(backgroundId);
  const [shown, setShown] = useState(selected);
  const [previous, setPrevious] = useState<typeof selected | null>(null);

  useEffect(() => {
    if (shown.id === selected.id) return;
    setPrevious(shown);
    setShown(selected);
  }, [selected, shown]);

  useEffect(() => {
    if (!previous) return;
    const timer = window.setTimeout(() => setPrevious(null), 480);
    return () => window.clearTimeout(timer);
  }, [previous]);

  return <div className="moon-world" data-background={shown.id} aria-hidden="true">
    <div className="moon-world-image">
      {previous && <div className={`moon-world-scene ${previous.pixelArt ? 'pixel-art' : ''} fade-away`} style={{ backgroundImage: `url("${previous.asset}")` }} />}
      <div className={`moon-world-scene ${shown.pixelArt ? 'pixel-art' : ''} ${previous ? 'fade-in' : ''}`} style={{ backgroundImage: `url("${shown.asset}")` }} />
    </div>
    <div className="moon-world-shade" />
    {/* Atmosphere (styles/identity.css): moonlight from above, two slow mist banks, a vignette. Gradients only. */}
    <div className="moon-world-halo" />
    <div className="moon-world-mist"><i /><i /></div>
    <div className="moon-world-vignette" />
    <div className="moon-world-fireflies">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ '--i': i, left: `${(i * 37 + 8) % 100}%`, top: `${(i * 19 + 16) % 90}%` } as CSSProperties} />)}</div>
  </div>;
}
