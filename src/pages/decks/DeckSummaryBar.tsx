import { Icon } from '../../components/Icon';
import { Sigil } from '../../components/CardParts';
import type { DeckSummary } from '../../game/decks/deckSummary';
import { plural } from './deckStatus';

export const STARTING_HP_HELP = 'Your HP at the start of every battle: the printed HP Contribution of all your Units.';

const nf = new Intl.NumberFormat('en-US');

/** The deck's headline number. Tapping it (where a handler is given) explains where the value comes from. */
export function StartingHpBadge({ value, onExplain }: { value: number; onExplain?: () => void }) {
  const body = (
    <>
      <span className="dk-hp-label">Starting HP</span>
      <span className="dk-hp-value">
        <Icon name="lp" size={15} filled />
        {nf.format(value)}
      </span>
    </>
  );
  return onExplain ? (
    <button type="button" className="dk-hp" onClick={onExplain} aria-label={`Starting HP ${nf.format(value)}. What is this?`} title={STARTING_HP_HELP}>
      {body}
    </button>
  ) : (
    <span className="dk-hp" role="group" aria-label={`Starting HP ${nf.format(value)}`} title={STARTING_HP_HELP}>
      {body}
    </span>
  );
}

/** One quiet line under the deck header: Unit/Spell split, average ATK and which factions the Units come from. */
export function DeckSummaryBar({ summary }: { summary: DeckSummary }) {
  return (
    <div className="dk-summary" aria-label="Deck summary">
      <span>{plural(summary.units, 'Unit')}</span>
      <span className="dk-summary-dot" aria-hidden="true" />
      <span>{plural(summary.spells, 'Spell')}</span>
      {summary.averageAtk !== null && (
        <>
          <span className="dk-summary-dot" aria-hidden="true" />
          <span className="dk-summary-atk">
            <Icon name="attack" size={12} />
            Avg {summary.averageAtk} ATK
          </span>
        </>
      )}
      {summary.factions.length > 0 && (
        <span className="dk-summary-factions">
          {summary.factions.map((f) => (
            <span key={f.faction} className="dk-summary-faction" aria-label={`${f.units} ${f.faction} Units`}>
              <Sigil faction={f.faction} size="sm" />
              {f.units}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
