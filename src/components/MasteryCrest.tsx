import type { MasteryId } from '../game/mastery/definitions';
import { Icon, type IconName } from './Icon';

const CREST_ICON: Record<MasteryId, IconName> = { fortification: 'hero', necromancy: 'graveyard', 'blood-pact': 'power' };

/** The small emblem for a Mastery - one place decides which glyph represents which Mastery. */
export function MasteryCrest({ id, size = 18 }: { id: MasteryId; size?: number }) {
  return <Icon name={CREST_ICON[id]} size={size} />;
}
