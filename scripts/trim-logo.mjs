#!/usr/bin/env node
/**
 * Trim the supplied square logos down to the wordmark inside them.
 *
 * `welt-logo.png` and `welt-logo-light.png` are 512x512 with the wordmark floating in a large
 * field of flat colour. Rendered in a header at `h-8` that padding survives into the layout, so the
 * wordmark itself lands at about a third of the height it should be, and no amount of CSS cropping
 * fixes it without hardcoding percentages that break the moment the asset is redrawn.
 *
 * So the crop is done once, here, against the actual pixels: find the bounding box of everything
 * that is not the background colour, add a small even margin, and write a trimmed file beside the
 * original. Same approach as crop-product-images.mjs, and the same reason.
 *
 *   node scripts/trim-logo.mjs
 */

import sharp from 'sharp'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand')

/** Bounding box of every pixel that differs from the corner colour by more than a hair. */
async function contentBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const bg = [data[0], data[1], data[2]]
  let top = height, left = width, right = -1, bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const differs =
        Math.abs(data[i] - bg[0]) > 12 ||
        Math.abs(data[i + 1] - bg[1]) > 12 ||
        Math.abs(data[i + 2] - bg[2]) > 12
      if (!differs) continue
      if (y < top) top = y
      if (y > bottom) bottom = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

for (const name of ['welt-logo.png', 'welt-logo-light.png']) {
  const src = path.join(dir, name)
  const box = await contentBox(src)
  if (!box) {
    console.log(`${name}: nothing but background, skipped`)
    continue
  }
  // A little air, clamped so a mark that already touches an edge does not overflow.
  const pad = Math.round(box.height * 0.12)
  const meta = await sharp(src).metadata()
  const region = {
    left: Math.max(0, box.left - pad),
    top: Math.max(0, box.top - pad),
    width: Math.min(meta.width - Math.max(0, box.left - pad), box.width + pad * 2),
    height: Math.min(meta.height - Math.max(0, box.top - pad), box.height + pad * 2)
  }
  const out = src.replace('.png', '-trimmed.png')
  await sharp(src).extract(region).toFile(out)
  console.log(`${name}: ${meta.width}x${meta.height} -> ${region.width}x${region.height}`)
}
