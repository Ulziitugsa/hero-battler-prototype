# Moonwater redesign verification

September 21, 2026 local development pass.

- Production build and lint pass. All 480 tests across 33 files pass, including coverage of every roster card's shipped artwork and atlas bounds.
- Desktop Home, full expanded collection, deck gallery, summoning banners, single featured reveal and ten-pull results visually inspected.
- Phone viewport 390 × 844 checked for Home, deck gallery, profile, campaign map, summon banners and single reveal. Fixed collapsed banner cards, reveal/card-title overlap, and result spacing.
- Practice selection updated with character portraits. A test battle placed a hero, resolved combat, and reached round two. Exited before match completion.
- Summon checks used developer previews that grant no cards and spend no currency.
- Reward selection, guarantees, acquisition rules, saves, and battle resolution remain in the existing engine. The visual code does not determine rewards.
- Character idle loops pause offscreen/in background tabs and respect reduced-motion settings. The arrival effects also have reduced-motion rules.

Remaining production work: only three companion identities currently have animated sprites. Additional portraits and spell scenes are static. Generated frame registration needs artist cleanup, large source PNG sheets need a delivery/asset-size pass before mobile release, and real-device performance and sound require separate verification. No online accounts, PvP backend, payments, or release deployment are claimed by this visual pass.

Skyfall follow-up: the rejected chest was replaced by a shared full-screen comet sequence. Desktop arrival, rarity trail and final Legendary reveal inspected using free developer previews. Build and lint pass after the change; the preceding asset/engine test run passed all 480 tests. Existing pacing, skip targets and rewards are unchanged. Physical-device motion and audio remain unverified.


Expanded skyfall: single durations are Common 3.3s, Rare 4.8s, Epic 6.8s, Legendary 8.6s (+0.5s featured). Shared ten-pull arrival also slowed; individual batch reveals remain concise. Gathering sparks, layered comet filaments, drifting dust and a pre-impact hold added. Live developer preview verified Skip during charging jumps directly to results.


Cinematic integration and meteor revision: local 1.78 MB video plays before the reward timeline; end/error/10-second watchdog releases the intro, Skip remains immediate. Full-opacity final film frame removes the doubled village/moon. Canvas meteors replace the rigid 5x2 formation with deterministic curved paths, staggered entry and varied depth, preserving pull identity. Live no-grant ten-pull completion and immediate single-pull Skip verified. Build and lint pass; current repository suite: 508 tests across 38 files. Vite reports a bundle-size warning. Real-device performance remains unverified.


Latest user direction restores shooting stars, excludes doorway. One original Moonwater film plays, followed by slanted right-to-left meteors with varied depth, onset, trajectory and wake length. Detached stardust removed. Exit motion continues along the flight vector instead of dropping toward card positions. One ivory wash bridges impact and reveal; reduced motion hides the wash. Exactly one light per pull retained. Build/lint and 509-test repository suite pass before the final trajectory assertion update; focused trajectory test rerun separately.

