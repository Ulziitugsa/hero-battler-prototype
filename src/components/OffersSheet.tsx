import { useEffect, useState } from 'react';
import { OFFERS, FIRST_PURCHASE_BONUS, type OfferId } from '../game/offers/definitions';
import { cancelPurchase, simulatePurchase, trackOfferClicked, trackOfferSeen } from '../game/offers/store';
import { useOffers } from '../game/offers/useOffers';
import { getConfig } from '../config/config';
import { GoldIcon } from './GoldIcon';
import { GemIcon } from './GemIcon';
import { TicketIcon } from './TicketIcon';
import { Icon } from './Icon';
import '../styles/missions.css';
import '../styles/offers.css';

/**
 * The offer catalog (Commercial Prototype Phase 10) - product/catalog/UX layer only, NO real payment
 * processing anywhere. Every purchase button is explicitly labelled "(Test)" and every confirmation
 * repeats "not a real charge", per the brief's "Do not let a fake purchase architecture accidentally
 * become trusted production economy code" - the labelling is load-bearing, not decorative.
 */
export function OffersSheet({ onClose }: { onClose: () => void }) {
  const purchases = useOffers();
  const [confirming, setConfirming] = useState<OfferId | null>(null);
  const [justGranted, setJustGranted] = useState<string | null>(null);
  const prices = getConfig().offers.priceLabels;

  useEffect(() => {
    for (const o of OFFERS) trackOfferSeen(o.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per sheet open, not per offer
  }, []);

  return (
    <div className="overlay-backdrop missions-overlay" onClick={onClose}>
      <div className="missions-sheet offers-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="missions-header">
          <span className="missions-title">Offers</span>
          <button type="button" className="missions-close" onClick={onClose} aria-label="Close">
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
          {OFFERS.map((o) => (
            <div key={o.id} className={`offers-card ${o.comingSoon ? 'locked' : ''}`}>
              <div className="offers-card-text">
                <span className="offers-card-title">{o.title}</span>
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
                  {o.reward.cardId ? <span>1 Hero</span> : null}
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
                        if (r.ok) setJustGranted(o.title);
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

        {justGranted && (
          <p className="offers-granted-banner" role="status">
            {justGranted} granted (test) - check your balances.
          </p>
        )}
      </div>
    </div>
  );
}
