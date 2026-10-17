import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GameState, LaneId, Side } from '../game/types';
import { LANES } from '../game/types';
import type { LabLayerView } from '../pages/GamePage';
import { useReducedMotion } from '../components/animation/timing';
import { replayUpTo } from '../game/engine/replay';
import { getCombatCard } from '../game/cardCombat/cards';
import { effectiveAtk } from '../game/cardCombat/engine';
import { POWER_TIERS, chainOf, formatAtk, spectacleCues, type CueKind, type SpectacleCue } from './spectacle';
import type { ArcaneTrial } from './trials';

// The Arcane Trials layer over the real battle screen (GamePage's labLayer). It never changes the battle: it reads the
// round's resolver events and how far playback has reached, and draws:
//   - the trial's objective and round count;
//   - each signature moment (spectacle.ts) over the lane it happened in, the instant playback reaches its event;
//   - the Spell chain while Spells resolve, when this round's Spells spread or scale;
//   - a lasting power aura and a large ATK plaque on any Unit that multiplies its ATK, read from the board as shown.
// Reduced motion keeps every label and drops the movement.

/** How long each moment stays up (ms). Short enough not to hold up the round, long enough to read. */
const DURATION: Record<CueKind, number> = { rise: 1500, endless: 1300, conduit: 1100, chain: 1600, strike: 1500, double: 1500, tier: 2200, immune: 1300, unmade: 1500 };
/** At most this many lane moments at once (an instant-speed round reveals everything together). */
const MAX_ACTIVE = 4;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Anchors = Record<Side, Record<LaneId, Box | null>>;

function measure(root: HTMLElement | null): Anchors | null {
  const scene = root?.parentElement;
  if (!root || !scene) return null;
  const origin = root.getBoundingClientRect();
  const out = { player: {}, enemy: {} } as Anchors;
  for (const lane of LANES)
    for (const side of ['player', 'enemy'] as const) {
      const slot = scene.querySelector(`.battle-lane.lane-${lane} .zone-${side === 'player' ? 'pHero' : 'eHero'}`);
      const r = slot?.getBoundingClientRect();
      out[side][lane] = r && r.width > 0 ? { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height } : null;
    }
  return out;
}

const multiplies = (cardId: string) => getCombatCard(cardId).abilities.some((a) => a.actions.some((x) => x.type === 'MULTIPLY_ATK'));

function tierOf(atk: number): number {
  let tier = 0;
  POWER_TIERS.forEach((t, i) => {
    if (atk >= t.atk) tier = i + 1;
  });
  return tier;
}

/** A number that counts from `from` to `to` once (instantly under reduced motion). */
function CountUp({ from, to, ms, still }: { from: number; to: number; ms: number; still: boolean }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, ms, still]);
  return <>{formatAtk(still ? to : shown)}</>;
}

function LaneCue({ cue, anchors, still }: { cue: SpectacleCue; anchors: Anchors; still: boolean }) {
  const box = anchors[cue.side][cue.lane];
  if (!box) return null;
  const style = { left: box.x, top: box.y, width: box.w, height: box.h };
  if (cue.kind === 'conduit' || cue.kind === 'strike') {
    const boxes = (cue.lanes ?? [cue.lane]).map((l) => anchors[cue.side][l]).filter((b): b is Box => !!b);
    const left = Math.min(...boxes.map((b) => b.x));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    return (
      <>
        {cue.kind === 'conduit' && <span className="tr-conduit-beam" style={{ left, width: right - left, top: box.y + box.h / 2 }} aria-hidden="true" />}
        {boxes.map((b, i) => (
          <span key={i} className={`tr-cue tr-${cue.kind}`} style={{ left: b.x, top: b.y, width: b.w, height: b.h, animationDelay: still ? undefined : `${i * 90}ms` }} aria-hidden="true">
            <span className="tr-fx" />
          </span>
        ))}
        {cue.kind === 'strike' && (
          <span className="tr-strike-title" style={{ left: (left + right) / 2, top: box.y + box.h * 0.5 }} aria-hidden="true">
            <b>{cue.title}</b>
            <span>{cue.detail}</span>
          </span>
        )}
      </>
    );
  }
  const fromAtk = cue.kind === 'double' && cue.value ? Math.round(cue.value / Number(cue.title.slice(1) || 2)) : null;
  return (
    <span className={`tr-cue tr-${cue.kind}`} style={style} aria-hidden="true">
      <span className="tr-fx" />
      <span className="tr-cue-label">
        <b>{cue.title}</b>
        {cue.value !== undefined && cue.kind !== 'tier' && <strong>{fromAtk !== null ? <CountUp from={fromAtk} to={cue.value} ms={700} still={still} /> : formatAtk(cue.value)}</strong>}
      </span>
    </span>
  );
}

export function TrialLayer({ view, trial, initial, onHint }: { view: LabLayerView; trial: ArcaneTrial; /** The arranged position, shown before the first Fight. */ initial: GameState; onHint: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const cues = useMemo(() => spectacleCues(view.events, view.base), [view.events, view.base]);
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [active, setActive] = useState<SpectacleCue[]>([]);
  const seen = useRef<{ events: unknown; keys: Set<string> }>({ events: null, keys: new Set() });
  // Each moment's own end timer. Never cleared as playback advances, only when the layer goes away.
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useLayoutEffect(() => {
    const update = () => setAnchors(measure(root.current));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [view.events, view.round]);

  // Moments start the instant playback reaches their event, and end on their own timer.
  useEffect(() => {
    if (seen.current.events !== view.events) seen.current = { events: view.events, keys: new Set() };
    if (!view.resolving) return;
    const fresh = cues.filter((c) => c.at <= view.revealedUntil && !seen.current.keys.has(c.key) && c.kind !== 'chain');
    if (fresh.length === 0) return;
    for (const c of fresh) seen.current.keys.add(c.key);
    const shown = [...fresh].sort((a, b) => b.weight - a.weight).slice(0, MAX_ACTIVE);
    setActive((prev) => [...prev, ...shown].slice(-MAX_ACTIVE));
    for (const c of shown) timers.current.push(window.setTimeout(() => setActive((prev) => prev.filter((p) => p.key !== c.key)), DURATION[c.kind]));
  }, [cues, view.revealedUntil, view.resolving, view.events]);

  // Moments belong to the round resolving now; between rounds none is shown.
  const visible = view.resolving ? active : [];

  // The board as playback shows it right now, for the lasting power aura.
  const shownBoard: GameState | null = useMemo(() => {
    if (!view.base) return initial;
    return view.resolving ? replayUpTo(view.base, view.events, view.revealedUntil) : replayUpTo(view.base, view.events, view.events.length - 1);
  }, [view.base, view.events, view.revealedUntil, view.resolving, initial]);

  const auras: { side: Side; lane: LaneId; atk: number; tier: number }[] = [];
  if (shownBoard && anchors)
    for (const side of ['player', 'enemy'] as const)
      for (const lane of LANES) {
        const u = shownBoard[side].heroZones[lane];
        if (u && multiplies(u.cardId)) {
          const atk = shownBoard.cardCombat ? effectiveAtk(shownBoard, side, lane) : u.power;
          auras.push({ side, lane, atk, tier: tierOf(atk) });
        }
      }

  const chain = view.resolving ? chainOf(cues, 'player').filter((c) => c.at <= view.revealedUntil) : [];
  const tier = visible.find((c) => c.kind === 'tier');
  const lastRound = trial.position.round + trial.rounds - 1;
  const roundsLeft = lastRound - view.round + 1;

  return (
    <div ref={root} className={`lab-layer tr-layer${still ? ' reduced-motion' : ''}`}>
      <div className="tr-objective" role="status">
        <span className="tr-objective-tag" title="Arcane Trial: practice only. Nothing is saved or granted.">Practice</span>
        {/* The battle's own round number, as the log prints it. */}
        <span className="tr-objective-round">Round {view.round}</span>
        <span className="tr-objective-goal">{roundsLeft > 1 ? `Win by Round ${lastRound}` : roundsLeft === 1 ? 'Win this round' : 'No rounds left'}</span>
        {!view.resolving && (
          <button type="button" className="tr-hint-button" onClick={onHint}>
            Hint
          </button>
        )}
      </div>

      {anchors &&
        auras.map((a) => {
          const box = anchors[a.side][a.lane];
          if (!box) return null;
          return (
            <span key={`${a.side}-${a.lane}`} className={`tr-aura tier-${a.tier}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} aria-hidden="true">
              <span className="tr-aura-glow" />
              <span className="tr-atk-plaque">
                {formatAtk(a.atk)}
                {a.tier > 0 && <small>{POWER_TIERS[a.tier - 1].name}</small>}
              </span>
            </span>
          );
        })}

      {anchors && visible.filter((c) => c.kind !== 'tier').map((c) => <LaneCue key={c.key} cue={c} anchors={anchors} still={still} />)}

      {chain.length > 0 && (
        <ol className="tr-chain" aria-label="Spell chain this round">
          {chain.map((c) => (
            <li key={c.key} className={c.value !== undefined ? 'tr-chain-finisher' : ''}>
              <span className="tr-chain-n">{c.title.replace('Spell ', '')}</span>
              <span className="tr-chain-name">{c.detail}</span>
            </li>
          ))}
        </ol>
      )}

      {tier && (
        <div key={tier.key} className={`tr-tier-banner tier-${tierOf(tier.value ?? 0)}`} role="status">
          <b>{tier.title}</b>
          <strong>{formatAtk(tier.value ?? 0)} ATK</strong>
          <span>{tier.detail}</span>
        </div>
      )}
    </div>
  );
}
