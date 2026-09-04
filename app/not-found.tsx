import { BRAND, PRODUCT } from '@/lib/product'

/**
 * The shop is a single route with internal steps, so every path someone might reasonably type or
 * be read over a call — /checkout, /bag, /product — lands here. Without this it was Next's stock
 * black-and-white 404, which is the one screen in the build that looked like a developer test.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-6">
      <span className="text-xl font-extrabold tracking-[0.2em]">{BRAND}</span>

      <div className="rule-t mt-8 pt-8">
        <p className="label mb-2">404</p>
        <h1 className="text-[2rem] font-bold leading-[1.05] tracking-[-0.02em]">
          There is nothing at this address.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This shop is one page. The {PRODUCT.brand} {PRODUCT.name} lives at the front of it, in four
          colourways, and the checkout is a few clicks further on.
        </p>

        <a href="/" className="btn-primary mt-7 inline-block px-6 py-3.5 text-sm">
          Back to the shop
        </a>
      </div>
    </main>
  )
}
