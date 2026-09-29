import type { AbilityDefinition, CardDefinition } from '../../game/types';
import { ATK_MEANING, cardFaceStats, formatStat, HP_CONTRIBUTION_MEANING } from '../../game/cards/cardFace';
import { cardEffectLines, cardKeywords, EFFECT_TIMING_HELP, KEYWORD_HELP } from '../../game/cards/effectText';
import { cardCombatEffectLines } from '../../game/cardCombat/cardText';
import { MASTERY_HPC_PCT } from '../../game/cardCombat/stats';
import { masteryLabel } from '../../game/cardMastery/model';
import { AtkIcon, HpIcon } from './CardIcons';
import '../../styles/cardInspect.css';

/** In a card-combat battle: what this copy put into its owner's Starting HP, and at which Card Mastery stage. */
export interface CardCombatInspect {
  owner: 'player' | 'enemy';
  /** HP Contribution with Card Mastery applied (what it added to Starting HP this match). */
  hpContribution: number;
  masteryStage: number;
}

/** The two stats spelled out, with their meaning, for Card Inspect and the Collection sheet. */
export function CardStatsPanel({ card, livePower, cardCombat }: { card: CardDefinition; livePower?: number; cardCombat?: CardCombatInspect }) {
  const printed = cardFaceStats(card);
  if (!printed) return null;
  if (cardCombat) return <CardCombatStatsPanel printed={printed} liveAtk={livePower} info={cardCombat} />;
  const live = livePower !== undefined ? cardFaceStats(card, livePower) : null;
  const shift = live ? live.atk - printed.atk : 0;
  return (
    <section className="ci-stats" aria-label="Card stats">
      <div className="ci-stat atk">
        <AtkIcon size={22} />
        <div>
          <strong>{formatStat(live?.atk ?? printed.atk)} <small>ATK</small></strong>
          <p>{shift !== 0 ? `${shift > 0 ? '+' : '−'}${Math.abs(shift)} this battle · printed ${printed.atk}` : ATK_MEANING}</p>
        </div>
      </div>
      <div className="ci-stat hp">
        <HpIcon size={22} />
        <div>
          <strong>+{formatStat(printed.hpContribution)} <small>HP</small></strong>
          <p><b>HP Contribution.</b> {HP_CONTRIBUTION_MEANING}</p>
        </div>
      </div>
    </section>
  );
}

/** Card combat: live ATK (a Unit's only battle stat) and the HP Contribution this copy added before the match. */
function CardCombatStatsPanel({ printed, liveAtk, info }: { printed: { atk: number; hpContribution: number }; liveAtk?: number; info: CardCombatInspect }) {
  const atk = liveAtk ?? printed.atk;
  const shift = atk - printed.atk;
  const pct = MASTERY_HPC_PCT[Math.max(1, Math.min(5, info.masteryStage)) - 1];
  const whose = info.owner === 'player' ? 'your' : 'the enemy’s';
  return (
    <section className="ci-stats" aria-label="Card stats">
      <div className="ci-stat atk">
        <AtkIcon size={22} />
        <div>
          <strong>{formatStat(atk)} <small>ATK</small></strong>
          <p>{shift !== 0 ? `${shift > 0 ? '+' : '−'}${Math.abs(shift)} this battle · printed ${printed.atk}` : ATK_MEANING}</p>
        </div>
      </div>
      <div className="ci-stat hp">
        <HpIcon size={22} />
        <div>
          <strong>+{formatStat(info.hpContribution)} <small>HP</small></strong>
          <p>
            <b>HP Contribution.</b> Added +{formatStat(info.hpContribution)} to {whose} Starting HP. It is not this Unit’s health.
          </p>
        </div>
      </div>
      <p className="ci-mastery-note">
        {masteryLabel(info.masteryStage)}: HP Contribution {pct > 0 ? `+${pct}%` : 'as printed'} (printed +{printed.hpContribution}). Mastery never changes ATK.
      </p>
    </section>
  );
}

/** Every effect line with its timing, plus short definitions for the keywords it uses. */
export function CardEffectList({ card, abilities = card.abilities, masteryAdded, cardCombat = false }: { card: CardDefinition; abilities?: readonly AbilityDefinition[]; masteryAdded?: ReadonlySet<AbilityDefinition>; cardCombat?: boolean }) {
  // Card combat plays the approved card-combat definition, with its own ATK / Player HP wording.
  const lines = cardCombat ? cardCombatEffectLines(card) : cardEffectLines(card, abilities);
  const keywords = cardKeywords(card, abilities);
  return (
    <section className="ci-effects" aria-label="Card effect">
      <h3 className="ci-heading">Effect</h3>
      {lines.length === 0 && <p className="ci-effect-none">No effect. A straightforward stat line.</p>}
      {lines.map((line, index) => (
        <div className="ci-effect" key={index}>
          <div className="ci-effect-tags">
            <span className="ci-timing" title={EFFECT_TIMING_HELP[line.trigger]}>{line.label}</span>
            {line.oncePerRound && <span className="ci-tag">Once per round</span>}
            {masteryAdded?.has(abilities[index]) && <span className="ci-tag mastery">Mastery</span>}
          </div>
          <p>{line.text}</p>
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
