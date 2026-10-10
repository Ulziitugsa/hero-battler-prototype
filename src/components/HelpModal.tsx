import { Icon } from './Icon';
import { CARD_GLOSSARY, DESTROYED_SPELL_RULE, ROUND_STEPS } from '../game/cards/cardPresentation';

// The card-combat rules, short. One list everywhere (battle, Profile): every battle mode plays these rules.
const RULES: { icon: Parameters<typeof Icon>[0]['name']; text: string }[] = [
  { icon: 'hero', text: '3 Unit lanes and 3 Spell lanes face off. Play Units and Spells from your hand into open lanes, then press FIGHT.' },
  { icon: 'hp', text: 'Starting HP: each Unit’s HP Contribution adds to your Starting HP. Units have no HP of their own.' },
  { icon: 'power', text: 'Higher ATK wins a lane. The loser is destroyed, the winner stays, and the losing player takes the difference as Clash Damage (145 vs 85: 60).' },
  { icon: 'warning', text: 'Equal ATK destroys both Units, with no damage to either player.' },
  { icon: 'battle', text: 'A Unit facing an empty lane hits the enemy player for its full ATK.' },
  { icon: 'spell', text: 'Spells resolve before combat. A one-time Spell happens once. A Lane Spell stays in its lane and works every round until it is destroyed.' },
  { icon: 'attachedSpell', text: 'An Attached Spell goes onto your Unit in its lane. When that Unit leaves play, the Spell goes to the Graveyard with it.' },
  { icon: 'help', text: 'Each effect says when it happens (“Before lanes fight”, “At the end of each round”, “When this is destroyed”). Card Inspect also names its timing. Card words are below.' },
  { icon: 'graveyard', text: 'Destroyed cards go to the Graveyard. A card can come back from it once per battle.' },
  { icon: 'check', text: 'You draw back up to 3 cards each round. An empty deck just stops drawing. Bring the enemy to 0 HP to win.' },
  { icon: 'cards', text: 'Every card plays exactly as printed. Duplicates never change a card’s ATK, HP Contribution or effects.' },
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
        <h3 className="help-modal-subhead">How a round works</h3>
        <ol className="help-modal-steps">
          {ROUND_STEPS.map((step) => (
            <li key={step.term}>
              <strong>{step.term}.</strong> {step.text}
            </li>
          ))}
        </ol>
        <p className="help-modal-note">{DESTROYED_SPELL_RULE}</p>
        <h3 className="help-modal-subhead">Card words</h3>
        <dl className="help-modal-glossary">
          {CARD_GLOSSARY.map((entry) => (
            <div key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>{entry.text}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
          Got it
        </button>
      </div>
    </div>
  );
}
