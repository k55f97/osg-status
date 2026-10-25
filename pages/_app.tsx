import '@mantine/core/styles.css'
import '@/styles/osg-fonts.css'
import '@/styles/osg-theme.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { MantineProvider } from '@mantine/core'
import NoSsr from '@/components/NoSsr'
import { seoHeadTags, SeoIntro } from '@/components/SeoMarkup'
import '@/util/i18n'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* Outside <NoSsr> on purpose: must be in the initial HTML. */}
      <Head>{seoHeadTags()}</Head>
      <SeoIntro />
      <NoSsr>
        <MantineProvider defaultColorScheme="auto">
          <Component {...pageProps} />
        </MantineProvider>
      </NoSsr>
    </>
  )
}
