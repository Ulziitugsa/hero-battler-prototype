import type { CardDefinition, Side } from '../../game/types';
import { ATK_MEANING, HP_CONTRIBUTION_MEANING, formatStat } from '../../game/cards/cardFace';
import { cardEffects, cardKeywords, printedAtk, KEYWORD_HELP, type CardRules } from '../../game/cards/cardPresentation';
import { MASTERY_HPC_PCT, printedStats } from '../../game/cardCombat/stats';
import { masteryLabel, masteryNumeral } from '../../game/cardMastery/model';
import { AtkIcon, HpIcon } from './CardIcons';
import '../../styles/cardInspect.css';

// The sections of Card Inspect (CardInspect.tsx): a Unit's two stats with their meaning, and every effect's full rule.
// Both read the card presentation model; neither writes rules text of its own.

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

export interface StatsPanelProps {
  card: CardDefinition;
  rules: CardRules;
  /** ATK now (a Unit in play). Defaults to printed. */
  atk?: number;
  /** HP Contribution of this copy (Card Mastery applied). Defaults to printed. */
  hpContribution?: number;
  /** This copy's Card Mastery stage (1..5), 0 for a card not owned. */
  masteryStage: number;
  /** In battle: whose copy this is. */
  owner?: Side;
  /** Legacy battles: the copy's Card Mastery rank, whose added effects the effect list marks. */
  masteryRank?: number;
}

/** ATK and HP Contribution, spelled out. A legacy battle says why HP Contribution doesn't apply there. */
export function CardStatsPanel({ card, rules, atk, hpContribution, masteryStage, owner, masteryRank = 0 }: StatsPanelProps) {
  if (card.type !== 'hero') return null;
  const printed = printedAtk(card, rules) ?? 0;
  const now = atk ?? printed;
  const shift = now - printed;
  const printedHpc = printedStats(card)?.hpc ?? 0;
  const hpc = hpContribution ?? printedHpc;
  const whose = owner === 'enemy' ? 'the enemy’s' : 'your';
  const pct = MASTERY_HPC_PCT[Math.max(1, Math.min(5, masteryStage)) - 1] ?? 0;
  let note: string;
  if (rules === 'legacy') note = masteryRank > 0 ? `Mastery ${masteryNumeral(masteryRank + 1)}: adds the effects marked Mastery below.` : '';
  else if (masteryStage < 1) note = 'Card Mastery raises HP Contribution, up to +20% at Mastery V. It never changes ATK.';
  else note = `${masteryLabel(masteryStage)}: HP Contribution ${pct > 0 ? `+${pct}%` : 'as printed'} (printed +${formatStat(printedHpc)}). Mastery never changes ATK.`;
  return (
    <section className="ci-stats" aria-label="Card stats">
      <div className="ci-stat atk">
        <AtkIcon size={22} />
        <div>
          <strong>
            {formatStat(now)} <small>ATK</small>
          </strong>
          <p>{shift !== 0 ? `${signed(shift)} this battle · printed ${printed}` : ATK_MEANING}</p>
        </div>
      </div>
      {rules === 'card' ? (
        <div className="ci-stat hp">
          <HpIcon size={22} />
          <div>
            <strong>
              +{formatStat(hpc)} <small>HP</small>
            </strong>
            <p>
              <b>HP Contribution.</b> {owner ? `Added +${formatStat(hpc)} to ${whose} Starting HP.` : HP_CONTRIBUTION_MEANING} It is not this Unit’s health.
            </p>
          </div>
        </div>
      ) : (
        <div className="ci-stat hp is-classic">
          <HpIcon size={22} />
          <div>
            <strong>
              +{formatStat(printedHpc)} <small>HP</small>
            </strong>
            <p>
              <b>HP Contribution.</b> Not used in this battle: it plays classic rules, where both players start at a fixed HP.
            </p>
          </div>
        </div>
      )}
      {note && <p className="ci-mastery-note">{note}</p>}
    </section>
  );
}

/** Every effect's full rule under its timing label, then short definitions for the keywords it uses. */
export function CardEffectList({ card, rules, masteryRank = 0 }: { card: CardDefinition; rules: CardRules; masteryRank?: number }) {
  const effects = cardEffects(card, { rules, masteryRank });
  const keywords = cardKeywords(card, { rules, masteryRank });
  return (
    <section className="ci-effects" aria-label="Card effect">
      <h3 className="ci-heading">{effects.length > 1 ? 'Effects' : 'Effect'}</h3>
      {effects.length === 0 && <p className="ci-effect-none">No effect. A straightforward stat line.</p>}
      {effects.map((effect, index) => (
        <div className="ci-effect" key={index}>
          <div className="ci-effect-tags">
            <span className="ci-timing" title={effect.help}>
              {effect.label}
            </span>
            {effect.label !== effect.timing && (
              <span className="ci-tag" title={effect.help}>
                {effect.timing}
              </span>
            )}
            {effect.oncePerRound && <span className="ci-tag">Once per round</span>}
            {effect.mastery && <span className="ci-tag mastery">Mastery</span>}
          </div>
          <p>{effect.full}</p>
        </div>
      ))}
      {keywords.length > 0 && (
        <dl className="ci-keywords">
          {keywords.map((keyword) => (
            <div key={keyword}>
              <dt>{keyword}</dt>
              <dd>{KEYWORD_HELP[keyword]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
