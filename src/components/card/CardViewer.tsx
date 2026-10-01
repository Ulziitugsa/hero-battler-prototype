import { useState } from 'react';
import { cardCopyView } from '../../game/cards/cardCopy';
import { useCollection } from '../../game/collection/useCollection';
import { useAscension } from '../../game/ascension/useAscension';
import { cardFocusDetails } from '../battleInfo/focusDetails';
import { useDialogFocus } from '../useDialogFocus';
import { CardFocusPanel, type FocusAction } from './CardFocusPanel';
import { CardInspect, type InspectContext } from './CardInspect';
import { GameCard, type CardTreatment } from './GameCard';

/**
 * Outside battle, the focused card detail as a sheet over the bottom of the screen: the player's copy of the card (the
 * same card face as in the grid, larger) beside its full rules, with the screen's own actions and Card Inspect.
 */
export function CardFocusSheet({ cardId, onClose, onInspect, actions }: { cardId: string; onClose: () => void; onInspect: () => void; actions?: FocusAction[] }) {
  const dialog = useDialogFocus(onClose);
  const copy = cardCopyView(cardId, useCollection(), useAscension());
  const details = cardFocusDetails(cardId, { rules: 'card', masteryStage: copy.masteryStage, hpContribution: copy.hpContribution });
  return (
    <div className="cf-sheet-backdrop" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className="cf-sheet-host" onClick={(e) => e.stopPropagation()}>
        <CardFocusPanel
          layout="sheet"
          details={details}
          onClose={onClose}
          onInspect={onInspect}
          actions={actions}
          side={<GameCard cardId={cardId} density="tile" hpContribution={copy.hpContribution} owned={copy.owned} copies={copy.copies} masteryStage={copy.masteryStage} />}
        />
      </div>
    </div>
  );
}

/**
 * How every screen outside battle shows a card it was asked about: the focus sheet first, Card Inspect one tap further,
 * and closing Card Inspect steps back to the sheet. Screens render it while a card is picked and drop it on close.
 */
export function CardViewer({
  cardId,
  context,
  onClose,
  actions,
  startWith = 'focus',
  treatment,
  onPrev,
  onNext,
  onOpenDecks,
}: {
  cardId: string;
  context: InspectContext;
  onClose: () => void;
  actions?: FocusAction[];
  /** 'inspect' opens Card Inspect straight away (a screen whose tiles already show everything the sheet would). */
  startWith?: 'focus' | 'inspect';
  treatment?: CardTreatment;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenDecks?: () => void;
}) {
  const [layer, setLayer] = useState<'focus' | 'inspect'>(startWith);
  if (layer === 'inspect') {
    return (
      <CardInspect
        cardId={cardId}
        context={context}
        treatment={treatment}
        onClose={startWith === 'inspect' ? onClose : () => setLayer('focus')}
        onPrev={onPrev}
        onNext={onNext}
        onOpenDecks={onOpenDecks}
      />
    );
  }
  return <CardFocusSheet cardId={cardId} onClose={onClose} onInspect={() => setLayer('inspect')} actions={actions} />;
}
