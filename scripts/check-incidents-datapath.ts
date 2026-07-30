/**
 * Red/green proof for the /incidents data path, run against the REAL live state
 * (compactedStateStr as served by https://status.openshopgraph.org/).
 *
 *   npx tsx scripts/check-incidents-datapath.ts <state.json> <YYYY-MM>
 *
 * Prints the incidents the page will now render for that month. Before this
 * change the page never received compactedStateStr at all, so the count was
 * structurally 0 no matter what the worker had recorded.
 */
import { readFileSync } from 'fs'
import { CompactedMonitorStateWrapper } from '../worker/src/store'
import { detectedIncidentsForMonth } from '../util/incidents'
import type { MonitorTarget } from '../types/config'

const [, , statePath, month] = process.argv
const compactedStateStr = readFileSync(statePath, 'utf-8')
const state = new CompactedMonitorStateWrapper(compactedStateStr)

const monitors = Object.keys(state.data.incident).map((id) => ({ id, name: id })) as MonitorTarget[]
const found = detectedIncidentsForMonth(state, month, monitors)

console.log(`lastUpdate=${new Date(state.data.lastUpdate * 1000).toISOString()} month=${month}`)
console.log(`incidents rendered: ${found.length}`)
for (const i of found) {
  console.log(
    `  ${i.monitor.id}  ${new Date(i.start).toISOString()} -> ${
      i.end ? new Date(i.end).toISOString() : 'OPEN'
    }  ${i.reasons.join(' | ')}`
  )
}
if (found.length === 0) process.exitCode = 1
