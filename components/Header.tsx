import { Container, Group } from '@mantine/core'
import classes from '@/styles/Header.module.css'
import { pageConfig } from '@/uptime.config'
import { PageConfigLink } from '@/types/config'
import { useTranslation } from 'react-i18next'

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

  return (
    <header className={classes.header} style={style}>
      <Container size="md" className={classes.inner}>
        <div>
          <a href="https://openshopgraph.org" className="osg-brand">
            <OsgMark />
            OpenShopGraph
            <span className="osg-status-label">&nbsp;Status</span>
          </a>
        </div>

        <Group gap={5} visibleFrom="sm">
          {links?.map(linkToElement)}
        </Group>

        <Group gap={5} hiddenFrom="sm">
          {links?.filter((link) => link.highlight || link.link.startsWith('/')).map(linkToElement)}
        </Group>
      </Container>
    </header>
  )
}
