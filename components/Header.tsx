import { Container, Group } from '@mantine/core'
import classes from '@/styles/Header.module.css'
import { pageConfig } from '@/uptime.config'
import { PageConfigLink } from '@/types/config'
import { useTranslation } from 'react-i18next'

// Target of the wordmark on the left. Nav links pointing here are duplicates.
//
// DERIVED from pageConfig, never written out a second time. It used to be its
// own literal ('https://openshopgraph.org') while uptime.config.ts held the
// same URL separately, and the two silently drifted apart the moment the site
// moved to openshopgraph.com: the dedup below compares by exact string, so a
// stale BRAND_LINK matches nothing and the "duplicate" nav link survives.
// Measured on the live page at 360px with the two out of sync — 18px of
// horizontal page overflow and a 66px header in the 56px slot, clipping
// "Incidents", i.e. exactly the layout break the comment further down was
// written to prevent. Neither `next build` nor `next lint` can see it.
// Deriving both the wordmark href and the comparison from the one highlighted
// config link makes that drift impossible rather than merely fixed once.
const BRAND_LINK =
  (pageConfig.links || []).find((l) => l.highlight)?.link.replace(/\/$/, '') ??
  'https://openshopgraph.com'

// OSG brand mark — same two-dot "connect" glyph as the wordmark on
// openshopgraph.org (BaseLayout.astro .top-brand .mark svg).
function OsgMark() {
  return (
    <span className="osg-mark">
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <circle cx="3" cy="9" r="1.7" fill="var(--mantine-color-body)" />
        <circle cx="9" cy="3" r="1.7" fill="var(--mantine-color-body)" />
        <path
          d="M4.2 7.8L7.8 4.2"
          stroke="var(--mantine-color-body)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export default function Header({ style }: { style?: React.CSSProperties }) {
  const { t } = useTranslation('common')
  const linkToElement = (link: PageConfigLink, i: number) => {
    return (
      <a
        key={i}
        href={link.link}
        target={link.link.startsWith('/') ? undefined : '_blank'}
        className={classes.link}
        data-active={link.highlight}
      >
        {link.label}
      </a>
    )
  }

  const links = [{ label: t('Incidents'), link: '/incidents' }, ...(pageConfig.links || [])]

  // On narrow viewports the row is: wordmark + nav. Measured at 360px, adding
  // the 150px "openshopgraph.com" link — which points exactly where the
  // wordmark already points — wrapped the nav onto a second line: 65px of
  // content inside a 56px header (clipping "Incidents") plus 11px of horizontal
  // page overflow. Dropping the duplicate is what makes it fit; see the
  // min-height in Header.module.css for the guard against the next long label.
  const compactLinks = links.filter(
    (link) =>
      link.link.replace(/\/$/, '') !== BRAND_LINK && (link.highlight || link.link.startsWith('/'))
  )

  return (
    <header className={classes.header} style={style}>
      <Container size="md" className={classes.inner}>
        <div>
          <a href={BRAND_LINK} className="osg-brand">
            <OsgMark />
            OpenShopGraph
            <span className="osg-status-label">&nbsp;Status</span>
          </a>
        </div>

        <Group gap={5} visibleFrom="sm">
          {links?.map(linkToElement)}
        </Group>

        <Group gap={5} hiddenFrom="sm">
          {compactLinks.map(linkToElement)}
        </Group>
      </Container>
    </header>
  )
}
