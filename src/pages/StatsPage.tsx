import { useMemo } from 'react';
import { loadRecentMatches } from '../game/engine/localMatchHistory';
import { summarizeCardRecords, summarizeDeckRecords } from '../game/engine/playtestReport';
import { Icon } from '../components/Icon';

/** Developer-only local balance tooling (README "Simple Balance Report"). Not statistically meaningful - just eyeballing trends from whatever's been played on this machine. */
export function StatsPage({ onBack }: { onBack: () => void }) {
  const matches = useMemo(() => loadRecentMatches(), []);
  const deckRecords = useMemo(() => summarizeDeckRecords(matches), [matches]);
  const cardRecords = useMemo(() => summarizeCardRecords(matches), [matches]);

  return (
    <div className="screen-shell dev-screen">
      <div className="screen-header">
        <button type="button" className="btn btn-icon" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h1>
          <Icon name="bug" size={16} /> Playtest Stats
        </h1>
        <span className="screen-sub">{matches.length} matches saved locally</span>
      </div>

      {matches.length === 0 && (
        <div className="empty-state panel">
          <Icon name="trophy" size={22} />
          <span>No matches played yet on this browser.</span>
        </div>
      )}

      {matches.length > 0 && (
        <>
          <h2>By deck</h2>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Deck</th>
                <th>Wins</th>
                <th>Games</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {deckRecords.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>{r.wins}</td>
                  <td>{r.games}</td>
                  <td>{r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>By card</h2>
          <table className="stats-table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Drawn</th>
                <th>Played</th>
                <th>Wins when played</th>
              </tr>
            </thead>
            <tbody>
              {cardRecords.map((r) => (
                <tr key={r.cardId}>
                  <td>{r.name}</td>
                  <td>{r.drawn}</td>
                  <td>{r.played}</td>
                  <td>{r.winsWhenPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
