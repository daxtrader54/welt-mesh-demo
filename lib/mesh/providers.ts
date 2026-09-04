import { providerRank } from '@/lib/product'

/**
 * Turning two Mesh catalogues into one answer.
 *
 * Pure, and separate from the route, because the bug that lived here for two days was a wrong
 * field name — `content.integrations` on an endpoint that returns `content.items` — and a wrong
 * field name is exactly the class of defect a typecheck cannot see and a route test can.
 *
 * The two catalogues answer different questions:
 *  - `transfers/managed/integrations` is capability: who could settle this asset on this network.
 *  - `integrations` is availability: who Link will actually put in front of this client right now.
 *
 * The gap between them is the interesting part. Kraken can fund a USDC payment on Ethereum and
 * still never appear in the sandbox picker.
 */

export type MeshIntegration = {
  id: string
  name?: string
  type: string
  supportsOutgoingTransfers?: boolean
  networks?: { id: string; name?: string; chainId?: string; supportedTokens?: string[] }[]
}

export type OfferedIntegration = { id: string; name?: string; type?: string }

export type Provider = {
  id: string
  name: string
  type: string
  canPay: boolean
  sandboxAvailable: boolean
  reason: string | null
  networks: string[]
}

export function mapProviders(
  capable: MeshIntegration[],
  offered: OfferedIntegration[],
  settlement: { networkId: string; symbol: string; network: string }
): Provider[] {
  /**
   * Keyed on `type`, not `name`. The catalogue carries `coinbase`, `coinbaseRamp` and
   * `sandboxCoinbase`, all named "Coinbase", and only the last has a test account. Matching on the
   * name marks all three available and tells a merchant the production OAuth flow is usable in a
   * sandbox.
   */
  const offeredTypes = new Set(offered.map(i => (i.type ?? '').toLowerCase()).filter(Boolean))

  return capable
    .map(i => {
      const network = i.networks?.find(n => n.id === settlement.networkId)
      const canPay = Boolean(
        i.supportsOutgoingTransfers && network?.supportedTokens?.includes(settlement.symbol)
      )
      return {
        id: i.id,
        name: i.name ?? i.type,
        type: i.type,
        canPay,
        sandboxAvailable: offeredTypes.has(i.type.toLowerCase()),
        reason: canPay
          ? null
          : network
            ? `no ${settlement.symbol} on this network`
            : `testnet only in sandbox, no ${settlement.network} route`,
        networks: (i.networks ?? []).map(n => n.name).filter((n): n is string => Boolean(n))
      }
    })
    .sort(
      (a, b) =>
        Number(b.canPay && b.sandboxAvailable) - Number(a.canPay && a.sandboxAvailable) ||
        Number(b.canPay) - Number(a.canPay) ||
        // The merchant's ranking before the alphabet. Alphabetical alone put Binance above
        // Coinbase, which then became the provider the checkout deep-linked to.
        providerRank(a.name) - providerRank(b.name) ||
        a.name.localeCompare(b.name)
    )
}

/**
 * Which provider the checkout should open Link on.
 *
 * Mesh's picker is the whole catalogue, and that is right for the breadth argument and wrong as a
 * default: a shopper who does not own crypto reads a list containing MetaMask and self-custody
 * wallets as a question they cannot answer. A tester did exactly that.
 *
 * So the merchant picks a default and the catalogue stays one click away. "Usable here" is the
 * only rule: can settle the merchant's asset on the merchant's network, and Link will actually
 * offer it. Nothing is hardcoded, so this follows the catalogue rather than a name in the source.
 */
export function suggestProvider(providers: Provider[]): { id: string; name: string } | null {
  const best = providers.find(p => p.canPay && p.sandboxAvailable)
  return best ? { id: best.id, name: best.name } : null
}
