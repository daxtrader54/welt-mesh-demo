import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import { BRAND, PRODUCT } from '@/lib/product'
import './globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800']
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  display: 'swap',
  weight: ['400', '500', '600']
})

/**
 * The title says mocked up on purpose.
 *
 * This is a demonstration store that takes real payments against Mesh's sandbox, and the two
 * halves of that sentence are easy to confuse from the outside. Someone who finds the tab in a
 * browser history, a shared link or a screenshot should be able to tell it is not a shop without
 * having to open it. The same reasoning drives `noindex`: nothing here should ever turn up in a
 * search result next to real retailers, and the shoe is a real Skechers product listed by a
 * fictional retailer.
 */
const DESCRIPTION =
  `A mocked up single-product shoe shop, built to demonstrate Mesh. Pay $${PRODUCT.price} for the ` +
  `${PRODUCT.brand} ${PRODUCT.name} in ${PRODUCT.settlement.symbol} on ` +
  `${PRODUCT.settlement.network}, funded from an exchange account you already hold. Runs against ` +
  `the Mesh sandbox: no real account, no real money, and no orders are fulfilled.`

export const metadata: Metadata = {
  title: `${BRAND} - Mocked Up Mini Shoe Shop`,
  description: DESCRIPTION,
  applicationName: BRAND,
  /**
   * Belt and braces. The meta tag covers the rendered page; the `X-Robots-Tag` header in
   * `next.config.ts` covers everything else a crawler can reach, including the API routes, and
   * `app/robots.ts` refuses the whole origin before either is read.
   */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true }
  },
  openGraph: {
    title: `${BRAND} - Mocked Up Mini Shoe Shop`,
    description: DESCRIPTION,
    siteName: BRAND,
    type: 'website',
    locale: 'en_GB'
  },
  // No image on purpose. An unfurled product photograph in a Slack thread is exactly the thing
  // that makes a demonstration store read as a real one.
  twitter: { card: 'summary', title: `${BRAND} - Mocked Up Mini Shoe Shop`, description: DESCRIPTION }
}

export const viewport: Viewport = {
  themeColor: '#f2f0ea',
  width: 'device-width',
  initialScale: 1,
  /**
   * Lets the page paint under the notch and the home indicator, which is what makes
   * `env(safe-area-inset-*)` return anything other than zero. Without it the console bar sits
   * flush at bottom:0 and iOS Safari's own toolbar covers the tap target.
   */
  viewportFit: 'cover'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
