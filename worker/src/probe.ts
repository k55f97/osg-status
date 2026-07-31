import { MonitorStateCompacted } from '../../types/config'

/**
 * Detection for the silent self-healing described in uptime.config.ts:80-85.
 *
 * `checkProxyFallback: true` is the right setting — a probe outage must not be
 * published as a service outage. But it makes the probe outage itself invisible:
 * monitor.ts falls back to a local re-check, the page reports the local colo
 * (truthfully), and nothing states that the configured region has stopped
 * answering. A Durable Object that never comes back therefore turns a
 * two-region page into a one-region page in complete silence.
 *
 * This module is the missing comparison: configured region (`checkProxy`)
 * against the region the run actually came from (`fromConfiguredRegion`,
 * monitor.ts).
 *
 * WHY NOT COMPARE THE COLO GEOGRAPHICALLY. The obvious reading of "target
 * region vs actual region" is to map the recorded colo (e.g. "EWR") to a
 * region and compare it against the hint ("enam"). That test is strictly
 * weaker and would have a real blind spot: `checkLocation` on the fallback
 * path is the CRON worker's colo, and the cron worker can be scheduled
 * anywhere — including inside the very region being checked. A dead enam probe
 * whose fallback happens to run in a US colo would look perfect. (Measured
 * 2026-07-31: cron colo LHR, probe colo EWR — today it would happen to show,
 * tomorrow it need not.) It would also need a ~200-entry country->region table
 * whose gaps produce false positives. The proxy call either answered or it did
 * not; that is the exact signal, so it is the one used here.
 */

// Consecutive runs from outside the configured region before this is a finding.
// Cron is `* * * * *` (deploy.tf:64-69), so N runs ~ N minutes.
//
// WHY 15:
//  * Noise floor: a Durable Object relocation or cold start costs one or two
//    runs. N=1 or N=3 would page for every blip — new alarm fatigue, which is
//    worse than the silence it replaces.
//  * Not the service grace period: `notification.gracePeriod` is 3 because a
//    user-visible outage is urgent. A probe that moved is an operations fact,
//    not a user-visible outage; it may be found 15 minutes later.
//  * Above the write cooldown: state is written at most every
//    `kvWriteCooldownMinutes` (3). At 5x that, a skipped state write can never
//    manufacture a streak.
export const PROBE_DRIFT_RUNS = 15
export const PROBE_DRIFT_SECONDS = PROBE_DRIFT_RUNS * 60

export type ProbeVerdict = {
  /** Seconds since the configured region last answered for this monitor. */
  staleFor: number
  /** Currently measuring from outside the configured region for >= N runs. */
  degraded: boolean
  /** This run is the one that crossed the threshold (fire the alert once). */
  crossed: boolean
  /** The configured region answered again after a degraded stretch. */
  recovered: boolean
}

/**
 * Folds one check result into `state.probeOkAt` and returns the verdict.
 * Mutates `state.probeOkAt` — that is the point, the field has to be persisted.
 *
 * @param monitorId            id of the monitor just checked
 * @param fromConfiguredRegion did the run come from `monitor.checkProxy`?
 * @param now                  unix seconds of this run
 */
export function evaluateProbe(
  state: MonitorStateCompacted,
  monitorId: string,
  fromConfiguredRegion: boolean,
  now: number
): ProbeVerdict {
  const probeOkAt = (state.probeOkAt ??= {})

  // First time we see this monitor (fresh state, or first run after deploy):
  // start the clock now, so a monitor cannot be born already degraded.
  const previousOkAt = probeOkAt[monitorId] ?? now
  const staleFor = Math.max(0, now - previousOkAt)

  if (fromConfiguredRegion) {
    probeOkAt[monitorId] = now
    return {
      staleFor: 0,
      degraded: false,
      crossed: false,
      recovered: staleFor >= PROBE_DRIFT_SECONDS,
    }
  }

  probeOkAt[monitorId] = previousOkAt
  return {
    staleFor,
    degraded: staleFor >= PROBE_DRIFT_SECONDS,
    // Fire once, on the run that crosses. The +-30s window is the idiom already
    // used for the grace period in index.ts:129-137 and absorbs clock drift;
    // with a 60s cron exactly one run falls inside it.
    crossed: staleFor >= PROBE_DRIFT_SECONDS - 30 && staleFor < PROBE_DRIFT_SECONDS + 30,
    recovered: false,
  }
}

export function formatProbeDriftNotification(
  monitorName: string,
  configuredRegion: string,
  measuredFrom: string,
  staleFor: number
): string {
  return (
    `\u{1F4CD} ${monitorName}: check region "${configuredRegion}" has not answered for ` +
    `${Math.round(staleFor / 60)} minutes. Checks are falling back to ${measuredFrom}, ` +
    `so this monitor is no longer an independent vantage point. ` +
    `Service status itself is unaffected.`
  )
}

export function formatProbeRecoveryNotification(
  monitorName: string,
  configuredRegion: string
): string {
  return `\u{2705} ${monitorName}: check region "${configuredRegion}" is answering again.`
}
