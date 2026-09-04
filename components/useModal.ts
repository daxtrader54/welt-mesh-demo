'use client'

import { useEffect, useRef } from 'react'

/**
 * Focus for anything that sits on top of the page.
 *
 * Every overlay in this app had a different fraction of this and none had all of it. The bag
 * confirmation had `role="dialog"` and no Escape, with its own "View bag" button about
 * twenty-five tab stops away from where focus actually was. The pretend payment sheet and the
 * technical panel had Escape and `aria-modal="true"` but never moved focus in, which is the worse
 * combination of the two: `aria-modal` tells assistive technology to ignore everything outside the
 * dialog, so a screen reader is told to confine itself to a region the keyboard is not in.
 *
 * Four things, in the order they matter:
 *  1. Move focus in when it opens, so the keyboard is where the eyes are.
 *  2. Keep Tab inside while it is open, so the next Tab does not land on the shop behind it.
 *  3. Escape closes, everywhere, because that is what Escape does.
 *  4. Put focus back on whatever opened it, so closing does not dump the user at the top of the
 *     document with no idea where they were.
 *
 * `enabled` rather than a mounted/unmounted hook, so a surface that is always in the DOM (the
 * docked panel) can opt out without a second code path.
 */
export function useModal<T extends HTMLElement>(enabled: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  /** Whatever had focus before this opened. Where focus goes back to when it closes. */
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    const node = ref.current
    if (!node) return

    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null || el === document.activeElement)

    // The container itself if it has nothing focusable in it, so focus still lands inside rather
    // than staying on the page behind. It needs tabIndex={-1} on the element for this to take.
    const first = focusable()[0] ?? node
    first.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const items = focusable()
      if (!items.length) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (!firstItem || !lastItem) return
      const active = document.activeElement

      // Wrap at both ends. Without this, Tab off the last control walks into the shop behind an
      // overlay the user cannot see past.
      if (e.shiftKey && (active === firstItem || active === node)) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault()
        firstItem.focus()
      } else if (active instanceof HTMLElement && !node.contains(active)) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      // Only take focus back if it is still inside the thing that just closed. If something else
      // has deliberately moved it, leave it alone.
      const active = document.activeElement
      if (returnTo.current && (!active || active === document.body || node.contains(active))) {
        returnTo.current.focus()
      }
    }
  }, [enabled, onClose])

  return ref
}
