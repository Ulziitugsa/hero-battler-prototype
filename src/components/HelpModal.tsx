import { Icon } from './Icon';

// The card-combat rules, short. One list everywhere (battle, Profile): every battle mode plays these rules.
const RULES: { icon: Parameters<typeof Icon>[0]['name']; text: string }[] = [
  { icon: 'hero', text: '3 Unit lanes and 3 Spell lanes face off. Play Units and Spells from your hand into open lanes, then press FIGHT.' },
  { icon: 'hp', text: 'Starting HP: each Unit’s HP Contribution adds to your Starting HP. Units have no HP of their own.' },
  { icon: 'power', text: 'Higher ATK wins a lane. The loser is destroyed, the winner stays, and the losing player takes the difference as Clash Damage (145 vs 85: 60).' },
  { icon: 'warning', text: 'Equal ATK destroys both Units, with no damage to either player.' },
  { icon: 'battle', text: 'A Unit facing an empty lane hits the enemy player for its full ATK.' },
  { icon: 'spell', text: 'Spells resolve before combat. Continuous Spells stay and work every round until removed.' },
  { icon: 'graveyard', text: 'Destroyed cards go to the Graveyard. A card can come back from it once per match.' },
  { icon: 'check', text: 'You draw back up to 3 cards each round. An empty deck just stops drawing. Bring the enemy to 0 HP to win.' },
  { icon: 'cards', text: 'Card Mastery (I to V) raises a Unit’s HP Contribution, up to +20%. It never changes ATK.' },
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
