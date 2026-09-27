# Moonwater Shop and personalization

## Shop

The five-slot navigation places Shop between Heroes and Decks. Shop reuses the existing offer definitions, eligibility rules, configured test prices, and simulated purchase store. Starter and Growth bundles appear after their existing progression gates; Gem packs appear after the first summon. Gold and Energy exchanges spend existing Gems. No real billing, discount claim, or countdown is implemented.

The daily free gift is 100 Gold and shares the existing Missions UTC day key. Its claimed state persists in local storage, resets at the same UTC daily boundary, and the Shop badge is only shown while unclaimed. At the Gold cap the gift is disabled so players cannot lose the reward.

## Backgrounds

Five pixel-art environments are included: Moonwater Village (existing default), Emerald Canopy, Sunstone Canyon, Violet Grove, and Coral Garden. The four new generated assets use a consistent 2D pixel-art treatment with deliberately different biomes and palettes. Files live in `public/art/backgrounds/`. The first two unlock after three and seven cleared Chapter 1 nodes; the last two are future cosmetic placeholders.

Selection is persisted at `moonwater:selected-background`, updates the shared WorldBackdrop immediately, and crossfades unless reduced motion is enabled. No gameplay stats depend on scenery.

Profile exposes a testing toggle in development and with `?debug=1`; it permits selection of locked
backgrounds for review. Normal unlock requirements remain unchanged, and the toggle is not available
to persist as an enabled setting in production builds.

## Hero and startup

Hero inspection fills the viewport while retaining the existing collection, upgrade, Ascension, ability, and deck-link content. Android Back follows the existing Escape-to-close dialog behavior.

Android's launch theme supplies a dark Moonwater splash mark. The in-app branded indeterminate loader only appears while a lazy route is loading; it does not add a minimum wait. Offer purchases remain test-only. Real store billing, cosmetics for sale, and the future background unlock conditions await a later product decision.
