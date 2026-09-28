import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OFFERS, FIRST_PURCHASE_BONUS, type OfferId } from '../game/offers/definitions';
import { cancelPurchase, simulatePurchase, trackOfferClicked, trackOfferCtaClicked, trackOfferDismissed, trackOfferOpened, trackOfferSeen } from '../game/offers/store';
import { useOffers } from '../game/offers/useOffers';
import { getConfig } from '../config/config';
import { GoldIcon } from './GoldIcon';
import { GemIcon } from './GemIcon';
import { TicketIcon } from './TicketIcon';
import { Icon } from './Icon';
import { getCard } from '../game/cards';
import { useDialogFocus } from './useDialogFocus';
import '../styles/missions.css';
import '../styles/offers.css';
import { useHeroLevel } from '../game/heroLevel/useHeroLevel';
import { useAscension } from '../game/ascension/useAscension';
import { useEconomy } from '../game/economy/useEconomy';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { getAscensionRank } from '../game/ascension/store';
import { getHeroLevel } from '../game/heroLevel/store';
import { track } from '../analytics/track';

const PRIMARY_OFFERS = OFFERS.filter((o) => ['starter-pack', 'growth-pack', 'gem-pack-medium'].includes(o.id));

/**
 * The offer catalog (Commercial Prototype Phase 10) - product/catalog/UX layer only, NO real payment
 * processing anywhere. Every purchase button is explicitly labelled "(Test)" and every confirmation
 * repeats "not a real charge", per the brief's "Do not let a fake purchase architecture accidentally
 * become trusted production economy code" - the labelling is load-bearing, not decorative.
 */
export function OffersSheet({ onClose }: { onClose: () => void }) {
  const source = 'home_navigation';
  const sessionOfferCount = useRef(0);
  const handleClose = useCallback(() => {
    trackOfferDismissed(source, sessionOfferCount.current);
    onClose();
  }, [onClose]);
  const dialog = useDialogFocus(handleClose);
  const purchases = useOffers();
  const heroLevels = useHeroLevel();
  const ascensions = useAscension();
  const { summon } = useEconomy();
  const hasProgressedHero = PLAYTEST_ROSTER.some((id) => getHeroLevel(id, heroLevels) > 1 || getAscensionRank(id, ascensions) > 0);
  const hasSummoned = summon.history.length > 0;
  const eligible = useMemo(() => OFFERS.filter((offer) => {
    if (offer.id === 'starter-pack') return hasProgressedHero || hasSummoned;
    if (offer.id === 'growth-pack') return hasProgressedHero;
    if (offer.id.startsWith('gem-pack-')) return hasSummoned;
    return true;
  }), [hasProgressedHero, hasSummoned]);
  const [confirming, setConfirming] = useState<OfferId | null>(null);
  const [justGranted, setJustGranted] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [newOfferIds] = useState<Set<OfferId>>(() => {
    const fresh = new Set<OfferId>();
    for (const offer of eligible) {
      if (offer.comingSoon) continue;
      try { if (localStorage.getItem(`moonwater:offer-viewed:${offer.id}`) !== '1') fresh.add(offer.id); } catch { fresh.add(offer.id); }
    }
    return fresh;
  });
  const prices = getConfig().offers.priceLabels;
  const visibleOffers = useMemo(() => (showMore ? OFFERS : PRIMARY_OFFERS).filter((offer) => eligible.some((entry) => entry.id === offer.id)), [eligible, showMore]);
  const opened = useRef(false);
  const seenOffers = useRef(new Set<OfferId>());

  useEffect(() => {
    for (const offer of eligible) {
      if (offer.comingSoon) continue;
      const key = `moonwater:offer-eligible:${offer.id}`;
      try {
        if (localStorage.getItem(key) !== '1') {
          localStorage.setItem(key, '1');
          track('offer_became_eligible', { offerId: offer.id, source: 'player_progress' });
        }
      } catch { /* best effort */ }
    }
  }, [eligible]);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    sessionOfferCount.current = getSessionOfferCount();
    trackOfferOpened(source, sessionOfferCount.current);
  }, []);
  useEffect(() => {
    for (const o of visibleOffers) {
      if (seenOffers.current.has(o.id)) continue;
      seenOffers.current.add(o.id);
      trackOfferSeen(o.id);
    }
  }, [visibleOffers]);
  useEffect(() => {
    const newlyViewed = visibleOffers.filter((offer) => newOfferIds.has(offer.id));
    for (const offer of newlyViewed) {
      if (offer.comingSoon) continue;
      try { localStorage.setItem(`moonwater:offer-viewed:${offer.id}`, '1'); } catch { /* best effort */ }
      track('offer_new_state_viewed', { offerId: offer.id, source });
    }
  }, [visibleOffers, newOfferIds, source]);

  return (
    <div className="overlay-backdrop missions-overlay" onClick={handleClose}>
      <div ref={dialog} tabIndex={-1} className="missions-sheet offers-sheet" role="dialog" aria-modal="true" aria-labelledby="offers-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div className="missions-header">
          <span className="missions-title" id="offers-sheet-title">Offers</span>
          <button type="button" className="missions-close" onClick={handleClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        <p className="offers-test-banner">TEST MODE - no real purchase, no real charge. Payments are not wired up yet.</p>
        {!purchases.hasEverPurchased && (
          <p className="offers-bonus-banner">
            First purchase bonus: <GemIcon size={12} /> +{FIRST_PURCHASE_BONUS.gems} Gems on your first offer.
          </p>
        )}

        <div className="offers-list">
          {visibleOffers.map((o) => (
            <div key={o.id} className={`offers-card ${o.comingSoon ? 'locked' : ''}`}>
              <div className="offers-card-text">
                <span className="offers-card-title">{o.title}{newOfferIds.has(o.id) && <small className="offers-new-tag"> · New</small>}</span>
                <span className="offers-card-subtitle">{o.subtitle}</span>
                <span className="offers-card-rewards">
                  {o.reward.gold ? (
                    <span>
                      <GoldIcon size={12} />
                      {o.reward.gold}
                    </span>
                  ) : null}
                  {o.reward.gems ? (
                    <span>
                      <GemIcon size={12} />
                      {o.reward.gems}
                    </span>
                  ) : null}
                  {o.reward.tickets ? (
                    <span>
                      <TicketIcon size={12} />
                      {o.reward.tickets}
                    </span>
                  ) : null}
                  {o.reward.cardId ? <span>{getCard(o.reward.cardId).name}</span> : null}
                </span>
              </div>
              {o.comingSoon ? (
                <span className="offers-card-locked-tag">
                  <Icon name="lock" size={13} />
                  Soon
                </span>
              ) : confirming === o.id ? (
                <div className="offers-confirm">
                  <span>{prices[o.id] ?? '—'} (Test) - not a real charge</span>
                  <span className="offers-confirm-btns">
                    <button
                      type="button"
                      className="missions-claim-btn"
                      onClick={() => {
                        cancelPurchase(o.id);
                        setConfirming(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="missions-claim-btn"
                      onClick={() => {
                        const r = simulatePurchase(o.id);
                        if (r.ok) {
                          const grants = [r.gold > 0 && `${r.gold.toLocaleString()} Gold`, r.gems > 0 && `${r.gems.toLocaleString()} Gems`, r.tickets > 0 && `${r.tickets} Tickets`, r.cardGranted && getCard(r.cardGranted).name].filter(Boolean);
                          setJustGranted(`${o.title} added: ${grants.join(' · ')}`);
                        }
                        setConfirming(null);
                      }}
                    >
                      Confirm (Test)
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="offers-card-price"
                  onClick={() => {
                    trackOfferCtaClicked(o.id, source, sessionOfferCount.current);
                    trackOfferClicked(o.id);
                    setConfirming(o.id);
                  }}
                >
                  {prices[o.id] ?? '—'}
                </button>
              )}
            </div>
          ))}
        </div>

        {visibleOffers.length === 0 && <p className="offers-empty-note">Explore Campaign, Summons, and Card Mastery. Relevant offers may appear here as you play.</p>}

        {!showMore && <button type="button" className="offers-more-options" aria-expanded={false} onClick={() => setShowMore(true)}>Show all offers</button>}

        {justGranted && (
          <p className="offers-granted-banner" role="status">
            {justGranted} granted (test) - check your balances.
          </p>
        )}
      </div>
    </div>
  );
}

const SESSION_OFFER_COUNT_KEY = 'skyloom:sessionOfferCount';
function getSessionOfferCount(): number {
  try {
    const previous = Number(sessionStorage.getItem(SESSION_OFFER_COUNT_KEY) ?? '0');
    const next = (Number.isFinite(previous) ? Math.max(0, Math.floor(previous)) : 0) + 1;
    sessionStorage.setItem(SESSION_OFFER_COUNT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}
