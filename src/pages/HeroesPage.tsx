import { useMemo, useState } from 'react';
import type { CardDefinition, Faction, Rarity } from '../game/types';
import { TRIGGER_LABEL } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { RARITY_GEMS } from '../components/cardVisuals';
import { listDeckOptions } from '../game/engine/deckOptions';
import { loadPreferences } from '../game/engine/preferences';
import { Icon } from '../components/Icon';

// Heroes screen (see docs/game "Heroes Screen v2.dc.html" import). Adds a collection-completion layer
// on top of card browsing: an ownership rail (All/Owned/Missing) beside the rarity gems, a struck
// ratio + fill bar scoped to whichever faction crest is active, and an "uncollected" seal treatment
// for cards not yet owned (dimmed frame metal, silhouetted art, still fully readable). Lives inside the
// shared AppShell, so - like Decks and Home - it's a flowing flex layout adapted from the design's
// fixed 390x844 canvas rather than a literal pixel reproduction.
//
// Ownership is not a real system in this codebase yet (no accounts, no unlock flow) - the design's own
// notes call it "sample data, not a system": one hardcoded playtest collection so the ownership UI has
// something to render. SAMPLE_OWNED below is that same sample, ported as-is. It gates nothing else in
// the app (deckbuilding still draws from the full roster) - purely cosmetic on this screen, exactly as
// specced.

const FACTION_ORDER: Faction[] = ['kingdom', 'undead', 'infernal'];
const FACTION_LABEL: Record<Faction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal', wildborn: 'Wildborn' };
const RANK: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
type OwnedFilter = 'all' | 'owned' | 'missing';
type SortMode = 'rarity' | 'power';

const HERO_IDS: string[] = PLAYTEST_ROSTER.filter((id) => getCard(id).type === 'hero');

/** One sample playtest account's collection - twelve of eighteen, gaps weighted to epic/legendary so the chase sorts to the top. Ported verbatim from the design; see file header. */
const SAMPLE_OWNED = new Set([
  'kng-common-knight',
  'kng-archer',
  'kng-royal-guard',
  'kng-light-priest',
  'kng-paladin',
  'und-bone-soldier',
  'und-cursed-warrior',
  'und-dark-priest',
  'und-mira',
  'inf-flame-imp',
  'inf-cultist',
  'inf-hellhound',
]);

function Sigil({ faction, size }: { faction: Faction; size: 'lg' | 'md' | 'sm' | 'xs' }) {
  return <span className={`heroes-sigil heroes-sigil-${size} ${faction}`} aria-hidden="true" />;
}

function Gems({ count, size = 7, dim }: { count: number; size?: number; dim?: boolean }) {
  return (
    <span className="heroes-gems">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`heroes-gem ${i < count ? (dim ? 'lit-dim' : 'lit') : ''}`} style={{ width: size, height: size }} />
      ))}
    </span>
  );
}

function factionTally(faction: Faction | 'all') {
  const pool = faction === 'all' ? HERO_IDS : HERO_IDS.filter((id) => getCard(id).faction === faction);
  const have = pool.filter((id) => SAMPLE_OWNED.has(id)).length;
  return { have, total: pool.length };
}

/** The deck to credit in a hero's "In your deck" footer: the active deck if it carries this hero, else the first deck (starters first) that does. Every starter includes its whole faction's roster, so this only comes up empty for a hero absent from every saved deck too. */
function findDeckFor(cardId: string): string | null {
  const decks = listDeckOptions();
  const activeId = loadPreferences().selectedDeckId;
  const active = decks.find((d) => d.id === activeId);
  if (active?.cardIds.includes(cardId)) return active.label;
  const any = decks.find((d) => d.cardIds.includes(cardId));
  return any?.label ?? null;
}

function HeroTile({ card, owned, onClick }: { card: CardDefinition; owned: boolean; onClick: () => void }) {
  const artUrl = cardArtUrl(card.id);
  const legendary = card.rarity === 'legendary';
  const epic = card.rarity === 'epic';
  return (
    <button type="button" className={`heroes-tile rarity-${card.rarity} ${owned ? '' : 'locked'}`} onClick={onClick}>
      {legendary && <span className="heroes-tile-aura" aria-hidden="true" />}
      {legendary && <span className="heroes-tile-crown" aria-hidden="true" />}
      <div className="heroes-tile-frame">
        <div className="heroes-tile-art">
          <div className={`heroes-tile-art-bg ${card.faction} ${owned ? '' : 'veiled'}`}>
            {artUrl ? (
              <img src={artUrl} alt="" draggable={false} />
            ) : (
              <>
                <span className="heroes-tile-art-glow" aria-hidden="true" />
                <span className="heroes-tile-art-silhouette" aria-hidden="true" />
                <Sigil faction={card.faction} size="sm" />
              </>
            )}
          </div>
          {!owned && (
            <div className="heroes-tile-seal">
              <span className="heroes-tile-seal-badge">
                <Icon name="lock" size={16} />
              </span>
              <span className="heroes-tile-seal-label">Uncollected</span>
            </div>
          )}
          <span className="heroes-tile-gems">
            <Gems count={RARITY_GEMS[card.rarity]} size={6} dim={!owned} />
          </span>
          <span className={`heroes-tile-rarity-word ${owned ? '' : 'dim'}`}>{card.rarity}</span>
          {legendary && (
            <>
              <span className="heroes-tile-bracket bl" aria-hidden="true" />
              <span className="heroes-tile-bracket br" aria-hidden="true" />
            </>
          )}
          {epic && (
            <>
              <span className="heroes-tile-corner tl" aria-hidden="true" />
              <span className="heroes-tile-corner tr" aria-hidden="true" />
            </>
          )}
        </div>
        <div className="heroes-tile-info">
          <div className={`heroes-tile-plate ${owned ? '' : 'locked'}`}>
            <span className={`heroes-tile-name ${owned ? '' : 'dim'}`}>{card.name}</span>
          </div>
          <div className={`heroes-tile-coin ${owned ? '' : 'locked'}`}>
            <span className={owned ? '' : 'dim'}>{card.power}</span>
          </div>
          <div className="heroes-tile-role">
            <Sigil faction={card.faction} size="xs" />
            <span>
              {FACTION_LABEL[card.faction]} · {card.role}
            </span>
          </div>
          <div className={`heroes-tile-cue ${owned ? '' : 'dim'}`}>{card.boardText ?? 'No ability'}</div>
        </div>
      </div>
    </button>
  );
}

function HeroDetail({ card, owned, onClose, onOpenDecks }: { card: CardDefinition; owned: boolean; onClose: () => void; onOpenDecks: () => void }) {
  const artUrl = cardArtUrl(card.id);
  const deckLabel = findDeckFor(card.id);
  return (
    <div className="overlay-backdrop heroes-detail-backdrop" onClick={onClose}>
      <div className="heroes-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <div className={`heroes-detail-art ${card.faction}`}>
          {artUrl && <img src={artUrl} alt="" draggable={false} />}
          {!artUrl && (
            <>
              <span className="heroes-tile-art-glow" aria-hidden="true" />
              <Sigil faction={card.faction} size="lg" />
            </>
          )}
          <button type="button" className="heroes-detail-back" onClick={onClose} aria-label="Close">
            <Icon name="back" size={17} />
          </button>
          <div className="heroes-detail-rarity">
            {!owned && (
              <span className="heroes-detail-uncollected">
                <Icon name="lock" size={10} />
                Uncollected
              </span>
            )}
            <span>{card.rarity}</span>
            <Gems count={RARITY_GEMS[card.rarity]} size={9} />
          </div>
        </div>

        <div className="heroes-detail-body">
          <div className="heroes-detail-nameplate">
            <span className="heroes-detail-name">{card.name}</span>
          </div>
          <div className="heroes-detail-coin">
            <span className="heroes-detail-coin-power">{card.power}</span>
            <span className="heroes-detail-coin-label">Power</span>
          </div>

          <div className="heroes-detail-meta">
            <Sigil faction={card.faction} size="sm" />
            <span className="heroes-detail-meta-role">
              {FACTION_LABEL[card.faction]} · {card.role}
            </span>
            {card.tags.length > 0 && (
              <>
                <span className="heroes-detail-meta-sep" />
                <span className="heroes-detail-meta-tags">{card.tags.join(', ')}</span>
              </>
            )}
          </div>
          <div className="heroes-detail-rule" />

          <div className="heroes-detail-abilities">
            {card.abilities.length === 0 && <div className="heroes-detail-no-ability">No ability - plain steel.</div>}
            {card.abilities.map((a, i) => (
              <div className="heroes-detail-ability" key={i}>
                <span className="heroes-detail-ability-trigger">{TRIGGER_LABEL[a.trigger]}</span>
                <span className="heroes-detail-ability-text">{a.text}</span>
              </div>
            ))}
          </div>

          {deckLabel && (
            <button type="button" className="heroes-detail-footer" onClick={onOpenDecks}>
              <div className="heroes-detail-footer-text">
                <span className="heroes-detail-footer-label">In your deck</span>
                <span className="heroes-detail-footer-deck">{deckLabel}</span>
              </div>
              <div className="heroes-detail-footer-link">
                <Icon name="cards" size={15} />
                <span>View deck</span>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HeroesPage({ onOpenDecks }: { onOpenDecks: () => void }) {
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const [factionFilter, setFactionFilter] = useState<Faction | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('rarity');
  const [inspectId, setInspectId] = useState<string | null>(null);

  const headerTally = factionTally(factionFilter);

  const filtered = useMemo(() => {
    let list = HERO_IDS.map(getCard).filter(
      (c) =>
        (factionFilter === 'all' || c.faction === factionFilter) &&
        (rarityFilter === 'all' || c.rarity === rarityFilter) &&
        (ownedFilter === 'all' || (ownedFilter === 'owned') === SAMPLE_OWNED.has(c.id)),
    );
    list = list.slice().sort(sortMode === 'power' ? (a, b) => (b.power ?? 0) - (a.power ?? 0) : (a, b) => RANK[a.rarity] - RANK[b.rarity]);
    return list;
  }, [factionFilter, rarityFilter, ownedFilter, sortMode]);

  function clearFilters() {
    setOwnedFilter('all');
    setFactionFilter('all');
    setRarityFilter('all');
  }

  const inspectCard = inspectId ? getCard(inspectId) : null;

  return (
    <div className="heroes-screen">
      <div className="heroes-header">
        <div className="heroes-header-left">
          <span className="heroes-title">Heroes</span>
          <div className="heroes-progress-col">
            <span className="heroes-count">
              {headerTally.have} / {headerTally.total}
            </span>
            <div className="heroes-progress-bar">
              <span className="heroes-progress-fill" style={{ width: `${Math.round((headerTally.have / headerTally.total) * 100)}%` }} />
            </div>
          </div>
        </div>
        <button type="button" className="heroes-sort-chip" onClick={() => setSortMode((m) => (m === 'rarity' ? 'power' : 'rarity'))}>
          <Icon name="sort" size={13} />
          <span>{sortMode === 'rarity' ? 'Rarity' : 'Power'}</span>
        </button>
      </div>

      <div className="heroes-crest-rail">
        {(['all', ...FACTION_ORDER] as (Faction | 'all')[]).map((f) => {
          const { have, total } = factionTally(f);
          const on = f === factionFilter;
          return (
            <button type="button" key={f} className="heroes-crest" onClick={() => setFactionFilter(f)}>
              <span className={`heroes-crest-chip ${on ? 'on' : ''}`}>{f === 'all' ? <span className="heroes-all-mark" /> : <Sigil faction={f} size="md" />}</span>
              <span className={`heroes-crest-label ${on ? 'on' : ''}`}>{f === 'all' ? 'All' : FACTION_LABEL[f]}</span>
              <span className={`heroes-crest-tally ${on ? 'on' : ''}`}>
                {have}/{total}
              </span>
            </button>
          );
        })}
      </div>

      <div className="heroes-filter-plate">
        <div className="heroes-owned-rail">
          {(['all', 'owned', 'missing'] as OwnedFilter[]).map((o) => (
            <button type="button" key={o} className={`heroes-owned-chip ${ownedFilter === o ? 'on' : ''}`} onClick={() => setOwnedFilter(o)}>
              <Icon name={o === 'all' ? 'cards' : o === 'owned' ? 'check' : 'lock'} size={11} />
              <span>{o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Missing'}</span>
            </button>
          ))}
        </div>
        <span className="heroes-filter-divider" />
        <div className="heroes-rarity-rail">
          {(['all', 'common', 'rare', 'epic', 'legendary'] as (Rarity | 'all')[]).map((r) => (
            <button type="button" key={r} className={`heroes-chip ${rarityFilter === r ? 'on' : ''}`} onClick={() => setRarityFilter(r)}>
              {r === 'all' ? 'Any' : <Gems count={RARITY_GEMS[r]} size={6} />}
            </button>
          ))}
        </div>
      </div>

      <div className="heroes-grid">
        {filtered.map((card) => (
          <HeroTile key={card.id} card={card} owned={SAMPLE_OWNED.has(card.id)} onClick={() => setInspectId(card.id)} />
        ))}
        {filtered.length === 0 && (
          <div className="heroes-empty">
            <span className="heroes-empty-frame" aria-hidden="true" />
            <span className="heroes-empty-title">No hero by that name</span>
            <span className="heroes-empty-sub">Nothing in the roster matches these filters.</span>
            <button type="button" className="heroes-empty-clear" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {inspectCard && <HeroDetail card={inspectCard} owned={SAMPLE_OWNED.has(inspectCard.id)} onClose={() => setInspectId(null)} onOpenDecks={onOpenDecks} />}
    </div>
  );
}
