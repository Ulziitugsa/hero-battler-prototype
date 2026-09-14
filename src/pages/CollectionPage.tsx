import { useState } from 'react';
import type { Faction, Rarity } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { PLAYTEST_ROSTER } from '../game/cards/roster';
import { TopBar } from '../components/TopBar';
import { CardDetail } from '../components/CardDetail';
import { Icon } from '../components/Icon';

const FACTIONS: (Faction | 'all')[] = ['all', 'kingdom', 'undead', 'infernal'];
const TYPES: ('all' | 'hero' | 'spell')[] = ['all', 'hero', 'spell'];
const RARITIES: (Rarity | 'all')[] = ['all', 'common', 'rare', 'epic', 'legendary'];

/** All 30-ish Card Set v0.1 cards are unlocked for playtesting - this is a browser, not the future gacha collection. */
export function CollectionPage() {
  const [faction, setFaction] = useState<Faction | 'all'>('all');
  const [type, setType] = useState<'all' | 'hero' | 'spell'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);

  const cards = PLAYTEST_ROSTER.map(getCard).filter(
    (c) =>
      (faction === 'all' || c.faction === faction) &&
      (type === 'all' || c.type === type) &&
      (rarity === 'all' || c.rarity === rarity) &&
      c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="screen-shell">
      <TopBar title="Heroes" caption={`${cards.length} of ${PLAYTEST_ROSTER.length} cards`} />

      <div className="search-row">
        <Icon name="search" size={16} />
        <input type="text" placeholder="Search cards..." value={query} onChange={(e) => setQuery(e.target.value)} />
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

      {cards.length === 0 ? (
        <div className="empty-state panel">
          <Icon name="search" size={22} />
          <span>No cards match those filters.</span>
        </div>
      ) : (
        <div className="collection-grid">
          {cards.map((card) => {
            const artUrl = cardArtUrl(card.id);
            return (
            <button type="button" key={card.id} className={`collection-card rarity-${card.rarity}`} onClick={() => setInspectCardId(card.id)}>
              <div className={`art ${card.faction}`}>{artUrl && <img className="art-image" src={artUrl} alt="" draggable={false} />}</div>
              <div className={`rarity-tag rarity-${card.rarity}`}>{card.rarity}</div>
              <div className="type-tag">{card.type === 'hero' ? 'HERO' : card.spellKind === 'CONTINUOUS' ? 'CONT.' : 'SPELL'}</div>
              <div className="collection-card-body">
                <div className="name">
                  {card.name}
                  {card.power !== undefined && <span className="power-badge">{card.power}</span>}
                </div>
                <div className="meta">
                  {card.faction} · {card.role}
                </div>
                <div className="text">{card.abilities[0]?.text ?? 'No ability.'}</div>
              </div>
            </button>
            );
          })}
        </div>
      )}

      {inspectCardId && <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />}
    </div>
  );
}
