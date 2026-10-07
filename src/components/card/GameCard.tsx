import { Fragment, useLayoutEffect, useRef } from 'react';
import { getCard } from '../../game/cards';
import { cardEffects, printedAtk, type CardEffect, type CardRules } from '../../game/cards/cardPresentation';
import { isAttachedSpell } from '../../game/cardCombat/cards';
import { CardArtwork } from '../CardArtwork';
import { Gems, Sigil } from '../CardParts';
import { Icon } from '../Icon';
import '../../styles/gameCard.css';

/**
 * THE card. Every surface in Moonwater draws a card with this one component: the hand, the board and the Spell zones in
 * every battle mode, the Collection, the Deck Builder, Shop and Box contents, Pull Results, events, the outside-battle
 * focus sheet and Card Inspect. It is a collectible card in four zones inside the rarity frame: a name bar, a framed
 * art box, a stats and identity row with ATK (and, off the battlefield, HP Contribution) set into the frame, and a text
 * box with every effect as a short battle line after its small-caps timing label ("Passive: Adjacent allies +15 ATK.").
 *
 * The words come from the card presentation model (game/cards/cardPresentation.ts), never from the screen: `rules`
 * picks the card-combat rules (the default, and every surface outside battle) or, in a legacy battle, the legacy ones.
 *
 * Densities:
 *  hand:    most readable; full name.
 *  board:   compact but complete; short name; board wording; shows whether conditional Passives are active.
 *  spell:   a Spell in a Spell zone: a wide, short strip with its name and text.
 *  tile:    a card in a grid (Collection, Deck Builder, Shop, Pull Results, events): the hand card, plus HP Contribution
 *           and the collection marks (copies, not owned).
 *  inspect: the large face in Card Inspect and the outside-battle focus sheet.
 *
 * Text never ellipsizes and the card body never scrolls. If the effects don't fit, `useFitCard` tightens spacing,
 * then gives the text box what it needs from the art box (down to a floor), then steps the type down (never below
 * 9px), and sets the very longest text slightly condensed. The stats row drops its rarity gems before it ever
 * crowds ATK or HP Contribution (the frame's material still shows the rarity).
 */
export type GameCardDensity = 'hand' | 'board' | 'spell' | 'tile' | 'inspect';

/**
 * Presentation variants a copy of a card can carry. Only 'base' is styled for real today; the rest are reserved names
 * so owned-copy data, shop products and event rewards can refer to them without another component change. The frame
 * reads `data-treatment`, and the `.gc-treatment` layer over the art is where foil and moonlit sheens and animated
 * overlays go. Alternate art is a different `artId`, not a different component.
 */
export type CardTreatment = 'base' | 'foil' | 'moonlit' | 'animated' | 'alt-art' | 'premium-frame' | 'event';

export interface GameCardProps {
  cardId: string;
  density: GameCardDensity;
  /** Which rules the text and ATK describe: card combat (default) or a legacy battle's. */
  rules?: CardRules;
  /** Legacy rules only (historical legacy matches): the copy's legacy Ascension rank, whose added effects that resolver plays. */
  masteryRank?: number;
  /** A Unit's current ATK (on the board: base, changes and Continuous Spells). Defaults to its printed ATK. */
  atk?: number;
  /** This-round ATK change, shown as a small flag on the art. */
  tempAtk?: number;
  silenced?: boolean;
  shielded?: boolean;
  /** Always-on effects whose condition is currently met (true) or not (false), keyed by ability index. */
  passiveState?: ReadonlyMap<number, boolean>;
  /** Overrides the title (a board Unit's short name). */
  name?: string;
  /** A Unit's HP Contribution, shown beside ATK (tiles, Card Inspect). Omit to leave it off (battle faces). */
  hpContribution?: number;
  /** false veils the art with a lock (a card not collected yet). */
  owned?: boolean;
  /** Copies owned; a ×N mark shows from 2. */
  copies?: number;
  treatment?: CardTreatment;
  /** Art to paint instead of the card's own (alternate art). */
  artId?: string;
  /** Animate the pixel art (off by default except in Card Inspect, to save battery in grids). */
  animated?: boolean;
  className?: string;
}

/**
 * Presentation levels, tried in order until every effect shows (gameCard.css): a little extra art when the text is
 * short; the standard card; tighter spacing. A card with more text then keeps as much art as its effects leave
 * ("fill"), first at full type, then half a pixel smaller, then at 9px, then at 9px set 8% narrower, each with a floor
 * on the art box (a share of the card's height). No level scrolls.
 */
const CARD_LEVELS = ['roomy', 'base', 'tight'] as const;
const FILL_LEVELS = [
  ['fill', 44],
  ['sm-fill', 41],
  ['xs-fill', 30],
  ['xxs-fill', 26],
] as const;
/** Text is never cut off: the last level takes the art box below its floor if the effects still need it. */
const MIN_ART = 10;
/** Spell zones have no art to give, so their last level sets the 9px text slightly condensed, as long card text is. */
const SPELL_LEVELS = ['base', 'sm', 'xs', 'xxs'] as const;
/** The name stays on one line: full name, then a smaller size, then the short name. */
const NAME_FITS = ['full', 'full-sm', 'short', 'short-sm'] as const;
/** The stats row: everything; without the rarity gems; then tighter sockets; then without the faction sigil too. */
const STAT_FITS = ['full', 'no-gems', 'tight', 'min'] as const;

/** A number stays on the line with its unit ("+15 ATK", "90 damage", "Guard 2"), as on a printed card. */
const keepTogether = (text: string) => text.replace(/(\d) (ATK|HP|damage|more)\b/g, '$1 $2').replace(/\bGuard (\d)/g, 'Guard $1');

interface FitResult {
  fit: string;
  name: string;
  stats: string;
  art: string | null;
  artTop: string | null;
}

/**
 * Fitted layouts by content and size, so a grid of the same cards (the Collection, a Box's contents) measures each
 * card once. Only kept once the web fonts have loaded: a layout measured in a fallback font is redone.
 */
const fitCache = new Map<string, FitResult>();
const fontsSettled = () => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded';

function useFitCard(density: GameCardDensity, key: string) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    const rules = root?.querySelector<HTMLElement>('.gc-rules');
    if (!root || !rules) return;
    const name = root.querySelector<HTMLElement>('.gc-namebar .gc-name');
    const statRow = root.querySelector<HTMLElement>('.gc-statrow');
    const names = NAME_FITS.filter((n) => !n.startsWith('short') || root.querySelector('.gc-name-short'));
    const fits = () => rules.scrollHeight <= rules.clientHeight + 1;
    const apply = (result: FitResult) => {
      root.dataset.fit = result.fit;
      root.dataset.name = result.name;
      root.dataset.stats = result.stats;
      if (result.art) root.style.setProperty('--gc-art', result.art);
      else root.style.removeProperty('--gc-art');
      if (result.artTop) root.style.setProperty('--gc-art-top', result.artTop);
      else root.style.removeProperty('--gc-art-top');
    };
    const measure = () => {
      root.style.removeProperty('--gc-art');
      root.style.removeProperty('--gc-art-top');
      if (statRow) {
        for (const level of STAT_FITS) {
          root.dataset.stats = level;
          if (statRow.scrollWidth <= statRow.clientWidth + 1) break;
        }
      }
      if (name) {
        for (const n of names) {
          root.dataset.name = n;
          if (name.scrollWidth <= name.clientWidth + 1) break;
        }
        // A name that still doesn't fit wraps rather than clips.
        if (name.scrollWidth > name.clientWidth + 1) root.dataset.name = `${root.dataset.name} wrap`;
      }
      if (density === 'spell') {
        for (const level of SPELL_LEVELS) {
          root.dataset.fit = level;
          if (fits()) return;
        }
        return;
      }
      for (const level of CARD_LEVELS) {
        root.dataset.fit = level;
        if (fits()) return;
      }
      // The effects need more room than the standard art box leaves: measure them and give the rest to the art.
      const body = rules.parentElement?.clientHeight ?? 0;
      const card = root.clientHeight;
      const art = root.querySelector<HTMLElement>('.gc-art');
      if (!body || !card || !art) return;
      const setArt = (px: number) => {
        const pct = (px / body) * 100;
        root.style.setProperty('--gc-art', `${pct.toFixed(2)}%`);
        root.style.setProperty('--gc-art-top', `${Math.min(0, (pct - 56) * 0.7).toFixed(1)}%`);
      };
      for (const [level, floor] of FILL_LEVELS) {
        root.dataset.fit = level;
        rules.style.flex = '0 0 auto';
        const need = rules.offsetHeight;
        rules.style.removeProperty('flex');
        const artNow = art.offsetHeight;
        // The art box once the text box has exactly what it needs.
        const artPx = Math.floor(artNow - (need - rules.offsetHeight));
        const last = level === 'xxs-fill';
        const floorPx = Math.ceil(((last && artPx < (floor / 100) * card ? MIN_ART : floor) / 100) * card);
        if (artPx >= floorPx || last) {
          let px = Math.min(artNow, Math.max(floorPx, artPx));
          setArt(px);
          // Heights round to whole pixels, so the estimate can be a pixel out: settle on the largest box that fits.
          for (let i = 0; i < 3 && px > floorPx && !fits(); i++) setArt(--px);
          for (let i = 0; i < 3 && px < artNow && fits(); i++) {
            setArt(px + 1);
            if (!fits()) break;
            px++;
          }
          setArt(px);
          return;
        }
      }
    };
    const fit = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (!w || !h) return;
      const cacheKey = `${key}|${w}x${h}`;
      const cached = fontsSettled() ? fitCache.get(cacheKey) : undefined;
      if (cached) {
        apply(cached);
        return;
      }
      measure();
      if (fontsSettled()) {
        fitCache.set(cacheKey, {
          fit: root.dataset.fit ?? '',
          name: root.dataset.name ?? 'full',
          stats: root.dataset.stats ?? 'full',
          art: root.style.getPropertyValue('--gc-art') || null,
          artTop: root.style.getPropertyValue('--gc-art-top') || null,
        });
      }
    };
    fit();
    // Web fonts change the measurements once they arrive; refit then too.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    let live = true;
    const refit = () => {
      fitCache.clear();
      if (live) fit();
    };
    fonts?.ready.then(() => live && fit());
    fonts?.addEventListener?.('loadingdone', refit);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit);
    observer?.observe(root);
    return () => {
      live = false;
      fonts?.removeEventListener?.('loadingdone', refit);
      observer?.disconnect();
    };
  }, [density, key]);
  return ref;
}

interface EffectGroup {
  label: string;
  trigger: CardEffect['trigger'];
  implied: boolean;
  /** A keyword line ("Guard 2.", "Shield."): printed alone, without "label:". */
  keyword: boolean;
  effects: CardEffect[];
}

export function GameCard({
  cardId,
  density,
  rules = 'card',
  masteryRank = 0,
  atk,
  tempAtk = 0,
  silenced = false,
  shielded = false,
  passiveState,
  name,
  hpContribution,
  owned = true,
  copies = 0,
  treatment = 'base',
  artId,
  animated,
  className = '',
}: GameCardProps) {
  const card = getCard(cardId);
  const unit = card.type === 'hero';
  const continuous = card.spellKind === 'CONTINUOUS';
  const effects = cardEffects(cardId, { rules, masteryRank });
  const printed = printedAtk(card, rules) ?? 0;
  const current = atk ?? printed;
  const shift = current > printed ? 'up' : current < printed ? 'down' : '';
  const compactName = density === 'board' || density === 'spell';
  const title = name ?? (compactName ? card.shortName : card.name);
  const hasShort = !compactName && !name && card.shortName !== card.name;
  const inspect = density === 'inspect';
  const marks = density === 'tile' || inspect;
  // Re-fit whenever something that changes the name, the stats row or the text box's length changes.
  const passiveKey = passiveState ? [...passiveState].map(([i, on]) => `${i}${on ? '+' : '-'}`).join(',') : '';
  const fitRef = useFitCard(density, `${cardId}|${density}|${rules}|${masteryRank}|${title}|${silenced}|${passiveKey}|${current}|${hpContribution ?? ''}`);
  // A Spell names its kind where a Unit shows ATK. (Card Inspect lists a Unit's role under the card.)
  const attached = continuous && rules === 'card' && isAttachedSpell(cardId);
  const spellKind = attached ? (inspect ? 'Attached Spell' : 'Attached') : continuous ? (inspect ? 'Lane Spell' : 'Lane') : 'Spell';

  // Effects that share a label read as one paragraph under it ("Clash: Give this Unit +15 ATK this round. If ...").
  const groups: EffectGroup[] = [];
  for (const effect of effects) {
    // A one-time Spell's effect happens once, when it is cast, so its timing goes without saying (as on a printed card).
    const implied = !unit && !continuous && (effect.trigger === 'CAST' || effect.trigger === 'ON_PLAY');
    const last = groups[groups.length - 1];
    if (last && !effect.keyword && !last.keyword && last.label === effect.faceLabel && last.implied === implied) last.effects.push(effect);
    else groups.push({ label: effect.faceLabel, trigger: effect.trigger, implied, keyword: effect.keyword, effects: [effect] });
  }
  const stateDot = (state: boolean | undefined) =>
    state !== undefined && !silenced && <span className={`gc-state ${state ? 'on' : 'off'}`} role="img" aria-label={state ? 'active now' : 'inactive now'} title={state ? 'Active now' : 'Not active now'} />;

  const text = (
    <span className="gc-rules">
      {density === 'spell' && (
        <span className="gc-name gc-name-inline">
          <Icon name={attached ? 'attachedSpell' : continuous ? 'continuousSpell' : 'spell'} size={10} />
          {title}
        </span>
      )}
      {silenced && <span className="gc-silenced">Silenced this round</span>}
      {effects.length === 0 && <span className="gc-none">No effect</span>}
      {groups.map((group, g) => {
        const states = group.effects.map((effect) => passiveState?.get(effect.abilityIndex));
        const single = group.effects.length === 1;
        return (
          <span className={`gc-effect ${silenced || states.every((state) => state === false) ? 'is-off' : ''}`} key={g} data-trigger={group.trigger}>
            {!group.implied && !group.keyword && (
              <>
                <span className="gc-when">
                  {single && stateDot(states[0])}
                  {group.label}:
                </span>{' '}
              </>
            )}
            {group.effects.map((effect, k) => (
              <Fragment key={k}>
                {k > 0 && ' '}
                <span className={`gc-text ${silenced || states[k] === false ? 'is-off' : ''} ${effect.mastery ? 'is-mastery' : ''} ${effect.keyword ? 'is-keyword' : ''}`}>
                  {(!single || group.keyword) && stateDot(states[k])}
                  {keepTogether(density === 'board' || density === 'spell' ? effect.board : effect.compact)}
                </span>
              </Fragment>
            ))}
          </span>
        );
      })}
    </span>
  );

  return (
    <span
      className={`game-card d-${density} r-${card.rarity} ${card.faction} ${unit ? 'is-unit' : 'is-spell'} ${silenced ? 'is-silenced' : ''} ${owned ? '' : 'is-missing'} treatment-${treatment} ${className}`}
      data-card={cardId}
      data-treatment={treatment}
      data-fit={density === 'spell' ? SPELL_LEVELS[0] : CARD_LEVELS[0]}
      data-name="full"
      data-stats="full"
      ref={fitRef}
    >
      <span className="gc-frame" aria-hidden="true" />
      {card.rarity === 'legendary' && density !== 'spell' && <span className="gc-crest" aria-hidden="true" />}
      <span className="gc-body">
        {density !== 'spell' && (
          <>
            <span className="gc-namebar">
              <span className="gc-name">
                {hasShort ? (
                  <>
                    <span className="gc-name-full">{title}</span>
                    <span className="gc-name-short">{card.shortName}</span>
                  </>
                ) : (
                  title
                )}
              </span>
            </span>
            <span className="gc-art">
              <CardArtwork cardId={artId ?? cardId} animated={animated ?? inspect} />
              {treatment !== 'base' && <span className="gc-treatment" aria-hidden="true" />}
              {!owned && (
                <span className="gc-veil" aria-hidden="true">
                  <Icon name="lock" size={inspect ? 18 : 13} />
                </span>
              )}
              {marks && copies > 1 && (
                <span className="gc-marks">
                  {copies > 1 && <span className="gc-mark copies">×{copies}</span>}
                </span>
              )}
              {(shielded || (unit && tempAtk !== 0)) && (
                <span className="gc-flags">
                  {shielded && (
                    <span className="gc-flag shield" title="Shield: survives the first time it would be destroyed">
                      Shield
                    </span>
                  )}
                  {unit && tempAtk !== 0 && (
                    <span className={`gc-flag gc-temp ${tempAtk > 0 ? 'up' : 'down'}`} title="Until the end of this round">
                      {tempAtk > 0 ? '+' : '−'}
                      {Math.abs(tempAtk)} this round
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="gc-statrow">
              <span className="gc-identity" aria-hidden="true">
                <Sigil faction={card.faction} size="sm" />
                <Gems rarity={card.rarity} dim={!owned} />
              </span>
              {!unit && (
                <span className="gc-stat gc-kind-stat">
                  <span className="gc-stat-label">{spellKind}</span>
                </span>
              )}
              {unit && hpContribution !== undefined && hpContribution > 0 && (
                <span className="gc-stat gc-hpc" aria-label={`HP Contribution +${hpContribution}`} title="HP Contribution: adds this to your Starting HP">
                  <span className="gc-stat-label">HP</span>
                  <strong>+{hpContribution}</strong>
                </span>
              )}
              {unit && (
                <span className={`gc-stat gc-atk ${shift}`} aria-label={`${current} ATK${shift ? `, printed ${printed}` : ''}`}>
                  <span className="gc-stat-label">ATK</span>
                  <strong>{current}</strong>
                  {shift && <s className="gc-atk-printed">{printed}</s>}
                </span>
              )}
            </span>
          </>
        )}
        {text}
      </span>
    </span>
  );
}
