import { Icon } from './Icon';
import { useBattleCardDisplay } from './combatDisplay';

const RULES: { icon: Parameters<typeof Icon>[0]['name']; text: string }[] = [
  { icon: 'hero', text: '3 unit lanes and 3 Spell lanes face off, side by side.' },
  { icon: 'deck', text: 'Play units and Spells from your hand into any open lane.' },
  { icon: 'power', text: 'Higher ATK wins a lane - the loser is destroyed, the winner stays, and the losing player takes damage.' },
  { icon: 'warning', text: 'Equal ATK destroys both units in that lane.' },
  { icon: 'hp', text: 'An empty lane lets the enemy unit hit your HP directly.' },
  { icon: 'spell', text: 'Spells resolve before Combat, in the order you placed them.' },
  { icon: 'continuousSpell', text: 'Continuous Spells stay on the board, working every round, until removed.' },
  { icon: 'check', text: 'You draw back up to 3 cards in hand at the start of every round.' },
  { icon: 'battle', text: 'When you’re ready, press FIGHT to lock in and resolve the round.' },
];

/** Card combat (ATK + HP Contribution): the same list with the clash and HP lines in its own terms. */
const CARD_COMBAT_RULES: typeof RULES = RULES.flatMap((rule) => {
  if (rule.text.startsWith('Higher ATK')) return [{ icon: 'power' as const, text: 'Higher ATK wins a lane - the loser is destroyed, the winner stays, and the losing player takes the ATK difference as Clash Damage (145 vs 85: 60).' }];
  if (rule.text.startsWith('Equal ATK')) return [{ icon: 'warning' as const, text: 'Equal ATK destroys both units in that lane, with no Player damage.' }];
  if (rule.text.startsWith('An empty lane')) {
    return [
      { icon: 'hp' as const, text: 'Your HP starts at your deck’s Starting HP: the HP Contribution of all its Units added up. Units have no HP of their own.' },
      { icon: 'hp' as const, text: 'An empty lane lets the enemy unit hit your HP for its full ATK.' },
    ];
  }
  return [rule];
});

export function HelpModal({ onClose }: { onClose: () => void }) {
  const cardCombat = useBattleCardDisplay()?.rules === 'card';
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="modal-panel help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal-header">
          <h2>How to Play</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <ul className="help-modal-list">
          {(cardCombat ? CARD_COMBAT_RULES : RULES).map((rule, i) => (
            <li key={i}>
              <Icon name={rule.icon} size={18} />
              <span>{rule.text}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
          Got it
        </button>
      </div>
    </div>
  );
}
