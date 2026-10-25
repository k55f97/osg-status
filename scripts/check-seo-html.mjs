// Prueft das INITIALE HTML (vor jedem JS) auf die Suchmaschinen-Basis.
// Nutzung nach dem Deploy:  node scripts/check-seo-html.mjs https://status.openshopgraph.com/
// Exit 1 + Liste der Verstoesse, sonst 0. Die Pruefung ist eine Funktion, damit
// scripts/test/seo-html.test.mjs sie mit echt gerendertem und mutiertem HTML fuettern kann.
export function checkSeoHtml(html, { canonical = 'https://status.openshopgraph.com/' } = {}) {
  const problems = []
  if (!html || html.length < 200) return ['HTML leer/zu kurz: nichts geprueft (ROT, nicht gruen)']
  const title = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  if (!title || !title[1].trim()) problems.push('kein nichtleeres <title>')
  const desc = /<meta\b[^>]*\bname="description"[^>]*>/i.exec(html)
  const descContent = desc && /\bcontent="([^"]+)"/i.exec(desc[0])
  if (!descContent || descContent[1].trim().length < 40)
    problems.push('keine meta description (>=40 Zeichen)')
  const h1 = /<h1[^>]*>([^<]*\S[^<]*)<\/h1>/i.exec(html)
  if (!h1) problems.push('kein nichtleeres <h1>')
  const canon = /<link\b[^>]*\brel="canonical"[^>]*>/i.exec(html)
  const canonHref = canon && /\bhref="([^"]+)"/i.exec(canon[0])
  if (!canonHref || canonHref[1] !== canonical) problems.push(`canonical != ${canonical}`)
  if (/<meta\b[^>]*\bname="robots"[^>]*noindex/i.test(html)) problems.push('meta robots noindex')
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2]
  if (!target) {
    console.error('usage: node scripts/check-seo-html.mjs <url|file>')
    process.exit(2)
  }
  const html = /^https?:/.test(target)
    ? await (await fetch(target)).text()
    : (await import('node:fs')).readFileSync(target, 'utf8')
  const problems = checkSeoHtml(html)
  if (problems.length) {
    console.error('SEO-HTML ROT:\n - ' + problems.join('\n - '))
    process.exit(1)
  }
  console.log('SEO-HTML gruen: title, description, h1, canonical vorhanden, kein noindex')
}
