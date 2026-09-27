import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../components/Icon';
import { GoldIcon } from '../components/GoldIcon';
import { GemIcon } from '../components/GemIcon';
import { TicketIcon } from '../components/TicketIcon';
import { CardArtwork } from '../components/CardArtwork';
import { getConfig } from '../config/config';
import { useEconomy } from '../game/economy/useEconomy';
import { spendGems, grantGold } from '../game/economy/economy';
import { MAX_GOLD } from '../game/economy/config';
import { loadEnergy, restoreEnergy } from '../game/campaign/energy';
import { getDailyShopGiftState, subscribeDailyShopGift, claimDailyShopGift, dailyShopGiftResetsAt, DAILY_SHOP_GIFT_GOLD } from '../game/shop/dailyGift';
import { OFFERS, type OfferId, type OfferDef } from '../game/offers/definitions';
import { simulatePurchase, trackOfferClicked, trackOfferCtaClicked, trackOfferSeen } from '../game/offers/store';
import { useHeroLevel } from '../game/heroLevel/useHeroLevel';
import { useAscension } from '../game/ascension/useAscension';
import { getHeroLevel } from '../game/heroLevel/store';
import { getAscensionRank } from '../game/ascension/store';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { useDialogFocus } from '../components/useDialogFocus';
import { getCard } from '../game/cards';
import { track } from '../analytics/track';
import '../styles/shop.css';

type PendingPurchase = { kind: 'offer'; id: OfferId } | { kind: 'gold' } | { kind: 'energy' };
const GOLD_EXCHANGE_GEMS = 50;
const GOLD_EXCHANGE_AMOUNT = 500;
const ENERGY_REFILL_GEMS = 35;
const ENERGY_REFILL_AMOUNT = 20;

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
    <span className="shop-section-eyebrow">REVIEW EXCHANGE</span><h2 id="shop-confirm-title">{offer?.title ?? (pending.kind === 'gold' ? 'Gold exchange' : 'Energy refill')}</h2>
    {offer ? <><p>{offer.subtitle}</p><div className="shop-confirm-reward">{rewardContent(offer)}</div><p className="shop-confirm-test">{prices[offer.id] ?? 'Test offer'} · simulated only · no charge</p></> : pending.kind === 'gold' ? <p>Spend {GOLD_EXCHANGE_GEMS} Gems and receive {GOLD_EXCHANGE_AMOUNT} Gold.</p> : <p>Spend {ENERGY_REFILL_GEMS} Gems to restore up to {ENERGY_REFILL_AMOUNT} Energy. Current: {energy.current}/{energy.max}.</p>}
    <div className="shop-confirm-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="confirm" onClick={onConfirm}>Confirm {pending.kind === 'offer' ? '(Test)' : 'Exchange'}</button></div>
  </div></div>;
}

export function ShopPage() {
  const economy = useEconomy();
  const heroLevels = useHeroLevel();
  const ascensions = useAscension();
  const gift = useSyncExternalStore(subscribeDailyShopGift, getDailyShopGiftState, getDailyShopGiftState);
  const [energy, setEnergy] = useState(loadEnergy);
  const [giftResetCountdown, setGiftResetCountdown] = useState('');
  const [pending, setPending] = useState<PendingPurchase | null>(null);
  const [notice, setNotice] = useState('');
  const seenOffers = useRef(new Set<OfferId>());
  const prices = getConfig().offers.priceLabels;
  const offersEnabled = getConfig().flags.offersEnabled;

  const progressed = PLAYTEST_ROSTER.some((id) => getHeroLevel(id, heroLevels) > 1 || getAscensionRank(id, ascensions) > 0);
  const summoned = economy.summon.history.length > 0;
  const eligibleOffers = useMemo(() => offersEnabled ? OFFERS.filter((offer) => {
    if (offer.id === 'starter-pack') return progressed || summoned;
    if (offer.id === 'growth-pack') return progressed;
    if (offer.id.startsWith('gem-pack-')) return summoned;
    return false;
  }) : [], [progressed, summoned, offersEnabled]);
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
    } else if (pending.kind === 'gold') {
      if (spendGems(GOLD_EXCHANGE_GEMS)) {
        const result = grantGold(GOLD_EXCHANGE_AMOUNT, 'shop');
        setNotice(`${result.gained.toLocaleString()} Gold added for ${GOLD_EXCHANGE_GEMS} Gems.`);
        track('shop_purchase_simulated', { productId: 'gold-for-gems', productType: 'gold', simulated: false, gems: GOLD_EXCHANGE_GEMS, gold: result.gained });
      } else setNotice('You do not have enough Gems for this exchange.');
    } else {
      if (energy.current >= energy.max) setNotice('Energy is already full.');
      else if (spendGems(ENERGY_REFILL_GEMS)) {
        const before = energy.current;
        const next = restoreEnergy(ENERGY_REFILL_AMOUNT);
        setEnergy(next);
        const restored = next.current - before;
        track('energy_refilled', { amount: restored, gems: ENERGY_REFILL_GEMS, source: 'shop' });
        track('shop_purchase_simulated', { productId: 'energy-refill', productType: 'energy', simulated: false, gems: ENERGY_REFILL_GEMS, energy: restored });
        setNotice(`${restored} Energy restored for ${ENERGY_REFILL_GEMS} Gems.`);
      } else setNotice('You do not have enough Gems for this refill.');
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

  return <main className="shop-screen">
    <header className="shop-header">
      <div><span className="shop-kicker">THE MOONWATER MARKET</span><h1>Shop</h1><p>Useful things for the road ahead.</p></div>
      <div className="shop-balances"><span><GemIcon size={16} />{economy.gems.toLocaleString()}</span><span><GoldIcon size={16} />{economy.gold.toLocaleString()}</span></div>
    </header>

    <div className="shop-test-note"><Icon name="check" size={14} /> Prototype store · bundles and Gem packs are simulated test purchases. No real money is charged.</div>

    <section className={`shop-gift ${gift.claimed || economy.gold >= MAX_GOLD ? 'claimed' : 'ready'}`} aria-labelledby="shop-gift-title">
      <div className="shop-gift-art" aria-hidden="true"><span>✦</span><GoldIcon size={24} /></div>
      <div className="shop-gift-copy"><span className="shop-section-eyebrow">DAILY GIFT</span><h2 id="shop-gift-title">A little Gold for the journey</h2><p>{gift.claimed ? `Claimed · resets in ${giftResetCountdown || '…'} (daily UTC reset)` : `${DAILY_SHOP_GIFT_GOLD} Gold · free to claim`}</p></div>
      <button type="button" className="shop-gift-claim" onClick={claimGift} disabled={gift.claimed || economy.gold >= MAX_GOLD}>{economy.gold >= MAX_GOLD ? 'Gold full' : gift.claimed ? 'Claimed' : 'FREE · Ready'}</button>
    </section>

    <section className="shop-section" aria-labelledby="shop-featured-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">FOR YOUR ADVENTURE</span><h2 id="shop-featured-title">Featured bundles</h2></div><span className="shop-section-note">Test offers</span></div>
      {featured.length > 0 ? <div className="shop-featured-grid">
        {featured.map((offer, index) => <article key={offer.id} className={`shop-featured-card ${index === 0 ? 'lead' : ''}`}>
          <div className="shop-featured-art"><div className="shop-art-halo" />{offer.reward.cardId ? <CardArtwork cardId={offer.reward.cardId} className="shop-hero-art" /> : <span className="shop-bundle-mark">✧</span>}</div>
          <div className="shop-featured-copy"><span className="shop-product-type">{offer.id === 'starter-pack' ? 'THE FIRST EXPEDITION' : 'ROSTER GROWTH'}</span><h3>{offer.title}</h3><p>{offer.subtitle}</p>{rewardContent(offer)}</div>
          <button type="button" className="shop-buy-button" onClick={() => chooseOffer(offer.id)}><span>{prices[offer.id] ?? 'Test'}</span><small>SIMULATE</small></button>
        </article>)}
      </div> : <div className="shop-unlock-note"><Icon name="lock" size={18} /><span>Featured bundles appear as you progress and visit the Moonwell.</span></div>}
    </section>

    <section className="shop-section" aria-labelledby="shop-gems-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">MOONWELL CURRENCY</span><h2 id="shop-gems-title">Gem packs</h2></div><span className="shop-section-note">Simulated</span></div>
      {gemPacks.length > 0 ? <div className="shop-gem-row">{gemPacks.map((offer) => <button type="button" key={offer.id} className={`shop-gem-card ${offer.id === 'gem-pack-medium' ? 'recommended' : ''}`} onClick={() => chooseOffer(offer.id)}>
        <span className="shop-gem-crystal"><GemIcon size={27} /></span><strong>{offer.reward.gems?.toLocaleString()}</strong><span className="shop-gem-name">{offer.title.replace('Small Gem Pouch', 'Small Pouch').replace('Gem Purse', 'Gem Purse').replace('Gem Chest', 'Large Chest')}</span><span className="shop-gem-price">{prices[offer.id] ?? 'Test'} · Test</span>
      </button>)}</div> : <div className="shop-unlock-note"><Icon name="lock" size={18} /><span>Gem packs become available after your first Moonwell summon.</span></div>}
    </section>

    <section className="shop-section shop-trade-section" aria-labelledby="shop-trade-title">
      <div className="shop-section-heading"><div><span className="shop-section-eyebrow">RESOURCE EXCHANGE</span><h2 id="shop-trade-title">For the road</h2></div></div>
      <div className="shop-trades">
        <article className="shop-trade-card"><span className="shop-trade-icon gold"><GoldIcon size={23} /></span><div className="shop-trade-copy"><h3>Gold exchange</h3><p><GemIcon size={14} />{GOLD_EXCHANGE_GEMS} Gems <span aria-hidden="true">→</span> <GoldIcon size={14} />{GOLD_EXCHANGE_AMOUNT} Gold</p></div><button type="button" onClick={() => { track('shop_product_viewed', { productId: 'gold-for-gems', productType: 'gold' }); setPending({ kind: 'gold' }); }} disabled={economy.gems < GOLD_EXCHANGE_GEMS || economy.gold >= MAX_GOLD}>{economy.gold >= MAX_GOLD ? 'Gold full' : 'Exchange'}</button></article>
        <article className="shop-trade-card"><span className="shop-trade-icon energy">✦</span><div className="shop-trade-copy"><h3>Energy refill</h3><p>Restore up to {ENERGY_REFILL_AMOUNT} Energy for <GemIcon size={14} />{ENERGY_REFILL_GEMS} Gems</p><small>{energy.current}/{energy.max} Energy · {energy.current >= energy.max ? 'already full' : `${energy.max - energy.current} capacity available`}</small></div><button type="button" onClick={() => { track('shop_product_viewed', { productId: 'energy-refill', productType: 'energy' }); setPending({ kind: 'energy' }); }} disabled={economy.gems < ENERGY_REFILL_GEMS || energy.current >= energy.max}>{energy.current >= energy.max ? 'Full' : 'Refill'}</button></article>
      </div>
    </section>

    <section className="shop-section shop-limited-note" aria-label="Limited offers information">
      <p>Offers without an expiry date stay available as listed. No countdowns or sale claims are shown unless a configured offer supplies a real expiry.</p>
    </section>

    {notice && <div className="shop-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="close" size={16} /></button></div>}

    {pending && <ShopConfirmation pending={pending} energy={energy} prices={prices} onCancel={closeConfirmation} onConfirm={confirmPurchase} />}
  </main>;
}
