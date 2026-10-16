import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GoldIcon } from '../GoldIcon';
import { GemIcon } from '../GemIcon';
import { TicketIcon } from '../TicketIcon';
import { pulseRewardTarget, resolveRewardTarget, STACK_DELAY_MS, subscribeRewardFlights, type Point, type RewardFlight, type RewardKind } from './rewardBus';

const ICON: Record<RewardKind, () => ReactNode> = {
  gold: () => <GoldIcon size={18} />,
  gems: () => <GemIcon size={18} />,
  tickets: () => <TicketIcon size={18} />,
  cards: () => <span className="mw-flight-card" />,
};

/** How long the "+100 Gold" label stays (styles/feedback/motion.css .mw-float-number). */
const LABEL_MS = 900;
/** Vertical step between labels of rewards announced together. */
const LABEL_STACK_PX = 26;

/**
 * Draws every reward flight announced on the reward bus. Mounted once, as the last child of the app root (.moon-game) so
 * it sits above every screen and sheet (a flight
 * often starts inside a sheet and ends on a header counter behind it). Each flight shows its label where the reward was
 * earned and, motion allowing, sends a few tokens along an arc to the counter, which swells as the last one lands.
 */
export function RewardFlightLayer() {
  const [flights, setFlights] = useState<{ flight: RewardFlight; to: Point | null }[]>([]);

  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const unsubscribe = subscribeRewardFlights((flight) => {
      const target = resolveRewardTarget(flight.kind);
      const r = target?.getBoundingClientRect();
      const to = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
      setFlights((list) => [...list, { flight, to }]);
      later(() => setFlights((list) => list.filter((f) => f.flight.id !== flight.id)), Math.max(flight.delayMs + LABEL_MS, flight.plan.landsInMs) + 60);
      // The counter answers on arrival; with no tokens in the air (reduced motion) it answers at once.
      if (to) later(() => pulseRewardTarget(flight.kind), flight.plan.landsInMs);
    });
    return () => {
      unsubscribe();
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  if (flights.length === 0) return null;
  return (
    <div className="mw-flight-layer" aria-hidden="true">
      {flights.map(({ flight, to }) => (
        <FlightView key={flight.id} flight={flight} to={to} />
      ))}
    </div>
  );
}

function FlightView({ flight, to }: { flight: RewardFlight; to: Point | null }) {
  const tokens = to ? flight.plan.tokens : 0;
  return (
    <>
      <span className="mw-flight-label mw-float-number" data-kind={flight.kind} style={{ left: flight.from.x, top: flight.from.y - 14 - flight.stack * LABEL_STACK_PX, animationDelay: flight.delayMs ? `${flight.delayMs}ms` : undefined }}>
        {flight.label}
      </span>
      {to && Array.from({ length: tokens }, (_, i) => <FlightToken key={i} index={i} flight={flight} to={to} />)}
    </>
  );
}

/**
 * One token on its way. The path is a quadratic arc: it pops out around the source, curves up and over, and shrinks
 * into the counter. Spread and lift vary per token so a handful of coins reads as a scatter, not a single line.
 */
function FlightToken({ index, flight, to }: { index: number; flight: RewardFlight; to: Point }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const { from, plan } = flight;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    // Deterministic scatter per token index (no randomness: the same claim always looks the same).
    const spread = ((index % 3) - 1) * 22 + (index > 2 ? 9 : 0);
    const burst = { x: spread, y: -18 - (index % 2) * 10 };
    const lift = Math.min(-60, dy * 0.25 - 80);
    const mid = { x: dx * 0.45 + spread * 0.6, y: dy * 0.45 + lift };
    const animation = el.animate(
      [
        { transform: 'translate(0, 0) scale(0.4)', opacity: 0 },
        { transform: `translate(${burst.x}px, ${burst.y}px) scale(1.15)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mid.x}px, ${mid.y}px) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0.9 },
      ],
      { duration: plan.durationMs, delay: flight.delayMs + flight.stack * STACK_DELAY_MS + index * plan.staggerMs, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'both' },
    );
    return () => animation.cancel();
  }, [flight, to, index]);

  return (
    <span ref={ref} className="mw-flight-token" style={{ left: flight.from.x, top: flight.from.y }}>
      {ICON[flight.kind]()}
    </span>
  );
}
