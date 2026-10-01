import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../components/Icon';
import { GemIcon } from '../../components/GemIcon';
import { CardArtwork } from '../../components/CardArtwork';
import { GameCard } from '../../components/card/GameCard';
import { CardViewer } from '../../components/card/CardViewer';
import { cardCopyView } from '../../game/cards/cardCopy';
import { Sigil } from '../../components/CardParts';
import { useDialogFocus } from '../../components/useDialogFocus';
import { getCard } from '../../game/cards';
import { canAfford } from '../../game/economy/economy';
import { useEconomy } from '../../game/economy/useEconomy';
import { useCollection } from '../../game/collection/useCollection';
import { getOwnedCount } from '../../game/collection/collection';
import type { StructureDeckDef } from '../../game/structureDecks/definitions';
import { buyStructureDeck, getStructureDeckState, structureDeckPurchases, subscribeStructureDecks } from '../../game/structureDecks/store';
import { track } from '../../analytics/track';
import '../../styles/box.css';
import '../../styles/structureDeck.css';

const FACTION_LABEL: Record<StructureDeckDef['faction'], string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' };

function deckLines(cardIds: string[]) {
  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([cardId, count]) => ({ card: getCard(cardId), count }));
}

function ConfirmPurchase({ deck, onCancel, onConfirm }: { deck: StructureDeckDef; onCancel: () => void; onConfirm: () => void }) {
  const ref = useDialogFocus(onCancel);
  return <div className="box-sheet-backdrop centered" onClick={onCancel}><div ref={ref} className="box-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="sd-confirm-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
    <span className="box-eyebrow">STRUCTURE DECK</span>
    <h2 id="sd-confirm-title">Get {deck.name}?</h2>
    <p>Spend <GemIcon size={14} /> {deck.priceGems.toLocaleString()} Gems. All {deck.cardIds.length} cards are added to your collection, and the deck is saved in Decks ready to play.</p>
    <p className="box-test-note">Prototype: bought with in-game Gems only. No real money is involved.</p>
    <div className="box-reset-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="confirm" onClick={onConfirm}>Get deck</button></div>
  </div></div>;
}

/** A featured card: the game's one card face, as the player's copy (Card Mastery and HP Contribution). */
function FeaturedCard({ cardId }: { cardId: string }) {
  const copy = cardCopyView(cardId);
  return <GameCard cardId={cardId} density="tile" owned={copy.owned} masteryStage={copy.masteryStage} hpContribution={copy.hpContribution} />;
}

export function StructureDeckDetail({ deck, onBack }: { deck: StructureDeckDef; onBack: () => void }) {
  const economy = useEconomy();
  const owned = useCollection();
  const purchases = useSyncExternalStore(subscribeStructureDecks, getStructureDeckState, getStructureDeckState);
  const bought = structureDeckPurchases(deck.id, purchases);
  const soldOut = bought >= deck.purchaseLimit;
  const [inspect, setInspect] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  const lines = deckLines(deck.cardIds);
  const units = lines.filter(line => line.card.type === 'hero');
  const spells = lines.filter(line => line.card.type === 'spell');
  const alreadyOwned = lines.filter(line => getOwnedCount(line.card.id, owned) >= line.count).length;

  useEffect(() => {
    track('structure_deck_viewed', { deckId: deck.id });
    window.scrollTo?.({ top: 0 });
  }, [deck.id]);

  function buy() {
    setConfirming(false);
    const result = buyStructureDeck(deck);
    if (result.ok) setNotice(`${deck.name} is yours. ${result.newCards > 0 ? `${result.newCards} new cards joined your collection. ` : ''}Find it in Decks, ready to play.`);
    else setNotice(result.reason === 'limit-reached' ? 'You already own this Structure Deck.' : `You need ${deck.priceGems.toLocaleString()} Gems for this deck.`);
  }

  const renderLine = ({ card, count }: ReturnType<typeof deckLines>[number]) => <button type="button" key={card.id} className={`sd-line r-${card.rarity}`} onClick={() => setInspect(card.id)}>
    <span className="sd-line-count">×{count}</span>
    <span className="sd-line-name">{card.name}</span>
    <span className="sd-line-rarity">{card.rarity}</span>
    <span className="sd-line-owned">{getOwnedCount(card.id, owned) > 0 ? `own ${getOwnedCount(card.id, owned)}` : 'new'}</span>
  </button>;

  return <main className="shop-screen box-screen sd-screen">
    <nav className="box-nav"><button type="button" onClick={onBack}><Icon name="back" size={18} />Shop</button><span><GemIcon size={15} />{economy.gems.toLocaleString()}</span></nav>

    <section className={`sd-hero ${deck.faction}`} aria-labelledby="sd-title">
      <div className="sd-hero-art" aria-hidden="true"><CardArtwork cardId={deck.featuredCardIds[0]} /></div>
      <div className="sd-hero-copy">
        <span className="box-eyebrow">STRUCTURE DECK · {deck.cardIds.length} CARDS</span>
        <h1 id="sd-title">{deck.name}</h1>
        <p className="sd-faction"><Sigil faction={deck.faction} size="sm" />{FACTION_LABEL[deck.faction]} · {deck.style}</p>
        <p className="sd-tagline">{deck.tagline}</p>
      </div>
    </section>

    <div className="sd-buy">
      <div><strong>Ready to play</strong><small>{soldOut ? 'Owned · saved in Decks' : `${units.reduce((n, l) => n + l.count, 0)} Units · ${spells.reduce((n, l) => n + l.count, 0)} Spells · limit ${deck.purchaseLimit}`}</small></div>
      <button type="button" onClick={() => setConfirming(true)} disabled={soldOut} aria-describedby={!soldOut && !canAfford(deck.priceGems, economy.gems) ? 'sd-short' : undefined}>
        {soldOut ? 'Owned' : <><GemIcon size={15} />{deck.priceGems.toLocaleString()}</>}
      </button>
    </div>
    {!soldOut && !canAfford(deck.priceGems, economy.gems) && <p id="sd-short" className="box-notice">You have {economy.gems.toLocaleString()} Gems. Earn more in Campaign, missions and Ranked.</p>}
    {notice && <p className="box-notice" role="status">{notice}</p>}

    <section className="box-section" aria-labelledby="sd-how-title">
      <h2 id="sd-how-title">How this deck plays</h2>
      <p className="sd-body">{deck.howItPlays}</p>
    </section>

    <section className="box-section" aria-labelledby="sd-featured-title">
      <div className="box-section-heading"><h2 id="sd-featured-title">Featured cards</h2><span>Tap for details</span></div>
      <div className="box-chase sd-featured">
        {deck.featuredCardIds.map(id => <button type="button" key={id} className="box-chase-card" onClick={() => setInspect(id)}>
          <FeaturedCard cardId={id} />
        </button>)}
      </div>
    </section>

    <section className="box-section" aria-labelledby="sd-combo-title">
      <h2 id="sd-combo-title">Example combo</h2>
      <ol className="sd-combo">{deck.exampleCombo.map((step, index) => <li key={index}>{step}</li>)}</ol>
    </section>

    <section className="box-section" aria-labelledby="sd-list-title">
      <div className="box-section-heading"><h2 id="sd-list-title">Full contents</h2><span>{alreadyOwned} of {lines.length} already in your collection</span></div>
      <h3 className="sd-group">Units</h3>
      <div className="sd-list">{units.map(renderLine)}</div>
      <h3 className="sd-group">Spells</h3>
      <div className="sd-list">{spells.map(renderLine)}</div>
    </section>

    {confirming && <ConfirmPurchase deck={deck} onCancel={() => setConfirming(false)} onConfirm={buy} />}
    {inspect && <CardViewer cardId={inspect} context="shop" onClose={() => setInspect(null)} />}
  </main>;
}
