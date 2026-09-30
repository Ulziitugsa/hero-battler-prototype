import { useEffect } from 'react';
import { getCard } from '../game/cards';
import { CARD_LORE } from '../game/cards/lore';
import { CollectibleCard, type CardTreatment } from './CollectibleCard';
import { Icon } from './Icon';
import { useDialogFocus } from './useDialogFocus';
import { Gems, Sigil } from './CardParts';
import { getCollection, getOwnedCount } from '../game/collection/collection';
import { acquisitionSummary } from '../game/collection/acquisition';
import { productAcquisitionLines } from '../game/collection/productSources';
import { getAscensionRank } from '../game/ascension/store';
import { getCardAscension } from '../game/ascension/definitions';
import { ascensionAddedAbilities, effectiveAbilities } from '../game/ascension/effective';
import { CardEffectList, CardStatsPanel } from './card/CardInspectSections';
import { track } from '../analytics/track';
import { getCardMasteryView } from '../game/cardMastery/model';
import { useCardCombatDisplay } from './combatDisplay';
import { BattleCard } from './card/BattleCard';

/** Where Card Inspect was opened from. Battle views keep the sheet to what matters mid-match. */
export type InspectContext = 'collection' | 'deck' | 'battle' | 'opponent' | 'pack' | 'shop' | 'event' | 'other';

const TYPE_LABEL = { hero: 'Unit', ONE_TIME: 'Spell', CONTINUOUS: 'Continuous Spell' } as const;
const FACTION_LABEL: Record<string, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal', wildborn: 'Wildborn' };
const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' } as const;
const STAGES = ['I', 'II', 'III', 'IV', 'V'];

export interface CardDetailProps {
  cardId: string;
  onClose: () => void;
  context?: InspectContext;
  /** Current battle Power of this copy, to show live ATK. */
  livePower?: number;
  /** Mastery rank to describe. Defaults to the player's own rank; pass an opponent copy's rank in battle. */
  masteryRank?: number;
  treatment?: CardTreatment;
}

/** Card Inspect: the one place that spells out a card - big face, stats with their meaning, exact effect, collection state. */
export function CardDetail({ cardId, onClose, context = 'other', livePower, masteryRank, treatment = 'base' }: CardDetailProps) {
  const dialog = useDialogFocus(onClose);
  const card = getCard(cardId);
  const inBattle = context === 'battle' || context === 'opponent';
  const typeLabel = TYPE_LABEL[card.type === 'hero' ? 'hero' : (card.spellKind ?? 'ONE_TIME')];
  const lore = CARD_LORE[cardId];
  const owned = getOwnedCount(cardId, getCollection());
  const masteryPath = getCardAscension(cardId);
  const rank = masteryRank ?? (context === 'opponent' ? 0 : getAscensionRank(cardId));
  // A card-combat battle plays the approved card-combat definition: no Ascension-added lines, Mastery is HP only.
  const cardCombat = useCardCombatDisplay();
  const combatInfo = cardCombat && inBattle && card.type === 'hero' && card.role !== 'Token'
    ? { owner: context === 'opponent' ? ('enemy' as const) : ('player' as const), hpContribution: cardCombat.hpContribution(cardId, context === 'opponent' ? 'enemy' : 'player'), masteryStage: cardCombat.masteryStage(cardId, context === 'opponent' ? 'enemy' : 'player') }
    : undefined;
  const abilities = cardCombat ? card.abilities : effectiveAbilities(cardId, rank);
  const added = cardCombat ? undefined : ascensionAddedAbilities(cardId, rank);

  useEffect(() => {
    track('card_inspect_opened', { cardId, context, rarity: card.rarity });
  }, [cardId, context, card.rarity]);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className={`modal-panel card-inspect ci-${context}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${card.name} card details`}>
        <button type="button" className="btn btn-icon ci-close" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        <div className="ci-card">
          {/* In a card-combat battle, the same battle card as in hand and on the board, larger and with HP Contribution. The Effect list below gives the full wording. */}
          {cardCombat && inBattle ? (
            <BattleCard cardId={cardId} variant="inspect" atk={card.type === 'hero' ? livePower : undefined} hpContribution={combatInfo?.hpContribution} />
          ) : (
            <CollectibleCard cardId={cardId} mode="inspect" livePower={livePower} masteryRank={combatInfo ? combatInfo.masteryStage : rank} treatment={treatment} />
          )}
        </div>

        <header className="ci-header">
          <h2>{card.name}</h2>
          <div className="ci-pills">
            <span className={`ci-pill rarity r-${card.rarity}`}><Gems rarity={card.rarity} />{RARITY_LABEL[card.rarity]}</span>
            <span className="ci-pill"><Sigil faction={card.faction} size="sm" />{FACTION_LABEL[card.faction] ?? card.faction}</span>
            <span className="ci-pill"><Icon name={card.type === 'hero' ? 'hero' : card.spellKind === 'CONTINUOUS' ? 'continuousSpell' : 'spell'} size={13} />{typeLabel}{card.type === 'hero' && card.role ? ` · ${card.role}` : ''}</span>
          </div>
          {card.tags.length > 0 && <p className="ci-traits">{card.tags.join(' · ')}</p>}
        </header>

        <CardStatsPanel card={card} livePower={livePower} cardCombat={combatInfo} />
        <CardEffectList card={card} abilities={abilities} masteryAdded={added} cardCombat={!!cardCombat} />

        {!inBattle && (
          <section className="ci-collection" aria-label="Collection">
            <h3 className="ci-heading">Collection</h3>
            <dl>
              <div><dt>Copies owned</dt><dd>{owned > 0 ? `×${owned}` : 'Not collected yet'}</dd></div>
              {card.type === 'hero' && <div><dt>Card Mastery</dt><dd>{masteryPath ? `${getCardMasteryView(cardId).label} of ${STAGES[masteryPath.ranks.length] ?? masteryPath.ranks.length + 1}` : 'No Mastery path yet'}</dd></div>}
              <div><dt>How to get it</dt><dd>{[acquisitionSummary(cardId).replaceAll('Summon ·', 'Pack set ·'), ...productAcquisitionLines(cardId)].join(' / ')}</dd></div>
              <div><dt>Card style</dt><dd>{treatment === 'base' ? 'Standard' : treatment}</dd></div>
            </dl>
          </section>
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
  );
}
