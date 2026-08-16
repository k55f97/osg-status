#!/usr/bin/env node
/**
 * Verifies that the RENDERED status page is English-only and that every date it
 * prints is unambiguous.
 *
 * Why a browser and not curl: the page is a Next.js app whose incident list,
 * status banner and every timestamp are produced by client-side JavaScript
 * after hydration. `curl` receives the pre-hydration HTML, so it sees neither
 * the German UI strings nor the localized dates. A curl-based check reported
 * "0 German words in 21057 characters" against a page that was visibly German.
 *
 * Why locale de-DE: language and date format were never configured — they
 * followed `navigator.language` through i18next-browser-languagedetector and
 * through bare `toLocaleString()`. A browser running en-US therefore rendered
 * English *by accident* and would pass a naive check while a German visitor
 * still saw German. This check runs the worst case on purpose: a browser that
 * asks for German. If the page is English here, it is English everywhere.
 *
 * Not wired into CI: it needs the network and a deployed page, and CI runs
 * before the deploy exists. Run it by hand against production after a deploy.
 *
 * Usage:  node scripts/check-english.mjs [baseUrl]
 *         node scripts/check-english.mjs https://status.openshopgraph.com
 * Exit 0 = green, 1 = red. Requires `playwright` to be resolvable.
 */

const base = (process.argv[2] || 'https://status.openshopgraph.org').replace(/\/$/, '')

// Exact UI strings from locales/de-DE/common.json. These are the search
// patterns; the run against the un-fixed page is their positive control —
// if this list stops matching a German page it is broken, not the page.
const GERMAN_UI = [
  'Vorfälle',
  'Auswählen',
  'Betroffene Komponenten',
  'Alle Systeme funktionsfähig',
  'Nicht alle Systeme funktionsfähig',
  'Manche Systeme sind nicht funktionsfähig',
  'Letzte Aktualisierung',
  'Noch keine Daten',
  'Keine Daten',
  'Funktionsfähig',
  'Antwortzeiten',
  'Ausfall für',
  'Geplante Wartung',
  'Voraussichtliches Ende',
  'Geplant für',
  'Bis auf Weiteres',
  'Gesamt:',
  'verstecken',
  'Keine Vorfälle',
  'Zurück',
  'Vorwärts',
  'Betriebszeit',
  'Heute',
  'vor 30 Tagen',
  'Alle',
]

// "Von:" / "Bis:" are short enough to appear inside unrelated words, so they
// are matched as standalone labels only.
const GERMAN_LABELS = [/(^|\s)Von:/m, /(^|\s)Bis:/m]

// 30.7.2026 / 30.07.2026 — ambiguous for an international audience.
const AMBIGUOUS_DATE = /\b\d{1,2}\.\d{1,2}\.\d{4}\b/g
// 2026-07-30 — what we require instead.
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g

// Pages to inspect. The month hashes are the ones that actually hold recorded
// incidents, so that the incident detail block (dates + "From:"/"To:") renders
// at all; an empty month would make the date check vacuously green.
const now = new Date()
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const prevDate = new Date(now.getFullYear(), now.getMonth() - 1)
const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

const PAGES = ['/', `/incidents#${thisMonth}`, `/incidents#${prevMonth}`]

let playwright
try {
  playwright = await import('playwright')
} catch {
  console.error('SETUP ERROR: playwright is not resolvable — this is NOT a pass.')
  console.error('Install it (npm i -D playwright && npx playwright install chromium) and re-run.')
  process.exit(1)
}

const browser = await playwright.chromium.launch()
const context = await browser.newContext({
  // Worst case on purpose — see header.
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
})
const page = await context.newPage()

let failures = []
// Positive control for the DATE axis: did any page print a date at all, in any
// format? Counting only ISO dates would report "no date rendered" on a page
// that is full of German dates, which is the wrong diagnosis.
let sawAnyDate = false

for (const path of PAGES) {
  const url = base + path
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  // Hash-driven month switch re-renders after the hashchange listener runs.
  await page.waitForTimeout(1500)

  const text = await page.evaluate(() => document.body.innerText)
  const htmlLang = await page.evaluate(() => document.documentElement.lang || '(unset)')

  // ---- POSITIVE CONTROL ------------------------------------------------
  // An absence claim is only worth something if presence would have shown up.
  // A blank or unhydrated page must be reported as RED, never as "no German".
  if (text.length < 200) {
    failures.push(`${url}: PAGE DID NOT RENDER (${text.length} chars) — RED, not clean.`)
    continue
  }
  // "API" is a monitor name from uptime.config.ts; it only appears once the
  // client has rendered the monitor list.
  if (!text.includes('API')) {
    failures.push(
      `${url}: rendered ${text.length} chars but no monitor names — page did not hydrate. RED, not clean.`
    )
    continue
  }

  // ---- LANGUAGE --------------------------------------------------------
  const germanHits = GERMAN_UI.filter((w) => text.includes(w))
  for (const re of GERMAN_LABELS) if (re.test(text)) germanHits.push(re.source)
  if (germanHits.length) {
    failures.push(`${url}: German UI strings present -> ${germanHits.join(' | ')}`)
  }
  if (htmlLang !== 'en') {
    failures.push(`${url}: <html lang="${htmlLang}">, expected "en"`)
  }

  // ---- DATE FORMAT -----------------------------------------------------
  const ambiguous = text.match(AMBIGUOUS_DATE) || []
  if (ambiguous.length) {
    failures.push(`${url}: ambiguous d.m.yyyy dates -> ${[...new Set(ambiguous)].join(', ')}`)
  }
  const iso = text.match(ISO_DATE) || []
  if (iso.length || ambiguous.length) sawAnyDate = true

  console.log(
    `checked ${url}\n  chars=${text.length} lang=${htmlLang} german=${germanHits.length} ambiguousDates=${ambiguous.length} isoDates=${iso.length}`
  )
}

// A run in which no page ever printed a date cannot testify about date format.
if (!sawAnyDate) {
  failures.push(
    'NO DATE WAS RENDERED ON ANY PAGE — the date-format check proved nothing. RED, not clean.'
  )
}

await browser.close()

if (failures.length) {
  console.error('\nRED:')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.log('\nGREEN: English-only UI, ISO dates, on a de-DE browser.')
