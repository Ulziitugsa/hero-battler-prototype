# Moonwater visual polish

This pass keeps Moonwater's current portrait layout, pixel character art, progression data, and readiness rules. It gives the game UI a more readable frame around the pixel art.

## Type and color

- Display headings and hero names use the already loaded **Bree Serif** font, with Georgia as the offline fallback.
- Body copy, buttons, currency balances, and readable metadata use **Nunito**, with the system sans-serif stack as the fallback.
- Pixel rendering stays on character and environment art. Compact status labels may remain uppercase, but normal interface text uses the sans-serif role.
- The `--moon-*` tokens live in `src/styles/moonwaterPolish.css`: deep navy surfaces, teal-blue depth, ivory text, cool secondary text, and gold reserved for account prestige, rarity, rewards, and the primary Campaign action.

## Surface hierarchy

- Home gives the player identity and equipped Mastery a framed account signature, with Level progress and balances at the top.
- Campaign uses the existing Ashen Road scene art behind a larger active-deck Hero, then chapter/stage progress, live Roster Power and recommendation, the actual next reward, and one primary action.
- Quick Battle and Friendly Battle are quiet companion actions. Formation is a compact summary. Missions, Journey, Idle Gold, and Moonwell use a shared icon rail; only claimable rewards get the stronger frame and badge.
- Hero inspection leads with an enlarged pixel portrait, rarity-framed surface, ownership, level/Ascension/stars and Roster Power, followed by existing upgrade/Ascend controls and abilities.
- Profile repeats the account frame and progress styling. The bottom navigation uses rounded active treatment and readable mixed-case labels.

The Home state and navigation rules remain data driven. No claim state, scarcity, sale, progress, or player customization was added. The identity name remains the existing `Wanderer` placeholder, and its frame/title are visual presentation of the current Level and equipped Mastery rather than new editable profile systems.
