import { useState } from 'react';
import type { CardDefinition } from '../../game/types';
import { Icon } from '../../components/Icon';
import { GoldIcon } from '../../components/GoldIcon';
import { useEconomy } from '../../game/economy/useEconomy';
import { useAccount } from '../../game/progression/useAccount';
import { useHeroLevel } from '../../game/heroLevel/useHeroLevel';
import { getHeroLevelStatus, levelUpHero } from '../../game/heroLevel/levelUp';
import '../../styles/ascension.css';

/**
 * The Hero Level section of an OWNED card's detail sheet - mirrors AscensionPanel's shape exactly (one
 * status query, one confirm-and-spend button) so the two progression systems read as one family rather
 * than two different UIs bolted together. Every number comes from game/heroLevel; this component decides
 * nothing.
 */
export function HeroLevelPanel({ card }: { card: CardDefinition }) {
  const { gold } = useEconomy();
  const account = useAccount();
  useHeroLevel(); // re-render whenever any hero's Level changes
  const [confirming, setConfirming] = useState(false);
  const status = getHeroLevelStatus(card.id, gold, account.level);

  return (
    <section className="asc-panel" aria-label="Hero Level">
      <div className="asc-head">
        <span className="asc-title">
          Level {status.level}
          {status.nextLevel === null && <em>Max</em>}
        </span>
        <span className="asc-copies">Cap {status.accountCap} / {status.maxLevel}</span>
      </div>

      {status.nextLevel !== null && status.cost !== null && (
        <>
          {confirming ? (
            <div className="asc-confirm" role="alertdialog" aria-label="Confirm Level Up">
              <span>
                Level {card.shortName} up to {status.nextLevel}? Costs {status.cost} Gold.
              </span>
              <span className="asc-confirm-btns">
                <button type="button" className="asc-btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="asc-btn gold"
                  onClick={() => {
                    levelUpHero(card.id);
                    setConfirming(false);
                  }}
                >
                  Confirm
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className={`asc-btn wide ${status.canLevelUp ? 'gold' : ''}`} disabled={!status.canLevelUp} onClick={() => setConfirming(true)}>
              <Icon name={status.canLevelUp ? 'power' : 'lock'} size={14} />
              Level Up · <GoldIcon size={13} /> {status.cost}
            </button>
          )}
          {!status.canLevelUp && status.reason && <p className="asc-reason">{status.reason}</p>}
        </>
      )}
    </section>
  );
}
