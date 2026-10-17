import { useMemo, useRef, useState } from 'react';
import type { GameEvent, GameState } from '../game/types';
import { GamePage } from '../pages/GamePage';
import { GameCard } from '../components/card/GameCard';
import { CardInspect } from '../components/card/CardInspect';
import { getCard } from '../game/cards';
import { cardEffects } from '../game/cards/cardPresentation';
import { LAUNCH_DECKS, getLaunchDeck, launchDeckList, type LaunchDeck } from '../game/cards/launchDecks';
import { AI_SHARED_GAPS, LAB_ARCHETYPES, aiMeasuredLine, getArchetype, type LabArchetype } from './archetypes';
import { LAB_SCENARIOS, buildScenario, getScenario, type LabScenario } from './scenarios';
import { cardsWorthExploring } from './discovery';
import { labMoments, topMoments } from './moments';
import { LabMomentsLayer } from './LabMomentsLayer';
import type { StorageGuard } from './storageGuard';
import './lab.css';

// The Card Discovery Lab (docs/design/CARD-DISCOVERY-LAB.md): browse the nine optimised archetypes, borrow any reference
// deck for one battle against any other, or play an arranged combination. Battles are the real battle screen and the
// real resolver in sandbox mode. Nothing here reads or writes the player's decks, collection or progress, and the
// storage guard refuses every save write while the lab is open.

type Tab = 'archetypes' | 'combos' | 'match';

interface Battle {
  key: number;
  playerDeckId: string;
  enemyDeckId: string;
  scenario?: LabScenario;
  initial?: { state: GameState; events: GameEvent[] };
}

interface Result {
  battle: Battle;
  status: GameState['status'];
  events: GameEvent[];
}

const FACTION_LABEL = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' } as const;
const KIND_LABEL: Record<LaunchDeck['kind'], string> = { optimized: 'Optimised archetype decks', starter: 'Core starters', budget: 'Budget lists', 'structure-deck': 'Structure Decks' };
const KIND_ORDER: LaunchDeck['kind'][] = ['optimized', 'starter', 'budget', 'structure-deck'];

const deckName = (id: string) => getLaunchDeck(id).name;

function exitLab() {
  const url = new URL(window.location.href);
  url.searchParams.delete('lab');
  window.location.assign(url.toString());
}

function DeckSelect({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  return (
    <label className="lab-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {KIND_ORDER.map((kind) => (
          <optgroup key={kind} label={KIND_LABEL[kind]}>
            {LAUNCH_DECKS.filter((d) => d.kind === kind).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function CardRow({ ids, onInspect }: { ids: readonly string[]; onInspect: (id: string) => void }) {
  return (
    <div className="lab-card-row">
      {ids.map((id) => (
        <button key={id} type="button" className="lab-card-tile" onClick={() => onInspect(id)} aria-label={`Inspect ${getCard(id).name}`}>
          <GameCard cardId={id} density="tile" />
        </button>
      ))}
    </div>
  );
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="lab-block">
      <h3>{title}</h3>
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

function ArchetypeDetail({ a, onInspect, onFight, onBorrow, onScenario, onBack }: { a: LabArchetype; onInspect: (id: string) => void; onFight: () => void; onBorrow: () => void; onScenario: () => void; onBack: () => void }) {
  const list = launchDeckList(getLaunchDeck(a.deckId));
  const counts = new Map<string, number>();
  for (const id of list) counts.set(id, (counts.get(id) ?? 0) + 1);
  return (
    <div className="lab-detail">
      <button type="button" className="lab-back" onClick={onBack}>
        ← All archetypes
      </button>
      <header className="lab-detail-head">
        <span className="lab-eyebrow">{FACTION_LABEL[a.faction]} · {a.units} Units · {a.startingHp} Starting HP</span>
        <h2>{a.name}</h2>
        <p>{a.strategy}</p>
      </header>
      <div className="lab-actions">
        <button type="button" className="lab-primary" onClick={onFight}>
          Fight against {a.name}
        </button>
        <button type="button" onClick={onBorrow}>
          Borrow {a.name}
        </button>
        <button type="button" onClick={onScenario}>
          Combination test
        </button>
      </div>
      <section className="lab-block">
        <h3>Key cards</h3>
        <CardRow ids={a.keyCards} onInspect={onInspect} />
      </section>
      {a.combos.map((c) => (
        <section key={c.title} className="lab-block lab-combo">
          <h3>{c.title}</h3>
          <CardRow ids={c.cards} onInspect={onInspect} />
          <p>{c.how}</p>
          <p className="lab-limit">
            <b>Limit:</b> {c.limit}
          </p>
        </section>
      ))}
      <List title="Strengths" items={a.strengths} />
      <List title="Weaknesses" items={a.weaknesses} />
      <section className="lab-block">
        <h3>Likely counters</h3>
        <ul>
          {a.counters.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <CardRow ids={a.counterCards} onInspect={onInspect} />
      </section>
      <List title="Worth knowing" items={a.notes} />
      <section className="lab-block lab-ai">
        <h3>How the AI plays it</h3>
        <p>{aiMeasuredLine(a.deckId)}</p>
        <ul>
          {a.aiGaps.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="lab-limit">Borrow the deck to judge the cards yourself rather than the AI’s use of them.</p>
      </section>
      <section className="lab-block">
        <h3>Deck list (15)</h3>
        <ul className="lab-decklist">
          {[...counts].map(([id, n]) => (
            <li key={id}>
              <button type="button" onClick={() => onInspect(id)}>
                {n}× {getCard(id).name}
              </button>
              <span>{getCard(id).rarity}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ScenarioCard({ s, onInspect, onPlay }: { s: LabScenario; onInspect: (id: string) => void; onPlay: () => void }) {
  return (
    <section className="lab-block lab-scenario" id={`scenario-${s.id}`}>
      <span className="lab-eyebrow">{getArchetype(s.archetype).name} · arranged setup</span>
      <h3>{s.title}</h3>
      <CardRow ids={s.cards} onInspect={onInspect} />
      <p>{s.idea}</p>
      <p>
        <b>Arranged:</b> {s.arranged} The opponent holds no cards this round; both sides draw normally afterwards.
      </p>
      {s.borrowed && s.borrowed.length > 0 && <p className="lab-limit">Borrowed from the Box, not in the optimised list: {s.borrowed.map((id) => getCard(id).name).join(', ')}.</p>}
      <p>
        <b>Try:</b> {s.steps}
      </p>
      <p>
        <b>What the resolver does with that play:</b> {s.expected}
      </p>
      <button type="button" className="lab-primary" onClick={onPlay}>
        Play this setup
      </button>
    </section>
  );
}

function ResultView({ result, onInspect, onRematch, onBack }: { result: Result; onInspect: (id: string) => void; onRematch: () => void; onBack: () => void }) {
  const picks = useMemo(() => {
    // The opponent's cards: its deck list, plus anything a setup placed for it.
    const arranged = result.battle.scenario ? Object.values(result.battle.scenario.enemy.board).flatMap((u) => (u ? [u.cardId] : [])) : [];
    return cardsWorthExploring(result.events, 'enemy', [...launchDeckList(getLaunchDeck(result.battle.enemyDeckId)), ...arranged]);
  }, [result]);
  const moments = useMemo(() => topMoments(labMoments(result.events, result.battle.initial?.state), 6), [result.events, result.battle.initial]);
  const outcome = result.status === 'PLAYER_WIN' ? 'Victory' : result.status === 'ENEMY_WIN' ? 'Defeat' : 'Draw';
  const rounds = result.events.filter((e) => e.type === 'ROUND_END').length;
  return (
    <div className="lab-result">
      <header className="lab-detail-head">
        <span className="lab-eyebrow">
          {deckName(result.battle.playerDeckId)} vs {deckName(result.battle.enemyDeckId)}
          {result.battle.scenario ? ` · ${result.battle.scenario.title}` : ''}
        </span>
        <h2>{outcome}</h2>
        <p>{rounds} round{rounds === 1 ? '' : 's'} played. Nothing was saved or granted.</p>
      </header>
      <section className="lab-block">
        <h3>Cards worth exploring</h3>
        {picks.length === 0 && <p>The opponent’s cards won with printed ATK this time: none of their effects did much.</p>}
        {picks.map((p) => (
          <div key={p.cardId} className="lab-pick">
            <button type="button" className="lab-card-tile" onClick={() => onInspect(p.cardId)} aria-label={`Inspect ${p.name}`}>
              <GameCard cardId={p.cardId} density="tile" />
            </button>
            <div className="lab-pick-body">
              <b>{p.name}</b>
              <p className="lab-pick-did">In this battle: {p.summary}.</p>
              <p className="lab-pick-text">{cardEffects(p.cardId).map((e) => e.full).join(' ')}</p>
              <p className={p.obtainable ? 'lab-pick-source' : 'lab-pick-source unavailable'}>{p.obtainable ? `Normally from: ${p.source}` : p.source}</p>
              <button type="button" onClick={() => onInspect(p.cardId)}>
                Inspect
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="lab-block">
        <h3>Biggest moments</h3>
        {moments.length === 0 && <p>No effect stood out this battle.</p>}
        <ul className="lab-moment-list">
          {moments.map((m) => (
            <li key={m.key} className={`lab-moment-line lab-moment-${m.side}`}>
              <b>
                Round {m.round} · {m.side === 'player' ? 'Your' : 'Enemy'} {m.source}: {m.title}
              </b>
              <span>{m.detail}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="lab-actions">
        <button type="button" className="lab-primary" onClick={onRematch}>
          {result.battle.scenario ? 'Play the setup again' : 'Rematch'}
        </button>
        <button type="button" onClick={onBack}>
          Back to the lab
        </button>
      </div>
    </div>
  );
}

export function CardLabApp({ guard }: { guard: StorageGuard | null }) {
  const [tab, setTab] = useState<Tab>('archetypes');
  const [archetypeId, setArchetypeId] = useState<string | null>(null);
  const [playerDeckId, setPlayerDeckId] = useState('kingdom-starter');
  const [enemyDeckId, setEnemyDeckId] = useState('arcane');
  const [battle, setBattle] = useState<Battle | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const ended = useRef<Result | null>(null);
  const nextKey = useRef(1);

  function start(b: Omit<Battle, 'key'>) {
    ended.current = null;
    setResult(null);
    setBattle({ ...b, key: nextKey.current++ });
  }
  const startMatch = (player: string, enemy: string) => start({ playerDeckId: player, enemyDeckId: enemy });
  const startScenario = (s: LabScenario) => start({ playerDeckId: s.player.deck, enemyDeckId: s.enemy.deck, scenario: s, initial: buildScenario(s) });

  if (battle) {
    return (
      <div className="moon-game lab-battle">
        <span className="lab-battle-badge">Lab · nothing is saved</span>
        <GamePage
          key={battle.key}
          playerDeck={launchDeckList(getLaunchDeck(battle.playerDeckId))}
          enemyDeck={launchDeckList(getLaunchDeck(battle.enemyDeckId))}
          playerDeckLabel={deckName(battle.playerDeckId)}
          enemyDeckLabel={deckName(battle.enemyDeckId)}
          combatModel="card"
          sandbox
          initialState={battle.initial?.state}
          initialEvents={battle.initial?.events}
          labLayer={(view) => <LabMomentsLayer view={view} />}
          onMatchEnd={(status, _stats, events) => {
            ended.current = { battle, status, events };
          }}
          onExit={() => {
            setResult(ended.current);
            setBattle(null);
          }}
        />
      </div>
    );
  }

  const archetype = archetypeId ? getArchetype(archetypeId) : null;
  return (
    <div className="moon-game lab-root">
      <div className="lab-page">
        <header className="lab-head">
          <div>
            <span className="lab-eyebrow">Moonwater · test build</span>
            <h1>Card Discovery Lab</h1>
          </div>
          <button type="button" className="lab-exit" onClick={exitLab}>
            Exit lab
          </button>
        </header>
        <p className="lab-safety">
          An experiment on the real cards and the real resolver. Decks here are borrowed for one battle: nothing is saved, granted or counted toward progress.{' '}
          <span data-testid="lab-guard">{guard ? `Save writes blocked: ${guard.blocked.length}.` : ''}</span>
        </p>

        {result ? (
          <ResultView
            result={result}
            onInspect={setInspect}
            onRematch={() => (result.battle.scenario ? startScenario(getScenario(result.battle.scenario.id)) : startMatch(result.battle.playerDeckId, result.battle.enemyDeckId))}
            onBack={() => setResult(null)}
          />
        ) : (
          <>
            <nav className="lab-tabs" role="tablist">
              {(['archetypes', 'combos', 'match'] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  {t === 'archetypes' ? 'Archetypes' : t === 'combos' ? 'Combinations' : 'Battle'}
                </button>
              ))}
            </nav>

            {tab === 'archetypes' && !archetype && (
              <div className="lab-grid">
                {LAB_ARCHETYPES.map((a) => (
                  <button key={a.id} type="button" className="lab-archetype" onClick={() => setArchetypeId(a.id)}>
                    <span className="lab-archetype-card">
                      <GameCard cardId={a.legendary} density="tile" />
                    </span>
                    <span className="lab-archetype-body">
                      <span className="lab-eyebrow">{FACTION_LABEL[a.faction]}</span>
                      <b>{a.name}</b>
                      <span>{a.strategy}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {tab === 'archetypes' && archetype && (
              <ArchetypeDetail
                a={archetype}
                onInspect={setInspect}
                onBack={() => setArchetypeId(null)}
                onFight={() => startMatch(playerDeckId === archetype.deckId ? 'kingdom-starter' : playerDeckId, archetype.deckId)}
                onBorrow={() => {
                  setPlayerDeckId(archetype.deckId);
                  setTab('match');
                }}
                onScenario={() => {
                  setTab('combos');
                  window.setTimeout(() => document.getElementById(`scenario-${archetype.scenarioId}`)?.scrollIntoView({ block: 'start' }), 0);
                }}
              />
            )}

            {tab === 'combos' && (
              <div className="lab-scenarios">
                <p className="lab-note">
                  Each setup arranges the board and your hand so one combination is ready this round. The real resolver decides what happens, whatever you play, and the battle then continues as a normal match.
                </p>
                {LAB_SCENARIOS.map((s) => (
                  <ScenarioCard key={s.id} s={s} onInspect={setInspect} onPlay={() => startScenario(s)} />
                ))}
              </div>
            )}

            {tab === 'match' && (
              <div className="lab-match">
                <DeckSelect label="You play" value={playerDeckId} onChange={setPlayerDeckId} />
                <DeckSelect label="Against" value={enemyDeckId} onChange={setEnemyDeckId} />
                <p className="lab-note">Any reference deck, either side. The opponent is the production AI. A borrowed deck lasts one battle.</p>
                <button type="button" className="lab-primary" onClick={() => startMatch(playerDeckId, enemyDeckId)}>
                  Start battle
                </button>
                <section className="lab-block lab-ai">
                  <h3>About the AI opponent</h3>
                  <ul>
                    {AI_SHARED_GAPS.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </>
        )}
      </div>
      {inspect && <CardInspect cardId={inspect} context="other" onClose={() => setInspect(null)} />}
    </div>
  );
}
