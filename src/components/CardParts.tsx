import type { Faction, Rarity } from '../game/types';
import { RARITY_GEMS } from './cardVisuals';
import '../styles/cardParts.css';

/** Faction mark (diamond / ring / spike / leaf) - shared by Decks and Heroes so the crest reads the same everywhere. */
export function Sigil({ faction, size }: { faction: Faction | 'spell'; size: 'lg' | 'md' | 'sm' }) {
  return <span className={`cp-sigil cp-sigil-${size} ${faction}`} aria-hidden="true" />;
}

/** The four rarity gems, lit to the card's tier and tinted by rarity. */
export function Gems({ rarity, dim }: { rarity: Rarity; dim?: boolean }) {
  return (
    <span className={`cp-gems r-${rarity} ${dim ? 'dim' : ''}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`cp-gem ${i < RARITY_GEMS[rarity] ? 'lit' : ''}`} />
      ))}
    </span>
  );
}
