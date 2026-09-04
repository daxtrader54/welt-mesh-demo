'use client'

import { useEffect, useState } from 'react'
import { PRODUCT } from '@/lib/product'

/**
 * One line about where the money can come from, under the pay button.
 *
 * An earlier pass turned this into a grid of provider buttons and it was the wrong call: it read
 * as a half-built form, it buried the action, and it duplicated a picker Mesh already does well.
 * Mesh owns the choosing. The merchant's job is to say, before you commit, that this is not a
 * one-exchange checkout.
 *
 * Still live from the catalogue, still checked against the merchant's own asset and network.
 * Nothing here is hardcoded.
 */

export type Provider = {
  id: string
  name: string
  type: string
  canPay: boolean
  sandboxAvailable: boolean
  reason: string | null
}

export function FundingNote() {
  const [providers, setProviders] = useState<Provider[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/mesh/providers')
      .then(r => r.json())
      .then(j => !cancelled && setProviders(j.providers ?? []))
      .catch(() => !cancelled && setProviders([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (!providers?.length) return null

  // Split by what Link will actually offer here, not just by what could settle the payment in
  // principle. Promising Kraken on a screen whose next step cannot show Kraken is worse than a
  // shorter list.
  const here = unique(providers.filter(p => p.canPay && p.sandboxAvailable).map(p => p.name))
  /**
   * Deduplicated across the buckets, not just within them.
   *
   * Coinbase and Binance each appear in the catalogue as several integration types, some sandbox
   * and some not, so they landed in both lists and the sentence read "Coinbase and Binance can
   * fund this payment. Coinbase, Binance, Kraken, Robinhood, CashApp and Uphold can too, in
   * production." Two brands, two verdicts, one after the other.
   */
  const elsewhere = unique(
    providers.filter(p => p.canPay && !p.sandboxAvailable).map(p => p.name)
  ).filter(name => !here.includes(name))
  const wallets = unique(providers.filter(p => p.sandboxAvailable && !p.canPay).map(p => p.name))

  if (!here.length && !elsewhere.length) return null

  return (
    <p className="note">
      {here.length > 0 && (
        <>
          {list(here)} can fund this payment in {PRODUCT.settlement.symbol} on{' '}
          {PRODUCT.settlement.network}.{' '}
        </>
      )}
      {elsewhere.length > 0 && <>{list(elsewhere)} can too, on a live account. </>}
      {wallets.length > 0 && (
        <>
          {list(wallets)} will connect but hold testnet assets only in the sandbox, so they cannot
          reach it.
        </>
      )}
    </p>
  )
}

/** Coinbase appears three times in the catalogue as different integration types. In prose, once. */
function unique(names: string[]): string[] {
  return [...new Set(names)]
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
