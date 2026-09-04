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

export const metadata: Metadata = {
  title: `${BRAND} — ${PRODUCT.brand} ${PRODUCT.name}`,
  description: `Pay for the ${PRODUCT.brand} ${PRODUCT.name} in ${PRODUCT.settlement.symbol} from an account you already hold.`,
  robots: { index: false, follow: false }
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
