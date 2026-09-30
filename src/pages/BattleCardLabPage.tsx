import { ALL_CARDS } from '../game/cards';
import { BattleCard } from '../components/card/BattleCard';

/**
 * Dev-only QA sheet (?battleCardLab): every card as a card-combat battle face, at the sizes the 390x844 battle screen
 * gives them (hand 117x176, board 118x168, Spell zone 118x66). Each face reports the fit level it needed in
 * `data-fit` and `data-head`, so layout QA can list the cards that need smaller type or less artwork.
 */
export function BattleCardLabPage({ onBack }: { onBack: () => void }) {
  // ?battleCardLab&width=360 sizes the faces as a 360px-wide phone would (the battle scene scales with the viewport).
  const k = Number(new URLSearchParams(window.location.search).get('width') ?? 390) / 390;
  const size = (w: number, h: number) => ({ position: 'relative' as const, width: Math.round(w * k), height: Math.round(h * k) });
  const cards = ALL_CARDS.filter((c) => !c.id.startsWith('tok-'));
  return (
    <div style={{ padding: 12, background: '#0a141e', minHeight: '100dvh', color: '#f4ead2', overflowY: 'auto', height: '100dvh' }}>
      <button type="button" onClick={onBack}>Back</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {cards.map((card) => (
          <div key={card.id} data-lab-card={card.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div data-lab-variant="hand" style={size(117, 176)}>
              <BattleCard cardId={card.id} variant="hand" />
            </div>
            {card.type === 'hero' ? (
              <div data-lab-variant="board" style={size(118, 168)}>
                <BattleCard cardId={card.id} variant="board" />
              </div>
            ) : (
              <div data-lab-variant="spell" style={size(118, 66)}>
                <BattleCard cardId={card.id} variant="spell" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
