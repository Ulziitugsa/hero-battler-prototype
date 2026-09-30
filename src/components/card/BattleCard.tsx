import { useLayoutEffect, useRef } from 'react';
import { getCard } from '../../game/cards';
import { cardAtk } from '../../game/cardCombat/engine';
import { cardCombatBattleEffects } from '../../game/cardCombat/cardText';
import { CardArtwork } from '../CardArtwork';
import { Gems, Sigil } from '../CardParts';
import { Icon } from '../Icon';
import { AtkIcon } from './CardIcons';
import '../../styles/collectible.css';
import '../../styles/battleCard.css';

/**
 * A card-combat card as it reads in battle (Battle UX pass): artwork, name, current ATK and every combat effect with
 * its timing, on the card itself. Card Inspect adds HP Contribution, Mastery and keyword help, but no rule lives only
 * there. Legacy battles, Collection and Deck Builder keep CollectibleCard.
 *
 * hand:  taller face in the hand fan; each effect under its own timing label, in its full wording where it fits.
 * board: the Unit in a Hero zone; timing label inline, board wording.
 * spell: a Spell in a Spell zone (a Continuous Spell, or a one-time Spell staged for this round); no art.
 *
 * Text never ellipsizes. If the rules don't fit, `useFitRules` steps through smaller type and the board wording before
 * it lets the rules panel scroll, and QA lists any card that reaches that last step.
 */
export type BattleCardVariant = 'hand' | 'board' | 'spell';

export interface BattleCardProps {
  cardId: string;
  variant: BattleCardVariant;
  /** Current ATK on the board (effective: base, this-round changes and Continuous Spells). Defaults to the printed ATK. */
  atk?: number;
  /** This-round ATK change, shown as a small chip. */
  tempAtk?: number;
  silenced?: boolean;
  shielded?: boolean;
  /** Always-on effects whose condition is currently met (true) or not (false), keyed by ability index. */
  passiveState?: ReadonlyMap<number, boolean>;
  /** Short name on the board; full name in hand. */
  name?: string;
}

/**
 * Presentation levels, tried in order until the rules panel shows everything: a taller art band when the rules are
 * short, full wording (hand only), smaller type,
 * board wording, a slimmer art band ("Gameplay readability wins over showing maximum artwork"), 9px type, and only
 * then a scrolling rules panel. Type never goes below 9px.
 */
const HAND_LEVELS = ['full-roomy', 'full', 'full-sm', 'compact', 'compact-sm', 'full-slim', 'compact-slim', 'compact-slim-sm', 'compact-slim-xs', 'scroll'] as const;
const BOARD_LEVELS = ['compact-roomy', 'compact', 'compact-sm', 'compact-slim', 'compact-slim-sm', 'compact-slim-xs', 'scroll'] as const;
const SPELL_LEVELS = ['compact', 'compact-sm', 'compact-xs', 'scroll'] as const;

/** Picks the first presentation level at which the rules panel shows everything without overflowing. */
function useFitRules(levels: readonly string[], key: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const el = root?.querySelector<HTMLElement>('.bc-rules');
    if (!root || !el) return;
    const fit = () => {
      for (const level of levels) {
        root.dataset.fit = level;
        if (level === 'scroll' || el.scrollHeight <= el.clientHeight + 1) return;
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, [levels, key]);
  return ref;
}

export function BattleCard({ cardId, variant, atk, tempAtk = 0, silenced = false, shielded = false, passiveState, name }: BattleCardProps) {
  const card = getCard(cardId);
  const unit = card.type === 'hero';
  const continuous = card.spellKind === 'CONTINUOUS';
  const effects = cardCombatBattleEffects(cardId);
  const printed = unit ? cardAtk(cardId) : 0;
  const current = atk ?? printed;
  const shift = current > printed ? 'up' : current < printed ? 'down' : '';
  const levels = variant === 'hand' ? HAND_LEVELS : variant === 'board' ? BOARD_LEVELS : SPELL_LEVELS;
  // Re-fit whenever something that changes the rules panel's length changes (a state tag, the Silenced line, flags).
  const passiveKey = passiveState ? [...passiveState].map(([i, on]) => `${i}${on ? '+' : '-'}`).join(',') : '';
  const fitRef = useFitRules(levels, `${cardId}|${variant}|${silenced}|${shielded}|${tempAtk !== 0}|${passiveKey}`);
  const title = name ?? (variant === 'hand' ? card.name : card.shortName);

  return (
    <span className={`collectible battle-card v-${variant} r-${card.rarity} ${card.faction} ${unit ? 'is-unit' : 'is-spell'} ${silenced ? 'is-silenced' : ''}`} data-mode={`battle-${variant}`} data-fit={levels[0]} ref={fitRef}>
      <span className="collectible-frame" aria-hidden="true" />
      {card.rarity === 'legendary' && variant !== 'spell' && <span className="collectible-crest" aria-hidden="true" />}
      <span className="bc-body">
        {variant !== 'spell' && (
          <span className="bc-art">
            <CardArtwork cardId={cardId} animated={false} />
            <span className="bc-identity" aria-hidden="true">
              <Sigil faction={card.faction} size="sm" />
              <Gems rarity={card.rarity} />
            </span>
            {unit ? (
              <span className={`bc-atk ${shift}`} aria-label={`${current} ATK${shift ? `, printed ${printed}` : ''}`}>
                <AtkIcon size={12} />
                <strong>{current}</strong>
                {shift && <s className="bc-atk-printed">{printed}</s>}
              </span>
            ) : (
              <span className="bc-kind">
                <Icon name={continuous ? 'continuousSpell' : 'spell'} size={11} />
                {continuous ? 'Continuous' : 'Spell'}
              </span>
            )}
            {unit && tempAtk !== 0 && (
              <span className={`bc-temp ${tempAtk > 0 ? 'up' : 'down'}`} title="Until the end of this round">
                {tempAtk > 0 ? '+' : '−'}
                {Math.abs(tempAtk)} this round
              </span>
            )}
            {shielded && (
              <span className="bc-flag shield" title="Shield: survives the first time it would be destroyed">
                Shield
              </span>
            )}
          </span>
        )}
        {variant !== 'spell' && <span className="bc-name">{title}</span>}
        <span className="bc-rules">
          {variant === 'spell' && (
            <span className="bc-name">
              <Icon name={continuous ? 'continuousSpell' : 'spell'} size={10} />
              {title}
            </span>
          )}
          {silenced && <span className="bc-silenced">Silenced this round: effects are off</span>}
          {effects.length === 0 && <span className="bc-none">No effect</span>}
          {effects.map((effect, i) => {
            const state = passiveState?.get(effect.abilityIndex);
            return (
              <span className={`bc-effect ${state === false || silenced ? 'is-off' : ''}`} key={i} data-trigger={effect.trigger}>
                {/* A one-time Spell in its zone is being cast this round, so "On Play" goes without saying there. */}
                <span className={`bc-when ${variant === 'spell' && !continuous && effect.trigger === 'ON_PLAY' ? 'bc-when-implied' : ''}`}>
                  {effect.label}
                  {effect.oncePerRound && <span className="bc-once"> · once per round</span>}
                  {state !== undefined && !silenced && <span className={`bc-state ${state ? 'on' : 'off'}`}>{state ? 'active' : 'inactive'}</span>}
                </span>{' '}
                {variant === 'hand' && <span className="bc-text bc-text-full">{effect.text}</span>}
                <span className="bc-text bc-text-compact">{effect.compact}</span>
              </span>
            );
          })}
        </span>
      </span>
    </span>
  );
}
