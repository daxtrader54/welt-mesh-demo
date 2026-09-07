/**
 * Holding the page still under an overlay, counted rather than saved per overlay.
 *
 * The obvious version saves `body.style.overflow` when a dialog opens and puts it back when it
 * closes. That is correct for one dialog and wrong for two. The second to open saves the value the
 * first one set, which is `hidden`, and restores `hidden` on the way out. The page is then locked
 * with nothing on screen to explain it, and the only way back is a reload.
 *
 * It is a nasty one to catch because it needs two surfaces and a particular closing order, so it
 * survives every single-dialog test and then strands someone mid-demo. Three overlays can be up at
 * once here: the added-to-bag sheet, the pretend payment sheet and the technical panel.
 *
 * Counting fixes it: read the original once on the way in, write it back once on the way out,
 * whatever order things close in. The reads and writes are injected so the logic can be tested
 * without a DOM, which is the whole reason this is in `lib` and not in the hook.
 */
export type ScrollLock = {
  lock: () => void
  unlock: () => void
  /** How many overlays currently hold the lock. Exposed for tests and diagnostics. */
  readonly depth: number
}

export function createScrollLock(read: () => string, write: (value: string) => void): ScrollLock {
  let depth = 0
  let before = ''

  return {
    lock() {
      // Read the original only on the outermost lock. Anything deeper would read `hidden`, which
      // is the bug this exists to prevent.
      if (depth === 0) {
        before = read()
        write('hidden')
      }
      depth += 1
    },
    unlock() {
      // Floored at zero. An unlock with nothing held is a symptom of a double cleanup somewhere
      // else, and going negative would mean the next real lock never restores anything.
      if (depth === 0) return
      depth -= 1
      if (depth === 0) write(before)
    },
    get depth() {
      return depth
    }
  }
}
