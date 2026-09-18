import type { LaneId } from '../../game/types';
import type { VfxCue } from './chitEffects';

// The reusable, lane-anchored VFX layer (combat-feel refinement pass, section 18): a small set of
// generic overlay effects driven purely by event-derived cues (VfxCue), never by card identity. Sits
// above the board and renders nothing when there's nothing to show - the same step-driven model as
// every other piece of the animation layer (see components/animation). Deliberately limited to the
// two shapes real combat produces (a clash, or an unopposed hit through an empty lane) rather than a
// grab-bag of one-off effects per card, per section 19's "clear, punchy, readable, not noisy."

const LANE_CENTER_X: Record<LaneId, string> = { left: '17.7%', center: '50%', right: '82.3%' };

export function CombatVfxLayer({ cues }: { cues: VfxCue[] }) {
  if (cues.length === 0) return null;
  return (
    <div className="combat-vfx-layer" aria-hidden="true">
      {cues.map((cue) => {
        if (cue.kind === 'impact-burst') {
          return (
            <span key={cue.key} className="vfx-impact" style={{ left: LANE_CENTER_X[cue.lane] }}>
              <span className="vfx-impact-ring" />
              <span className="vfx-impact-slash a" />
              <span className="vfx-impact-slash b" />
            </span>
          );
        }
        // lane-streak
        return <span key={cue.key} className={`vfx-streak vfx-streak-${cue.side}`} style={{ left: LANE_CENTER_X[cue.lane] }} />;
      })}
    </div>
  );
}
