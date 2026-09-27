# Reward feedback audit

## Existing support

- Summon has an event-based sound hook (`game/summon/sound.ts`) and an opt-in `ArchiveAudio` player. Rarity and reveal beats already differ in the pure summon timeline; reduced-motion timing is already supported.
- Native haptics are wrapped by `src/platform/haptics.ts`; web builds safely no-op. Level, Ascension,
  Star gain, Campaign victory/chapter completion, and Legendary reveal call the wrapper. Actual device
  feedback remains unverified.
- Hero Level and Ascension emit their existing progression and Roster Power analytics. Missions, Journey, Idle Gold, and Campaign also have source-specific claim events.

## Shared presentation language

`RewardFeedback` is the compact common treatment: small for currency claims, progression for Hero Level, and major for Ascension or a newly granted Hero. Ascension now holds briefly before applying the rank, then lights the progression panel and reveals the derived Star count, ability improvement, and Roster Power increase. The pause plus flourish stays around 1.3 seconds; the existing Legendary reveal remains the strongest rarity treatment. Reduced-motion disables the decorative movement.

Reward presentation does not depend on sound or vibration being enabled. Haptics remain optional and
are only invoked for the milestone events listed above; small currency claims currently have visual
feedback without a haptic.
