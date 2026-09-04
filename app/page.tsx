import { Shop } from '@/components/Shop'

export const dynamic = 'force-dynamic'

/**
 * The shop opens as a shop. The technical panel starts collapsed and is opened from the bar along
 * the bottom or the handle on the right edge; `?demo=1` starts it docked for presenting. Neither
 * changes how the integration behaves and neither mocks anything.
 */
export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const openPanel = params.demo === '1' || params.demo === 'true'
  return <Shop panelOpenByDefault={openPanel} />
}
