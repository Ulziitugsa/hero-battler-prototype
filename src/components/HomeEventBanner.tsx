import { CardArtwork } from './CardArtwork';
import { AttentionDot } from './AttentionIndicator';
import { daysRemaining } from '../game/events/definitions';
import { useLiveEvent } from '../game/events/useLiveEvent';
import '../styles/event.css';

/** Home's single event entry (Moonwater batch 1, E5): one slim banner, only while an event is live,
 * with the shared attention dot only when a reward is actually claimable. */
export function HomeEventBanner({ onOpen }: { onOpen: () => void }) {
  const live = useLiveEvent();
  if (!live) return null;
  const { def, claimable, now } = live;
  const days = daysRemaining(def, now);
  const status = claimable > 0 ? `${claimable} reward${claimable === 1 ? '' : 's'} ready` : days <= 1 ? 'Ends today' : `${days} days left`;
  return <button type="button" className="home-event-banner" style={{ ['--event-accent' as string]: def.theme.accent }} onClick={onOpen} aria-label={`${def.name}, limited event. ${status}. Open event`}>
    <span className="home-event-art" aria-hidden="true"><CardArtwork cardId={def.theme.heroCardId} animated={false} /></span>
    <span className="home-event-copy"><small>LIMITED EVENT</small><strong>{def.name}</strong></span>
    <span className={`home-event-status ${claimable > 0 ? 'is-ready' : ''}`}>{status}</span>
    {claimable > 0 && <AttentionDot label="Event reward ready" />}
  </button>;
}
