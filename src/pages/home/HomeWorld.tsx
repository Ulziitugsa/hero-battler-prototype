/** The pixel-art Home environment: the same Moonwater scene used by the pixel-art concept page
 * (src/pages/PixelPreviewPage.tsx), reused here as Home's world layer per the pixel-art migration -
 * world and atmosphere only, drawn as a plain CSS background so a missing file just falls back to the
 * plain night gradient in .hh. Every piece of UI is drawn above it; a shade layer on top keeps
 * identity/plates readable. */
export function HomeWorld() {
  return (
    <>
      <div className="hh-world" aria-hidden="true" />
      <div className="hh-shade" aria-hidden="true" />
    </>
  );
}
