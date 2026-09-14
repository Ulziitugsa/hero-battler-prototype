import { useState } from 'react';
import type { AnimationSpeed } from '../pages/GamePage';
import { Icon } from './Icon';
import { HelpModal } from './HelpModal';

/**
 * Developer/QA tools only - speed, new match, help. Floats over the battle scene rather than taking
 * layout space, since the scene itself now carries the player-facing exit control (the in-scene
 * close seal in the enemy banner, Battle Screen v8) - this row is the dashed-rule "developer tools"
 * concept from the design source of truth, not part of the player experience.
 */
export function TopControls({
  animationSpeed,
  onNewMatch,
  onSetAnimationSpeed,
}: {
  seed: number;
  animationSpeed: AnimationSpeed;
  onNewMatch: () => void;
  onReplaySameSeed: () => void;
  onSetAnimationSpeed: (s: AnimationSpeed) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="top-controls">
      <select className="speed-select" value={animationSpeed} onChange={(e) => onSetAnimationSpeed(e.target.value as AnimationSpeed)} aria-label="Animation speed">
        <option value="1x">Speed 1x</option>
        <option value="2x">Speed 2x</option>
        <option value="instant">Instant</option>
      </select>
      <button type="button" className="btn btn-icon btn-sm" onClick={onNewMatch} aria-label="New match">
        <Icon name="plus" size={16} />
      </button>
      <button type="button" className="btn btn-icon btn-sm" onClick={() => setHelpOpen(true)} aria-label="How to play">
        <Icon name="help" size={16} />
      </button>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
