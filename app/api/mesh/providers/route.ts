import { meshEnv } from '@/lib/env'
import { guard, ok } from '@/lib/http'
import { PRODUCT } from '@/lib/product'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Who could actually pay this merchant.
 *
 * The technical view uses this to answer "what would it take to accept Kraken too" with data
 * rather than a claim: nothing, because Mesh already matches the shopper's holdings against the
 * asset and network the merchant configured. Providers that cannot reach USDC on Ethereum are
 * returned too, marked, because the honest version of the breadth argument includes its edges.
 */


type MeshIntegration = {
  id: string
  name?: string
  type: string
  supportsOutgoingTransfers?: boolean
  networks?: { id: string; name?: string; chainId?: string; supportedTokens?: string[] }[]
}

export async function GET() {
  return guard(async () => {
    const env = meshEnv()
    const headers = { 'X-Client-Id': env.clientId, 'X-Client-Secret': env.apiKey }
    const next = { revalidate: 3600 }

    /**
     * Two catalogues, two different questions, and the gap between them is the interesting part.
     *
     * `transfers/managed/integrations` is capability: who could settle USDC on Ethereum at all.
     * `integrations` is availability: who Link will actually offer this client right now. In
     * sandbox that second list is five entries, which is why Kraken can fund this payment in
     * principle and still not appear in the picker.
     */
    const [capable, offered] = await Promise.all([
      fetch(`${env.baseUrl}/api/v1/transfers/managed/integrations`, { headers, next }),
      fetch(`${env.baseUrl}/api/v1/integrations`, { headers, next })
    ])

    if (!capable.ok) return ok({ providers: [], eligible: 0, total: 0 })

    const json = (await capable.json()) as { content?: { integrations?: MeshIntegration[] } }
    const integrations = json.content?.integrations ?? []

    /**
     * This endpoint returns its list under `content.items`, unlike `transfers/managed/integrations`
     * which uses `content.integrations`. Reading the wrong key silently produced an empty set, so
     * every provider read as unavailable and the panel labelled sandbox Coinbase "production only".
     *
     * Matched on `type`, not `name`: three entries share the name "Coinbase" and only
     * `sandboxCoinbase` is the one with a test account.
     */
    const offeredJson = offered.ok
      ? ((await offered.json()) as { content?: { items?: { id: string; name?: string; type?: string }[] } })
      : null
    const offeredTypes = new Set(
      (offeredJson?.content?.items ?? []).map(i => (i.type ?? '').toLowerCase()).filter(Boolean)
    )

    const providers = integrations.map(i => {
      const network = i.networks?.find(n => n.id === env.merchantNetworkId)
      const canPay = Boolean(
        i.supportsOutgoingTransfers && network?.supportedTokens?.includes(PRODUCT.settlement.symbol)
      )
      return {
        id: i.id,
        name: i.name ?? i.type,
        // The catalogue holds several variants per brand: Coinbase appears as `coinbase`,
        // `coinbaseRamp` and `sandboxCoinbase`, which is why the same name shows up more than
        // once. The type is what tells them apart, so it is always displayed alongside.
        type: i.type,
        canPay,
        // Whether Link will actually put this in front of the shopper on this environment.
        sandboxAvailable: offeredTypes.has(i.type.toLowerCase()),
        // Why not, in the provider's own terms. Self-custody wallets are testnet-only in sandbox.
        reason: canPay
          ? null
          : network
            ? `no ${PRODUCT.settlement.symbol} on this network`
            : `testnet only in sandbox, no ${PRODUCT.settlement.network} route`,
        networks: i.networks?.map(n => n.name).filter(Boolean) ?? []
      }
    })

    return ok({
      providers: providers.sort(
        (a, b) =>
          Number(b.canPay && b.sandboxAvailable) - Number(a.canPay && a.sandboxAvailable) ||
          Number(b.canPay) - Number(a.canPay) ||
          a.name.localeCompare(b.name)
      ),
      eligible: providers.filter(p => p.canPay).length,
      total: providers.length,
      asset: PRODUCT.settlement.symbol,
      network: PRODUCT.settlement.network
    })
  })
}
