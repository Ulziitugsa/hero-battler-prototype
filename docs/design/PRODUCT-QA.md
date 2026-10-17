# Moonwater final mobile product QA (Polish Pass 5)

October 17, 2026. A testing and bug-fixing pass over the whole game as one mobile product, after Polish Passes 1-4.
Nothing here changes combat, balance, reward amounts, Box odds, card acquisition, save format or routes.

## Environment, and what it does not cover

* Headless Chrome (desktop build of Chromium) driven over the DevTools protocol, with **touch emulation** and phone
  viewports: 390×844, 360×800 and 430×932, plus 844×390 for rotation. Safe-area insets were emulated (47px top, 34px
  bottom). A 130% text size was simulated by scaling every computed font size.
* Most journeys ran against the **production build** (`vite build` + `vite preview`); state set-up and keyboard checks
  used the development server.
* **Not tested on any real device.** iOS Safari, Android Chrome and the Android WebView (Capacitor) are unverified:
  emulation is not a substitute for them. See the real-device checklist below.
* Friendly Battle could not be played: this build has no online backend ("Online battles are not connected on this
  build yet"), and its room buttons are disabled.

## Journey verified (fresh save, production build, 390×844)

| Step | Result |
| --- | --- |
| First load | Loading screen, then the faction pick. No errors in the console. |
| Starter pick | Kingdom chosen; Home shows the starter deck, Paladin as champion, Campaign as the first call to action. |
| Tutorial | There is no guided tutorial: the battle's step hint ("Tap a card", "Tap a Unit slot", "Ready to fight") and the How to play sheet carry first-run guidance. |
| Campaign | Story node, then Broken Palisade won: +40 XP, +20 Gems, +30 Gold and Bone Soldier ×3 on screen and in the save; Undead Core unlocked and the Undead Starter 15/15 in Decks. |
| Daily Gift | +100 Gold (30 → 130). |
| Journey day 1 | Blood Demon granted once, from four rapid taps on Claim. |
| Box | One pull: 120 → 20 Gems, Pikeman added, Box 33 → 32. With 20 Gems: "You need 100 Gems", nothing charged. |
| Reload | Gold, Gems, 22/116 cards, Box 32/33 and the claimed gift all persisted. |
| Quick Battle | A loss: +5 XP on screen and saved (40 → 45); both battle missions 1 → 2 on screen and saved. |
| Ranked | A win: rating 0 → 24, the match in history, the two Ranked missions ready. Ranked grants rating, not XP. |
| Missions | Three claims, each tapped twice: Gold 130 → 160 and Gems 20 → 55, exactly the three rewards. |
| Box, long run | Three 10-pulls took a Box from 32 cards to 2 for exactly 3,000 Gems; a fourth was refused ("Not enough cards left") with nothing charged. |
| Daily reset | See "Daily reset" below. |

## Fixed in this pass

| Severity | Problem | Root cause | Fix |
| --- | --- | --- | --- |
| P1 (Pass 4, fixed before merging it) | A second finger on another hand card started a second drag: dropping the first placed whichever card was selected last (dragging Power Surge placed Royal Guard), and a second press on the dragged card stranded its copy. | Each hand card ran its own drag with no shared owner, and pointer up/cancel did not check which pointer it was. | One drag at a time across the hand; other pointers are ignored; capture loss and unmount end the drag cleanly. |
| P1 | In a Ranked or Campaign battle, "New match" restarted on a fresh seed and recorded nothing: a losing match re-rolled for free (no rating loss, no Energy, toward Division rewards) on one unconfirmed tap. The developer panel beside it could reveal the enemy's hand. | The developer tools row and panel (the mobile drawer and the desktop side panel at 900px and wider) were shown in every mode of a production build. | Shown in Quick Battle and in development builds only. |
| P1 (Android) | How to play was not a dialog: no focus, no Escape, and the Android back button (which closes the top `role="dialog"`) skipped it, so on Home it closed the app. | The sheet had no dialog role or focus handling. | A labelled modal dialog using the shared focus hook. |
| P2 | Claiming a mission or Journey reward with the keyboard left focus on the page: Escape no longer closed the sheet and Tab walked into the screen behind it (Inspect opened on top of Missions). | The claimed button is disabled or removed, focus drops to `<body>`, and the sheet only listened for keys inside itself. | Escape and Tab reach the topmost open sheet even when focus has fallen out of it. |
| P2 (found in code review) | The shared focus hook re-ran whenever its parent re-rendered with a new close handler (most callers pass an inline one), which sends focus back to the trigger and then to the sheet's first control. | The effect depended on the handler. | The handler is read through a ref; the effect runs once per sheet. |
| P2 | The first Campaign win read "Undead Core cards unlocked — the Undead Starter is ready in Decks" above a locked "Undead Starter · 2 / 15 cards collected". | Starter progress was measured from the card reward before the same clear unlocked the Core package. | The stale line is dropped for the deck the unlock completed. |
| P2 | Battle Log and Graveyard pills, Home's Shop gift and Collection links and the Event's Claim buttons took a 21-22px tall press. | Text-sized controls. | An invisible 8px touch margin, as the hand and deck-builder buttons already had. The battle's Exit X is deliberately left as it is. |
| P3 | Text on the screen beneath showed through Missions, Journey, Offers, How to play and the Campaign sheets. | The sheet surface was 97% opaque. | Sheets use an opaque surface. |
| P3 | Friendly Battle was the last screen in square panels and typewriter labels. | It predates the visual identity. | Rounded panels and fields, the UI face for labels, the gold primary button. Layout unchanged. |

## Measured

* **No horizontal scrolling** and no control off-screen on 17 screens at 390×844, 360×800 and 430×932.
* **Safe areas:** with 47px/34px insets, Home, sheets, Cards, the Campaign map and stage sheet and the battle all keep
  their controls clear of both (the battle header moves from 8px to 54px, the hand ends 34px above the bottom).
* **Long session (production):** six Quick Battles and five 10-pulls in a row. Sampled at Home after a forced
  garbage collection: DOM nodes about 1,030, JS listeners about 395 and JS heap about 17MB throughout, no reward
  flights left behind, no console errors.
* **First load (fresh save, cache disabled):** 9.6MB before the faction pick is fully drawn, 9.2MB of it four PNGs:
  `selene-idle-8.png` 2.8MB, `moonwater.png` 2.3MB, `infernal-atlas-v2.png` 2.1MB and `undead-atlas-v2.png` 2.0MB. The
  main script is 214KB. On a throttled "fast 3G" link (1.6 Mbps, 150ms) the faction pick is usable at about 6s, but its
  portraits are still blank at 45s.
* **Text contrast** (computed against the nearest solid background): all text passes on Home, Cards, Shop, Ranked and
  the battle; only the locked Infernal Starter label in Decks (3.7:1, intentionally dimmed) is below 4.5:1.
* **130% text:** no horizontal scrolling; some labels truncate, and card faces clip their name and ATK.
* **Rotation:** 844×390 mid-battle and back keeps the battle state; the next round plays normally.

## Daily reset

Checked live at 00:00 UTC on the production build, with the Shop left open from 23:41 and not reloaded: the Daily Gift turned from "Claimed · resets in 0h 18m" to "FREE · Ready" by itself, and Missions showed every daily mission back at 0 while weekly progress (9 battles) was kept. The Journey did not advance at midnight: its days count 24 hours from the first launch, not UTC days, so Day 2 opens at the time of day the player started (by design in `journey/store.ts`, but a different clock from the Gift and Missions).

## Outstanding, for the owner's review

P2:
* **First-load weight.** Single portraits come out of 2-3MB PNG sheets (above). Re-encoding (WebP, or palette PNG for
  the pixel art) or per-card crops would cut first load several-fold. This is an asset pipeline task, not attempted here.
* **Leaving a battle is one tap.** The Exit X (24px, top-left) and Android back leave immediately, without asking, in
  every mode; a Campaign battle's Energy is already spent. Leaving a Ranked battle records nothing, so a losing match can
  be abandoned without a rating loss. A confirmation, and whether leaving Ranked counts as a loss, are rule decisions.
* **The enemy HP bar is half covered** on phones by the Speed / New match / Help panel (the numbers stay readable).
* **Browser Back leaves the game** on the mobile web: the app keeps no history entries. The Android app's back button is
  handled.
* **No guided first battle.** Guidance is the hint chip and the How to play sheet.
* **Large system text** (Android WebView scales px fonts with the system setting) truncates card names and ATK on card
  faces in the 130% simulation. Needs checking on a device.

P3:
* The Campaign map's first stop sits at the left edge with its label cut ("ROAD HOME").
* Story speakers have no portrait art (a dark placeholder arch).
* The Lanterns screen has no entry point from Home (the prop is passed but unused).
* Landscape on the mobile web: the battle column is taller than the screen and the hand needs scrolling (the Android
  app is locked to portrait; there is no iOS project in the repository).
* On a slow connection the loading screen briefly shows a strip of the backdrop above it.
* Region select has no world backdrop; deck builder removal has no added feedback (Pass 4 note).
* Ranked battles grant rating and missions but no XP; worth confirming that is intended.
* The Journey counts days from the first launch (24 hours each) while the Daily Gift and Missions reset at 00:00 UTC.
* Battle rounds show one or two long frames (75-81ms) as a round starts in headless Chromium; the 10-pull ceremony peaks at 38ms. Indicative only: headless rendering is not a phone's.

## Real-device checklist

On an iPhone (Safari, notch) and a mid-range Android phone (Chrome, and the Capacitor app):

1. Fresh install: loading time on mobile data, faction portraits appearing, the faction pick.
2. Battle drag: drag a card to a lane, cancel by releasing outside, a second finger touching another card mid-drag,
   a drag interrupted by a notification or the system back gesture, tap to select, long-press to Inspect.
3. Scrolling: Home, Cards, the deck builder and the Campaign map scroll and pan; the hand never scrolls the page.
4. Safe areas: header below the notch / status bar, bottom nav and battle hand above the home indicator.
5. Sheets: Missions, Journey, How to play and Inspect open and close; Android back closes the top sheet first.
6. Keyboard: Cards search, deck name and deck search stay visible above the on-screen keyboard.
7. Large system text (Android display size / font size at maximum; iOS Larger Text): card faces, Home, battle.
8. Reduced motion (iOS Reduce Motion, Android Remove animations): Box ceremony, Inspect, sheets, battle.
9. A Box 10-pull with and without Skip; frame rate during the ceremony and a full battle at 1x.
10. Leave the app mid-battle and return; lock the phone during a Box ceremony; rotate the phone (web).
11. A daily reset with the app open (Daily Gift, Missions, Journey).
12. A long session (10+ battles): heat, battery and memory.
