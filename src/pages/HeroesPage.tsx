import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CardDefinition, Faction, Rarity } from '../game/types';
import { getCard } from '../game/cards';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { cardCopyView } from '../game/cards/cardCopy';
import { Icon } from '../components/Icon';
import { Sigil } from '../components/CardParts';
import { useCollection } from '../game/collection/useCollection';
import { track } from '../analytics/track';
import { GameCard } from '../components/card/GameCard';
import { CardViewer } from '../components/card/CardViewer';
import { emptyCopy, FACTION_LABEL, FACTION_ORDER, filterHeroes, isFiltered, scopeOf, SORT_LABEL, tally, type HeroFilters, type OwnedFilter, type SortMode } from './heroes/collection';
import '../styles/heroes.css';

// Cards screen: the collection gallery. Three columns of the game's one card face (GameCard, tile density: art, name,
// rarity frame, faction, ATK, HP Contribution and every effect's battle line), a single engraved counter that follows
// whatever you're filtering, and missing cards veiled but still legible so they read as things to chase rather than
// broken slots. Tapping a card opens the focused card detail (the same panel battle uses, as a sheet), and Card Inspect
// from there pages through the gallery with previous/next.
//
// Ownership comes from the real persisted collection (src/game/collection) - Campaign rewards add
// cards to it and this screen re-renders the moment that happens. Filtering / sorting / empty copy live
// in ./heroes/collection.ts and take the owned set as an argument.

// Every collectible card, Units and Spells alike: Spells are pulled from Boxes and owned as copies too.
const HERO_IDS: string[] = [...PLAYTEST_ROSTER];
const HEROES: CardDefinition[] = HERO_IDS.map(getCard);

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const SORTS: SortMode[] = ['rarity', 'power', 'name', 'faction'];

function HeroTile({ card, collection, onClick }: { card: CardDefinition; collection: ReturnType<typeof useCollection>; onClick: () => void }) {
  const copy = cardCopyView(card.id, collection);
  return (
    <button type="button" className={`hr-card hr-card-face r-${card.rarity} ${copy.owned ? '' : 'missing'}`} onClick={onClick} aria-label={`${card.name}, ${RARITY_LABEL[card.rarity]}, ${copy.owned ? 'owned' : 'not collected'}. Show details.`}>
      <GameCard cardId={card.id} density="tile" owned={copy.owned} copies={copy.copies} hpContribution={copy.hpContribution} />
    </button>
  );
}

export function HeroesPage({ onOpenDecks }: { onOpenDecks: () => void }) {
  const collection = useCollection();
  const owned = useMemo(() => new Set(HERO_IDS.filter((id) => (collection[id] ?? 0) > 0)), [collection]);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const [factionFilter, setFactionFilter] = useState<Faction | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('rarity');
  const [sortOpen, setSortOpen] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const closeInspect = useCallback(() => setInspectId(null), []);

  const filters: HeroFilters = { owned: ownedFilter, faction: factionFilter, rarity: rarityFilter, query };
  const list = useMemo(() => filterHeroes(HEROES, owned, { owned: ownedFilter, faction: factionFilter, rarity: rarityFilter, query }, sortMode), [owned, ownedFilter, factionFilter, rarityFilter, query, sortMode]);
  const scope = scopeOf(HEROES, filters);
  const t = tally(scope, owned);

  const scopeName = [rarityFilter === 'all' ? '' : RARITY_LABEL[rarityFilter], factionFilter === 'all' ? '' : FACTION_LABEL[factionFilter], 'Cards'].filter(Boolean).join(' ');
  const showMissing = ownedFilter === 'missing';
  const counter = showMissing ? `${t.missing}` : `${t.have} / ${t.total}`;
  const caption = query.trim() ? 'matching cards' : `${scopeName} ${showMissing ? 'still missing' : 'collected'}`;
  useEffect(() => {
    track('collection_progress_viewed', { discovered: t.have, available: t.total, completion: t.total ? t.have / t.total : 0 });
  // Count/filter changes are not separate collection visits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = t.total === 0 ? 0 : Math.round(((showMissing ? t.missing : t.have) / t.total) * 100);

  function clearFilters() {
    setOwnedFilter('all');
    setFactionFilter('all');
    setRarityFilter('all');
    setQuery('');
    setSearchOpen(false);
  }

  const idx = inspectId ? list.findIndex((c) => c.id === inspectId) : -1;
  const inspectCard = inspectId ? getCard(inspectId) : null;
  const go = (d: number) => {
    if (idx < 0) return;
    setInspectId(list[(idx + d + list.length) % list.length].id);
  };

  const empty = list.length === 0 ? emptyCopy(filters, HEROES, owned) : null;

  return (
    <div className="heroes-screen">
      <header className="hr-head">
        <h1 className="hr-title">Cards</h1>
        <div className="hr-tools">
          <button
            type="button"
            className={`hr-tool ${searchOpen || query ? 'on' : ''}`}
            onClick={() => {
              if (searchOpen) setQuery('');
              setSearchOpen(!searchOpen);
            }}
            aria-label={searchOpen ? 'Close search' : 'Search cards'}
            aria-expanded={searchOpen}
          >
            <Icon name={searchOpen ? 'close' : 'search'} size={18} />
          </button>
          <div className="hr-sort">
            <button type="button" className={`hr-tool wide ${sortOpen ? 'on' : ''}`} onClick={() => setSortOpen(!sortOpen)} aria-haspopup="listbox" aria-expanded={sortOpen}>
              <Icon name="sort" size={16} />
              {SORT_LABEL[sortMode]}
            </button>
            {sortOpen && (
              <>
                <button type="button" className="hr-sort-scrim" aria-label="Close sort menu" onClick={() => setSortOpen(false)} />
                <div className="hr-sort-menu" role="listbox" aria-label="Sort by">
                  {SORTS.map((s) => (
                    <button
                      type="button"
                      key={s}
                      role="option"
                      aria-selected={s === sortMode}
                      className={`hr-sort-opt ${s === sortMode ? 'on' : ''}`}
                      onClick={() => {
                        setSortMode(s);
                        setSortOpen(false);
                      }}
                    >
                      {SORT_LABEL[s]}
                      {s === sortMode && <Icon name="check" size={14} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="hr-search">
          <Icon name="search" size={16} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or effect" aria-label="Search cards" />
          {query && (
            <button type="button" className="hr-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      )}

      <div className="hr-ledger">
        <span className="hr-ledger-count">{counter}</span>
        <span className="hr-ledger-side">
          <span className="hr-ledger-caption">{caption}</span>
          <span className="hr-ledger-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        </span>
      </div>

      <div className="hr-crests" role="group" aria-label="Faction">
        {(['all', ...FACTION_ORDER] as (Faction | 'all')[]).map((f) => {
          const on = f === factionFilter;
          return (
            <button type="button" key={f} className={`hr-crest ${on ? 'on' : ''}`} onClick={() => setFactionFilter(f)} aria-pressed={on}>
              <span className="hr-crest-coin">{f === 'all' ? <Icon name="heroes" size={20} /> : <Sigil faction={f} size="lg" />}</span>
              <span className="hr-crest-label">{f === 'all' ? 'All' : FACTION_LABEL[f]}</span>
            </button>
          );
        })}
      </div>

      <div className="hr-seg" role="group" aria-label="Ownership">
        {(['all', 'owned', 'missing'] as OwnedFilter[]).map((o) => (
          <button type="button" key={o} className={`hr-seg-btn ${ownedFilter === o ? 'on' : ''}`} onClick={() => setOwnedFilter(o)} aria-pressed={ownedFilter === o}>
            <Icon name={o === 'all' ? 'cards' : o === 'owned' ? 'check' : 'lock'} size={14} />
            {o === 'all' ? 'All' : o === 'owned' ? 'Owned' : 'Missing'}
          </button>
        ))}
      </div>

      <div className="hr-rarities" role="group" aria-label="Rarity">
        <button type="button" className={`hr-rar ${rarityFilter === 'all' ? 'on' : ''}`} onClick={() => setRarityFilter('all')} aria-pressed={rarityFilter === 'all'}>
          <span className="hr-rar-any">Any</span>
        </button>
        {RARITIES.map((r) => (
          <button type="button" key={r} className={`hr-rar r-${r} ${rarityFilter === r ? 'on' : ''}`} onClick={() => setRarityFilter(rarityFilter === r ? 'all' : r)} aria-pressed={rarityFilter === r}>
            <span className="hr-rar-gem" aria-hidden="true" />
            <span className="hr-rar-name">{RARITY_LABEL[r]}</span>
          </button>
        ))}
      </div>

      {empty ? (
        <div className="hr-empty">
          <span className="hr-empty-frame" aria-hidden="true">
            <Icon name={empty.title === 'Collection complete' ? 'trophy' : 'search'} size={26} />
          </span>
          <span className="hr-empty-title">{empty.title}</span>
          <span className="hr-empty-sub">{empty.sub}</span>
          {isFiltered(filters) && (
            <span className="hr-empty-actions">
              {query.trim() && (
                <button type="button" className="hr-empty-btn" onClick={() => setQuery('')}>
                  Clear search
                </button>
              )}
              <button type="button" className="hr-empty-btn" onClick={clearFilters}>
                Clear filters
              </button>
            </span>
          )}
        </div>
      ) : (
        <div className="hr-grid">
          {list.map((card) => (
            <HeroTile key={card.id} card={card} collection={collection} onClick={() => setInspectId(card.id)} />
          ))}
        </div>
      )}

      {inspectCard && (
        <CardViewer
          cardId={inspectCard.id}
          context="collection"
          onClose={closeInspect}
          onPrev={list.length > 1 && idx >= 0 ? () => go(-1) : undefined}
          onNext={list.length > 1 && idx >= 0 ? () => go(1) : undefined}
          onOpenDecks={onOpenDecks}
        />
      )}
    </div>
  );
}
