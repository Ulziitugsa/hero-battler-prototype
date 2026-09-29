import type { CardDefinition } from '../game/types';
import { CardStats } from './card/CardStats';

/** @deprecated Use `CardStats` from ./card/CardStats. Kept for existing callers; renders the production ATK / HP Contribution pair. */
export function CardStatPair({ card, compact = false, effectivePower }: { card: CardDefinition; compact?: boolean; effectivePower?: number }) {
  return <CardStats card={card} size={compact ? 'compact' : 'standard'} livePower={effectivePower} />;
}
