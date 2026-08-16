/**
 * Date/time rendering for the status page — one fixed, unambiguous format for
 * every visitor.
 *
 * Why this file exists: every timestamp on the page went through a bare
 * `toLocaleString()` / `toLocaleDateString()` / `toLocaleTimeString([], …)`.
 * With no locale argument those follow the *browser*, so the same incident read
 * "30.7.2026, 22:10:24" in Hamburg and "7/30/2026, 10:10:24 PM" in New York.
 * For an international audience "30.7.2026" is not merely foreign, it is
 * genuinely ambiguous — 30 July or (read as m/d) an impossible month, and
 * "7.3.2026" flips meaning outright between the two readings. A status page is
 * read when something is broken and the exact minute matters; that is the
 * worst possible place for a date the reader has to guess at.
 *
 * Format chosen: ISO-8601 calendar order, `2026-07-30 22:10:24 CEST`.
 * Unambiguous in every locale, sorts lexicographically, and the zone is named
 * because these are absolute instants rendered in the *viewer's* local zone —
 * without the zone the reader still cannot line the page up against their own
 * logs.
 *
 * Implementation note (not cosmetic): the numbers come from Intl, but this
 * module assembles the string itself via formatToParts. Picking some locale
 * whose pattern happens to be YYYY-MM-DD (en-CA) would leave the format at the
 * mercy of a CLDR revision. The locale is pinned to Latin digits and the
 * Gregorian calendar for the same reason — a browser configured for another
 * numbering system must not change what a status page prints.
 */

// -u-ca-gregory-nu-latn: Gregorian calendar, Latin digits, regardless of what
// the visitor's browser prefers.
const NUMERIC_LOCALE = 'en-GB-u-ca-gregory-nu-latn'

const dateParts = new Intl.DateTimeFormat(NUMERIC_LOCALE, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeParts = new Intl.DateTimeFormat(NUMERIC_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // h23, not `hour12: false`: the latter renders midnight as "24" in several
  // engines.
  hourCycle: 'h23',
})

const hourMinuteParts = new Intl.DateTimeFormat(NUMERIC_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const zoneParts = new Intl.DateTimeFormat(NUMERIC_LOCALE, {
  timeZoneName: 'short',
})

function pick(fmt: Intl.DateTimeFormat, date: Date, type: Intl.DateTimeFormatPartTypes): string {
  return fmt.formatToParts(date).find((p) => p.type === type)?.value ?? ''
}

/** `2026-07-30` */
export function formatDate(date: Date): string {
  const y = pick(dateParts, date, 'year')
  const m = pick(dateParts, date, 'month')
  const d = pick(dateParts, date, 'day')
  return `${y}-${m}-${d}`
}

/** `22:10:24` */
export function formatTime(date: Date): string {
  const h = pick(timeParts, date, 'hour')
  const mi = pick(timeParts, date, 'minute')
  const s = pick(timeParts, date, 'second')
  return `${h}:${mi}:${s}`
}

/** `22:10` — for dense tooltip ranges like `[22:10-22:15]`. */
export function formatHourMinute(date: Date): string {
  const h = pick(hourMinuteParts, date, 'hour')
  const mi = pick(hourMinuteParts, date, 'minute')
  return `${h}:${mi}`
}

/** `2026-07-30 22:10:24 CEST` — the viewer's local zone, named. */
export function formatDateTime(date: Date): string {
  const zone = pick(zoneParts, date, 'timeZoneName')
  const stamp = `${formatDate(date)} ${formatTime(date)}`
  return zone ? `${stamp} ${zone}` : stamp
}
