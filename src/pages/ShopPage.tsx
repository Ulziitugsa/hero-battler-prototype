import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { GoldIcon } from '../components/GoldIcon';
import { GemIcon } from '../components/GemIcon';
import { TicketIcon } from '../components/TicketIcon';
import { CardArtwork } from '../components/CardArtwork';
import { getConfig } from '../config/config';
import { useEconomy } from '../game/economy/useEconomy';
import { canAfford } from '../game/economy/economy';
import { MAX_GOLD } from '../game/economy/config';
import { loadEnergy } from '../game/campaign/energy';
import { ENERGY_REFILL_AMOUNT, ENERGY_REFILL_GEMS, refillEnergyWithGems } from '../game/shop/energyRefill';
import { getDailyShopGiftState, subscribeDailyShopGift, claimDailyShopGift, dailyShopGiftResetsAt, DAILY_SHOP_GIFT_GOLD } from '../game/shop/dailyGift';
import { OFFERS, type OfferId, type OfferDef } from '../game/offers/definitions';
import { simulatePurchase, trackOfferClicked, trackOfferCtaClicked, trackOfferSeen } from '../game/offers/store';
import { isGrowthPackVisible, isStarterPackVisible } from '../game/offers/eligibility';
import { useAccount } from '../game/progression/useAccount';
import { useDialogFocus } from '../components/useDialogFocus';
import { getCard } from '../game/cards';
import { track } from '../analytics/track';
import { boxPullPrice, boxPullTickets, hasOpenedPacks } from '../game/box/boxProduct';
import { BOX_FACTION_GROUPS, boxSize, getArchetypeBox, isArchetypeBoxId } from '../game/box/archetypeBoxes';
import { boxCardsRemaining, getBoxesState, getBoxPool } from '../game/box/boxPool';
import { STRUCTURE_DECKS_ON_SALE, getStructureDeck } from '../game/structureDecks/definitions';
import { getStructureDeckState, structureDeckPurchases, subscribeStructureDecks } from '../game/structureDecks/store';
import { BoxDetail } from './shop/BoxDetail';
import { StructureDeckDetail } from './shop/StructureDeckDetail';
import { pushBackInterceptor } from '../platform/backInterceptors';
import '../styles/shop.css';

/** Which Shop surface is showing. Box and Structure Deck pages are addressed by their stable product ids. */
export type ShopView = { kind: 'main' } | { kind: 'box'; id: string } | { kind: 'structure-deck'; id: string };

// Gold is earn-only: there is no Gems -> Gold exchange (removed 2026-10-04). Energy refill: game/shop/energyRefill.ts.
type PendingPurchase = { kind: 'offer'; id: OfferId } | { kind: 'energy' };

function rewardContent(offer: OfferDef) {
  return <span className="shop-reward-line">
    {offer.reward.gold ? <span><GoldIcon size={15} />{offer.reward.gold.toLocaleString()}</span> : null}
    {offer.reward.gems ? <span><GemIcon size={15} />{offer.reward.gems.toLocaleString()}</span> : null}
    {offer.reward.tickets ? <span><TicketIcon size={15} />{offer.reward.tickets}</span> : null}
    {offer.reward.cardId ? <span className="shop-card-reward">{getCard(offer.reward.cardId).shortName}</span> : null}
  </span>;
}

function ShopConfirmation({ pending, energy, prices, onCancel, onConfirm }: {
  pending: PendingPurchase;
  energy: ReturnType<typeof loadEnergy>;
  prices: Record<string, string>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmationRef = useDialogFocus(onCancel);
  const offer = pending.kind === 'offer' ? OFFERS.find((item) => item.id === pending.id) : undefined;
  return <div className="shop-confirm-backdrop" onClick={onCancel}><div ref={confirmationRef} className="shop-confirm" role="dialog" aria-modal="true" aria-labelledby="shop-confirm-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
    <button type="button" className="shop-confirm-close" onClick={onCancel} aria-label="Cancel"><Icon name="close" size={18} /></button>
    <span className="shop-section-eyebrow">REVIEW EXCHANGE</span><h2 id="shop-confirm-title">{offer?.title ?? 'Energy refill'}</h2>
    {offer ? <><p>{offer.subtitle}</p><div className="shop-confirm-reward">{rewardContent(offer)}</div><p className="shop-confirm-test">{prices[offer.id] ?? 'Test offer'} · simulated only · no charge</p></> : <p>Spend {ENERGY_REFILL_GEMS} Gems to restore up to {ENERGY_REFILL_AMOUNT} Energy. Current: {energy.current}/{energy.max}.</p>}
    <div className="shop-confirm-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="confirm" onClick={onConfirm}>Confirm {pending.kind === 'offer' ? '(Test)' : 'Exchange'}</button></div>
  </div></div>;
}

export function ShopPage({ initialView = { kind: 'main' } }: { initialView?: ShopView } = {}) {
  const economy = useEconomy();
  const accountLevel = useAccount().level;
  const gift = useSyncExternalStore(subscribeDailyShopGift, getDailyShopGiftState, getDailyShopGiftState);
  const [energy, setEnergy] = useState(loadEnergy);
  const [giftResetCountdown, setGiftResetCountdown] = useState('');
  const [pending, setPending] = useState<PendingPurchase | null>(null);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<ShopView>(initialView);
  // Android Back from a Box or Structure Deck returns to the Shop, not Home.
  useEffect(() => (view.kind === 'main' ? undefined : pushBackInterceptor(() => setView({ kind: 'main' }))), [view.kind]);
  const structurePurchases = useSyncExternalStore(subscribeStructureDecks, getStructureDeckState, getStructureDeckState);
  const seenOffers = useRef(new Set<OfferId>());
  const prices = getConfig().offers.priceLabels;
  const offersEnabled = getConfig().flags.offersEnabled;

  const openedPacks = hasOpenedPacks(economy);
  const eligibleOffers = useMemo(() => offersEnabled ? OFFERS.filter((offer) => {
    if (offer.id === 'starter-pack') return isStarterPackVisible({ openedPacks, accountLevel });
    if (offer.id === 'growth-pack') return isGrowthPackVisible({ openedPacks, accountLevel });
    if (offer.id.startsWith('gem-pack-')) return openedPacks;
    return false;
  }) : [], [openedPacks, accountLevel, offersEnabled]);
  const featured = eligibleOffers.filter((offer) => offer.id === 'starter-pack' || offer.id === 'growth-pack');
  const gemPacks = eligibleOffers.filter((offer) => offer.id.startsWith('gem-pack-'));

  useEffect(() => {
    track('shop_opened', { source: 'main_navigation' });
    track('offer_opened', { popup_source: 'shop', session_offer_count: 0 });
  }, []);

  useEffect(() => {
    for (const offer of eligibleOffers) {
      if (offer.comingSoon) continue;
      const eligibleKey = `moonwater:offer-eligible:${offer.id}`;
      try {
        if (localStorage.getItem(eligibleKey) !== '1') {
          localStorage.setItem(eligibleKey, '1');
          track('offer_became_eligible', { offerId: offer.id, source: 'player_progress' });
        }
      } catch { /* eligibility remains available even if analytics acknowledgement cannot persist */ }
      if (!seenOffers.current.has(offer.id)) {
        seenOffers.current.add(offer.id);
        trackOfferSeen(offer.id);
      }
    }
  }, [eligibleOffers]);

  useEffect(() => {
    const refresh = () => { setEnergy(loadEnergy()); getDailyShopGiftState(); };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  const closeConfirmation = useCallback(() => setPending(null), []);

  function chooseOffer(id: OfferId) {
    track('shop_product_viewed', { productId: id, productType: id.startsWith('gem-pack-') ? 'gems' : 'bundle' });
    trackOfferCtaClicked(id, 'shop', 0);
    trackOfferClicked(id);
    setPending({ kind: 'offer', id });
  }

  function confirmPurchase() {
    if (!pending) return;
    if (pending.kind === 'offer') {
      const result = simulatePurchase(pending.id);
      if (result.ok) {
        track('shop_purchase_simulated', { productId: pending.id, productType: pending.id.startsWith('gem-pack-') ? 'gems' : 'bundle', simulated: true });
        const gained = [result.gold > 0 && `${result.gold.toLocaleString()} Gold`, result.gems > 0 && `${result.gems.toLocaleString()} Gems`, result.tickets > 0 && `${result.tickets} Tickets`, result.cardGranted && getCard(result.cardGranted).shortName].filter(Boolean);
        setNotice(`${gained.join(' · ')} added. Test purchase only; no charge.`);
      }
    } else {
      const result = refillEnergyWithGems();
      setEnergy(result.energy);
      if (result.ok) setNotice(`${result.restored} Energy restored for ${ENERGY_REFILL_GEMS} Gems.`);
      else setNotice(result.reason === 'full' ? 'Energy is already full.' : 'You do not have enough Gems for this refill.');
    }
    setPending(null);
  }

  function claimGift() {
    if (claimDailyShopGift()) setNotice(`${DAILY_SHOP_GIFT_GOLD} Gold collected. Your next free gift is available after the daily reset.`);
  }

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = Math.max(0, dailyShopGiftResetsAt(gift) - new Date().getTime());
      setGiftResetCountdown(`${Math.floor(remaining / 3_600_000)}h ${Math.floor((remaining % 3_600_000) / 60_000)}m`);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 30_000);
    return () => window.clearInterval(interval);
  }, [gift]);

  if (view.kind === 'box' && isArchetypeBoxId(view.id)) return <BoxDetail box={getArchetypeBox(view.id)} onBack={() => setView({ kind: 'main' })} />;
  const openDeck = getStructureDeck(view.kind === 'structure-deck' ? view.id : '');
  if (openDeck) return <StructureDeckDetail deck={openDeck} onBack={() => setView({ kind: 'main' })} />;

  const boxState = getBoxesState();

  return <main className="shop-screen">
    <header className="shop-header">
      <div><span className="shop-kicker">THE MOONWATER MARKET</span><h1>Shop</h1><p>Card Boxes, Structure Decks and supplies.</p></div>
      <div className="shop-balances">{economy.tickets > 0 && <span aria-label={`${economy.tickets} Pack ${economy.tickets === 1 ? 'Ticket' : 'Tickets'}`}><TicketIcon size={16} />{economy.tickets.toLocaleString()}</span>}<span><GemIcon size={16} />{economy.gems.toLocaleString()}</span><span><GoldIcon size={16} />{economy.gold.toLocaleString()}</span></div>
    </header>

    <div className="shop-test-note"><Icon name="check" size={14} /> Prototype store · Boxes and Structure Decks use in-game Gems (a Pack Ticket pays for one pull); bundles and Gem bundles are simulated test purchases. No real money is charged.</div>

    <section className="shop-section shop-first-section" aria-labelledby="shop-box-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">ARCHETYPE BOXES</span><h2 id="shop-box-title">Card Boxes</h2></div><span className="shop-section-note">{economy.tickets > 0 ? <><TicketIcon size={13} />{boxPullTickets(1)} / pull</> : <><GemIcon size={13} />{boxPullPrice(1)} / pull</>}</span></div>
      {BOX_FACTION_GROUPS.map(group => <div key={group.faction} className={`shop-box-group ${group.faction}`}>
        <h3 className="shop-box-group-title">{group.name}</h3>
        <div className="shop-box-tiles">
          {group.boxIds.map(id => {
            const box = getArchetypeBox(id);
            const size = boxSize(id);
            const left = boxCardsRemaining(id, boxState);
            const legendaryInside = (getBoxPool(id, boxState).remaining[box.flagshipId] ?? 0) > 0;
            return <button type="button" key={id} className={`shop-box-tile ${left === 0 ? 'empty' : ''}`} onClick={() => setView({ kind: 'box', id })} aria-label={`${box.name}: ${left} of ${size} cards left. ${box.theme}. Open the Box`}>
              <span className="shop-box-tile-art" aria-hidden="true"><CardArtwork cardId={box.flagshipId} /></span>
              <strong>{box.name.replace(/ Box$/, '')}</strong>
              <span className="shop-box-tile-left">{left === 0 ? 'Empty · restock' : `${left} / ${size} left`}</span>
              <span className="shop-box-meter"><span style={{ width: `${(left / size) * 100}%` }} /></span>
              <small>{legendaryInside ? 'Legendary inside' : 'Legendary pulled'}</small>
            </button>;
          })}
        </div>
      </div>)}
    </section>

    <section className={`shop-gift shop-section ${gift.claimed || economy.gold >= MAX_GOLD ? 'claimed' : 'ready'}`} aria-labelledby="shop-gift-title">
      <div className="shop-gift-art" aria-hidden="true"><span>✦</span><GoldIcon size={24} /></div>
      <div className="shop-gift-copy"><span className="shop-section-eyebrow">DAILY GIFT</span><h2 id="shop-gift-title">A little Gold for the journey</h2><p>{gift.claimed ? `Claimed · resets in ${giftResetCountdown || '…'} (daily UTC reset)` : `${DAILY_SHOP_GIFT_GOLD} Gold · free to claim`}</p></div>
      <button type="button" className="shop-gift-claim" onClick={claimGift} disabled={gift.claimed || economy.gold >= MAX_GOLD}>{economy.gold >= MAX_GOLD ? 'Gold full' : gift.claimed ? 'Claimed' : 'FREE · Ready'}</button>
    </section>

    <section className="shop-section" aria-labelledby="shop-structure-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">READY TO PLAY</span><h2 id="shop-structure-title">Structure Decks</h2></div><span className="shop-section-note">Full decklist shown</span></div>
      {STRUCTURE_DECKS_ON_SALE.map(deck => {
        const owned = structureDeckPurchases(deck.id, structurePurchases) >= deck.purchaseLimit;
        return <button type="button" key={deck.id} className={`shop-deck-card ${deck.faction}`} onClick={() => setView({ kind: 'structure-deck', id: deck.id })}>
          <span className="shop-deck-art" aria-hidden="true"><CardArtwork cardId={deck.featuredCardIds[0]} /></span>
          <span className="shop-deck-copy">
            <span className="shop-product-type">{deck.faction.toUpperCase()} · {deck.style.toUpperCase()}</span>
            <strong>{deck.name}</strong>
            <span className="shop-deck-tagline">{deck.tagline}</span>
            <span className="shop-deck-price">{owned ? 'Owned · in Decks' : <><GemIcon size={14} />{deck.priceGems.toLocaleString()} · {deck.cardIds.length} cards</>}</span>
          </span>
        </button>;
      })}
    </section>

    <section className="shop-section" aria-labelledby="shop-featured-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">BUNDLES</span><h2 id="shop-featured-title">Featured bundles</h2></div><span className="shop-section-note">Test offers</span></div>
      {featured.length > 0 ? <div className="shop-featured-grid">
        {featured.map((offer, index) => <article key={offer.id} className={`shop-featured-card ${index === 0 ? 'lead' : ''}`}>
          <div className="shop-featured-art"><div className="shop-art-halo" />{offer.reward.cardId ? <CardArtwork cardId={offer.reward.cardId} className="shop-hero-art" /> : <span className="shop-bundle-mark">✧</span>}</div>
          <div className="shop-featured-copy"><span className="shop-product-type">{offer.id === 'starter-pack' ? 'THE FIRST EXPEDITION' : 'ROSTER GROWTH'}</span><h3>{offer.title}</h3><p>{offer.subtitle}</p>{rewardContent(offer)}</div>
          <button type="button" className="shop-buy-button" onClick={() => chooseOffer(offer.id)}><span>{prices[offer.id] ?? 'Test'}</span><small>SIMULATE</small></button>
        </article>)}
      </div> : <div className="shop-unlock-note"><Icon name="lock" size={18} /><span>Featured bundles appear as you progress and pull your first card.</span></div>}
    </section>

    <section className="shop-section shop-secondary" aria-labelledby="shop-gems-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">PREMIUM CURRENCY</span><h2 id="shop-gems-title">Gem bundles</h2></div><span className="shop-section-note">Simulated</span></div>
      {gemPacks.length > 0 ? <div className="shop-gem-row">{gemPacks.map((offer) => <button type="button" key={offer.id} className={`shop-gem-card ${offer.id === 'gem-pack-medium' ? 'recommended' : ''}`} onClick={() => chooseOffer(offer.id)}>
        <span className="shop-gem-crystal"><GemIcon size={27} /></span><strong>{offer.reward.gems?.toLocaleString()}</strong><span className="shop-gem-name">{offer.title.replace('Small Gem Pouch', 'Small Pouch').replace('Gem Purse', 'Gem Purse').replace('Gem Chest', 'Large Chest')}</span><span className="shop-gem-price">{prices[offer.id] ?? 'Test'} · Test</span>
      </button>)}</div> : <div className="shop-unlock-note"><Icon name="lock" size={18} /><span>Gem bundles become available after you pull your first card.</span></div>}
    </section>

    <section className="shop-section shop-secondary shop-trade-section" aria-labelledby="shop-trade-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">RESOURCE EXCHANGE</span><h2 id="shop-trade-title">For the road</h2></div></div>
      <div className="shop-trades">
        <article className="shop-trade-card"><span className="shop-trade-icon energy">✦</span><div className="shop-trade-copy"><h3>Energy refill</h3><p>Restore up to {ENERGY_REFILL_AMOUNT} Energy for <GemIcon size={14} />{ENERGY_REFILL_GEMS} Gems</p><small>{energy.current}/{energy.max} Energy · {energy.current >= energy.max ? 'already full' : `${energy.max - energy.current} capacity available`}</small></div><button type="button" onClick={() => { track('shop_product_viewed', { productId: 'energy-refill', productType: 'energy' }); setPending({ kind: 'energy' }); }} disabled={!canAfford(ENERGY_REFILL_GEMS, economy.gems) || energy.current >= energy.max}>{energy.current >= energy.max ? 'Full' : 'Refill'}</button></article>
      </div>
    </section>

    <section className="shop-section shop-limited-note" aria-label="Limited offers information">
      <p>Offers without an expiry date stay available as listed. No countdowns or sale claims are shown unless a configured offer supplies a real expiry.</p>
    </section>

    {notice && <div className="shop-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="close" size={16} /></button></div>}

    {pending && <ShopConfirmation pending={pending} energy={energy} prices={prices} onCancel={closeConfirmation} onConfirm={confirmPurchase} />}
  </main>;
}
