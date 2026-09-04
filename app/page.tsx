import { Shop } from '@/components/Shop'

export const dynamic = 'force-dynamic'

/**
 * `?demo=1` docks the technical panel and reveals the reset controls, for showing this on a
 * laptop. It changes nothing about how the integration behaves and mocks nothing.
 */
export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const demo = params.demo === '1' || params.demo === 'true'
  return <Shop demoMode={demo} />
}
