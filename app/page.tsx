import { Shop } from '@/components/Shop'

export const dynamic = 'force-dynamic'

/**
 * The technical panel is docked and open by default on a wide screen, because it is the point of
 * the build. `?demo=0` starts it collapsed for anyone who wants to see only the shop. Either way
 * it can be collapsed and reopened from the console bar, and neither changes how the integration
 * behaves or mocks anything.
 */
export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const closed = params.demo === '0' || params.demo === 'false'
  return <Shop closedByDefault={closed} />
}
