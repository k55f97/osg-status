import { MonitorTarget } from '@/types/config'
import { CompactedMonitorStateWrapper } from '@/worker/src/store'

export type DetectedIncident = {
  monitor: MonitorTarget
  start: number // ms
  end?: number // ms, undefined while the incident is still open
  reasons: string[]
}

/**
 * Inclusive start / exclusive end of a "YYYY-MM" string, in local time — the
 * same time base `getSelectedMonth()` on the incidents page uses.
 */
export function monthRange(monthStr: string): { from: number; to: number } {
  const [year, month] = monthStr.split('-').map(Number)
  return {
    from: new Date(year, month - 1, 1).getTime(),
    to: new Date(year, month, 1).getTime(),
  }
}

/**
 * Derive the incidents the worker actually recorded for a given month.
 *
 * Reads the compacted state directly instead of `uncompact()`ing it: we only
 * need the incident columns, and uncompacting also decodes the (much larger)
 * latency series, which this page never renders.
 *
 * An incident counts for the month when it *overlaps* it, not when it starts
 * in it — otherwise an outage running across midnight of the 1st, or one that
 * is still open, would silently vanish from the current month.
 */
export function detectedIncidentsForMonth(
  state: CompactedMonitorStateWrapper,
  monthStr: string,
  monitors: MonitorTarget[],
  now: number = Date.now()
): DetectedIncident[] {
  const { from, to } = monthRange(monthStr)
  const detected: DetectedIncident[] = []

  for (const monitorId of Object.keys(state.data.incident)) {
    // Fall back to the raw id for monitors that were removed from the config:
    // dropping their history silently is exactly the failure we are fixing.
    const monitor =
      monitors.find((m) => m.id === monitorId) ??
      ({ id: monitorId, name: monitorId } as MonitorTarget)

    for (let i = 0; i < state.incidentLen(monitorId); i++) {
      const incident = state.getIncident(monitorId, i)

      // The worker seeds every monitor with a zero-length 'dummy' record that
      // only stores when monitoring began (worker/src/index.ts:51) — not an outage.
      if (incident.error.length === 1 && incident.error[0] === 'dummy') continue

      const start = incident.start[0] * 1000
      const end = incident.end === null ? undefined : incident.end * 1000
      if (start >= to || (end ?? now) < from) continue

      detected.push({
        monitor,
        start,
        end,
        // Same error repeated over many checks reads as noise; keep first occurrence order.
        reasons: incident.error.filter((e, idx) => incident.error.indexOf(e) === idx),
      })
    }
  }

  return detected
}
