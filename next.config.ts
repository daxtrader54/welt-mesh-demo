import type { NextConfig } from 'next'

// Mesh Link renders in an iframe from sandbox-web.meshconnect.com (production uses web.meshconnect.com),
// and pulls integration logos from file-cdn.meshconnect.com. Both have to be allowed explicitly or the
// overlay is a blank grey box with no console error.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://file-cdn.meshconnect.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.meshconnect.com",
  "frame-src https://*.meshconnect.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      }
    ]
  }
}

export default nextConfig
