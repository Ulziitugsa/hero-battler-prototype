import { useMemo, useRef, useState } from 'react';
import type { GameEvent, GameState } from '../game/types';
import { GamePage } from '../pages/GamePage';
import { GameCard } from '../components/card/GameCard';
import { CardInspect } from '../components/card/CardInspect';
import { getCard } from '../game/cards';
import { arrange } from './arrange';
import { ARCANE_TRIALS, type ArcaneTrial } from './trials';
import { trialOutcome } from './solver';
import { TrialLayer } from './TrialLayer';
import { TRIALS_PARAM } from './access';
import type { StorageGuard } from '../lab/storageGuard';
import '../lab/lab.css';
import './trials.css';

// Arcane Trials (Power Fantasy Phase 1, docs/design/POWER-FANTASY-P1.md, Part D): three experimental puzzles, one per
// prototype combination. Each one is the real battle screen on an arranged position: the player makes every decision,
// the production resolver decides, the production AI plays the opponent. Nothing is recorded or granted: progress lives
// in this page's React state only, and the storage guard refuses every save write while the trials are open.

type Screen = { kind: 'list' } | { kind: 'brief'; trial: ArcaneTrial } | { kind: 'battle'; trial: ArcaneTrial; key: number } | { kind: 'result'; trial: ArcaneTrial; result: TrialResult };

interface TrialResult {
  success: boolean;
  /** Why it ended, in one line. */
  reason: string;
  enemyHp: number;
}

const THEME_CARD: Record<ArcaneTrial['theme'], string> = { 'immortal-army': 'xp-mordrath', apocalypse: 'xp-ashen-hierophant', champion: 'xp-aurelian' };
const THEME_NAME: Record<ArcaneTrial['theme'], string> = { 'immortal-army': 'The Immortal Army', apocalypse: 'The Apocalypse', champion: 'The Unstoppable Champion' };

function exitTrials() {
  const url = new URL(window.location.href);
  url.searchParams.delete(TRIALS_PARAM);
  window.location.assign(url.toString());
}

function CardRow({ ids, onInspect }: { ids: readonly string[]; onInspect: (id: string) => void }) {
  return (
    <div className="lab-card-row">
      {ids.map((id, i) => (
        <button key={`${id}-${i}`} type="button" className="lab-card-tile" onClick={() => onInspect(id)} aria-label={`Inspect ${getCard(id).name}`}>
          <GameCard cardId={id} density="tile" />
        </button>
      ))}
    </div>
  );
}

function Hints({ trial, shown, onMore }: { trial: ArcaneTrial; shown: number; onMore: () => void }) {
  return (
    <section className="lab-block tr-hints">
      <h3>Hints</h3>
      {shown === 0 ? <p className="lab-note">No hints used. Try it first: failing costs nothing.</p> : (
        <ol>
          {trial.hints.slice(0, shown).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      )}
      {shown < trial.hints.length && (
        <button type="button" onClick={onMore}>
          {shown === 0 ? 'Show a hint' : 'Another hint'}
        </button>
      )}
    </section>
  );
}

function Solution({ trial }: { trial: ArcaneTrial }) {
  return (
    <section className="lab-block">
      <h3>The intended solution</h3>
      <ol className="tr-solution">
        {trial.solution.map((round, i) => (
          <li key={i}>
            <b>{trial.rounds > 1 ? `Round ${i + 1}: ` : ''}</b>
            {round.length === 0 ? 'nothing' : round.map((p) => `${getCard(p.cardId).name} (${p.lane})`).join(', ')}
          </li>
        ))}
      </ol>
      <ul>
        {trial.explanation.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

export function TrialsApp({ guard }: { guard: StorageGuard | null }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [inspect, setInspect] = useState<string | null>(null);
  // Session only: how each trial went on this page load, and how many hints were opened.
  const [solved, setSolved] = useState<Record<string, number>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [hints, setHints] = useState<Record<string, number>>({});
  const [hintToast, setHintToast] = useState<string | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const ended = useRef(false);

  const battleTrial = screen.kind === 'battle' ? screen.trial : null;
  const battleKey = screen.kind === 'battle' ? screen.key : 0;
  // A fresh arranged position for every attempt (a retry starts from exactly the same state).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => (battleTrial ? arrange(battleTrial.position) : null), [battleTrial, battleKey]);

  function start(trial: ArcaneTrial) {
    ended.current = false;
    setShowSolution(false);
    setHintToast(null);
    setAttempts((a) => ({ ...a, [trial.id]: (a[trial.id] ?? 0) + 1 }));
    setScreen({ kind: 'battle', trial, key: Date.now() });
  }

  function finish(trial: ArcaneTrial, result: TrialResult) {
    if (ended.current) return;
    ended.current = true;
    if (result.success) setSolved((s) => ({ ...s, [trial.id]: (s[trial.id] ?? 0) + 1 }));
    setScreen({ kind: 'result', trial, result });
  }

  function moreHint(trial: ArcaneTrial) {
    const n = Math.min(trial.hints.length, (hints[trial.id] ?? 0) + 1);
    setHints((h) => ({ ...h, [trial.id]: n }));
    return trial.hints[n - 1];
  }

  if (screen.kind === 'battle' && initial) {
    const { trial } = screen;
    return (
      <div className="lab-battle tr-battle">
        <GamePage
          key={screen.key}
          playerDeck={trial.position.player.deck ?? []}
          enemyDeck={trial.position.enemy.deck ?? []}
          playerDeckLabel="Arcane Trial"
          enemyDeckLabel={trial.title}
          combatModel="card"
          sandbox
          initialState={initial.state}
          initialEvents={initial.events}
          labLayer={(view) => <TrialLayer view={view} trial={trial} initial={initial.state} onHint={() => setHintToast(moreHint(trial))} />}
          onMatchEnd={(status: GameState['status'], stats) => {
            finish(trial, {
              success: status === 'PLAYER_WIN',
              reason: status === 'PLAYER_WIN' ? 'The enemy reached 0 HP.' : status === 'ENEMY_WIN' ? 'You reached 0 HP first.' : 'The battle ended in a draw.',
              enemyHp: stats.finalEnemyHp,
            });
          }}
          onRoundEnd={(state: GameState, _events: GameEvent[]) => {
            if (trialOutcome(state, trial.position.round, trial.rounds) !== 'failure') return;
            // Let the settled board show for a moment before the verdict.
            window.setTimeout(() => finish(trial, { success: false, reason: trial.rounds === 1 ? 'The round ended with the enemy still standing.' : `${trial.rounds} rounds passed with the enemy still standing.`, enemyHp: state.enemy.hp }), 900);
          }}
          onExit={() => {
            if (!ended.current) setScreen({ kind: 'brief', trial });
          }}
        />
        {hintToast && (
          <div className="tr-hint-toast" role="status">
            <span>{hintToast}</span>
            <button type="button" onClick={() => setHintToast(null)} aria-label="Close hint">
              ✕
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="lab-root tr-root">
      <div className="lab-page">
        <header className="lab-head">
          <div>
            <span className="lab-eyebrow">Experiment · Power Fantasy Phase 1</span>
            <h1>Arcane Trials</h1>
          </div>
          <button type="button" className="lab-exit" onClick={exitTrials}>
            Exit trials
          </button>
        </header>
        <p className="lab-safety">
          Practice only. Nothing here is saved, granted or recorded, and these cards exist only in the trials. <span data-testid="trials-guard">Save writes blocked: {guard?.blocked.length ?? 0}</span>
        </p>

        {screen.kind === 'list' && (
          <div className="lab-grid">
            {ARCANE_TRIALS.map((t, i) => (
              <button key={t.id} type="button" className="lab-archetype tr-trial" onClick={() => setScreen({ kind: 'brief', trial: t })}>
                <span className="lab-archetype-card">
                  <GameCard cardId={THEME_CARD[t.theme]} density="tile" />
                </span>
                <span className="lab-archetype-body">
                  <span className="lab-eyebrow">
                    Trial {i + 1} · {THEME_NAME[t.theme]}
                  </span>
                  <b>{t.title}</b>
                  <span>{t.objective}</span>
                  <span className={`tr-status${solved[t.id] ? ' solved' : ''}`}>{solved[t.id] ? 'Solved' : attempts[t.id] ? `${attempts[t.id]} attempt${attempts[t.id] > 1 ? 's' : ''}` : 'Not tried'}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {screen.kind === 'brief' && (
          <div className="lab-detail">
            <button type="button" className="lab-back" onClick={() => setScreen({ kind: 'list' })}>
              ← All trials
            </button>
            <header className="lab-detail-head">
              <span className="lab-eyebrow">{THEME_NAME[screen.trial.theme]} · {screen.trial.combination}</span>
              <h2>{screen.trial.title}</h2>
            </header>
            <section className="lab-block tr-objective-block">
              <h3>Objective</h3>
              <p>
                <b>{screen.trial.objective}</b>
              </p>
              <p className="lab-note">
                {screen.trial.rounds === 1 ? 'One round.' : `${screen.trial.rounds} rounds.`} You make every play; the real combat rules and the opponent decide the rest.
              </p>
            </section>
            <section className="lab-block">
              <h3>What you know</h3>
              <ul>
                {screen.trial.brief.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
            <section className="lab-block">
              <h3>Key cards</h3>
              <p className="lab-note">Tap a card to read it in full.</p>
              <CardRow ids={screen.trial.keyCards} onInspect={setInspect} />
            </section>
            {screen.trial.position.enemy.hand.length > 0 && (
              <section className="lab-block">
                <h3>The enemy’s hand</h3>
                <CardRow ids={screen.trial.position.enemy.hand} onInspect={setInspect} />
              </section>
            )}
            <Hints trial={screen.trial} shown={hints[screen.trial.id] ?? 0} onMore={() => moreHint(screen.trial)} />
            <div className="lab-actions">
              <button type="button" className="lab-primary" onClick={() => start(screen.trial)}>
                Start trial
              </button>
            </div>
          </div>
        )}

        {screen.kind === 'result' && (
          <div className={`lab-detail tr-result ${screen.result.success ? 'success' : 'failure'}`}>
            <header className="lab-detail-head">
              <span className="lab-eyebrow">{screen.trial.title}</span>
              <h2>{screen.result.success ? 'Trial complete' : 'Trial failed'}</h2>
              <p>
                {screen.result.reason}
                {!screen.result.success && screen.result.enemyHp > 0 ? ` The enemy has ${screen.result.enemyHp} HP left.` : ''}
              </p>
            </header>
            <div className="lab-actions">
              <button type="button" className="lab-primary" onClick={() => start(screen.trial)}>
                {screen.result.success ? 'Play it again' : 'Retry now'}
              </button>
              {(() => {
                const next = ARCANE_TRIALS[ARCANE_TRIALS.indexOf(screen.trial) + 1];
                return screen.result.success && next ? (
                  <button type="button" onClick={() => setScreen({ kind: 'brief', trial: next })}>
                    Next trial
                  </button>
                ) : null;
              })()}
              <button type="button" onClick={() => setScreen({ kind: 'list' })}>
                All trials
              </button>
            </div>
            {screen.result.success ? (
              <>
                <section className="lab-block">
                  <h3>Why it worked</h3>
                  <ul>
                    {screen.trial.explanation.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </section>
                <section className="lab-block">
                  <h3>How an opponent stops it</h3>
                  <p>{screen.trial.counter}</p>
                </section>
              </>
            ) : (
              <>
                <Hints trial={screen.trial} shown={hints[screen.trial.id] ?? 0} onMore={() => moreHint(screen.trial)} />
                {showSolution ? (
                  <Solution trial={screen.trial} />
                ) : (
                  <div className="lab-actions">
                    <button type="button" onClick={() => setShowSolution(true)}>
                      Show the solution
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {inspect && <CardInspect cardId={inspect} context="other" onClose={() => setInspect(null)} />}
    </div>
  );
}
