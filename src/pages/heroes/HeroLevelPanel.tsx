import { useEffect, useState } from 'react';
import type { CardDefinition } from '../../game/types';
import { Icon } from '../../components/Icon';
import { GoldIcon } from '../../components/GoldIcon';
import { useEconomy } from '../../game/economy/useEconomy';
import { getAscensionRank } from '../../game/ascension/store';
import { rosterPowerForHero } from '../../game/heroLevel/rosterPower';
import { useAccount } from '../../game/progression/useAccount';
import { useHeroLevel } from '../../game/heroLevel/useHeroLevel';
import { getHeroLevelStatus, levelUpHero } from '../../game/heroLevel/levelUp';
import { RewardFeedback } from '../../components/RewardFeedback';
import { track } from '../../analytics/track';
import '../../styles/ascension.css';
import { haptics } from '../../platform/haptics';
import { combatStats } from '../../game/combatV2/model';

/**
 * The Hero Level section of an OWNED card's detail sheet - mirrors AscensionPanel's shape exactly (one
 * status query, one confirm-and-spend button) so the two progression systems read as one family rather
 * than two different UIs bolted together. Every number comes from game/heroLevel; this component decides
 * nothing.
 */
export function HeroLevelPanel({ card, priority = false }: { card: CardDefinition; priority?: boolean }) {
  const { gold } = useEconomy();
  const account = useAccount();
  useHeroLevel(); // re-render whenever any hero's Level changes
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<{ before: number; after: number; delta: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = getHeroLevelStatus(card.id, gold, account.level);
  const rank = getAscensionRank(card.id);
  const rosterGain = status.nextLevel === null ? 0 : rosterPowerForHero(card.power ?? 0, status.nextLevel, rank) - rosterPowerForHero(card.power ?? 0, status.level, rank);
  const powerBefore = rosterPowerForHero(card.power ?? 0, status.level, rank);
  const powerAfter = status.nextLevel === null ? powerBefore : rosterPowerForHero(card.power ?? 0, status.nextLevel, rank);
  const combatBefore = combatStats(card.id, status.level, rank);
  const combatAfter = status.nextLevel === null ? combatBefore : combatStats(card.id, status.nextLevel, rank);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 750);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  return (
    <section className={`asc-panel hero-level-panel ${priority ? 'progression-primary' : ''} ${feedback ? 'level-flare' : ''}`} aria-label="Hero Level">
      <div className="asc-head">
        <span className="asc-title">
          Level <span className={feedback ? 'level-value level-value-pop' : 'level-value'}>{status.level}</span>
          {status.nextLevel === null && <em>Max</em>}
        </span>
        <span className="asc-copies">Cap {status.accountCap} / {status.maxLevel}</span>
      </div>

      {status.nextLevel !== null && status.nextLevel <= status.accountCap && <span className="hero-level-preview"><span>Hero Roster Power <strong className={feedback ? 'power-value-pop' : ''}>{powerBefore} → {powerAfter}</strong></span><span>Next step <strong>+{rosterGain}</strong></span><span>Combat V2 · experimental <strong>ATK {combatBefore.attack} → {combatAfter.attack} · HP {combatBefore.maxHp} → {combatAfter.maxHp}</strong></span></span>}
      {feedback && <RewardFeedback tone="progression" detail={`Level ${feedback.before} → ${feedback.after}`}>Roster Power +{feedback.delta}</RewardFeedback>}
      {error && <p className="asc-reason" role="status">{error}</p>}
      {status.nextLevel !== null && status.cost !== null && (
        <>
          {confirming ? (
            <div className="asc-confirm" role="alertdialog" aria-label="Confirm Level Up">
              <span>
                Level {card.shortName} {status.level} → {status.nextLevel}? Costs {status.cost.toLocaleString()} Gold and adds {rosterGain} Roster Power.
              </span>
              <span className="asc-confirm-btns">
                <button type="button" className="asc-btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="asc-btn gold"
                  onClick={() => {
                    setError(null);
                    track('hero_level_attempted', { cardId: card.id, levelBefore: status.level, levelAfter: status.nextLevel, goldCost: status.cost, rosterPowerBefore: powerBefore, rosterPowerAfter: powerAfter });
                    const result = levelUpHero(card.id);
                    if (result.ok) { setFeedback({ before: powerBefore, after: powerAfter, delta: powerAfter - powerBefore }); void haptics.levelUp(); }
                    else {
                      setError(result.reason ?? 'Could not level this Hero.');
                      track('hero_upgrade_blocked', { cardId: card.id, level: status.level, reason: result.reason ?? 'unknown' });
                    }
                    setConfirming(false);
                  }}
                >
                  Confirm
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className={`asc-btn wide ${status.canLevelUp ? 'gold' : ''}`} disabled={!status.canLevelUp} onClick={() => { setError(null); setConfirming(true); }}>
              <Icon name={status.canLevelUp ? 'power' : 'lock'} size={14} />
              {status.canLevelUp ? `Level ${status.level} → ${status.nextLevel}` : 'Level Up'} · <GoldIcon size={13} /> {status.cost?.toLocaleString()}
            </button>
          )}
          {!status.canLevelUp && status.reason && <p className="asc-reason">{status.reason}{status.blocked === 'no-gold' && <span className="upgrade-resource-path"> Earn Gold in Campaign and Idle Gold.</span>}</p>}
        </>
      )}
    </section>
  );
}
