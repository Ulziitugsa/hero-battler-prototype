# Embervale production plan

## Latest approved visual direction

The user approved the Moonwater pixel-art character designs and requested coarser pixels with visible animation. See `design/PIXEL-PROTOTYPE.md`. A playable three-card art preview is accessible from Home. Earlier illustration directions below are historical experiments. The main game now uses Moonwater throughout Home, collection, decks, profile, campaign, story, practice selection, battle cards, and summoning. All 31 collectible heroes and 21 roster spells have artwork, plus the Hound Pup token. Three companion identities have eight-frame idle loops at 8fps. Portraits render at 160px following feedback that 96px obscured faces. The summon circle has been replaced by a lantern arrival. Asset records: design/MOONWATER-INTEGRATION.md, design/PIXEL-EXPANSION-PROMPTS.md, design/PIXEL-SPELL-PROMPTS.md.

## Product thesis

Three lanes, one decision at a time, heroes worth remembering. Preserve the deterministic BAM-inspired battle system. Build long-term interest through deck discovery, character attachment, fair competition, and authored encounters. More menus and more currencies are not content.

This document supersedes the old manager-to-developer handoff workflow for this pass. The existing game rules remain authoritative. The user's September 2026 request authorizes new story content and a broader visual pass beyond the old design-only scope.

## Implemented in this pass

- Three art-directed legendary portraits: Paladin, Vharos, Infernal Lord. New versions preserve earlier art files. Source prompts and provenance live in `design/ANCHOR-ART-PROMPTS.md`.
- Collectible card component with printed edging, rarity gems, integrated name and rules, and a power medallion. Used in summon stage reveals, card inspection, and story portraits.
- Ember Archive summon setting: layered arches, perspective floor, restrained motes, revised card motion, legible skip control, and responsive result layout. The existing resolved-before-animation economy is preserved.
- Optional original synthesized summon audio. Defaults off; enabled by a player gesture; disposed when leaving Summon.
- Seven character lore entries and collector inspection presentation.
- Home identity and entry to Lanterns of the Lost, a permanent three-battle story adventure with progression saved locally, replay support, and no energy charge. Its reward is story content; it does not advertise or grant additional cards or currency.
- Eight distinct legal campaign encounter decks. Vharos is reserved for the boss; patrol, spell, continuous-effect, and recursion encounters use different compositions.
- Regression coverage for encounter legality, engine/replay agreement, story order, replay idempotency, and storage failures.

## Narrative foundation

Embervale survived its longest winter by borrowing infernal fire. The royal contract used the forgotten as fuel: people erased from records, burial stones, and family memory. Vharos refused to surrender their names and became the king of the unremembered. The returning dead are guarding roads against collectors from the furnace.

The player is a watch captain who discovers that the kingdom's prosperity and the so-called undead invasion are the same story. Avel, the Paladin, defends people rather than a dynasty. Mira brings the missing home. The Infernal Lord is a creditor whose contract is valid even when its price is monstrous. Summoning is the archive remembering an oath, giving the card system a place in the fiction.

Chapter arc: Ashen Road (who are the dead guarding?) → Census House (who erased the names?) → Cinder Coast (who signed?) → Winter Court (what can replace the bargain?). Each chapter should introduce an enemy strategy and a character reversal, not just stronger numbers.

## Visual production rules

**Direction update after user review:** the user rejected the glossy knight studies and supplied an anime card reference. Future art must follow `design/CHARACTER-APPEAL.md`: expressive proportions, strong contours, and controlled cel shading. The woodcut proposal below records the initial experiment; it is no longer the target for full-roster production. Existing integrated legendary art is provisional.

Warm sunset environments stay. Character assets move toward matte gouache and woodcut: deliberate ink contours, distinct silhouettes, a narrow palette, and meaningful props. Each character needs an identifying shape and a contradiction. Reject interchangeable armored figures, ornate noise, uniformly glowing eyes, and excessive particle effects.

The three new anchors establish a direction, not a finished roster. Remaining illustrations are mixed legacy assets or explicit emblem fallbacks. Finish the full roster before calling the visual overhaul complete. Check each asset at 90px, 220px, and detail size; check faces, hands, silhouette, crop, faction readability, and color consistency. Art approval must consider the entire sheet, not one image at a time.

Cards: art first, name second, power always findable. One frame family; compact contexts omit rules. Next migrate collection and deck tiles to the shared component without losing their ownership/ascension controls. Keep battle chits independently optimized for legibility.

Motion grammar: gather → hesitate → release → settle. The legendary moment earns its duration through contrast. Keep ordinary pulls brief. Reduced motion must retain readable rarity and rewards without shake or flicker. Audio should add weight; the synthesized cues are a prototype score, not final sound production.

## Ordered delivery backlog and acceptance gates

1. **Complete the visual slice.** Finish all roster portraits and spell art; unify collection, deck, and summon cards; focus management and screen-reader audit; optimize and self-host assets/fonts. Gate: readable at 360×640 and 390×844, no obscured controls, reduced-motion pass, no missing assets, measured mobile frame times.
2. **Make the first hour compelling.** Tutorial encounters with constrained strategies, a second authored chapter, character unlock stories, and a permanent challenge archive. Gate: new players can explain placement, persistence, spells, and counterplay after ten minutes. Measure completion and voluntary replay, not merely session length.
3. **Production account foundation.** Server identity, save migration, authoritative economy and inventory, audit trail, recovery and backups. Gate: replaying requests cannot duplicate grants; two devices converge; failure injection cannot lose purchases or corrupt inventory.
4. **Friendly battles.** Invite rooms, equalized levels by default, deck validation, authoritative actions, reconnect and replay sharing. Gate: two real clients complete matches, reconnect, and cannot see unrevealed opponent cards. Only then label it multiplayer.
5. **PvP season.** Matchmaking, rating, seasonal cosmetics, abuse reports, disconnect rules, and balance telemetry. Gate: reproducible replays, stable skill matches, no paid statistical advantage in the competitive ruleset.
6. **Live operations.** Versioned event schedules, content validation, staging preview, rollback, support tools, and server-time eligibility. Prefer permanent event archives over disappearing story content. Gate: a content update can be rolled back without touching player inventory.
7. **Commercial release.** Payments and receipts, regional/platform requirements, customer support, spending controls, transparent odds and guarantees. Do not connect a checkout to the current client-only economy. Monetization should support a game players already enjoy; no fake scarcity, near-miss outcomes, or concealed rates.

## Server architecture to implement

The current application is React/Vite with localStorage. It has no real login, shared account, matchmaking, purchase validation, or trusted economy. This pass does not create those services or deploy anything.

Use the existing pure combat engine as a versioned server package. Start with one API service and one relational database, not microservices. Separate domains in code: identity, inventory, wallet ledger, summon transactions, campaign claims, matches, and content versions.

- `POST /summons`: authenticated account, banner version, pull count, and idempotency key. Within one database transaction: verify funds and banner eligibility, lock pity/wallet rows, draw with server cryptographic randomness, grant inventory, append ledger, persist the immutable outcome, and commit. Retried keys return the same outcome. The client only animates it.
- `POST /campaign/claims`: verify a server-recorded match outcome; unique account/node/reward-version key prevents double claims. Client-reported wins are not evidence.
- `POST /rooms` and `POST /rooms/:id/join`: short-lived invite code, deck snapshot, rules version, and presence. Ready state creates one match ID.
- Match channel: submit a round number and placements, validate against the server's hand, resolve only after both sides lock or timeout, send player-specific state and then the revealed event log. Never send the opponent's hidden hand to the client. Reconnect uses the last acknowledged sequence.
- Database: accounts, inventory quantities, wallet ledger, summon batches/pulls, pity counters, campaign claims, match participants/actions/events, content manifests. Unique constraints enforce idempotency; ledger entries are append-only.
- Local saves are untrusted. Import them only as an explicitly bounded migration grant, never as authoritative premium balances or ranked records.
- Operations: secrets only on the service, least-privilege database access, request limits, structured logs with tokens redacted, error reporting, daily backups and restore drills, CI build/test/lint plus database migration checks.

Hosting and identity providers are intentionally undecided. Choose against deployment region, budget, account recovery requirements, and multiplayer concurrency before provisioning paid resources. Existing `.env.local` was not read or exposed.

## Internal work briefs

**Design:** Inspect the actual rendered screen at phone size. Identify the primary action, dominant illustration, material palette, and motion beat. Propose one coherent composition. Implement with the existing icon family. Verify real long names, missing art, locked cards, and small heights.

**Engineering:** Trace the source of truth before modifying state. Keep presentation separate from resolution. Use stable IDs, validate external inputs, make grants idempotent, preserve saves, and test failure paths. Do not replace existing user work.

**Content:** Give each encounter a tactical purpose and each character a desire, cost, and memorable prop. Write dialogue a person could speak. Never promise a mechanic the actual deck does not exercise.

**QA:** Build and lint; run deterministic engine/replay and economy tests; exercise new routes and failure paths; inspect screens at target sizes; verify keyboard, reduced motion, audio off, missing assets, and persistence. Record what was not tested. A passing build is not visual approval or balance evidence.

## Remaining risks

Balance of the new decks needs human playtesting; automated legal/completion checks cannot establish fun or fairness. Expansion portraits and spell art are static; generated idle sheets still benefit from manual frame-registration cleanup. Story progress is local and can be edited or lost. The new illustrations are generated and require further art review before commercial release. Real-device performance, online security, multiplayer, payments, production audio, and store packaging remain unfinished.

