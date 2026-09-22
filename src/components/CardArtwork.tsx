import { useEffect, useRef, useState } from 'react';
import { getCard } from '../game/cards';
import { PIXEL_CARD_ART, PIXEL_COMPANIONS } from '../game/cards/pixelArt';
import { Sigil } from './CardParts';

const PORTRAIT_RESOLUTION = 160;

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => { images.delete(src); reject(new Error(`Artwork unavailable: ${src}`)); }; image.src = src;
  }));
  return images.get(src)!;
}

/** Render on a 160px grid: crisp pixels with enough detail for readable faces, not a high-resolution image with a CSS filter.
 * Sheets are decoded once; offscreen, hidden-tab and reduced-motion loops stop. */
export function CardArtwork({ cardId, companion, animated = true, className = '' }: { cardId?: string; companion?: string; animated?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const asset = companion ? PIXEL_COMPANIONS[companion] : PIXEL_CARD_ART[cardId ?? ''];
  const card = cardId ? getCard(cardId) : null;
  useEffect(() => {
    const element = canvas.current;
    if (!asset || !element) return;
    let cancelled = false, timer = 0, visible = true, frame = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let image: HTMLImageElement | null = null;
    const paint = () => {
      if (!image || cancelled) return;
      const context = element.getContext('2d'); if (!context) return;
      const cell = asset.cell + frame;
      const w = image.width / asset.columns, h = image.height / asset.rows;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, PORTRAIT_RESOLUTION, PORTRAIT_RESOLUTION);
      context.drawImage(image, cell % asset.columns * w, Math.floor(cell / asset.columns) * h, w, h, 0, 0, PORTRAIT_RESOLUTION, PORTRAIT_RESOLUTION);
    };
    const sync = () => {
      window.clearInterval(timer);
      if (!animated || reduced.matches) { frame = 0; paint(); }
      if (image && visible && !document.hidden && animated && !reduced.matches && asset.frames > 1)
        timer = window.setInterval(() => { frame = (frame + 1) % asset.frames; paint(); }, 125);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element); document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
    loadImage(asset.src).then(value => { if (!cancelled) { image = value; paint(); sync(); } }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; window.clearInterval(timer); observer.disconnect(); document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync); };
  }, [asset, animated]);
  if (!asset || failed) return <span className={`moon-art moon-rune ${card?.faction ?? 'kingdom'} ${className}`} aria-hidden="true"><Sigil faction={card?.type === 'spell' ? 'spell' : card?.faction ?? 'kingdom'} size="lg" /></span>;
  return <canvas ref={canvas} width={PORTRAIT_RESOLUTION} height={PORTRAIT_RESOLUTION} className={`moon-art ${className}`} aria-hidden="true" />;
}

