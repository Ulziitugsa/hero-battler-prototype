import { GameCard } from '../../components/card/GameCard';
import { CardArtwork } from '../../components/CardArtwork';
import { getCard } from '../../game/cards';
import { cardCopyView } from '../../game/cards/cardCopy';
import { useCollection } from '../../game/collection/useCollection';
import type { Rarity } from '../../game/types';
import '../../styles/homeFeatured.css';

const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const FACTION_LABEL: Record<string, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal', wildborn: 'Wildborn' };

export interface HomeFeaturedCardProps {
  /** The active deck's champion (game/home/featuredCard.ts deckChampion). */
  cardId: string;
  deckLabel: string;
  /** The active Box's Legendary while it is still inside and not yet owned (boxChase); null hides the chase row. */
  chase: { cardId: string; boxName: string } | null;
  onPlay: () => void;
  onInspect: (cardId: string) => void;
  onOpenDeck: () => void;
  onOpenBox: () => void;
}

/**
 * Home's card-first anchor: the champion of the deck the player is about to take into battle, shown as the real card
 * face in its rarity light, with the one obvious thing to do with it (play) and the ways to look closer (inspect, the
 * deck). When the Box the player pulls from still holds a Legendary they do not own, a slim chase row points at it.
 */
export function HomeFeaturedCard({ cardId, deckLabel, chase, onPlay, onInspect, onOpenDeck, onOpenBox }: HomeFeaturedCardProps) {
  const collection = useCollection();
  const card = getCard(cardId);
  const copy = cardCopyView(cardId, collection);
  return (
    <section className={`mw-featured mw-enter ${card.faction}`} aria-labelledby="mw-featured-title">
      <button type="button" className="mw-featured-card mw-rarity" data-rarity={card.rarity} onClick={() => onInspect(cardId)} aria-label={`Inspect ${card.name}`}>
        <GameCard cardId={cardId} density="tile" owned={copy.owned} hpContribution={copy.hpContribution} />
      </button>
      <div className="mw-featured-copy">
        <span className="mw-featured-kicker">Your champion</span>
        <h2 id="mw-featured-title">{card.name}</h2>
        <span className={`mw-featured-meta r-${card.rarity}`}>{RARITY_LABEL[card.rarity]} · {FACTION_LABEL[card.faction] ?? card.faction}</span>
        <div className="mw-featured-actions">
          <button type="button" className="mw-featured-cta" onClick={onPlay}>
            <span>Play</span>
            <small>Quick Battle</small>
          </button>
          <button type="button" className="mw-featured-secondary" onClick={() => onInspect(cardId)}>Inspect</button>
        </div>
        <button type="button" className="mw-featured-deck" onClick={onOpenDeck}>
          <small>In deck</small> {deckLabel} <b aria-hidden="true">→</b>
        </button>
      </div>
      {chase && (
        <button type="button" className="mw-featured-chase" onClick={onOpenBox} aria-label={`${getCard(chase.cardId).name} is still in the ${chase.boxName}. Open the Box`}>
          <span className="mw-featured-chase-art mw-rarity" data-rarity={getCard(chase.cardId).rarity} aria-hidden="true">
            <CardArtwork cardId={chase.cardId} animated={false} />
          </span>
          <span className="mw-featured-chase-copy">
            <small>Still in the {chase.boxName}</small>
            <strong>{getCard(chase.cardId).name}</strong>
          </span>
          <span className="mw-featured-chase-cta">Open Box <b aria-hidden="true">→</b></span>
        </button>
      )}
    </section>
  );
}
