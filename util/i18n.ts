import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en/common.json'

// ENGLISH ONLY — deliberate, and not a "locale setting" that was set wrong.
//
// Upstream UptimeFlare wires i18next-browser-languagedetector with
// `detection: { order: ['navigator'] }`, so the page spoke whatever
// `navigator.language` asked for. Nothing in this repository ever chose
// German: a German browser simply got locales/de-DE/common.json. Measured
// 2026-08-17 against the live page with a de-DE browser context: the chrome
// rendered "Vorfälle", "Betroffene Komponenten", "Von:", "Bis:", "Alle Systeme
// funktionsfähig" while the payload it framed ("Timeout after 10000ms",
// "Expected codes: [200], Got: 530") and the monitor names stayed English —
// the worst of both, unreadable from either side.
//
// Because detection was automatic, a maintainer on an en-US browser saw a
// fully English page and had no way to notice. Verify with a de-DE browser
// context, not with your own: `node scripts/check-english.mjs <url>`.
//
// The detector is removed rather than merely overridden, and the non-English
// bundles are no longer imported, so German cannot be reached by any browser
// setting or future detection tweak. locales/{de-DE,fr-FR,zh-CN,zh-TW} are
// left on disk untouched: this is a fork that still merges lyc8503/UptimeFlare
// upstream, and deleting upstream files buys a merge conflict for no gain.
// They are unreferenced from here on.
i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
