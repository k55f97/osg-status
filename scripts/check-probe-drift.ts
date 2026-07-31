/**
 * Red/green proof for the probe-drift detection (worker/src/probe.ts).
 *
 *   npx tsx scripts/check-probe-drift.ts
 *
 * Three cases side by side, all driving the REAL `doMonitor` fallback branch
 * (worker/src/monitor.ts:397-407) against the REAL `website_enam` monitor from
 * uptime.config.ts — the Durable Object is replaced, nothing else is:
 *
 *   A) PERMANENTLY DEAD PROXY — the stub throws from run 4 on. Detection MUST
 *      fire, exactly once, after PROBE_DRIFT_RUNS dead runs.
 *   B) SINGLE BLIP — one run out of 40 throws. Detection MUST NOT fire, or the
 *      silence has only been traded for alarm fatigue.
 *   C) CONTROL for the design choice — same dead proxy as A, but the cron
 *      worker happens to run inside the target region. The naive "map the
 *      recorded colo back to a region" test is blind here; this one is not.
 *
 * Exits non-zero if any expectation is violated.
 */
import { doMonitor } from '../worker/src/monitor'
import { evaluateProbe, PROBE_DRIFT_RUNS, PROBE_DRIFT_SECONDS } from '../worker/src/probe'
import { workerConfig } from '../uptime.config'
import { codeToCountry } from '../util/iata'
import type { MonitorStateCompacted, MonitorTarget } from '../types/config'

const monitor = workerConfig.monitors.find((m) => m.id === 'website_enam') as MonitorTarget
if (!monitor?.checkProxy) throw new Error('website_enam or its checkProxy is gone')

const LOCAL_COLO = 'LHR' // the cron colo, as measured live on 2026-07-31
const PROBE_COLO = 'EWR' // what the enam Durable Object answered live

/** Env whose Durable Object namespace is dead on the runs the predicate picks. */
function envWithDeadRuns(isDead: (n: number) => boolean, run: { n: number }): any {
  return {
    REMOTE_CHECKER_DO: {
      idFromName(_name: string) {
        if (isDead(run.n)) {
          throw new Error('Network connection lost.') // what a dead DO looks like
        }
        return 'id'
      },
      get(_id: any, _opts: any) {
        return {
          async getLocationAndStatus() {
            return { location: PROBE_COLO, status: { ping: 24, up: true, err: '' } }
          },
          async kill() {},
        }
      },
    },
  }
}

async function scenario(
  label: string,
  isDead: (n: number) => boolean,
  totalRuns: number,
  localColo: string = LOCAL_COLO
) {
  const state: MonitorStateCompacted = {
    lastUpdate: 0,
    overallUp: 0,
    overallDown: 0,
    incident: {},
    latency: {},
  }
  const run = { n: 0 }
  const t0 = 1785457187 // live `updatedAt` from status.openshopgraph.org
  const alerts: string[] = []
  const locs: string[] = []
  let firstDegradedRun: number | null = null
  let fallbackRuns = 0
  let deadRunsBeforeDetection = 0
  let naiveLooksCorrect = 0
  let allUp = true

  // Count how often the real fallback branch logged, as evidence that the
  // production code path — not a stand-in — produced these results.
  const realLog = console.log
  let fallbackLogLines = 0
  console.log = (...args: any[]) => {
    if (String(args[0]).startsWith('Falling back to local check')) fallbackLogLines++
  }

  for (let n = 1; n <= totalRuns; n++) {
    run.n = n
    const now = t0 + n * 60 // cron is every minute
    const result = await doMonitor(monitor, localColo, envWithDeadRuns(isDead, run))
    const verdict = evaluateProbe(state, monitor.id, result.fromConfiguredRegion, now)
    locs.push(result.location)
    // The naive alternative: reconstruct the region from the recorded colo, the
    // only thing the pre-change state knows. "enam" == a United States colo.
    if (codeToCountry(result.location).startsWith('United States')) naiveLooksCorrect++
    allUp &&= result.status.up
    if (!result.fromConfiguredRegion) fallbackRuns++
    if (verdict.degraded && firstDegradedRun === null) {
      firstDegradedRun = n
      deadRunsBeforeDetection = fallbackRuns
    }
    if (verdict.crossed) alerts.push(`run ${n}: DRIFT (stale ${verdict.staleFor}s)`)
    if (verdict.recovered) alerts.push(`run ${n}: RECOVERED`)
  }
  console.log = realLog

  const uniqueLocs = locs.filter((l, i) => locs.indexOf(l) === i)
  console.log(`\n=== ${label} ===`)
  console.log(
    `  runs                 : ${totalRuns} (cron 1/min), threshold ${PROBE_DRIFT_RUNS} runs / ${PROBE_DRIFT_SECONDS}s`
  )
  console.log(`  real fallback branch : taken ${fallbackLogLines}/${totalRuns} runs (monitor.ts:395)`)
  console.log(`  page showed location : ${uniqueLocs.join(', ')}`)
  console.log(`  monitor stayed UP    : ${allUp}`)
  console.log(`  first degraded run   : ${firstDegradedRun ?? 'never'}`)
  console.log(`  dead runs at detect  : ${firstDegradedRun ? deadRunsBeforeDetection : '-'}`)
  console.log(`  alerts               : ${alerts.length ? alerts.join(' | ') : 'none'}`)
  console.log(
    `  naive geo test says OK: ${naiveLooksCorrect}/${totalRuns} runs looked like the configured region`
  )
  return {
    alerts,
    firstDegradedRun,
    uniqueLocs,
    allUp,
    fallbackRuns,
    deadRunsBeforeDetection,
    naiveLooksCorrect,
  }
}

async function main() {
  let ok = true
  const check = (cond: boolean, msg: string) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`)
    ok &&= cond
  }

  // ---------------------------------------------------------------- A: dead --
  // Healthy for 3 runs, then the Durable Object never answers again.
  const dead = await scenario('A) Durable Object permanently dead from run 4', (n) => n >= 4, 40)
  check(dead.allUp, 'monitor stays UP throughout — the fallback keeps the page honest, as designed')
  check(
    dead.uniqueLocs.join() === `${PROBE_COLO},${LOCAL_COLO}`,
    `page showed ${PROBE_COLO} then silently ${LOCAL_COLO} forever, with no other signal (the bug)`
  )
  check(
    dead.deadRunsBeforeDetection === PROBE_DRIFT_RUNS,
    `detection fires after exactly ${PROBE_DRIFT_RUNS} dead runs, got ${dead.deadRunsBeforeDetection}`
  )
  check(dead.alerts.length === 1, `exactly one alert over 40 runs, got ${dead.alerts.length}`)

  // ---------------------------------------------------------------- B: blip --
  const blip = await scenario(
    'B) single dropped run (run 5), probe otherwise healthy',
    (n) => n === 5,
    40
  )
  check(blip.fallbackRuns === 1, `exactly one fallback run, got ${blip.fallbackRuns}`)
  check(blip.firstDegradedRun === null, `single blip never degrades, got ${blip.firstDegradedRun}`)
  check(blip.alerts.length === 0, `single blip raises no alert, got ${blip.alerts.length}`)
  check(
    blip.uniqueLocs.includes(PROBE_COLO) && blip.uniqueLocs.includes(LOCAL_COLO),
    'blip run really took the fallback branch'
  )

  // ------------------------------------------------- C: control for the design
  // Same permanently dead probe, but the CRON worker happens to be scheduled in
  // IAD — inside enam, the very region being checked. The naive "map the colo
  // back to a region" test sees United States on every run and stays silent.
  const blind = await scenario(
    'C) control — dead probe, but the cron worker sits in the target region (IAD)',
    (n) => n >= 4,
    40,
    'IAD'
  )
  check(
    blind.naiveLooksCorrect === 40,
    `naive geo test is blind here: it saw the configured region on ${blind.naiveLooksCorrect}/40 runs`
  )
  check(
    blind.alerts.length === 1 && blind.deadRunsBeforeDetection === PROBE_DRIFT_RUNS,
    'the implemented detection still fires — it asks the proxy, not the map'
  )

  console.log(`\n${ok ? 'GREEN' : 'RED'}`)
  if (!ok) process.exitCode = 1
}

main()
