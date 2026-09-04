import { fail, guard, ok } from '@/lib/http'
import { listTransfers } from '@/lib/mesh/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Mesh's own record of every transfer it has made for this client.
 *
 * The question this answers is the one a merchant asks after the demo rather than during it: how do
 * I see what actually moved. Not from the browser, which has closed, and not from our own order
 * store, which only knows what it was told. This is Mesh's ledger, read with the client credentials.
 *
 * It also settles what a sandbox transfer is. The hashes look like chain hashes and Mesh even
 * returns an `infoUrl` pointing at Etherscan, but none of them resolve: checked against Ethereum
 * mainnet, Sepolia, Base, Base Sepolia and Polygon. They are references into this ledger, and this
 * is where the record actually lives.
 *
 * Client-scoped, so it deliberately does not take a session: it lists this integration's transfers,
 * not one shopper's. That is fine for a demo panel and would be wrong in a real shop, which is said
 * out loud in the panel rather than left for someone to discover.
 */
export async function GET() {
  return guard(async () => {
    const res = await listTransfers(25)
    if (!res.ok) return fail(res.error, 502)
    return ok({ transfers: res.data.items, total: res.data.total, ms: res.ms })
  })
}
