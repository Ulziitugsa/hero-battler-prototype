import { useState } from 'react';
import { CardDetail } from '../../components/CardDetail';
import { Gems } from '../../components/CardParts';
import { Icon } from '../../components/Icon';
import { getCard } from '../../game/cards';
import { SUMMON_CONFIG, SUMMON_RARITY_ORDER } from '../../game/summon/config';
import { cardRates, type SummonPool } from '../../game/summon/pool';
import { RARITY_LABEL, formatPercent } from '../../game/summon/view';

/** "View pool": rates up top, then every card grouped by rarity with its own chance. Featured cards are marked. Kept readable - four rows and short lists, not a table of small print. */
export function PoolSheet({ pool, onClose }: { pool: SummonPool; onClose: () => void }) {
  const [inspectId, setInspectId] = useState<string | null>(null);
  const rates = cardRates(pool);
  return (
    <div className="overlay-backdrop campaign-sheet-backdrop" onClick={onClose}>
      <div className="pool-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${pool.name} pool`}>
        <div className="pool-head">
          <div>
            <span className="pool-title">{pool.name}</span>
            <span className="pool-sub">{pool.banner.builds}</span>
          </div>
          <button type="button" className="pool-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="pool-rates">
          {[...SUMMON_RARITY_ORDER].reverse().map((r) => (
            <span key={r} className={`pool-rate r-${r}`}>
              <b>{formatPercent(pool.rates[r])}</b>
              {RARITY_LABEL[r]}
            </span>
          ))}
        </div>
        <p className="pool-note">
          Featured cards are more likely within their rarity. Legendary is guaranteed by summon {SUMMON_CONFIG.pityThreshold} on this banner.
        </p>
        <div className="pool-scroll">
          {[...SUMMON_RARITY_ORDER].reverse().map((r) => {
            const rows = rates.filter((x) => x.entry.rarity === r);
            if (rows.length === 0) return null;
            return (
              <section key={r} className="pool-group">
                <h3 className={`r-${r}`}>
                  <Gems rarity={r} /> {RARITY_LABEL[r]}
                </h3>
                <ul>
                  {rows
                    .sort((a, b) => b.percent - a.percent)
                    .map(({ entry, percent }) => {
                      const c = getCard(entry.cardId);
                      return (
                        <li key={entry.cardId}>
                          <button type="button" onClick={() => setInspectId(entry.cardId)}>
                            <span className="pool-name">
                              {c.name}
                              {entry.featured && <em className={entry.featured}>Featured</em>}
                            </span>
                            <span className="pool-type">{c.type === 'hero' ? 'Hero' : 'Spell'}</span>
                            <span className="pool-pct">{formatPercent(percent)}</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {inspectId && <CardDetail cardId={inspectId} onClose={() => setInspectId(null)} />}
    </div>
  );
}
