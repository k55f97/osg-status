/**
 * RIEGEL: jeder Primaer-Monitor hat einen EU-Zwilling.
 *
 *   npx tsx scripts/check-eu-sonde.ts            # prueft uptime.config.ts
 *   npx tsx scripts/test/eu-sonde.selftest.ts    # Rot-Beweis je Sorte
 *
 * WARUM ES DEN RIEGEL GIBT: API und MCP verfehlten ihr 30-Tage-Dienstziel, und
 * jede Zahl kam aus KIX. Ohne EU-Sonde ist "Ursprung down" von "Route Osaka ->
 * Ursprung down" nicht zu unterscheiden. Eine Sonde einzubauen heilt den Fall;
 * dieser Riegel heilt die KLASSE: ein kuenftiger Primaer-Monitor ohne Zwilling
 * (oder ein Zwilling, der etwas anderes misst als sein Primaer) wird in der CI
 * rot, nicht erst bei der naechsten Dienstziel-Auswertung.
 *
 * REGEL (je Monitor OHNE checkProxy = "Primaer"):
 *   1. es gibt einen Monitor `<id>_weur`                      -> ZWILLING_FEHLT
 *   2. Zwilling: checkProxy `worker://weur` | `worker://eeur` -> REGION
 *   3. Zwilling: checkProxyFallback === true                  -> FALLBACK
 *      (ohne ihn wird ein Sondenausfall als DIENSTausfall veroeffentlicht)
 *   4. Zwilling: target, method, expectedCodes == Primaer     -> DRIFT
 *      (ein Zwilling mit anderem Ziel misst einen anderen Dienst)
 *   5. mindestens ein Primaer wurde gesehen                   -> VAKUUM
 *      (n = 0 ist ROT: eine Pruefung ueber leerer Menge ist keine Pruefung)
 *
 * REICHWEITE: der Riegel prueft die KONFIGURATION, nicht, dass die Sonde
 * deployt ist und antwortet. Das belegt allein die Statusseite (Probe-Loc in
 * der Latenzreihe) bzw. worker/src/probe.ts im Betrieb.
 *
 * AUSNAHMEREGISTER: leer, absichtlich. Ein Primaer ohne EU-Zwilling braucht
 * einen Eintrag MIT Grund; ohne Grund ist der Eintrag selbst rot.
 */
import type { MonitorTarget } from '../types/config'

export const EU_REGIONEN = ['worker://weur', 'worker://eeur']
export const AUSNAHMEN: Record<string, string> = {}

export type Verstoss = { art: string; monitor: string; text: string }

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function pruefe(
  monitors: MonitorTarget[],
  ausnahmen: Record<string, string> = AUSNAHMEN
): { verstoesse: Verstoss[]; primaere: number } {
  const v: Verstoss[] = []
  const primaere = monitors.filter((m) => m.checkProxy === undefined)
  if (primaere.length === 0) {
    v.push({
      art: 'VAKUUM',
      monitor: '-',
      text: 'kein Primaer-Monitor gesehen — die Pruefung lief ueber einer leeren Menge',
    })
  }
  for (const [id, grund] of Object.entries(ausnahmen)) {
    if (!grund || !grund.trim())
      v.push({ art: 'AUSNAHME_OHNE_GRUND', monitor: id, text: 'Ausnahme ohne genannten Grund' })
  }
  for (const p of primaere) {
    if (ausnahmen[p.id]?.trim()) continue
    const z = monitors.find((m) => m.id === `${p.id}_weur`)
    if (!z) {
      v.push({
        art: 'ZWILLING_FEHLT',
        monitor: p.id,
        text: `kein EU-Zwilling '${p.id}_weur' — dieser Weg wird nur aus Fernost/USA gemessen`,
      })
      continue
    }
    if (!EU_REGIONEN.includes(z.checkProxy ?? '')) {
      v.push({
        art: 'REGION',
        monitor: z.id,
        text: `checkProxy ${JSON.stringify(z.checkProxy)} ist keine EU-Region (${EU_REGIONEN.join(
          ' | '
        )})`,
      })
    }
    if (z.checkProxyFallback !== true) {
      v.push({
        art: 'FALLBACK',
        monitor: z.id,
        text: 'checkProxyFallback ist nicht true — ein Sondenausfall wuerde als Dienstausfall veroeffentlicht',
      })
    }
    if (
      z.target !== p.target ||
      z.method !== p.method ||
      !gleich(z.expectedCodes, p.expectedCodes)
    ) {
      v.push({
        art: 'DRIFT',
        monitor: z.id,
        text: `misst nicht dasselbe wie '${p.id}' (target/method/expectedCodes weichen ab)`,
      })
    }
  }
  return { verstoesse: v, primaere: primaere.length }
}

async function main() {
  const { workerConfig } = await import('../uptime.config')
  const { verstoesse, primaere } = pruefe(workerConfig.monitors as MonitorTarget[])
  console.log(
    `check-eu-sonde: ${primaere} Primaer-Monitor(e) geprueft, ${verstoesse.length} Verstoss/Verstoesse`
  )
  for (const x of verstoesse) console.log(`  ROT ${x.art} ${x.monitor}: ${x.text}`)
  if (verstoesse.length) {
    console.log(
      'FOLGE: gruen heisst hier nicht, dass dieser Weg aus Europa gemessen wird — ohne Zwilling bleibt die EU-Region UNGEPRUEFT.'
    )
    process.exit(1)
  }
  console.log('check-eu-sonde: GRUEN')
}

if (process.argv[1] && /check-eu-sonde\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error('check-eu-sonde: ABBRUCH', e)
    process.exit(2)
  })
}
