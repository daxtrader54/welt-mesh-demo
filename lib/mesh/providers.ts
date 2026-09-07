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

export type OfferedIntegration = {
  id: string
  name?: string
  type?: string
  /** Mesh ships a brand palette per integration, light and dark. We are a light-only shop. */
  style?: {
    buttonPrimaryLight?: string
    buttonHoverLight?: string
    buttonTextLight?: string
  } | null
  logo?: { iconColorUrl?: string } | null
}

/**
 * A broker's own colours, for the button that hands the shopper over to it.
 *
 * Mesh publishes this in the availability catalogue and it is easy to miss, because the response
 * is usually read for `type` and thrown away. Using it means the button a shopper presses and the
 * screen it opens are the same colour, which is the whole point: the handoff stops looking like a
 * page break.
 */
export type BrokerBrand = {
  button: string
  hover: string
  text: string
  /** Square mark. Served from file-cdn.meshconnect.com, which the CSP already allows. */
  icon: string | null
}

export type Provider = {
  id: string
  name: string
  type: string
  canPay: boolean
  sandboxAvailable: boolean
  reason: string | null
  networks: string[]
  /** Null unless Mesh published a usable palette for this integration. */
  brand: BrokerBrand | null
}

/**
 * These strings come from Mesh and end up in a `style` attribute, so they are checked rather
 * than trusted. A colour is three to eight hex digits and nothing else; an icon has to be on
 * Mesh's own CDN. The CSP would block a foreign image anyway, but a blocked image renders as a
 * broken one, and validating here means we simply do not ask for it.
 */
const HEX = /^#[0-9a-f]{3,8}$/i
const ICON_HOST = 'https://file-cdn.meshconnect.com/'

/**
 * Find the catalogue row a provider's colours belong to, on type *and* name.
 *
 * This looks like it contradicts the rule above, and it does not: that rule is about availability,
 * where three rows named "Coinbase" have different types and only one has a test account. Identity
 * runs the other way here. MetaMask, Phantom and Rainbow are all typed `deFiWallet` with three
 * different palettes, so type alone picks whichever happened to be last and paints MetaMask in
 * Rainbow's purple. Availability is decided by type; a brand needs both.
 */
function offeredRowFor(
  integration: { type: string; name?: string },
  offered: OfferedIntegration[]
): OfferedIntegration | undefined {
  const sameType = offered.filter(o => (o.type ?? '').toLowerCase() === integration.type.toLowerCase())
  if (sameType.length <= 1) return sameType[0]
  return sameType.find(o => o.name && o.name === integration.name)
}

function brandOf(offered: OfferedIntegration | undefined): BrokerBrand | null {
  const style = offered?.style
  const button = style?.buttonPrimaryLight
  const text = style?.buttonTextLight
  // Both halves or neither. A fill with no legible foreground is worse than the house accent.
  if (!button || !text || !HEX.test(button) || !HEX.test(text)) return null

  const hover = style?.buttonHoverLight
  const icon = offered?.logo?.iconColorUrl
  return {
    button,
    text,
    hover: hover && HEX.test(hover) ? hover : button,
    icon: icon && icon.startsWith(ICON_HOST) ? icon : null
  }
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
        networks: (i.networks ?? []).map(n => n.name).filter((n): n is string => Boolean(n)),
        brand: brandOf(offeredRowFor(i, offered))
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
export function suggestProvider(
  providers: Provider[]
): { id: string; name: string; brand: BrokerBrand | null } | null {
  const best = providers.find(p => p.canPay && p.sandboxAvailable)
  return best ? { id: best.id, name: best.name, brand: best.brand } : null
}

/**
 * Brands keyed by broker type, so the checkout can colour the button for the account the shopper
 * already connected rather than only for the one we suggested. `Connection.brokerType` is all we
 * get back from Mesh on a connection, so it is the only key available here.
 *
 * Which means a type shared by several brands cannot be answered. `deFiWallet` covers MetaMask,
 * Phantom and Rainbow, and a connection to it says nothing about which. Guessing paints the wrong
 * logo on the button, so an ambiguous type is dropped and the house accent stands in. Colouring
 * some buttons and not others is fine; colouring one of them wrongly is not.
 */
export function brandsByType(providers: Provider[]): Record<string, BrokerBrand> {
  const out: Record<string, BrokerBrand> = {}
  const ambiguous = new Set<string>()

  for (const p of providers) {
    if (!p.brand) continue
    const seen = out[p.type]
    if (seen && seen.button !== p.brand.button) ambiguous.add(p.type)
    out[p.type] = p.brand
  }

  for (const type of ambiguous) delete out[type]
  return out
}

/**
 * Whether a connection is a wallet the customer holds themselves.
 *
 * Worth knowing because it changes what a failure means. An exchange account with nothing eligible
 * is an empty or wrongly-funded account, and trying a different one is fair advice. A self-custody
 * wallet in this sandbox can never settle here however it is funded: Mesh offers MetaMask, Phantom
 * and Rainbow on Sepolia and Base Sepolia only, and this merchant collects on Ethereum mainnet. The
 * two produce the same empty result and deserve different words.
 *
 * Matched on the broker types Mesh uses for wallets rather than on names, since all three wallets
 * report the same `deFiWallet` type and the list of names will grow.
 */
const SELF_CUSTODY = new Set(['defiwallet', 'cryptocurrencyaddress', 'cryptocurrencywallet'])

export function isSelfCustody(brokerType: string | null | undefined): boolean {
  return SELF_CUSTODY.has((brokerType ?? '').toLowerCase())
}
