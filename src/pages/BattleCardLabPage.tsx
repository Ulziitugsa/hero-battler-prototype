import { ALL_CARDS } from '../game/cards';
import type { CardRules } from '../game/cards/cardPresentation';
import { GameCard } from '../components/card/GameCard';
import { CardFocusPanel } from '../components/card/CardFocusPanel';
import { cardFocusDetails } from '../components/battleInfo/focusDetails';
import { hpContribution } from '../game/cardCombat/stats';

/**
 * Dev-only QA sheet (?battleCardLab): every card on the game's one card face (GameCard) at the sizes the 390x844 screens
 * give it: hand 117x176, board 118x168, Spell zone 118x66 and a Collection tile 108 wide. Each face reports the fit
 * level it needed in `data-fit` (and its art share in the inline `--gc-art`) and how its name fits in `data-name`, so
 * layout QA can list the cards that need smaller type or less artwork. `&rules=legacy` shows a legacy battle's wording.
 */
export function BattleCardLabPage({ onBack }: { onBack: () => void }) {
  const params = new URLSearchParams(window.location.search);
  // ?battleCardLab&width=360 sizes the faces as a 360px-wide phone would (the battle scene scales with the viewport).
  const k = Number(params.get('width') ?? 390) / 390;
  const rules: CardRules = params.get('rules') === 'legacy' ? 'legacy' : 'card';
  const size = (w: number, h: number) => ({ position: 'relative' as const, width: Math.round(w * k), height: Math.round(h * k) });
  const cards = ALL_CARDS.filter((c) => !c.id.startsWith('tok-'));
  // ?battleCardLab&panels: every card's focus panel in the dock over the hand apron (390x188 at 390), each reporting
  // whether its rules had to scroll in `data-scrolls`.
  if (params.has('panels')) {
    return (
      <div style={{ padding: 12, background: '#0a141e', minHeight: '100dvh', color: '#f4ead2', overflowY: 'auto', height: '100dvh' }}>
        <button type="button" onClick={onBack}>Back</button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {cards.map((card) => (
            <div key={card.id} data-lab-panel={card.id} style={{ ...size(390, 188), flex: '0 0 auto' }}>
              <CardFocusPanel layout="dock" details={cardFocusDetails(card.id, { rules, place: 'hand', hpContribution: card.type === 'hero' && rules === 'card' ? hpContribution(card.id) : undefined })} onClose={() => {}} onInspect={() => {}} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: 12, background: '#0a141e', minHeight: '100dvh', color: '#f4ead2', overflowY: 'auto', height: '100dvh' }}>
      <button type="button" onClick={onBack}>Back</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {cards.map((card) => (
          <div key={card.id} data-lab-card={card.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div data-lab-variant="hand" style={size(117, 176)}>
              <GameCard cardId={card.id} density="hand" rules={rules} />
            </div>
            {card.type === 'hero' ? (
              <div data-lab-variant="board" style={size(118, 168)}>
                <GameCard cardId={card.id} density="board" rules={rules} />
              </div>
            ) : (
              <div data-lab-variant="spell" style={size(118, 66)}>
                <GameCard cardId={card.id} density="spell" rules={rules} />
              </div>
            )}
            <div data-lab-variant="tile" style={{ position: 'relative', width: Math.round(108 * k) }}>
              <GameCard cardId={card.id} density="tile" rules={rules} hpContribution={card.type === 'hero' ? hpContribution(card.id) : undefined} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
