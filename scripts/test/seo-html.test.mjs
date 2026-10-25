// Rendert die ECHTEN Komponenten (components/SeoMarkup.tsx) per react-dom/server
// und fuettert das Ergebnis dem Pruefer. Keine Mocks der Komponenten.
// Rot-Beweise je Sorte: title / description / h1 / canonical / noindex / leeres HTML,
// plus der Naht-Test: _app.tsx setzt die Markup-Teile AUSSERHALB von <NoSsr>.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { checkSeoHtml } from '../check-seo-html.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

// Transpile into node_modules/.cache (git-ignored) so 'react/jsx-runtime' resolves.
const out = path.join(root, 'node_modules/.cache/seo-test')
fs.mkdirSync(out, { recursive: true })
function build(src, dst, rewrite = (s) => s) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, src), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  fs.writeFileSync(path.join(out, dst), rewrite(code))
}
build('util/seo.ts', 'seo.mjs')
build('components/SeoMarkup.tsx', 'SeoMarkup.mjs', (c) => c.replace("'../util/seo'", "'./seo.mjs'"))
fs.writeFileSync(path.join(out, 'package.json'), '{"type":"module"}')
const { seoHeadTags, SeoIntro } = await import(
  pathToFileURL(path.join(out, 'SeoMarkup.mjs')).href + `?t=${Date.now()}`
)

const head = renderToStaticMarkup(React.createElement(React.Fragment, null, ...seoHeadTags()))
const body = renderToStaticMarkup(React.createElement(SeoIntro))
const pad = '<meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>'
const html = `<!DOCTYPE html><html lang="en"><head>${pad}${head}</head><body><div id="__next">${body}</div></body></html>`

test('Echtfall: gerenderte Komponenten erfuellen alle Kriterien', () => {
  assert.deepEqual(checkSeoHtml(html), [])
})

test('Echtfall: Titel kurz, keine Personennamen, Beschreibung nennt Website/API/MCP', () => {
  assert.match(html, /<title>OpenShopGraph Status<\/title>/)
  assert.match(html, /website, API and MCP/i)
  assert.doesNotMatch(html, /konrad|fr(ö|oe)hlich/i)
})

const mutations = {
  'title weg': (h) => h.replace(/<title>.*?<\/title>/, ''),
  'title leer': (h) => h.replace(/<title>.*?<\/title>/, '<title></title>'),
  'description weg': (h) => h.replace(/<meta name="description"[^>]*\/?>/, ''),
  'h1 weg': (h) => h.replace(/<h1>.*?<\/h1>/, ''),
  'canonical falsch': (h) => h.replace('https://status.openshopgraph.com/', 'https://example.com/'),
  'canonical weg': (h) => h.replace(/<link rel="canonical"[^>]*\/?>/, ''),
  noindex: (h) => h.replace('</head>', '<meta name="robots" content="noindex"/></head>'),
  'leeres Shell-HTML (heutiger Live-Zustand)': () =>
    `<!DOCTYPE html><html><head>${pad}<meta name="next-head-count" content="2"/></head><body><div id="__next"></div>${'x'.repeat(300)}</body></html>`,
}
for (const [name, mutate] of Object.entries(mutations)) {
  test(`Rot-Beweis: ${name} -> ROT`, () => {
    const mutated = mutate(html)
    assert.notEqual(mutated, html, 'Mutation hat nichts veraendert (Test misst nichts)')
    assert.notDeepEqual(checkSeoHtml(mutated), [])
  })
}

test('Naht: _app.tsx rendert Head+SeoIntro VOR/ausserhalb von <NoSsr>', () => {
  const app = fs.readFileSync(path.join(root, 'pages/_app.tsx'), 'utf8')
  const noSsr = app.indexOf('<NoSsr>')
  assert.ok(noSsr > 0)
  for (const marker of ['seoHeadTags()', '<SeoIntro />']) {
    const i = app.indexOf(marker)
    assert.ok(i > 0 && i < noSsr, `${marker} fehlt oder steht nicht vor <NoSsr>`)
  }
})
