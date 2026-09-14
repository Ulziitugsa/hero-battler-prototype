import { Icon, type IconName } from './Icon';

// Home's own "how to play" entry point (Home Screen v3) - a compact 3-step sheet, distinct from the
// fuller 9-point HelpModal used elsewhere (TopControls, Profile). Deliberately short: "no walls of
// text" per the Embervale UI principles.
const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'deck', title: 'Choose a card', text: 'Tap a hero or spell in your hand. You draw back up to 3 cards every round.' },
  { icon: 'hero', title: 'Place it in a lane', text: 'Heroes go to the front line, spells sit behind them. Placing is targeting.' },
  { icon: 'battle', title: 'Press Fight', text: 'The two front lines clash once, then the round resolves. No confirm step.' },
];

export function HowToPlaySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="how-to-play-overlay" onClick={onClose}>
      <div className="how-to-play-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="how-to-play-header">
          <span className="how-to-play-title">How to play</span>
          <button type="button" className="how-to-play-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="how-to-play-rule" />
        <div className="how-to-play-steps">
          {STEPS.map((step) => (
            <div className="how-to-play-step" key={step.title}>
              <span className="how-to-play-step-icon">
                <Icon name={step.icon} size={21} />
              </span>
              <div>
                <div className="how-to-play-step-title">{step.title}</div>
                <div className="how-to-play-step-desc">{step.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="how-to-play-footnote">One card, one lane, one Fight press per round. Spells sit behind your heroes and support them.</div>
        <button type="button" className="how-to-play-cta" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
