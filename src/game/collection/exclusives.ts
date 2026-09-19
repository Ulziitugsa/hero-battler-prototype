// Cards that stay Campaign-only: Summon never offers them. One central list - the Summon pool and the
// acquisition-source data both read it, so exclusivity is never decided ad hoc in UI.

export const CAMPAIGN_EXCLUSIVE_CARDS: ReadonlySet<string> = new Set(['und-vharos', 'und-mira']);

export function isCampaignExclusive(cardId: string): boolean {
  return CAMPAIGN_EXCLUSIVE_CARDS.has(cardId);
}
