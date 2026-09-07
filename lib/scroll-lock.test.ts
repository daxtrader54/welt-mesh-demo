import { describe, expect, it } from 'vitest'
import { createScrollLock } from './scroll-lock'

/**
 * A fake style property. The point of injecting the reads and writes is that this file needs no
 * DOM, so the behaviour that actually strands a page is covered by the same fast suite as
 * everything else.
 */
function styleSpy(initial = '') {
  let value = initial
  return {
    read: () => value,
    write: (v: string) => {
      value = v
    },
    get current() {
      return value
    }
  }
}

describe('createScrollLock', () => {
  it('locks and restores for a single overlay', () => {
    const style = styleSpy()
    const lock = createScrollLock(style.read, style.write)

    lock.lock()
    expect(style.current).toBe('hidden')
    lock.unlock()
    expect(style.current).toBe('')
  })

  it('keeps whatever the page had before, rather than assuming empty', () => {
    const style = styleSpy('scroll')
    const lock = createScrollLock(style.read, style.write)

    lock.lock()
    lock.unlock()
    expect(style.current).toBe('scroll')
  })

  /**
   * The regression this module exists for. Two overlaps, closed in either order, used to leave the
   * page locked forever because the second one saved the value the first one had set.
   */
  it('survives two overlapping overlays closing in order', () => {
    const style = styleSpy()
    const lock = createScrollLock(style.read, style.write)

    lock.lock()
    lock.lock()
    expect(style.current).toBe('hidden')

    lock.unlock()
    // Still one holder, so the page stays held.
    expect(style.current).toBe('hidden')

    lock.unlock()
    expect(style.current).toBe('')
  })

  it('survives three overlapping overlays closing in reverse order', () => {
    const style = styleSpy()
    const lock = createScrollLock(style.read, style.write)

    lock.lock()
    lock.lock()
    lock.lock()
    expect(lock.depth).toBe(3)

    lock.unlock()
    lock.unlock()
    expect(style.current).toBe('hidden')

    lock.unlock()
    expect(style.current).toBe('')
    expect(lock.depth).toBe(0)
  })

  /**
   * A double cleanup elsewhere must not push the count negative, or the next genuine lock never
   * gets back to zero and the page is stranded the other way round.
   */
  it('ignores an unlock when nothing is held', () => {
    const style = styleSpy('auto')
    const lock = createScrollLock(style.read, style.write)

    lock.unlock()
    lock.unlock()
    expect(lock.depth).toBe(0)
    expect(style.current).toBe('auto')

    lock.lock()
    expect(style.current).toBe('hidden')
    lock.unlock()
    expect(style.current).toBe('auto')
  })

  it('reads the original again on a second, separate lock', () => {
    const style = styleSpy('')
    const lock = createScrollLock(style.read, style.write)

    lock.lock()
    lock.unlock()

    style.write('clip')
    lock.lock()
    expect(style.current).toBe('hidden')
    lock.unlock()
    expect(style.current).toBe('clip')
  })
})
