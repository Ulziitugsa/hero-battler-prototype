import { Icon } from './Icon';

const RULES: { icon: Parameters<typeof Icon>[0]['name']; text: string }[] = [
  { icon: 'hero', text: '3 Hero lanes and 3 Spell lanes face off, side by side.' },
  { icon: 'deck', text: 'Play Heroes and Spells from your hand into any open lane.' },
  { icon: 'power', text: 'Higher Power wins a lane - the loser is destroyed, the winner is untouched.' },
  { icon: 'warning', text: 'Equal Power destroys both Heroes in that lane.' },
  { icon: 'hp', text: 'An empty lane lets the enemy Hero hit your HP directly.' },
  { icon: 'spell', text: 'Spells resolve before Combat, in the order you placed them.' },
  { icon: 'continuousSpell', text: 'Continuous Spells stay on the board, working every round, until removed.' },
  { icon: 'check', text: 'You draw back up to 3 cards in hand at the start of every round.' },
  { icon: 'battle', text: 'When you’re ready, press FIGHT to lock in and resolve the round.' },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
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
          {RULES.map((rule, i) => (
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
