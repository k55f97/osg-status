import { MonitorState, MonitorTarget } from '@/types/config'
import { getColor } from '@/util/color'
import { Box, Tooltip, Modal } from '@mantine/core'
import { useResizeObserver } from '@mantine/hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
const moment = require('moment')
require('moment-precise-range-plugin')

export default function DetailBar({
  monitor,
  state,
}: {
  monitor: MonitorTarget
  state: MonitorState
}) {
  const { t } = useTranslation('common')
  const [barRef, barRect] = useResizeObserver()
  const [modalOpened, setModalOpened] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modelContent, setModelContent] = useState(<div />)

  const overlapLen = (x1: number, x2: number, y1: number, y2: number) => {
    return Math.max(0, Math.min(x2, y2) - Math.max(x1, y1))
  }

  const uptimePercentBars = []

  const currentTime = Math.round(Date.now() / 1000)
  const montiorStartTime = state.incident[monitor.id][0].start[0]

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Owner direction 2026-07-13 (status.claude.com reference, HTML
  // inspected): fixed 30-day window with a legend row ("30 days ago —
  // uptime% — Today") is clearer than any variable-length scheme.
  let windowMonitorTime = 0
  let windowDownTime = 0
  for (let i = 29; i >= 0; i--) {
    const dayStart = Math.round(todayStart.getTime() / 1000) - i * 86400
    const dayEnd = dayStart + 86400

    const dayMonitorTime = overlapLen(dayStart, dayEnd, montiorStartTime, currentTime)
    let dayDownTime = 0

    let incidentReasons: string[] = []

    for (let incident of state.incident[monitor.id]) {
      const incidentStart = incident.start[0]
      const incidentEnd = incident.end ?? currentTime

      const overlap = overlapLen(dayStart, dayEnd, incidentStart, incidentEnd)
      dayDownTime += overlap

      // Incident history for the day
      if (overlap > 0) {
        for (let i = 0; i < incident.error.length; i++) {
          let partStart = incident.start[i]
          let partEnd =
            i === incident.error.length - 1 ? incident.end ?? currentTime : incident.start[i + 1]
          partStart = Math.max(partStart, dayStart)
          partEnd = Math.min(partEnd, dayEnd)

          if (overlapLen(dayStart, dayEnd, partStart, partEnd) > 0) {
            const startStr = new Date(partStart * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            const endStr = new Date(partEnd * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            incidentReasons.push(`[${startStr}-${endStr}] ${incident.error[i]}`)
          }
        }
      }
    }

    windowMonitorTime += Math.max(0, dayMonitorTime)
    windowDownTime += Math.max(0, dayDownTime)
    const dayPercent = (((dayMonitorTime - dayDownTime) / dayMonitorTime) * 100).toPrecision(4)

    uptimePercentBars.push(
      <Tooltip
        multiline
        key={i}
        events={{ hover: true, focus: false, touch: true }}
        label={
          Number.isNaN(Number(dayPercent)) ? (
            t('No Data')
          ) : (
            <>
              <div>
                {t('percent at date', {
                  percent: dayPercent,
                  date: new Date(dayStart * 1000).toLocaleDateString(),
                })}
              </div>
              {dayDownTime > 0 && (
                <div>
                  {t('Down for', {
                    duration: moment.preciseDiff(moment(0), moment(dayDownTime * 1000)),
                  })}
                </div>
              )}
            </>
          )
        }
      >
        <div
          style={{
            height: '42px',
            // claude.com-style: 30 bars share the full row width.
            flex: '1 1 0',
            minWidth: '4px',
            background: getColor(dayPercent, false),
            borderRadius: '3px',
            marginLeft: '1.5px',
            marginRight: '1.5px',
          }}
          onClick={() => {
            if (dayDownTime > 0) {
              setModalTitle(
                t('incidents at', {
                  name: monitor.name,
                  date: new Date(dayStart * 1000).toLocaleDateString(),
                })
              )
              setModelContent(
                <>
                  {incidentReasons.map((reason, index) => (
                    <div key={index}>{reason}</div>
                  ))}
                </>
              )
              setModalOpened(true)
            }
          }}
        />
      </Tooltip>
    )
  }

  return (
    <>
      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title={modalTitle}
        size={'40em'}
      >
        {modelContent}
      </Modal>
      <Box
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          marginTop: '10px',
          marginBottom: '5px',
        }}
        ref={barRef}
      >
        {uptimePercentBars}
      </Box>
      <Box
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: '13px',
          opacity: 0.75,
          marginBottom: '6px',
        }}
      >
        <span>{t('30 days ago')}</span>
        <span className="num">
          {windowMonitorTime > 0
            ? t('window uptime', {
                percent: (((windowMonitorTime - windowDownTime) / windowMonitorTime) * 100).toPrecision(4),
              })
            : t('No Data')}
        </span>
        <span>{t('Today')}</span>
      </Box>
    </>
  )
}
