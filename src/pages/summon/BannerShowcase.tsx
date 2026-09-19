import { Gems, Sigil } from '../../components/CardParts';
import { SummonSeal } from '../../components/SummonSeal';
import { getCard } from '../../game/cards';
import { cardArtUrl } from '../../game/cards/art';
import type { SummonBanner } from '../../game/summon/banners';

const FACTION_LABEL = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' } as const;

function Art({ cardId, sigilSize }: { cardId: string; sigilSize: 'lg' | 'md' }) {
  const card = getCard(cardId);
  const url = cardArtUrl(cardId);
  return (
    <span className={`sb-art ${card.faction}`}>
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <>
          <Sigil faction={card.type !== 'hero' ? 'spell' : card.faction} size={sigilSize} />
          {sigilSize === 'lg' && <span className="sb-art-label">{card.name}</span>}
        </>
      )}
    </span>
  );
}

/**
 * One banner plate: its own scene (palette, architecture and motif per faction - the banner carries the
 * theme, the app does not recolour), the summon seal as the altar, one dominant featured card and its two
 * supporting chase cards. Purely presentational.
 */
export function BannerShowcase({ banner, active, onViewPool }: { banner: SummonBanner; active: boolean; onViewPool: () => void }) {
  const main = getCard(banner.featured.main);
  return (
    <article className={`sb sb-${banner.faction} ${active ? 'active' : ''}`} aria-label={banner.name} aria-hidden={!active}>
      <div className="sb-scene" aria-hidden="true">
        <span className="sb-sky" />
        <span className="sb-motif" />
        <span className="sb-hang sb-hang-a" />
        <span className="sb-hang sb-hang-b" />
        <span className="sb-haze" />
        <span className="sb-ground" />
        <span className="sb-embers">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} style={{ ['--i' as string]: i } as React.CSSProperties} />
          ))}
        </span>
      </div>

      <div className="sb-top">
        <span className="sb-tag">
          <Sigil faction={banner.faction} size="sm" />
          {FACTION_LABEL[banner.faction]}
        </span>
        <button type="button" className="sb-pool-btn" onClick={onViewPool} tabIndex={active ? 0 : -1}>
          View pool
        </button>
      </div>

      <div className="sb-altar">
        <span className="sb-seal">
          <SummonSeal faction={banner.faction} />
        </span>
        <span className={`sb-main r-${main.rarity}`}>
          <span className="sb-main-frame">
            <Art cardId={banner.featured.main} sigilSize="lg" />
          </span>
          <span className="sb-main-ribbon">Featured</span>
        </span>
        {banner.featured.secondary.map((id, i) => {
          const c = getCard(id);
          return (
            <span key={id} className={`sb-side sb-side-${i} r-${c.rarity}`}>
              <span className="sb-side-frame">
                <Art cardId={id} sigilSize="md" />
              </span>
              <span className="sb-side-name">{c.shortName}</span>
              <Gems rarity={c.rarity} />
            </span>
          );
        })}
      </div>

      <div className="sb-copy">
        <h2 className="sb-title">{banner.name}</h2>
        <p className="sb-line">{banner.description}</p>
        <p className="sb-builds">
          <strong>Builds</strong> {banner.builds}
        </p>
      </div>
    </article>
  );
}
