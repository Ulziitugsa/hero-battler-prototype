import { useMemo, useState } from 'react';
import type { CardDefinition, Faction, Rarity } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { DECK_SIZE, maxCopiesFor, validateDeck } from '../game/engine/deckRules';
import { STARTER_DECKS, STARTER_DECK_NAMES, type StarterFaction } from '../game/cards/starterDecks';
import { deleteSavedDeck, loadSavedDecks, makeDeckId, upsertSavedDeck, type SavedDeck } from '../game/engine/localDecks';
import { TopBar } from '../components/TopBar';
import { Icon } from '../components/Icon';

const FACTIONS: (Faction | 'all')[] = ['all', 'kingdom', 'undead', 'infernal'];
const TYPES: ('all' | 'hero' | 'spell')[] = ['all', 'hero', 'spell'];
const RARITIES: (Rarity | 'all')[] = ['all', 'common', 'rare', 'epic', 'legendary'];
const STARTER_FACTIONS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

function countCopies(cardIds: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of cardIds) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** Faction / Hero-Spell / rarity breakdown of the deck being edited, so "is this deck coherent" is visible at a glance. */
function DeckDistribution({ cards }: { cards: CardDefinition[] }) {
  if (cards.length === 0) return null;
  const byFaction = new Map<string, number>();
  const byRarity = new Map<Rarity, number>();
  let heroes = 0;
  let spells = 0;
  for (const c of cards) {
    byFaction.set(c.faction, (byFaction.get(c.faction) ?? 0) + 1);
    byRarity.set(c.rarity, (byRarity.get(c.rarity) ?? 0) + 1);
    if (c.type === 'hero') heroes += 1;
    else spells += 1;
  }
  return (
    <div className="deck-distribution">
      <div className="deck-distribution-bar">
        {[...byFaction.entries()].map(([f, count]) => (
          <div key={f} className={`deck-distribution-segment ${f}`} style={{ flexGrow: count }} title={`${f}: ${count}`} />
        ))}
      </div>
      <div className="deck-distribution-chips">
        <span className="stat-chip">
          <Icon name="hero" size={13} /> <strong>{heroes}</strong> Hero{heroes === 1 ? '' : 'es'}
        </span>
        <span className="stat-chip">
          <Icon name="spell" size={13} /> <strong>{spells}</strong> Spell{spells === 1 ? '' : 's'}
        </span>
        {RARITY_ORDER.filter((r) => byRarity.has(r)).map((r) => (
          <span key={r} className={`stat-chip rarity-chip rarity-${r}`}>
            <strong>{byRarity.get(r)}</strong> {r}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DeckBuilderPage() {
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadSavedDecks());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('New Deck');
  const [deckFaction, setDeckFaction] = useState<StarterFaction>('kingdom');
  const [cardIds, setCardIds] = useState<string[]>([]);

  const [faction, setFaction] = useState<Faction | 'all'>('all');
  const [type, setType] = useState<'all' | 'hero' | 'spell'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');

  const copies = useMemo(() => countCopies(cardIds), [cardIds]);
  const validation = validateDeck(cardIds);

  function loadStarter(f: StarterFaction) {
    setEditingId(null);
    setName(`${STARTER_DECK_NAMES[f]} (custom)`);
    setDeckFaction(f);
    setCardIds([...STARTER_DECKS[f]]);
  }

  function loadSaved(d: SavedDeck) {
    setEditingId(d.id);
    setName(d.name);
    setDeckFaction(d.faction);
    setCardIds([...d.cardIds]);
  }

  function newBlankDeck() {
    setEditingId(null);
    setName('New Deck');
    setDeckFaction('kingdom');
    setCardIds([]);
  }

  function addCard(cardId: string) {
    if (cardIds.length >= DECK_SIZE) return;
    const current = copies.get(cardId) ?? 0;
    if (current >= maxCopiesFor(cardId)) return;
    setCardIds((prev) => [...prev, cardId]);
  }

  function removeOneCopy(cardId: string) {
    setCardIds((prev) => {
      const idx = prev.lastIndexOf(cardId);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }

  function save() {
    const id = editingId ?? makeDeckId();
    const deck: SavedDeck = { id, name: name.trim() || 'Unnamed Deck', faction: deckFaction, cardIds };
    upsertSavedDeck(deck);
    setEditingId(id);
    setSavedDecks(loadSavedDecks());
  }

  function removeSaved(id: string) {
    deleteSavedDeck(id);
    setSavedDecks(loadSavedDecks());
    if (editingId === id) newBlankDeck();
  }

  const pool = PLAYTEST_ROSTER.map(getCard).filter(
    (c) => (faction === 'all' || c.faction === faction) && (type === 'all' || c.type === type) && (rarity === 'all' || c.rarity === rarity),
  );

  const deckRows = [...copies.entries()].map(([cardId, count]) => ({ card: getCard(cardId), count }));
  const deckCards = cardIds.map(getCard);

  return (
    <div className="screen-shell">
      <TopBar title="Decks" caption="Build and manage your 15-card decks" />

      <div className="deckbuilder-toolbar">
        <span className="label">Start from:</span>
        {STARTER_FACTIONS.map((f) => (
          <button type="button" key={f} onClick={() => loadStarter(f)}>
            {STARTER_DECK_NAMES[f]}
          </button>
        ))}
        <button type="button" onClick={newBlankDeck}>
          Blank
        </button>
        {savedDecks.length > 0 && (
          <select
            value={editingId ?? ''}
            onChange={(e) => {
              const d = savedDecks.find((x) => x.id === e.target.value);
              if (d) loadSaved(d);
            }}
          >
            <option value="" disabled>
              Load saved deck...
            </option>
            {savedDecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="deckbuilder-current">
        <input className="deck-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name" />
        <select value={deckFaction} onChange={(e) => setDeckFaction(e.target.value as StarterFaction)}>
          {STARTER_FACTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className={`deck-count ${validation.valid ? 'ok' : 'bad'}`}>
          <Icon name={validation.valid ? 'check' : 'warning'} size={14} />
          {cardIds.length} / {DECK_SIZE}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          <Icon name="check" size={14} /> Save
        </button>
        {editingId && (
          <button type="button" className="btn btn-destructive btn-sm" onClick={() => removeSaved(editingId)}>
            Delete
          </button>
        )}
      </div>

      <DeckDistribution cards={deckCards} />

      {!validation.valid && (
        <div className="menu-warning">
          <Icon name="warning" size={15} />
          <div>
            {validation.errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </div>
        </div>
      )}

      <div className="deckbuilder-current-list">
        {deckRows.length === 0 && (
          <div className="empty-state">
            <Icon name="deck" size={22} />
            <span>No cards yet - add some from the pool below.</span>
          </div>
        )}
        {deckRows.map(({ card, count }) => (
          <div key={card.id} className={`deck-row rarity-${card.rarity}`}>
            <span className={`deck-row-faction ${card.faction}`} />
            <span className="deck-row-name">{card.name}</span>
            <span className="deck-row-count">
              x{count} / {maxCopiesFor(card.id)}
            </span>
            <button type="button" className="btn btn-icon btn-sm" onClick={() => removeOneCopy(card.id)} aria-label={`Remove one ${card.name}`}>
              <Icon name="minus" size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="filters">
        <select value={faction} onChange={(e) => setFaction(e.target.value as Faction | 'all')}>
          {FACTIONS.map((f) => (
            <option key={f} value={f}>
              {f === 'all' ? 'All factions' : f}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as 'all' | 'hero' | 'spell')}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All types' : t}
            </option>
          ))}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r === 'all' ? 'All rarities' : r}
            </option>
          ))}
        </select>
      </div>

      <div className="collection-grid">
        {pool.map((card) => {
          const have = copies.get(card.id) ?? 0;
          const limit = maxCopiesFor(card.id);
          const disabled = have >= limit || cardIds.length >= DECK_SIZE;
          const artUrl = cardArtUrl(card.id);
          return (
            <button
              type="button"
              key={card.id}
              className={`collection-card rarity-${card.rarity} pickable ${disabled ? 'disabled' : ''}`}
              onClick={() => addCard(card.id)}
              disabled={disabled}
            >
              <div className={`art ${card.faction}`}>{artUrl && <img className="art-image" src={artUrl} alt="" draggable={false} />}</div>
              <div className={`rarity-tag rarity-${card.rarity}`}>{card.rarity}</div>
              <div className="type-tag">{card.type === 'hero' ? 'HERO' : card.spellKind === 'CONTINUOUS' ? 'CONT.' : 'SPELL'}</div>
              <div className="collection-card-body">
                <div className="name">
                  {card.name}
                  {card.power !== undefined && <span className="power-badge">{card.power}</span>}
                </div>
                <div className="meta">
                  {have}/{limit} in deck
                </div>
                <div className="text">{card.abilities[0]?.text ?? 'No ability.'}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
