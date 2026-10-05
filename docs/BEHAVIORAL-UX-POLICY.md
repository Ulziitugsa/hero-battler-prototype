# Moonwater behavioral UX policy

This policy applies to the current local commercial prototype. It records the existing hierarchy and the boundaries for future presentation work; it does not add gameplay or purchase mechanics.

## Attention hierarchy audit

| Screen | Primary action | Secondary action | Current loudest treatment | Alignment |
| --- | --- | --- | --- | --- |
| Home | Continue the Campaign | Pull from a Box | Campaign action; Boxes is secondary | Aligned after the Home hierarchy pass. Missions/Journey only receive a restrained mark when a reward is claimable; Offers stays quiet. |
| Campaign / stage preview | Fight or claim the shown reward | Review objectives and formation | Fight / claim | Aligned. First-clear and repeat rewards are shown before entry; recommended Roster Power is contextual guidance, not a block. |
| Box (pulls) | Pull 1 or Pull 10 with Gems or a Pull Ticket | Inspect the Box's remaining contents | Pull inside the voluntarily opened Box | Aligned. The finite Box shows exactly what is left; there is no pity or guarantee copy. A Pull Ticket pays for one pull from the same Box (launch set, 2026-10-05; 1 pull = 1 card, no packs). |
| Heroes | Browse and inspect the collection | Filter or sort | Hero artwork and collection progress | Aligned. Owned state, copies, Stars, level, and Ascension are attached to the character detail. |
| Missions / Journey | Claim a ready reward | Review progress | A ready claim; otherwise progress rows | Aligned. No claim badge is shown when nothing is claimable; Journey remains reachable after completion. |
| Offers | Choose a test offer | Read contents and first-purchase bonus | Offer choice inside the voluntarily opened sheet | Aligned. Prices are config labels, all actions remain explicitly test-only, and the session opens with three choices. |
| Shop | Claim the daily Gold gift when available | Browse gated test offers or Gem exchanges | Gift only when unclaimed and below Gold cap | Aligned. Shop's marker follows the same claim and cap rules as the gift button. |
| Ranked | Start a local AI match or claim an earned milestone | Review rating and recent results | Claimable milestone only | Prototype. Rating is local and AI deck choice is based on average Hero Power; this is not PvP. |

The five bottom destinations are Home, Heroes, Shop, Decks, and Ranked. Profile and the developer
Combat V2 lab are reachable through Home/Profile; the lab does not change production combat or grant
game rewards. Attention markers aggregate ready Home rewards, ready Hero Ascension, the free Shop gift
when it can be received, and unclaimed Ranked milestones.

## Presentation rules

- Home has one dominant Campaign action. Packs is secondary; Missions, Journey, and Offers are quieter navigation.
- Reward-ready styling means the reward is actually claimable. No broad red-dot or permanent pulse system is used.
- The Box exposes its truthful remaining contents; no near-miss presentation or separate Ticket luck is introduced. The pack reveal only presents cards already granted.
- The Hero collection already shows an owned/total ledger that follows its filters. Hero identity and artwork remain ahead of level, Star, and economy details.
- Campaign previews show first-clear and repeat rewards before play. Hero upgrades preview the real Roster Power change.
- No automatic paid offer is currently presented. Offers are opened from Home navigation only. Therefore automatic commercial popups per session are currently zero; future automatic offers must be limited to one per session, must remain accessible from navigation after dismissal, and must never stack with one another.
- There are no genuine offer expiry timestamps in the current catalog. Do not show countdowns, crossed-out prices, savings, or comparative value claims until backed by real config data.
- After a purchase CTA, the explicit Cancel and Confirm (Test) choices are equally available. No confirm-shaming or automatic reopening is allowed.
- Offer presentation experiments may later vary ordering/emphasis through config, but there is no experimentation backend today.

## Measurement

The existing analytics abstraction now records `offer_opened`, `offer_dismissed`, and `offer_cta_clicked` with a navigation source and session offer-open count. Existing offer impression and simulated purchase events remain in place. There is no production analytics provider or live payment flow in this prototype.
