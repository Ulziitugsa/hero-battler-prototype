# Friendly Battle — private playtest

Deployment: see [VERCEL-DEPLOYMENT.md](VERCEL-DEPLOYMENT.md). The Home screen now links to the themed lobby. Friendly duels enforce base strength without local mastery/ascension bonuses; the server validates both decks. Room polling backs up Realtime delivery. Apply migration 0004 in addition to the original three.

Two real players play against each other remotely, using the exact same deterministic battle engine as
Quick Battle/Campaign. No accounts, no matchmaking, no rewards - this is a private playtesting feature.

## Architecture

- **Supabase** (free tier): Postgres, anonymous auth, and a lightweight Realtime "ping" signal.
- **Vercel serverless functions** (`api/`, free Hobby tier): the authoritative round resolver. It imports
  `resolveRound`/`beginRound`/`validateDeployment`/`createMatch` directly from `src/game/engine` - the
  exact same code Quick Battle runs in the browser - so PvP resolution is byte-identical to single-player
  for the same inputs. No engine logic is duplicated anywhere.
- Resolution is **fully server-authoritative**, not host-authoritative: the server never trusts a client's
  claimed action set, side, or resulting state. It re-reads both stored actions from the database and
  re-validates them with `validateDeployment` itself before calling `resolveRound`.

Round trip:

```
Browser -> POST /api/submit-action -> stores the action, and if both sides have now submitted,
           resolves the round in the SAME request (no second network call for a client to miss)
        -> Supabase Realtime ping (a table with NO game state in it) tells the OTHER browser to
           GET /api/match-view for its own view
```

`/api/resolve-round` is a separate, idempotent recovery endpoint sharing the same internal resolver -
harmless to call speculatively, and the only thing that can catch a resolver that crashed mid-resolve.

## Hidden information

Two pure, unit-tested modules in `src/game/engine/` do all of this - never in the browser, always before a
payload leaves the server:

- `redact.ts` - hides the true opponent's hand contents and deck order (kept only as counts/lengths, which
  is all the UI ever shows anyway), and strips the card identity off the opponent's `DRAW`/`CARD_DRAWN`
  events (the one real leak found while designing this: those events name the exact card that was just
  drawn).
- `perspective.ts` - the engine is hard-wired around canonical `player` (the room's host) / `enemy` (the
  guest). A guest's browser is handed a state/event log with `.player`/`.enemy` swapped (and `COMBAT`'s
  `outcome`, and `MATCH_END`'s `winner`, flipped to match) so it always renders its own side as "me" -
  `GamePage` itself never knows or needs to know whether it's running for the host or the guest.

Nothing carrying hidden information is ever put on a Realtime channel - the only realtime signal is a ping
on a table that holds no game state at all. Clients pull their own oriented+redacted view over an
authenticated HTTPS call instead.

## Concurrency / correctness

- **No permanent "stuck at both actions submitted"**: storing an action and attempting resolution happen
  in one server request (`/api/submit-action`), not two - there's no second call for a client to fail to make.
- **No permanently stuck mid-resolve state**: a resolver claims a round with `status='RESOLVING'` +
  `resolution_started_at`; a claim older than 20 seconds is treated as crashed and can be reclaimed by a
  later call (including `/api/resolve-round`, called speculatively after a ping or a client-side timeout).
- **No double resolution**: the claim is one atomic `UPDATE ... WHERE ... RETURNING *` - Postgres's normal
  row locking means only one concurrent caller can win it.
- **No stale/duplicate actions**: `submit_round_action` stamps each action with the round it was submitted
  for and rejects a mismatch or a second submission for a side already set that round.

## Room flow

`friendly_rooms` (WAITING -> READY -> IN_PROGRESS -> COMPLETE/ABANDONED) holds the two players' deck
snapshots and ready flags. `friendly_matches` holds the live canonical `GameState` (never selectable by a
client directly - only via the oriented `host_view`/`guest_view` columns, returned through the API).
Creating a room generates a 6-character code from an alphabet with confusable characters removed
(`0/O`, `1/I/L`). Joining, readying up, requesting a rematch, and leaving all go through
`SECURITY DEFINER` Postgres RPCs that re-derive the caller's identity/side from `auth.uid()` - a client
never gets a raw table write grant.

## Reconnect

The browser persists `{ roomId, matchId, canonicalSide }` in `localStorage` on join/create. On load, if
present, it re-fetches the room (RLS-restricted to its two members) and, if a match is in progress, its
own current view - picking back up exactly where it left off. A player who merely closes the tab (without
explicitly leaving) does not end the match; the other side just keeps waiting.

## Local development

Two-browser test, entirely on your own machine:

1. `npm install`
2. Follow "Supabase project setup" below, and add the two `VITE_` values to `.env.local` (copy
   `.env.example`).
3. Run `npx vercel dev` instead of `npm run dev` - this is what actually serves the `api/` functions
   locally; a plain `vite` dev server does not. It also picks up `.env.local` for the client build. (The
   Vercel CLI is deliberately not a tracked project dependency - its own dependency tree has pulled in
   double-digit known vulnerabilities in the past; `npx` runs it without adding it to `package.json`.)
4. Open `http://localhost:3000/?friendly` in a normal window -> Create Room -> note the 6-character code.
5. Open `http://localhost:3000/?friendly&room=<code>` in an Incognito window (or a second browser) -> Join
   Room.
6. Both pick a deck, both Ready. Play a few rounds with different actions on each side - verify HP/board/
   round counter match on both screens, and that neither browser's network tab ever shows the other side's
   real hand card ids (only `__hidden__` placeholders and counts). Refresh one tab mid-match to see
   reconnect restore it.

`?friendly` is a temporary, deliberately undiscoverable entry point (same pattern as the existing
`?pixelPreview`) so this feature doesn't need to touch `HomePage.tsx` while it's under active visual
redesign. A one-line Home nav entry can be added later without touching anything in this doc.

**Starting over during testing**: reconnect (by design) drops a browser back into whatever room/match it
last touched, even after just closing the tab without explicitly leaving - useful for a genuine accidental
refresh, confusing when you actually want a clean slate for another test pass. Add `&reset` to the URL
(`http://localhost:3000/?friendly&reset`) to skip reconnect and forget the saved session for that browser.

## Supabase project setup

1. Create a free project at supabase.com.
2. SQL Editor -> run `supabase/migrations/0001_friendly_battle.sql` (or `supabase db push` with the CLI).
   This creates all 3 tables, RLS policies, and RPCs, and enables Realtime on `friendly_rooms` and
   `friendly_match_pings` (the two tables with no hidden information in them).
3. Authentication -> Providers -> enable **Anonymous Sign-Ins**.
4. Project Settings -> API -> copy the Project URL and the `anon` `public` key into `.env.local`:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
5. Project Settings -> API -> copy the **service_role** key. Add it to your Vercel project's Environment
   Variables as `SUPABASE_SERVICE_ROLE_KEY` (server-only scope) - never put it in `.env.local` or any file
   that gets committed or shipped to the browser.
6. Deploy (`vercel deploy` or push to the connected Git branch) so the `api/` functions pick up both
   environment variables.

## What's deliberately out of scope for v1

- No accounts - identity is a per-browser anonymous Supabase auth session. Refreshing keeps it; a
  different browser/device is a different player.
- No rewards: Friendly Battle grants 0 XP/gems/cards/Campaign progress, and isn't written to local match
  history - it's an isolated networking experiment.
- No anti-cheat beyond "the server recomputes everything and never trusts a client's claims." A
  determined attacker could still, e.g., spam room creation. Fine for private friend testing; not
  something to build out further without a real reason.

## Before this could support ranked/public PvP

- Real accounts (anonymous auth doesn't survive a device change).
- Rate limiting on the `api/` endpoints and RPCs.
- Re-auditing `redact.ts`/`perspective.ts` against every future card ability - a new event type or field
  could reintroduce a hidden-information leak the same way `DRAW`/`CARD_DRAWN` did.
- Replacing the timeout-based resolving-claim recovery with stricter server-side sequencing if concurrency
  ever needs to be adversarial-safe rather than crash-safe.
