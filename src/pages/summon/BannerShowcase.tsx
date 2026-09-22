import { CollectibleCard } from '../../components/CollectibleCard';
import type { SummonBanner } from '../../game/summon/banners';

/** Real banner data in the approved Moonwater composition. */
export function BannerShowcase({ banner, active, onViewPool }: { banner: SummonBanner; active: boolean; onViewPool: () => void }) {
  const cards = [banner.featured.secondary[0], banner.featured.main, banner.featured.secondary[1]].filter(Boolean);
  return <article className={`sb moon-banner sb-${banner.faction} ${active ? 'active' : ''}`} aria-label={banner.name} aria-hidden={!active}>
    <div className="moon-banner-heading"><span>{banner.faction} · The moonwell</span><button className="sb-pool-btn" onClick={onViewPool} tabIndex={active ? 0 : -1}>View pool & rates</button></div>
    <div className="moon-banner-body"><div className="moon-banner-copy"><h2>{banner.name}</h2><p>{banner.description}</p><small>{banner.builds}</small></div><div className="moon-banner-cards">{cards.map(id => <div key={id}><CollectibleCard cardId={id} /></div>)}</div></div>
  </article>;
}
