import { useEffect, useRef } from 'react';
import type { Side } from '../../game/types';
import { getCard } from '../../game/cards';
import { CARD_LORE } from '../../game/cards/lore';
import { cardCopyView } from '../../game/cards/cardCopy';
import { cardTypeLine, FACTION_NAME, RARITY_NAME, type CardRules } from '../../game/cards/cardPresentation';
import { useCollection } from '../../game/collection/useCollection';
import { acquisitionSummary } from '../../game/collection/acquisition';
import { productAcquisitionLines } from '../../game/collection/productSources';
import { listDeckOptions } from '../../game/engine/deckOptions';
import { loadPreferences } from '../../game/engine/preferences';
import { track } from '../../analytics/track';
import { Icon } from '../Icon';
import { Gems, Sigil } from '../CardParts';
import { useDialogFocus } from '../useDialogFocus';
import { GameCard, type CardTreatment } from './GameCard';
import { CardEffectList, CardStatsPanel } from './CardInspectSections';
import '../../styles/heroes.css';
import '../../styles/cardInspect.css';

/**
 * Card Inspect: layer 3, the deepest. One sheet for every card everywhere (Collection, Deck Builder, Shop and Box
 * contents, pack results, events, and in battle from the focus panel): the card at its largest, its name, rarity,
 * faction and type, ATK and HP Contribution with what they mean, every effect's full rule with its keywords, copies
 * owned, where to get it, its card style, and its lore. Every card shows its printed values: there is no combat Card
 * Mastery. Historical Mastery / Ascension progress stays in the save for the future Prestige conversion but is never shown
 * to players (dev tools: skyloomDev.ascensionReport()). Nothing in battle needs Inspect: the card face and the focus panel
 * carry everything a decision needs.
 */

/** Where Card Inspect was opened from. In battle the sheet keeps to what matters mid-match. */
export type InspectContext = 'collection' | 'deck' | 'battle' | 'opponent' | 'pack' | 'shop' | 'event' | 'other';

/** In battle: the copy in play, under the battle's rules. */
export interface InspectBattleCopy {
  rules: CardRules;
  owner: Side;
  /** A Unit's ATK now (on the board). */
  atk?: number;
  /** Card rules: the HP Contribution this copy added to its owner's Starting HP (its printed value). */
  hpContribution?: number;
  /** Historical legacy matches only: the copy's legacy Ascension rank, whose added effects that resolver plays. */
  masteryRank?: number;
}

export interface CardInspectProps {
  cardId: string;
  onClose: () => void;
  context?: InspectContext;
  battle?: InspectBattleCopy;
  treatment?: CardTreatment;
  /** Page through a list (the Collection grid). */
  onPrev?: () => void;
  onNext?: () => void;
  /** The "In your deck" link (Collection). */
  onOpenDecks?: () => void;
}

/** The deck to credit in the "In your deck" link: the active deck if it carries this card, else the first that does. */
function findDeckFor(cardId: string): string | null {
  const decks = listDeckOptions();
  const activeId = loadPreferences().selectedDeckId;
  const active = decks.find((d) => d.id === activeId);
  if (active?.cardIds.includes(cardId)) return active.label;
  return decks.find((d) => d.cardIds.includes(cardId))?.label ?? null;
}

/** Where the back button returns to. */
const BACK_LABEL: Record<InspectContext, string> = { collection: 'Cards', deck: 'Deck', battle: 'Battle', opponent: 'Battle', pack: 'Back', shop: 'Shop', event: 'Event', other: 'Back' };

export function CardInspect({ cardId, onClose, context = 'other', battle, treatment = 'base', onPrev, onNext, onOpenDecks }: CardInspectProps) {
  const dialog = useDialogFocus(onClose);
  const scroller = useRef<HTMLDivElement>(null);
  const card = getCard(cardId);
  const unit = card.type === 'hero';
  const collection = useCollection();
  const copy = cardCopyView(cardId, collection);
  const rules: CardRules = battle?.rules ?? 'card';
  const inBattle = !!battle;
  const owned = inBattle || copy.owned;
  const hpContribution = battle ? (battle.rules === 'card' ? battle.hpContribution : undefined) : copy.hpContribution;
  const lore = CARD_LORE[cardId];
  const deckLabel = onOpenDecks ? findDeckFor(cardId) : null;
  const overline = battle ? `${battle.owner === 'enemy' ? 'Enemy card' : 'Your card'} · this battle` : copy.owned ? 'In your collection' : 'A card to discover';

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    track('card_inspect_opened', { cardId, context, rarity: card.rarity });
    if (context === 'collection') track('hero_detail_opened', { heroId: cardId, rarity: card.rarity });
    // Once per card shown, not per re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, context]);

  useEffect(() => {
    if (!onPrev && !onNext) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  return (
    <div className="overlay-backdrop hr-sheet-backdrop card-inspect-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className={`hr-sheet card-inspect ci-${context} r-${card.rarity} ${owned ? '' : 'missing'}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${card.name}, Card Inspect`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hr-sheet-scroll" ref={scroller}>
          <div className="hr-sheet-stage">
            <div className="hr-sheet-frame hr-sheet-card">
              <GameCard
                cardId={cardId}
                density="inspect"
                rules={rules}
                masteryRank={battle?.rules === 'legacy' ? (battle.masteryRank ?? 0) : 0}
                atk={battle?.atk}
                hpContribution={hpContribution}
                owned={owned}
                copies={inBattle ? 0 : copy.copies}
                treatment={treatment}
              />
            </div>
            {onPrev && (
              <button type="button" className="hr-sheet-nav prev" onClick={onPrev} aria-label="Previous card">
                <Icon name="back" size={20} />
              </button>
            )}
            {onNext && (
              <button type="button" className="hr-sheet-nav next" onClick={onNext} aria-label="Next card">
                <Icon name="back" size={20} />
              </button>
            )}
          </div>

          <div className="hr-sheet-body">
            <div className="hr-sheet-title">
              <span className="hr-sheet-overline">{overline.toUpperCase()}</span>
              <h2 className="hr-sheet-name">{card.name}</h2>
              {!inBattle && copy.owned && (
                <span className="hr-sheet-powerline">
                  {copy.copies} {copy.copies === 1 ? 'copy' : 'copies'}
                </span>
              )}
            </div>

            <div className="ci-pills">
              <span className={`ci-pill rarity r-${card.rarity}`}>
                <Gems rarity={card.rarity} />
                {RARITY_NAME[card.rarity]}
              </span>
              <span className="ci-pill">
                <Sigil faction={card.faction} size="sm" />
                {FACTION_NAME[card.faction] ?? card.faction}
              </span>
              <span className="ci-pill">
                <Icon name={unit ? 'hero' : card.spellKind === 'CONTINUOUS' ? 'continuousSpell' : 'spell'} size={13} />
                {cardTypeLine(card)}
              </span>
            </div>
            {card.tags.length > 0 && <p className="ci-traits">{card.tags.join(' · ')}</p>}

            <CardStatsPanel card={card} rules={rules} atk={battle?.atk} hpContribution={hpContribution} owner={battle?.owner} masteryRank={battle?.masteryRank} />
            <CardEffectList card={card} rules={rules} masteryRank={battle?.rules === 'legacy' ? (battle.masteryRank ?? 0) : 0} />

            {!inBattle && (
              <section className="ci-collection" aria-label="Collection">
                <h3 className="ci-heading">Collection</h3>
                <dl>
                  <div>
                    <dt>Copies owned</dt>
                    <dd>{copy.owned ? `×${copy.copies}` : 'Not collected yet'}</dd>
                  </div>
                  <div>
                    <dt>How to get it</dt>
                    <dd>{[acquisitionSummary(cardId).replaceAll('Summon ·', 'Pack set ·'), ...productAcquisitionLines(cardId)].join(' / ')}</dd>
                  </div>
                  <div>
                    <dt>Card style</dt>
                    <dd>{treatment === 'base' ? 'Standard' : treatment}</dd>
                  </div>
                </dl>
              </section>
            )}

            {deckLabel && onOpenDecks && (
              <button type="button" className="hr-deck-link" onClick={onOpenDecks}>
                <span className="hr-deck-link-text">
                  <span>In your deck</span>
                  <strong>{deckLabel}</strong>
                </span>
                <span className="hr-deck-link-go">
                  <Icon name="decks" size={16} />
                  View decks
                </span>
              </button>
            )}

            {!inBattle && lore && (
              <section className="ci-lore">
                <h3 className="ci-heading">{lore.title}</h3>
                <blockquote>“{lore.quote}”</blockquote>
                <p>{lore.story}</p>
              </section>
            )}
          </div>
        </div>

        <button type="button" className="hr-sheet-close" onClick={onClose} aria-label="Close Card Inspect">
          <Icon name="back" size={18} />
          <span className="hr-sheet-close-label">{BACK_LABEL[context]}</span>
        </button>
      </div>
    </div>
  );
}
