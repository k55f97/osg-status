import Head from 'next/head'

import { MaintenanceConfig, MonitorTarget } from '@/types/config'
import { maintenances, pageConfig } from '@/uptime.config'
import Header from '@/components/Header'
import { Box, Button, Center, Container, Group, Select } from '@mantine/core'
import Footer from '@/components/Footer'
import { useEffect, useState } from 'react'
import MaintenanceAlert from '@/components/MaintenanceAlert'
import NoIncidentsAlert from '@/components/NoIncidents'
import { useTranslation } from 'react-i18next'
import { CompactedMonitorStateWrapper, getFromStore } from '@/worker/src/store'
import { detectedIncidentsForMonth } from '@/util/incidents'

export const runtime = 'experimental-edge'

type IncidentEntry = Omit<MaintenanceConfig, 'monitors'> & { monitors: MonitorTarget[] }

function getSelectedMonth() {
  const hash = window.location.hash.replace('#', '')
  if (!hash) {
    const now = new Date()
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
  }
  return hash.split('-').splice(0, 2).join('-')
}

function filterMaintenancesByMonth(
  incidents: MaintenanceConfig[],
  monthStr: string,
  monitors: MonitorTarget[]
): IncidentEntry[] {
  return incidents
    .filter((incident) => {
      const d = new Date(incident.start)
      const incidentMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      return incidentMonth === monthStr
    })
    .map((e) => ({
      ...e,
      monitors: (e.monitors || []).map((e) => monitors.find((mon) => mon.id === e)!),
    }))
}

function getPrevNextMonth(monthStr: string) {
  const [year, month] = monthStr.split('-').map(Number)
  const date = new Date(year, month - 1)
  const prev = new Date(date)
  prev.setMonth(prev.getMonth() - 1)
  const next = new Date(date)
  next.setMonth(next.getMonth() + 1)
  return {
    prev: prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0'),
    next: next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0'),
  }
}

export default function IncidentsPage({
  compactedStateStr,
  monitors,
}: {
  compactedStateStr: string | null
  monitors: MonitorTarget[]
}) {
  const { t } = useTranslation('common')
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>('')
  const [selectedMonth, setSelectedMonth] = useState(getSelectedMonth())

  useEffect(() => {
    const onHashChange = () => setSelectedMonth(getSelectedMonth())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const state = new CompactedMonitorStateWrapper(compactedStateStr)
  // lastUpdate === 0 means the wrapper fell back to an empty state because the
  // store gave us nothing. That is "we don't know", not "nothing happened".
  const hasMonitorState = state.data.lastUpdate !== 0

  const recordedIncidents: IncidentEntry[] = detectedIncidentsForMonth(
    state,
    selectedMonth,
    monitors
  ).map((incident) => ({
    title: t('Outage of', { name: incident.monitor.name }),
    body: incident.reasons.join('\n'),
    start: incident.start,
    end: incident.end,
    color: 'red',
    monitors: [incident.monitor],
  }))

  const filteredIncidents = [
    ...recordedIncidents,
    ...filterMaintenancesByMonth(maintenances, selectedMonth, monitors),
  ].sort((a, b) => (new Date(a.start) > new Date(b.start) ? -1 : 1))

  const monitorFilteredIncidents = selectedMonitor
    ? filteredIncidents.filter((i) => i.monitors.find((e) => e?.id === selectedMonitor))
    : filteredIncidents

  const { prev, next } = getPrevNextMonth(selectedMonth)

  const monitorOptions = [
    { value: '', label: t('All') },
    ...monitors.map((monitor) => ({
      value: monitor.id,
      label: monitor.name,
    })),
  ]

  return (
    <>
      <Head>
        <title>{pageConfig.title}</title>
        <link rel="icon" href={pageConfig.favicon ?? '/favicon.png'} />
      </Head>

      <main>
        <Header
          style={{
            marginBottom: '40px',
          }}
        />
        <Center>
          <Container size="md" style={{ width: '100%' }}>
            <Group justify="end" mb="md">
              <Select
                placeholder={t('Select monitor')}
                data={monitorOptions}
                value={selectedMonitor}
                onChange={setSelectedMonitor}
                clearable
                style={{ maxWidth: 300, float: 'right' }}
              />
            </Group>
            <Box>
              {!hasMonitorState ? (
                <NoIncidentsAlert noData />
              ) : monitorFilteredIncidents.length === 0 ? (
                <NoIncidentsAlert />
              ) : (
                monitorFilteredIncidents.map((incident, i) => (
                  <MaintenanceAlert key={i} maintenance={incident} />
                ))
              )}
            </Box>
            <Group justify="space-between" mt="md">
              <Button variant="default" onClick={() => (window.location.hash = prev)}>
                {t('Backwards')}
              </Button>
              <Box style={{ alignSelf: 'center', fontWeight: 500, fontSize: 18 }}>
                {selectedMonth}
              </Box>
              <Button variant="default" onClick={() => (window.location.hash = next)}>
                {t('Forward')}
              </Button>
            </Group>
          </Container>
        </Center>
        <Footer />
      </main>
    </>
  )
}

export async function getServerSideProps() {
  const { workerConfig } = await import('@/uptime.config')
  // Read state as string from storage, to avoid hitting server-side cpu time limit.
  // Without this the page could only ever render hand-written maintenances and
  // reported "No incidents in this month" next to a 99.95% uptime figure that was
  // computed from the very outages it was hiding.
  const compactedStateStr = await getFromStore(process.env as any, 'state')

  // Only present these values to client
  const monitors: MonitorTarget[] = workerConfig.monitors.map((monitor) => ({
    id: monitor.id,
    name: monitor.name,
  })) as MonitorTarget[]
  return { props: { compactedStateStr, monitors } }
}
