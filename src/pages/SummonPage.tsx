import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GemBalance, GemIcon } from '../components/GemIcon';
import { TicketBalance, TicketIcon } from '../components/TicketIcon';
import { Icon } from '../components/Icon';
import { Gems } from '../components/CardParts';
import { getCard } from '../game/cards';
import { SUMMON_BANNERS, getBanner } from '../game/summon/banners';
import { forceNextRarity, peekForcedRarity } from '../game/summon/devControls';
import { getPool } from '../game/summon/pool';
import { PREVIEW_SCENARIOS, buildPreviewOutcome } from '../game/summon/preview';
import { loadSelectedBanner, saveSelectedBanner } from '../game/summon/selectedBanner';
import { performSummon, type SummonCurrency, type SummonKind } from '../game/summon/summon';
import { RARITY_LABEL, affordabilityNote, pityDisplay, summonOptions } from '../game/summon/view';
import { ArchiveAudio } from '../game/summon/audio';
import { onSummonSound } from '../game/summon/sound';
import { getTickets, setUnlimitedGems } from '../game/economy/economy';
import { useEconomy, useUnlimitedGems } from '../game/economy/useEconomy';
import { track } from '../analytics/track';
import type { Rarity } from '../game/types';
import { BannerShowcase } from './summon/BannerShowcase';
import { PoolSheet } from './summon/PoolSheet';
import { RitualStage } from './summon/RitualStage';
import { useSummonSequence } from './summon/useSummonSequence';
import '../styles/summon.css';
import '../styles/summonRitual.css';
import '../styles/archiveRitual.css';

/**
 * Summon: browse archetype banners, spend Gems, receive real cards. This screen only presents -
 * performSummon() decides the pulls, spends the Gems and updates the collection BEFORE the ritual starts;
 * the reveal (useSummonSequence + RitualStage) can only read that result. Heroes / Decks / Ascension read
 * the same stores, so they are already up to date the moment the cards appear.
 */
export function SummonPage({ onBack }: { onBack: () => void }) {
  const { gems, tickets, summon } = useEconomy();
  const unlimited = useUnlimitedGems();
  const [bannerId, setBannerId] = useState(loadSelectedBanner);
  // Tickets default to preferred once the player has any - spending the earn-only currency first is
  // always at least as good as spending Gems, and the toggle stays available to switch back.
  const [currency, setCurrency] = useState<SummonCurrency>(() => (getTickets() > 0 ? 'tickets' : 'gems'));
  const [showPool, setShowPool] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [preview, setPreview] = useState(false);
  const [audio] = useState(() => new ArchiveAudio());
  const [soundOn, setSoundOn] = useState(false);
  useEffect(() => {
    const unsubscribe = onSummonSound(event => audio.play(event));
    return () => { unsubscribe(); audio.close(); };
  }, [audio]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per screen visit, not per banner swipe
  useEffect(() => { track('summon_opened'); }, []);
  const { outcome, view, start, skip, end, finishIntro } = useSummonSequence();
  const railRef = useRef<HTMLDivElement>(null);

  const banner = getBanner(bannerId) ?? SUMMON_BANNERS[0];
  const pool = getPool(banner.id);
  const balance = currency === 'gems' ? gems : tickets;
  const options = summonOptions(balance, pool, unlimited, currency);
  const note = affordabilityNote(balance, pool, unlimited, currency);
  const pity = pityDisplay(summon.pity[banner.id] ?? 0);
  const busy = !!outcome;

  // Snap the rail to the remembered banner on mount, then follow the swipe to track which one is current.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const slide = rail?.children[SUMMON_BANNERS.findIndex((b) => b.id === bannerId)] as HTMLElement | undefined;
    if (rail && slide) rail.scrollLeft = slide.offsetLeft - (rail.clientWidth - slide.clientWidth) / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const center = rail.scrollLeft + rail.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        Array.from(rail.children).forEach((el, i) => {
          const c = (el as HTMLElement).offsetLeft + (el as HTMLElement).clientWidth / 2;
          if (Math.abs(c - center) < bestDist) {
            bestDist = Math.abs(c - center);
            best = i;
          }
        });
        const id = SUMMON_BANNERS[best].id;
        setBannerId((cur) => {
          if (cur === id) return cur;
          saveSelectedBanner(id);
          return id;
        });
      });
    };
    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      rail.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  function goTo(i: number) {
    const rail = railRef.current;
    const slide = rail?.children[i] as HTMLElement | undefined;
    if (rail && slide) rail.scrollTo({ left: slide.offsetLeft - (rail.clientWidth - slide.clientWidth) / 2, behavior: 'smooth' });
  }

  // Mouse users get the same rail: drag it, use the arrows, or scroll sideways. (Touch keeps native swipe + snap.)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  function onRailPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || !railRef.current) return;
    drag.current = { x: e.clientX, left: railRef.current.scrollLeft, moved: false };
  }
  function onRailPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const rail = railRef.current;
    if (!d || !rail) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved) {
      rail.style.scrollSnapType = 'none';
      rail.scrollLeft = d.left - dx;
    }
  }
  function endRailDrag() {
    const d = drag.current;
    const rail = railRef.current;
    drag.current = null;
    if (!d?.moved || !rail) return;
    rail.style.scrollSnapType = '';
    const slide = rail.children[0] as HTMLElement;
    const stride = slide.clientWidth + 12;
    goTo(Math.max(0, Math.min(SUMMON_BANNERS.length - 1, Math.round(rail.scrollLeft / stride))));
  }

  function summonNow(kind: SummonKind) {
    if (busy) return;
    const result = performSummon(kind, banner.id, undefined, currency); // resolved + persisted here, before any animation
    if (!result.ok) return; // buttons are disabled when unaffordable; nothing was spent
    setPreview(false);
    start(result);
  }

  const bannerIndex = SUMMON_BANNERS.findIndex((b) => b.id === banner.id);

  return (
    <div className={`summon-screen theme-${banner.faction}`}>
      <div className="summon-header">
        <button type="button" className="campaign-back-medallion" onClick={onBack} aria-label="Back to Home">
          <Icon name="back" size={20} />
        </button>
        <span className="summon-title">Summon</span>
        <span className="summon-balances">
          <TicketBalance />
          <GemBalance />
        </span>
      </div>

      <div className="summon-rail-wrap">
        <button type="button" className="summon-arrow left" onClick={() => goTo(bannerIndex - 1)} disabled={bannerIndex === 0} aria-label="Previous banner">
          <Icon name="back" size={18} />
        </button>
        <button type="button" className="summon-arrow right" onClick={() => goTo(bannerIndex + 1)} disabled={bannerIndex === SUMMON_BANNERS.length - 1} aria-label="Next banner">
          <Icon name="back" size={18} />
        </button>
      <div className="summon-rail" ref={railRef} onPointerDown={onRailPointerDown} onPointerMove={onRailPointerMove} onPointerUp={endRailDrag} onPointerLeave={endRailDrag}>
        {SUMMON_BANNERS.map((b, i) => (
          <div key={b.id} className="summon-slide">
            <BannerShowcase banner={b} active={i === bannerIndex} onViewPool={() => setShowPool(true)} />
          </div>
        ))}
      </div>
      </div>
      <div className="summon-dots" role="tablist" aria-label="Banners">
        {SUMMON_BANNERS.map((b, i) => (
          <button key={b.id} type="button" role="tab" aria-selected={i === bannerIndex} aria-label={b.name} className={i === bannerIndex ? 'on' : ''} onClick={() => goTo(i)} />
        ))}
      </div>

      <section className="summon-pity" aria-label="Legendary guarantee">
        <div className="summon-pity-row">
          <span>
            <Gems rarity="legendary" /> Legendary guarantee
          </span>
          <span className="summon-pity-count">
            {pity.current} / {pity.threshold}
          </span>
        </div>
        <span className="summon-pity-bar" role="progressbar" aria-valuemin={0} aria-valuemax={pity.threshold} aria-valuenow={pity.current}>
          <span style={{ width: `${(pity.current / pity.threshold) * 100}%` }} />
        </span>
        <span className="summon-pity-text">{pity.label}</span>
      </section>

      {tickets > 0 && (
        <div className="summon-currency-toggle" role="group" aria-label="Pay with">
          <button type="button" className={currency === 'tickets' ? 'on' : ''} aria-pressed={currency === 'tickets'} onClick={() => setCurrency('tickets')}>
            <TicketIcon size={13} /> Tickets
          </button>
          <button type="button" className={currency === 'gems' ? 'on' : ''} aria-pressed={currency === 'gems'} onClick={() => setCurrency('gems')}>
            <GemIcon size={13} /> Gems
          </button>
        </div>
      )}

      <section className="summon-actions">
        {options.map((o) => (
          <button key={o.kind} type="button" className={`summon-btn ${o.kind}`} disabled={!o.affordable || busy} onClick={() => summonNow(o.kind)}>
            <span className="summon-btn-label">{o.count === 1 ? 'Summon' : `Summon ×${o.count}`}</span>
            <span className="summon-btn-cost">
              {currency === 'gems' ? <GemIcon size={14} /> : <TicketIcon size={14} />}
              {o.cost}
            </span>
          </button>
        ))}
        {note && (
          <p className="summon-need" role="status">
            <strong>{note}</strong>
            <span>{currency === 'gems' ? 'Earn Gems in Campaign.' : 'Earn Tickets from missions and your 7-day journey.'}</span>
          </p>
        )}
      </section>

      <div className="summon-links">
        <button type="button" aria-pressed={soundOn} onClick={async () => {
          if (soundOn) { audio.disable(); setSoundOn(false); }
          else setSoundOn(await audio.enable());
        }}>Sound {soundOn ? 'on' : 'off'}</button>
        <button type="button" onClick={() => setShowPool(true)}>
          View pool &amp; rates
        </button>
        <button type="button" onClick={() => setShowHistory(true)} disabled={summon.history.length === 0}>
          Recent summons
        </button>
      </div>

      {import.meta.env.DEV && <DevPanel bannerId={banner.id} unlimited={unlimited} onPreview={(s) => { setPreview(true); start(buildPreviewOutcome(banner.id, s)); }} />}

      {outcome && view && <RitualStage outcome={outcome} view={view} faction={getPool(outcome.bannerId).banner.faction} onSkip={skip} onDone={end} onIntroFinished={finishIntro} preview={preview} />}

      {showPool && <PoolSheet pool={pool} onClose={() => setShowPool(false)} />}

      {showHistory && (
        <div className="overlay-backdrop campaign-sheet-backdrop" onClick={() => setShowHistory(false)}>
          <div className="summon-history" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Recent summons">
            <div className="summon-history-head">
              <span>Recent summons</span>
              <button type="button" className="summon-history-close" onClick={() => setShowHistory(false)} aria-label="Close">
                <Icon name="close" size={18} />
              </button>
            </div>
            <ul>
              {summon.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className={`r-${h.rarity}`}>
                  <Gems rarity={h.rarity} />
                  <span className="summon-history-name">{getCard(h.cardId).name}</span>
                  {h.bannerId && <span className="summon-history-banner">{getBanner(h.bannerId)?.name}</span>}
                  {h.wasNew && <span className="summon-card-tag new">New</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const FORCE: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** DEV ONLY (rendered under import.meta.env.DEV): visual preview scenarios + test switches. Preview never grants, spends or persists anything. */
function DevPanel({ bannerId, unlimited, onPreview }: { bannerId: string; unlimited: boolean; onPreview: (s: (typeof PREVIEW_SCENARIOS)[number]['id']) => void }) {
  const [forced, setForced] = useState<Rarity | null>(peekForcedRarity());
  return (
    <details className="summon-dev">
      <summary>Dev · Summon testing</summary>
      <div className="summon-dev-row">
        <label>
          <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimitedGems(e.target.checked)} /> Unlimited Gems
        </label>
      </div>
      <div className="summon-dev-row">
        <span>Force next pull ({bannerId}):</span>
        {FORCE.map((r) => (
          <button
            key={r}
            type="button"
            className={forced === r ? 'on' : ''}
            onClick={() => {
              const next = forced === r ? null : r;
              forceNextRarity(next);
              setForced(next);
            }}
          >
            {RARITY_LABEL[r]}
          </button>
        ))}
      </div>
      <div className="summon-dev-row">
        <span>Preview (no grants):</span>
        {PREVIEW_SCENARIOS.map((s) => (
          <button key={s.id} type="button" onClick={() => onPreview(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
    </details>
  );
}
