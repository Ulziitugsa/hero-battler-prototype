# Moonwater visual identity

Polish Pass 3 (2026-10-17). Moonwater had two visual languages on screen at once. Home, Shop, Cards and Profile used
the Moonwater night panels: rounded, lit from above, Bree Serif titles, Nunito text. Ranked, Quick Battle setup, the
Campaign map and its sheets, Missions, Journey, the bottom navigation and How to play still used an earlier pixel-era
layer: flat squares, Consolas labels, Georgia body text and brown-wood sheets. `src/styles/identity.css` moves the
second group onto the first.

The pass is presentation only. It changes no combat, balance, economy, Box odds, monetisation, save data or routes,
and no flow's markup depends on it. It also keeps the voice and material rules in
[MOONWATER-VISUAL-POLISH.md](MOONWATER-VISUAL-POLISH.md).

## Material

One recipe, defined as tokens on `.moon-game`:

| Token | Use |
| --- | --- |
| `--mw-surface` / `--mw-surface-raised` / `--mw-surface-sunk` | A panel, a panel that leads its screen, and a well inside a panel |
| `--mw-hairline` | Every quiet edge (cool, low alpha) |
| `--mw-rim` / `--mw-rim-soft` | The lit gold top edge of a leading panel; the soft gold of a rule or a medallion ring |
| `--mw-light` + `--mw-cast` | Light from above: a bright top inset, a dark lower inset and a soft cast shadow |
| `--mw-gold-face` + `--mw-gold-ledge` | The primary action, the one place gold is a fill (Home's Continue Campaign is the model) |
| `--mw-radius` / `--mw-radius-sm` | 20px for panels and sheets, 14px for plates and buttons, pills for claim buttons and tabs |

Rules:

* **Gold means "this matters".** It goes on the primary action, on rewards and on rank. It also marks the top rim of
  the panel that leads a screen: the Campaign card, the Ranked crest and the active sheet. Everything else uses the
  cool hairline.
* **Voices.** Bree Serif is for names, titles and big numerals. Nunito is for everything that is read. Card faces
  keep their own Cinzel titles. The layer contains no Consolas or Georgia, and a test checks this.
* **Titled groups.** A Bree Serif heading is followed by a gold rule that fades out (Ranked's "Recent trials", Quick
  Battle's "Who are you facing?").
* **Pixel art stays pixel art.** Portraits and scenes keep `image-rendering: pixelated`. The UI around them is smooth.

Where a screen was built on the pixel tokens (`--px-font-display`, `--px-font-label`, `--px-panel-2`,
`--px-line-dim`), the layer re-points them inside that screen, not globally. This applies to the Campaign stage sheet,
the story beat, Cards and Decks. Their plates and labels change, and their layout and the card faces do not.

## Atmosphere

`WorldBackdrop` gains three layers over the chosen Home background:

* **Halo:** moonlight pooling from the top right, with darkness gathering at the bottom edge.
* **Mist:** two slow banks over the water line, on 46s and 63s cycles. They move by `transform` only, so they never
  repaint.
* **Vignette:** keeps the edges dark so panels read in front of the scene.

Each destination tints the moonlight slightly, picked with `:has()` from the screen on show:

* Shop: lantern-warm.
* Ranked: ember.
* Cards: arcane violet.
* Decks: teal.

Nothing is stored or announced. A browser without `:has()` shows the default light.

Cost rules:

* The layers are gradients only.
* There is no blur anywhere in the layer, since a blurred backdrop re-filters every frame.
* The mist stops under reduced motion, and while a battle covers the screen.

## Screens

* **Home:**
  * Quick Battle and Friendly Battle sit side by side again. The grid had two columns for three children, so Friendly
    Battle wrapped and left half the row empty.
  * The Campaign card carries the lit rim as the one primary destination.
  * Small labels use Nunito.
* **Ranked:** crest, rival, rewards and history are panels. Battle for rating is the shared gold action. "Recent
  trials" now says there are none yet, instead of being left out.
* **Quick Battle setup:**
  * The rival choices are lit cards and the deck sits in a panel.
  * Fight is the shared gold action, and disabled reads as disabled.
* **Campaign:**
  * The map header, the stage plaques and the Energy lantern (a lit case filling with lamplight) use the shared style.
  * Cleared and veiled ground meet in a 60px fade instead of a hard seam.
  * The stage, reward, result and story sheets move from brown wood to the night panel.
  * The stage sheet shows the portrait its encounter names (`foeCardId`). It was documented as the stage portrait but
    rendered as an empty frame.
  * Story speakers have no portrait art yet, so their frame reads as a moonlit silhouette rather than an empty slab.
* **Missions, Journey, Offers:** rounded rows, pill tabs, gold claim pills, and the ready state from Home's reward
  rail.
* **Cards, Decks, Profile:** the pixel pass's square plates take the shared radius, and Consolas labels become Nunito.
* **Bottom navigation:** a lit gold seam along the top of the bar, and Nunito labels.
* **How to play (tutorial):** a Moonwater sheet replaces the parchment. Pip, the ember familiar from the launch art,
  sits beside the title (shown still under reduced motion). The three steps hang off one thread with numbered
  medallions.
* **First run:** each starter faction is lit by its own colour (Kingdom blue, Undead teal, Infernal ember) and glows
  when chosen.
* **Empty and waiting states:** the Cards "No cards found" frame and buttons, Ranked's empty history, and the Decks and
  Offers empty notes now share the panel style. Screen changes fade in over 220ms. The fade is opacity only, so a sheet
  that opens at once is never displaced, and it is off under reduced motion.

## Not changed

* The battle board and the battle result card (Pass 2).
* The Box opening ceremony (`revealRitual.css`, `archiveRitual.css`).
* Card faces.
* The boot screen (Pass 1). It paints before any stylesheet, so it stays inline and loads no art.
