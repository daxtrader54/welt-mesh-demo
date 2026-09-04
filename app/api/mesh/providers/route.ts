import { meshEnv } from '@/lib/env'
import { guard, ok } from '@/lib/http'
import { PRODUCT } from '@/lib/product'
import {
  mapProviders,
  suggestProvider,
  type MeshIntegration,
  type OfferedIntegration
} from '@/lib/mesh/providers'

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
      ? ((await offered.json()) as { content?: { items?: OfferedIntegration[] } })
      : null

    const providers = mapProviders(
      integrations,
      offeredJson?.content?.items ?? [],
      {
        networkId: env.merchantNetworkId,
        symbol: PRODUCT.settlement.symbol,
        network: PRODUCT.settlement.network
      }
    )

    /**
     * Who the checkout should open Link on by default.
     *
     * mapProviders already sorts usable-here first, so this is the top of the list. It matters
     * because Mesh's picker is the whole catalogue, and a shopper who does not hold crypto reads a
     * list containing MetaMask and self-custody wallets as a question they cannot answer. A tester
     * did exactly that. The merchant picks a sensible default; the catalogue stays one click away.
     */
    return ok({
      providers,
      suggested: suggestProvider(providers),
      eligible: providers.filter(p => p.canPay).length,
      total: providers.length,
      asset: PRODUCT.settlement.symbol,
      network: PRODUCT.settlement.network
    })
  })
}
