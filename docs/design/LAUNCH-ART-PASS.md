# Launch-set pixel art pass

## A. Assets added

22 original images generated with the built-in image_gen tool, one prompt per image. No third-party art was downloaded. Full prompts and original output filenames: [launch-art-prompts.json](launch-art-prompts.json).

- 13 card portraits in `public/art/pixel/launch/`: Marshal Aldric, Morwen, Cerberus, Duchess Nyx, Ignis, Saint Aveline, The Plague Mother, Kathra, The Grave Tyrant, Bone Dragon, Banshee, Brimstone Matriarch, Blightcaster.
- 9 product illustrations in `public/art/pixel/boxes/`.
- Cards are 320×320 PNGs on a 160×160 logical grid; Boxes are 480×320 PNGs on a 240×160 logical grid. Nearest-neighbor export preserves hard pixels.
- Runtime assets total 2,067,958 bytes (about 1.97 MiB); largest image 128,214 bytes.
- Existing art and animation sheets remain in place. No runtime generation dependency or build-tool changes.

[Portrait contact sheet](launch-art-qa/portraits.png) · [Box contact sheet](launch-art-qa/boxes.png)

## B. Cards covered

All 116 launch cards resolve to local artwork, including Core, Structure Deck and event cards. All three summon tokens also resolve to artwork.

| Coverage | Launch cards |
| --- | ---: |
| Existing artwork retained | 52 |
| New distinct portraits | 13 |
| Explicit shared placeholders | 51 |
| Missing / generic fallback | 0 |

All 13 launch Legendaries have distinct art identities. Dawnshield Paladin, Vharos, Infernal Lord and Archmage Vael retain their existing portraits; the other nine receive new portraits.

## C. Box art

| Box | Visual direction |
| --- | --- |
| Vanguard | Crimson banners, ivory shields, daylight and green hills |
| Arcane | Violet cosmic spell circles and luminous spellbook |
| Crusade | Golden oath blade, sunlit sanctuary and greenery |
| Bone Legion | Ochre tombs, ivory skeleton army and jade necromancy |
| Phantoms | Mint ghosts, amber lanterns and misty waterways |
| Wither | Moss, cursed growth, fungus and yellow-green decay |
| Hellpack | Hounds and ember pups charging through a red canyon |
| Hellfire | Volcanic crown, lava, ash and orange eruption |
| Bloodbound | Ruby blood rite, chalice and burgundy temple |

Each is wired to both its Shop tile and Box detail header. Headline cards continue to use their card portraits.

## D. Files changed

- `src/game/cards/launchArt.ts`: explicit portrait inventory and shared mappings.
- `src/game/cards/pixelArt.ts`: registers art using the existing renderer.
- `src/game/box/boxArt.ts`, `src/components/BoxArtwork.tsx`: typed local Box art map, lazy loading and flagship fallback on image failure.
- `src/components/CardArtwork.tsx`: associates load failure with its source so another card can render after a failed image.
- `src/pages/ShopPage.tsx`, `src/pages/shop/BoxDetail.tsx`, `src/styles/box.css`: product art integration.
- `src/game/cards/pixelArt.test.ts`: roster coverage, Legendary uniqueness, file validity, grid bounds and Box rendering.
- `src/game/shop/economyCleanup.test.ts`: normalizes Windows directory separators in the existing source scan. No economy code changed.
- 22 PNGs, this report, prompt manifest and QA images.

Card definitions, balance, economy, Box pools, prices, IDs and combat/resolver behavior are unchanged.

## E. Shared placeholders and fallback

51 launch cards deliberately share existing archetype illustrations. Two tokens also reuse suitable art. Every mapping is listed in [launchArt.ts](../../src/game/cards/launchArt.ts). These are temporary illustrations, not unique commissioned portraits; none uses a Legendary portrait as its source.

The generic faction-sigil fallback remains for image-load failures and off-roster experimental cards such as Wildborn. No launch card or Box relies on it under normal loading.

## F. Local verification

Verified in the in-app browser on 6 October 2026:

- Collection: 116 portrait canvases, zero fallback sigils, no broken image elements.
- All nine Shop Box images decoded successfully.
- Box detail: Bone Legion key art and headline portraits.
- Card detail: Morwen portrait in the existing card viewer.
- Structure Deck: Bone Dragon header and featured card art, with Barrow Knight's shared portrait.
- Single-pull reveal fixture and results: Morwen artwork resolves. This existing preview does not grant/save cards, so the account's unowned styling remains visible on the result; no currency was spent.
- Mobile Shop at 390×844: all nine tiles readable, no horizontal overflow.
- Browser console: no errors or warnings in the verification tab.

Screenshots: [mobile Shop](launch-art-qa/shop-mobile-viewport.jpg), [full Shop](launch-art-qa/shop.jpg), [Box detail](launch-art-qa/box-detail.jpg), [Collection](launch-art-qa/collection.jpg), [card detail](launch-art-qa/card-detail.jpg), [Structure Deck](launch-art-qa/structure-deck.jpg), [reveal results](launch-art-qa/reveal-result.jpg).

## G. Checks

- `npm run check`: passed — lint, 91 test files / 1,040 tests, TypeScript and production build.
- `git diff --check`: passed.
- Existing non-failing warnings: WorldBackdrop set-state-in-effect and Vite's >500 kB bundle warning.

## H–I. Review

PR requested against master; do not merge automatically. Ready for merge after visual review: yes, as the requested placeholder art pass. Unique illustrations for the 51 shared cards remain future art work.
