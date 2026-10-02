/**
 * ROT-BEWEIS JE SORTE fuer scripts/check-eu-sonde.ts.
 *
 *   npx tsx scripts/test/eu-sonde.selftest.ts
 *
 * Je Sorte (ZWILLING_FEHLT, REGION, FALLBACK, DRIFT x3, VAKUUM, AUSNAHME) eine
 * Mutation, die GENAU diese Art melden MUSS; dazu zwei Gegenproben, die gruen
 * bleiben MUESSEN (echte Konfiguration, begruendete Ausnahme). Ein einziger
 * Rot-Beweis wuerde zufaellig die Sorte treffen, die der Riegel beherrscht.
 * Die Mutationen sind syntaktisch gueltige Konfigurationen, die nur
 * semantisch falsch sind — der Test prueft die Schaerfe, nicht die Toleranz.
 */
import { workerConfig } from '../../uptime.config'
import { pruefe } from '../check-eu-sonde'
import type { MonitorTarget } from '../../types/config'

const echt = workerConfig.monitors as MonitorTarget[]
const kopie = (): MonitorTarget[] => JSON.parse(JSON.stringify(echt))
const mit = (f: (m: MonitorTarget[]) => MonitorTarget[] | void) => {
  const m = kopie()
  return f(m) ?? m
}
const finde = (m: MonitorTarget[], id: string) => m.find((x) => x.id === id) as MonitorTarget

let fehler = 0
function erwarte(
  name: string,
  monitors: MonitorTarget[],
  art: string | null,
  ausnahmen?: Record<string, string>
) {
  const { verstoesse } = pruefe(monitors, ausnahmen)
  const arten = verstoesse.map((x) => x.art)
  const ok = art === null ? arten.length === 0 : arten.includes(art)
  if (!ok) fehler++
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${name}: erwartet ${art ?? 'GRUEN'}, gemeldet [${arten.join(',')}]`
  )
}

// Vorbedingung: das Messmittel sieht die echten Primaere (sonst waeren alle Mutationen unsichtbar).
const echtErgebnis = pruefe(echt)
if (echtErgebnis.primaere < 4) {
  console.log(
    `FAIL Vorbedingung: nur ${echtErgebnis.primaere} Primaer-Monitor(e) in der echten Konfiguration gesehen`
  )
  fehler++
}

// Gegenproben (MUESSEN gruen sein)
erwarte('echte Konfiguration', echt, null)
erwarte(
  'begruendete Ausnahme',
  mit((m) => m.filter((x) => x.id !== 'website_weur')),
  null,
  { website: 'Testgrund: absichtlich nur zwei Regionen' }
)

// Rot-Beweise (je Sorte)
erwarte(
  'Zwilling entfernt (api_health_weur)',
  mit((m) => m.filter((x) => x.id !== 'api_health_weur')),
  'ZWILLING_FEHLT'
)
erwarte(
  'neuer Primaer ohne Zwilling',
  mit((m) => [...m, { ...finde(m, 'api_health'), id: 'neu_dienst' }]),
  'ZWILLING_FEHLT'
)
erwarte(
  'Zwilling aus falscher Region (enam)',
  mit((m) => {
    finde(m, 'mcp_weur').checkProxy = 'worker://enam'
  }),
  'REGION'
)
erwarte(
  'Zwilling ohne checkProxy (wird selbst Primaer)',
  mit((m) => {
    delete finde(m, 'mcp_weur').checkProxy
  }),
  'ZWILLING_FEHLT'
)
erwarte(
  'Fallback false',
  mit((m) => {
    finde(m, 'api_ready_weur').checkProxyFallback = false
  }),
  'FALLBACK'
)
erwarte(
  'Fallback fehlt',
  mit((m) => {
    delete finde(m, 'api_ready_weur').checkProxyFallback
  }),
  'FALLBACK'
)
erwarte(
  'Drift target',
  mit((m) => {
    finde(m, 'api_health_weur').target = 'https://api.openshopgraph.com/ready'
  }),
  'DRIFT'
)
erwarte(
  'Drift expectedCodes',
  mit((m) => {
    finde(m, 'mcp_weur').expectedCodes = [200]
  }),
  'DRIFT'
)
erwarte(
  'Drift method',
  mit((m) => {
    finde(m, 'website_weur').method = 'HEAD'
  }),
  'DRIFT'
)
erwarte(
  'Vakuum: nur Zwillinge, kein Primaer',
  mit((m) => m.filter((x) => x.checkProxy !== undefined)),
  'VAKUUM'
)
erwarte('Vakuum: leere Liste', [], 'VAKUUM')
erwarte('Ausnahme ohne Grund', echt, 'AUSNAHME_OHNE_GRUND', { website: ' ' })

if (fehler) {
  console.log(`eu-sonde.selftest: ROT — ${fehler} Fall/Faelle verfehlt`)
  process.exit(1)
}
console.log('eu-sonde.selftest: GRUEN — jede Sorte rot gemacht, Gegenproben gruen')
