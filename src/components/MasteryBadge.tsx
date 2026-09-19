import { useState } from 'react';
import type { MasteryLoadout } from '../game/types';
import type { MasteryToast } from './masteryToast';
import { MASTERIES, isMasteryId, masteryEffectText, rankNumeral } from '../game/mastery/definitions';
import { MasteryCrest } from './MasteryCrest';
import '../styles/mastery.css';

/** Small passive crest in the battle HUD: shows the equipped Mastery, tap for its effect, pulses and floats a short label when it triggers. */
export function MasteryBadge({ loadout, toast }: { loadout: MasteryLoadout; toast: MasteryToast | null }) {
  const [open, setOpen] = useState(false);
  if (!isMasteryId(loadout.id)) return null;
  const def = MASTERIES[loadout.id];
  return (
    <span className="mastery-badge-wrap">
      <button type="button" key={toast?.key ?? 'idle'} className={`mastery-badge ${toast ? 'pulse' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={`${def.name} ${rankNumeral(loadout.rank)}`} aria-expanded={open}>
        <MasteryCrest id={def.id} size={12} />
        <span className="mastery-badge-rank">{rankNumeral(loadout.rank)}</span>
      </button>
      {open && (
        <span className="mastery-pop" role="tooltip" onClick={() => setOpen(false)}>
          <strong>
            {def.name} {rankNumeral(loadout.rank)}
          </strong>
          <span>{masteryEffectText(def.id, loadout.rank)}</span>
        </span>
      )}
      {toast && (
        <span key={toast.key} className={`mastery-toast ${toast.outcome}`} role="status">
          <strong>{toast.name}</strong> {toast.detail}
        </span>
      )}
    </span>
  );
}
