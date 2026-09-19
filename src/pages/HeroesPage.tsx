import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardDefinition, Faction, Rarity } from '../game/types';
import { TRIGGER_LABEL } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { listDeckOptions } from '../game/engine/deckOptions';
import { loadPreferences } from '../game/engine/preferences';
import { Icon } from '../components/Icon';
import { Gems, Sigil } from '../components/CardParts';
import { useCollection } from '../game/collection/useCollection';
import { acquisitionSummary, getCardAcquisitionSources } from '../game/collection/acquisition';
import { useAscension } from '../game/ascension/useAscension';
import { getAscensionRank } from '../game/ascension/store';
import { ascensionNumeral } from '../game/ascension/ascend';
import { ascensionAddedAbilities, effectiveAbilities } from '../game/ascension/effective';
import { AscensionPanel } from './heroes/AscensionPanel';
import { displayRole, emptyCopy, FACTION_LABEL, FACTION_ORDER, filterHeroes, isFiltered, scopeOf, SORT_LABEL, tally, type HeroFilters, type OwnedFilter, type SortMode } from './heroes/collection';
import '../styles/heroes.css';

// Heroes screen: the collection gallery. Where Decks is dense and tactical, this is the slow, visual
// side of the game - two roomy columns of art-first cards framed by rarity (never faction), a single
// engraved counter that follows whatever you're filtering, and missing cards veiled but still legible
// so they read as things to chase rather than broken slots. Tapping a card opens a proper inspection
// sheet with previous/next so you can page through the gallery.
//
// Ownership comes from the real persisted collection (src/game/collection) - Campaign rewards add
// cards to it and this screen re-renders the moment that happens. Filtering / sorting / empty copy live
// in ./heroes/collection.ts and take the owned set as an argument.

const HERO_IDS: string[] = PLAYTEST_ROSTER.filter((id) => getCard(id).type === 'hero');
const HEROES: CardDefinition[] = HERO_IDS.map(getCard);

/** Ability text often opens with its own trigger ("On Play: ..."); the sheet already headlines the trigger, so drop the repeat. */
function ruleText(text: string, trigger: string): string {
  const m = text.match(/^([^:]{1,24}):\s+(.+)$/s);
  return m && m[1].toLowerCase() === trigger.toLowerCase() ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : text;
}

/** One quiet line: where the card comes from. Parked / unobtainable cards say so plainly rather than promising a stage. */
function sourceLine(cardId: string, owned: boolean): string {
  const kinds = getCardAcquisitionSources(cardId).map((x) => x.kind);
  if (kinds.includes('starter') || kinds.includes('campaign') || kinds.includes('summon')) return `${owned ? 'Source' : 'Earn it'}: ${acquisitionSummary(cardId)}`;
  return kinds.includes('future') ? 'Arrives in a later region' : 'Not obtainable yet';
}

const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const SORTS: SortMode[] = ['rarity', 'power', 'name', 'faction'];

/** The deck to credit in a hero's "In your deck" footer: the active deck if it carries this hero, else the first deck (starters first) that does. */
function findDeckFor(cardId: string): string | null {
  const decks = listDeckOptions();
  const activeId = loadPreferences().selectedDeckId;
  const active = decks.find((d) => d.id === activeId);
  if (active?.cardIds.includes(cardId)) return active.label;
  return decks.find((d) => d.cardIds.includes(cardId))?.label ?? null;
}

/** Card art with the existing fallback: real art when the card has it, otherwise a faction-tinted field with a large sigil. Missing cards get a desaturating veil either way. */
function HeroArt({ card, owned, large }: { card: CardDefinition; owned: boolean; large?: boolean }) {
  const url = cardArtUrl(card.id);
  return (
    <span className={`hr-art ${card.faction} ${large ? 'large' : ''} ${owned ? '' : 'veiled'} ${url ? 'has-img' : 'fallback'}`}>
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <span className="hr-art-emblem" aria-hidden="true">
          <Sigil faction={card.faction} size="lg" />
        </span>
      )}
      {!owned && <span className="hr-art-veil" aria-hidden="true" />}
    </span>
  );
}

function HeroTile({ card, owned, count, rank, onClick }: { card: CardDefinition; owned: boolean; count: number; rank: number; onClick: () => void }) {
  return (
    <button type="button" className={`hr-card r-${card.rarity} ${owned ? '' : 'missing'}`} onClick={onClick} aria-label={`${card.name}, ${RARITY_LABEL[card.rarity]}, ${owned ? 'owned' : 'not collected'}`}>
      {card.rarity === 'legendary' && <span className="hr-crown" aria-hidden="true" />}
      <span className="hr-card-frame">
        <span className="hr-card-window">
          <HeroArt card={card} owned={owned} />
          <span className="hr-card-gems">
            <Gems rarity={card.rarity} dim={!owned} />
          </span>
          {!owned && (
            <span className="hr-lock" aria-hidden="true">
              <Icon name="lock" size={13} />
            </span>
          )}
          {count > 1 && <span className="hr-copies">×{count}</span>}
          {owned && rank > 0 && <span className="asc-mark" title="Ascended">{ascensionNumeral(rank)}</span>}
          <span className="hr-power">{card.power}</span>
        </span>
        <span className="hr-card-plate">
          <Sigil faction={card.faction} size="sm" />
          <span className="hr-card-name">{card.name}</span>
        </span>
      </span>
    </button>
  );
}

function HeroDetail({
  card,
  owned,
  count,
  onClose,
  onPrev,
  onNext,
  onOpenDecks,
}: {
  card: CardDefinition;
  owned: boolean;
  count: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenDecks: () => void;
}) {
  const deckLabel = findDeckFor(card.id);
  const ascension = useAscension();
  const rank = owned ? getAscensionRank(card.id, ascension) : 0;
  const abilities = effectiveAbilities(card.id, rank);
  const fromAscension = ascensionAddedAbilities(card.id, rank);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [card.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="overlay-backdrop hr-sheet-backdrop" onClick={onClose}>
      <div className={`hr-sheet r-${card.rarity} ${owned ? '' : 'missing'}`} role="dialog" aria-modal="true" aria-label={card.name} onClick={(e) => e.stopPropagation()}>
        <div className="hr-sheet-scroll" ref={bodyRef}>
          <div className="hr-sheet-stage">
            <div className="hr-sheet-frame">
              <span className="hr-sheet-window">
                <HeroArt card={card} owned={owned} large />
                <span className="hr-power big">{card.power}</span>
                {!owned && (
                  <span className="hr-lock big" aria-hidden="true">
                    <Icon name="lock" size={16} />
                  </span>
                )}
              </span>
            </div>
            {onPrev && (
              <button type="button" className="hr-sheet-nav prev" onClick={onPrev} aria-label="Previous hero">
                <Icon name="back" size={20} />
              </button>
            )}
            {onNext && (
              <button type="button" className="hr-sheet-nav next" onClick={onNext} aria-label="Next hero">
                <Icon name="back" size={20} />
              </button>
            )}
          </div>

          <div className="hr-sheet-body">
            <h2 className="hr-sheet-name">{card.name}</h2>

            <div className="hr-sheet-line">
              <span className={`hr-rarity-tag r-${card.rarity}`}>
                <Gems rarity={card.rarity} />
                {RARITY_LABEL[card.rarity]}
              </span>
              <span className={`hr-owned-seal ${owned ? 'owned' : ''}`}>
                <Icon name={owned ? 'check' : 'lock'} size={12} />
                {owned ? (count > 1 ? `Owned ×${count}` : 'In your collection') : 'Not yet collected'}
              </span>
            </div>

            <div className="hr-sheet-line faction">
              <Sigil faction={card.faction} size="md" />
              <span>
                {[`${FACTION_LABEL[card.faction]} Hero`, displayRole(card)].filter(Boolean).join(' · ')}
              </span>
            </div>

            <div className={`hr-source ${owned ? '' : 'missing'}`}>
              <Icon name={owned ? 'check' : 'lock'} size={13} />
              <span>{sourceLine(card.id, owned)}</span>
            </div>

            {card.tags.length > 0 && (
              <div className="hr-tags" aria-label="Traits">
                {card.tags.map((t) => (
                  <span key={t} className="hr-tag">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="hr-rules">
              {abilities.length === 0 && <p className="hr-rules-none">No ability — plain steel.</p>}
              {abilities.map((a, i) => (
                <div className="hr-rule" key={i}>
                  <span className="hr-rule-trigger">
                    {TRIGGER_LABEL[a.trigger]}
                    {fromAscension.has(a) && <span className="asc-rule-tag">Ascension</span>}
                  </span>
                  <span className="hr-rule-text">{ruleText(a.text, TRIGGER_LABEL[a.trigger])}</span>
                </div>
              ))}
            </div>

            {owned && <AscensionPanel card={card} />}

            {deckLabel && (
              <button type="button" className="hr-deck-link" onClick={onOpenDecks}>
                <span className="hr-deck-link-text">
                  <span>In your deck</span>
                  <strong>{deckLabel}</strong>
                </span>
                <span className="hr-deck-link-go">
                  <Icon name="decks" size={16} />
                  View decks
                </span>
              </button>
            )}
          </div>
        </div>

        <button type="button" className="hr-sheet-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}

export function HeroesPage({ onOpenDecks }: { onOpenDecks: () => void }) {
  const collection = useCollection();
  const ascensionState = useAscension();
  const owned = useMemo(() => new Set(HERO_IDS.filter((id) => (collection[id] ?? 0) > 0)), [collection]);
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const [factionFilter, setFactionFilter] = useState<Faction | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('rarity');
  const [sortOpen, setSortOpen] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const filters: HeroFilters = { owned: ownedFilter, faction: factionFilter, rarity: rarityFilter, query };
  const list = useMemo(() => filterHeroes(HEROES, owned, { owned: ownedFilter, faction: factionFilter, rarity: rarityFilter, query }, sortMode), [owned, ownedFilter, factionFilter, rarityFilter, query, sortMode]);
  const scope = scopeOf(HEROES, filters);
  const t = tally(scope, owned);

  const scopeName = [rarityFilter === 'all' ? '' : RARITY_LABEL[rarityFilter], factionFilter === 'all' ? '' : FACTION_LABEL[factionFilter], 'Heroes'].filter(Boolean).join(' ');
  const showMissing = ownedFilter === 'missing';
  const counter = showMissing ? `${t.missing}` : `${t.have} / ${t.total}`;
  const caption = query.trim() ? 'matching Heroes' : `${scopeName} ${showMissing ? 'still missing' : 'collected'}`;
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
        <h1 className="hr-title">Heroes</h1>
        <div className="hr-tools">
          <button
            type="button"
            className={`hr-tool ${searchOpen || query ? 'on' : ''}`}
            onClick={() => {
              if (searchOpen) setQuery('');
              setSearchOpen(!searchOpen);
            }}
            aria-label={searchOpen ? 'Close search' : 'Search Heroes'}
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
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or trait" aria-label="Search Heroes" />
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
            <HeroTile key={card.id} card={card} owned={owned.has(card.id)} count={collection[card.id] ?? 0} rank={getAscensionRank(card.id, ascensionState)} onClick={() => setInspectId(card.id)} />
          ))}
        </div>
      )}

      {inspectCard && (
        <HeroDetail
          card={inspectCard}
          owned={owned.has(inspectCard.id)}
          count={collection[inspectCard.id] ?? 0}
          onClose={() => setInspectId(null)}
          onPrev={list.length > 1 && idx >= 0 ? () => go(-1) : undefined}
          onNext={list.length > 1 && idx >= 0 ? () => go(1) : undefined}
          onOpenDecks={onOpenDecks}
        />
      )}
    </div>
  );
}
