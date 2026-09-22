import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './animation/timing';

const FILMS = ['/art/pixel/moonwater-summon-intro.mp4'];
/** Preload both shots; retain the previous frame until the continuation starts playing. */
export function SummonFilm({ active, onFinished }: { active: boolean; onFinished: () => void }) {
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [segment, setSegment] = useState(0);
  const [visibleSegment, setVisibleSegment] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    const media = videos.current[segment];
    if (!active || reduced) { videos.current.forEach(v => v?.pause()); if (active) onFinished(); return; }
    let finished = false;
    const finish = () => { if (!finished) { finished = true; media?.pause(); onFinished(); } };
    const ended = () => { if (finished) return; if (segment < FILMS.length-1) { finished=true; setSegment(segment+1); } else finish(); };
    const playing = () => setVisibleSegment(segment);
    media?.addEventListener('playing', playing);
    media?.addEventListener('ended', ended);
    media?.addEventListener('error', finish);
    const timeout = window.setTimeout(finish, 15000);
    media?.play().catch(finish);
    return () => { finished = true; window.clearTimeout(timeout); media?.pause(); media?.removeEventListener('playing', playing); media?.removeEventListener('ended', ended); media?.removeEventListener('error', finish); };
  }, [active, reduced, onFinished, segment]);
  return <div className={`summon-film ${active ? 'film-playing' : 'film-finished'}`} aria-hidden="true">
    {!reduced && FILMS.map((src,i) => <video key={src} ref={v => { videos.current[i]=v; }} className={`film-segment ${visibleSegment===i ? 'is-shown' : ''}`} src={src} poster={i===0 ? '/art/pixel/moonwater.png' : undefined} muted playsInline preload="auto" />)}
  </div>;
}
