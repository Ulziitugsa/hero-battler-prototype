# Vercel private playtest deployment

This release is prepared for two friends to play remotely. It is not a paid gacha service: collection and currency remain browser-local, and friendly duels have no rewards or ranking. Friendly Battle uses anonymous Supabase identities, validated base-strength decks, and server-resolved rounds.

## 1. Configure Supabase

Use your existing Supabase project or a separate playtest project. Enable anonymous sign-ins under Authentication. Apply these migrations in order with the Supabase CLI or SQL editor (apply only migrations not already run):

1. `supabase/migrations/0001_friendly_battle.sql`
2. `supabase/migrations/0002_grant_service_role.sql`
3. `supabase/migrations/0003_room_creation_claim_timeout.sql`
4. `supabase/migrations/0004_rematch_guard.sql`

The first migration publishes `friendly_rooms` and `friendly_match_pings` to Realtime. Do not publish `friendly_matches`: it contains hidden hands and deck order. Keep RLS and the migration's grants intact. The fourth migration prevents rematches during active games and serializes rematch votes.

## 2. Configure Vercel

Import this repository, select its root as the project directory, and use Node 24.x. `vercel.json` selects Vite, `npm run build`, and `dist`. The root `api/` directory provides the four server endpoints; do not deploy only the static `dist` folder.

Set the following environment variables on the Vercel project, for both Production and Preview if you want to test preview deployments:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | The public anon key for that same project |
| `SUPABASE_SERVICE_ROLE_KEY` | The same project's server-only service role key |

Never prefix the service role key with `VITE_`, put it in source control, or send it to another player. Redeploy after changing VITE variables because the browser values are embedded at build time. Check that Deployment Protection permits your friend to access the selected deployment; production and preview protection settings can differ.

Run `npm ci` and `npm run check` before deploying. No extra video generation or media credits are required.

References: [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite), [Node runtime](https://vercel.com/docs/functions/runtimes/node-js).

## 3. Two-player acceptance test

Use two devices or independent browser profiles, not two tabs sharing the same anonymous identity.

- Open Home → Friendly battle. Enter a name and choose a deck, then create a room.
- Copy the invite link and send it to your friend. They select their name/deck and join.
- Confirm both names appear; ready both players; confirm both see round 1 and their own hand.
- Submit different deployments and compare both boards and HP after at least three rounds.
- Refresh one browser before and after submitting an action. Submit again if needed: the client resumes the server's saved action instead of replacing it.
- Finish a match, request a rematch on both clients, and check that both enter a fresh round 1.
- Leave a room on one side and verify the other player sees the departure and can return home.
- Check a narrow phone screen, and confirm solo campaign/summoning still work.

Local `npm run dev` and `npm run preview` serve the UI only. Use `npx vercel dev` to exercise server functions locally, with the three values in an untracked `.env.local`.

## Validation and limitations

Verified locally: 517 tests across 39 files, clean lint, frontend/API type checks, and the production build. Production dependencies reported zero known vulnerabilities in npm audit. Browser checks passed for Home → Friendly Battle, room creation against the configured Supabase backend, room restoration after refresh, leaving the room, and a 390-pixel viewport without horizontal overflow. The Supabase migrations and a complete two-player game must still be checked on the target backend; local UI preview does not validate them. No live deployment is created by this preparation pass.

This is a private playtest release. There is no durable cross-device account, trusted inventory, paid checkout, ranked matchmaking, moderation, or automated room retention policy. A disconnected player can rejoin using the same browser session; closing a tab does not automatically forfeit. If a friend goes away permanently, leave the room and create another. Keep the link within your playtest group and monitor Supabase/Vercel usage before opening access more widely.
