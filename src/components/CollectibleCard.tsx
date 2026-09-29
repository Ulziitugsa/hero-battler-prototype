import { getCard } from '../game/cards';
import { cardEffectSummary } from '../game/cards/effectText';
import { cardCombatEffectSummary } from '../game/cardCombat/cardText';
import { useCardCombatDisplay } from './combatDisplay';
import { CardArtwork } from './CardArtwork';
import { Gems, Sigil } from './CardParts';
import { Icon } from './Icon';
import { CardStats } from './card/CardStats';
import { EffectIcon } from './card/CardIcons';
import '../styles/collectible.css';

/**
 * battle:   hand / small reveal - art, ATK, HP Contribution, effect indicator, short name.
 * standard: Collection / Deck Builder / pack results - adds rarity, faction and a one-line effect summary.
 * inspect:  Card Inspect - large, with type line, full rarity label and set number.
 */
export type CardMode = 'battle' | 'standard' | 'inspect';

/**
 * Presentation variants a copy of a card can carry. Only 'base' is styled for real today; the rest are
 * reserved names so owned-copy data, shop products and event rewards can refer to them without another
 * component change. Each renders through the same face: the frame reads `data-treatment`, and the
 * `.collectible-treatment` layer above the art is where foil/moonlit sheens and animated overlays go.
 * Alternate art is a different `artId`, not a different component.
 */
export type CardTreatment = 'base' | 'foil' | 'moonlit' | 'animated' | 'alt-art' | 'premium-frame' | 'event';

export interface CollectibleCardProps {
  cardId: string;
  mode?: CardMode;
  /** @deprecated Use mode="battle". */
  compact?: boolean;
  treatment?: CardTreatment;
  /** Art to paint instead of the card's own (alternate art). Defaults to `cardId`. */
  artId?: string;
  /** Current battle Power (legacy) or ATK (card combat); shows live ATK against the printed value. */
  livePower?: number;
  /** false veils the art and shows a lock (Collection "missing"). */
  owned?: boolean;
  /** Copies owned; a ×N badge shows from 2. */
  copies?: number;
  /** Card Mastery rank (0 = none); shows a small numeral. */
  masteryRank?: number;
  /** Animate pixel art; off by default in grids to save battery. */
  animated?: boolean;
  className?: string;
}

const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' } as const;
const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V'];

/** The card object. One face for every surface; `mode` changes density, not identity. */
export function CollectibleCard({ cardId, mode, compact = false, treatment = 'base', artId, livePower, owned = true, copies = 0, masteryRank = 0, animated, className = '' }: CollectibleCardProps) {
  const card = getCard(cardId);
  const view: CardMode = mode ?? (compact ? 'battle' : 'standard');
  const unit = card.type === 'hero';
  const continuous = card.spellKind === 'CONTINUOUS';
  const cardCombat = useCardCombatDisplay();
  const summary = cardCombat ? cardCombatEffectSummary(card) : cardEffectSummary(card);
  const typeLabel = unit ? `${card.role === 'Token' ? 'Token' : 'Unit'}${card.role && card.role !== 'Token' ? ` · ${card.role}` : ''}` : continuous ? 'Continuous Spell' : 'Spell';
  return (
    <span
      className={`collectible mode-${view} r-${card.rarity} ${card.faction} ${unit ? 'is-unit' : 'is-spell'} treatment-${treatment} ${owned ? '' : 'missing'} ${className}`}
      data-treatment={treatment}
      data-mode={view}
    >
      <span className="collectible-art">
        <CardArtwork cardId={artId ?? cardId} animated={animated ?? view === 'inspect'} />
        {treatment !== 'base' && <span className="collectible-treatment" aria-hidden="true" />}
        {!owned && <span className="collectible-veil" aria-hidden="true"><Icon name="lock" size={view === 'inspect' ? 18 : 13} /></span>}
      </span>
      <span className="collectible-frame" aria-hidden="true" />
      {card.rarity === 'legendary' && <span className="collectible-crest" aria-hidden="true" />}

      <span className="collectible-top">
        <span className="collectible-identity">
          <Sigil faction={card.faction} size="sm" />
          <Gems rarity={card.rarity} dim={!owned} />
        </span>
        {view !== 'battle' && copies > 1 && <span className="collectible-badge">×{copies}</span>}
        {masteryRank > 0 && <span className="collectible-badge mastery" title="Card Mastery">{NUMERALS[masteryRank] ?? masteryRank}</span>}
        {view === 'battle' && summary && <span className="collectible-effect-dot" title="Has an effect"><EffectIcon size={10} /></span>}
      </span>

      {unit ? (
        <CardStats card={card} size={view === 'battle' ? 'compact' : 'standard'} livePower={livePower} className="collectible-stats" />
      ) : (
        <span className="collectible-spell-kind">
          <Icon name={continuous ? 'continuousSpell' : 'spell'} size={view === 'battle' ? 11 : 13} />
          {view !== 'battle' && <span>{continuous ? 'Continuous' : 'Spell'}</span>}
        </span>
      )}

      <span className="collectible-plate">
        <span className="collectible-name">{view === 'battle' ? card.shortName : card.name}</span>
        {view === 'inspect' && <span className="collectible-kind">{typeLabel}</span>}
        {view !== 'battle' && (
          <span className={`collectible-rule ${summary ? '' : 'plain'}`}>
            {summary ? <><EffectIcon size={9} />{summary}</> : 'No effect'}
          </span>
        )}
      </span>
      {view === 'inspect' && (
        <span className="collectible-number">
          <span>{RARITY_LABEL[card.rarity]}</span>
          <span>{card.id.replace(/^(kng|und|inf|spl|tok|wld)-/, '').replaceAll('-', ' ')}</span>
        </span>
      )}
    </span>
  );
}
