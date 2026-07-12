// Binary state colors (owner decision 2026-07-13): ONE healthy tone from the
// openshopgraph.org palette (--ok), one incident red — no yellow/orange
// gradations. Values are CSS custom properties defined in styles/osg-theme.css
// so they follow the light/dark scheme automatically.
function getColor(percent: number | string, darker: boolean): string {
  percent = Number(percent)
  if (Number.isNaN(percent)) {
    return 'var(--osg-nodata)'
  }
  // A day/period with any real downtime (>~7 min on a day) counts as an
  // incident; everything else renders in the single healthy tone.
  return percent >= 99.5 ? 'var(--osg-ok)' : 'var(--osg-down)'
}

export { getColor }
