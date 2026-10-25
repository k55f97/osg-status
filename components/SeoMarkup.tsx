import { SEO } from '../util/seo'

// Relative import on purpose: scripts/test/seo-html.test.mjs transpiles this file
// on its own and renders it, without the Next.js '@/' alias.

// <head> tags. Used inside next/head in _app, OUTSIDE <NoSsr>. Inside NoSsr
// nothing is server-rendered: the live page shipped with no <title>, no
// description and an empty <body> (next-head-count=2) although pages/index.tsx
// already had a <Head><title>.
export function seoHeadTags() {
  return [
    <title key="title">{SEO.title}</title>,
    <meta key="description" name="description" content={SEO.description} />,
    <link key="canonical" rel="canonical" href={SEO.canonical} />,
  ]
}

// Server-rendered, visible heading + one sentence. Also the only text a
// crawler sees before JS runs.
export function SeoIntro() {
  return (
    <section className="osg-seo-intro">
      <h1>{SEO.h1}</h1>
      <p>{SEO.intro}</p>
    </section>
  )
}
