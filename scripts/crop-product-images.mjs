#!/usr/bin/env node
/**
 * Re-frame the product photographs so the shoe is the same size in every view.
 *
 * The supplied 800x800 frames put the shoe in a different place per view: the lateral and medial
 * shots sit in a middle band with roughly 45% of the height empty above them, the top-down fills
 * the height but only 36% of the width, and the outsole occupies about 37% of the height. With
 * `object-contain` all of that empty space survives into the layout, so the hero rendered at about
 * a third of its plate and jumped roughly 2x in scale as you clicked through the thumbnail strip.
 *
 * This trims each image to its own content and re-pads it with a small uniform margin, nothing
 * more. Forcing every view into one frame shape was tried and made the tall views worse: padding
 * the top-down out to a landscape frame drops its fill from 37% to 20%. Cropping tight and letting
 * a fixed container letterbox each view is better on every plate at once.
 *
 * The four colourways agree with each other to within 3%, so one frame per plate covers all four
 * and they stay registered as you switch colour.
 *
 *   node scripts/crop-product-images.mjs            # writes public/product
 *   node scripts/crop-product-images.mjs --check    # reports what it would do, writes nothing
 *
 * Source of truth is public/product-src. The script is idempotent: it always reads the originals,
 * so it can be re-run after a tweak without compounding crops.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(root, 'public', 'product-src')
const OUT = path.join(root, 'public', 'product')
const check = process.argv.includes('--check')

/** Padding around the trimmed shoe, as a fraction of the longest side. Keeps it off the border. */
const MARGIN = 0.05
/** White, matching the drawing plate the images sit on. */
const BG = { r: 255, g: 255, b: 255, alpha: 1 }

async function contentBox(file) {
  const img = sharp(file)
  const { width, height } = await img.metadata()
  // Trim against the white background, then read back what was removed.
  const { info } = await img
    .trim({ background: '#ffffff', threshold: 12 })
    .toBuffer({ resolveWithObject: true })
  return {
    width,
    height,
    left: -info.trimOffsetLeft,
    top: -info.trimOffsetTop,
    w: info.width,
    h: info.height
  }
}

const colourways = (await readdir(SRC, { withFileTypes: true }))
  .filter(d => d.isDirectory())
  .map(d => d.name)

if (!colourways.length) {
  console.error(`No colourways in ${SRC}. Expected public/product-src/<colourway>/<plate>.webp`)
  process.exit(1)
}

const plates = (await readdir(path.join(SRC, colourways[0])))
  .filter(f => f.endsWith('.webp'))
  .map(f => path.basename(f, '.webp'))

console.log(`${colourways.length} colourways x ${plates.length} plates\n`)

for (const plate of plates) {
  // One frame per plate, sized to the largest content box across the four colourways, so the same
  // shoe is the same size whichever colour is selected.
  const boxes = []
  for (const c of colourways) {
    boxes.push({ c, ...(await contentBox(path.join(SRC, c, `${plate}.webp`))) })
  }

  const maxW = Math.max(...boxes.map(b => b.w))
  const maxH = Math.max(...boxes.map(b => b.h))
  const pad = Math.round(Math.max(maxW, maxH) * MARGIN)
  const frameW = maxW + pad * 2
  const frameH = maxH + pad * 2

  const before = boxes[0]
  console.log(
    `${plate.padEnd(9)} content ${String(before.w).padStart(3)}x${String(before.h).padStart(3)}` +
      ` in ${before.width}x${before.height}` +
      `  ->  frame ${frameW}x${frameH}` +
      `  (fill ${Math.round((before.w * before.h * 100) / (frameW * frameH))}%` +
      ` was ${Math.round((before.w * before.h * 100) / (before.width * before.height))}%)`
  )

  if (check) continue

  for (const b of boxes) {
    const out = path.join(OUT, b.c, `${plate}.webp`)
    await mkdir(path.dirname(out), { recursive: true })
    const buf = await sharp(path.join(SRC, b.c, `${plate}.webp`))
      .extract({ left: b.left, top: b.top, width: b.w, height: b.h })
      .extend({
        top: Math.round((frameH - b.h) / 2),
        bottom: frameH - b.h - Math.round((frameH - b.h) / 2),
        left: Math.round((frameW - b.w) / 2),
        right: frameW - b.w - Math.round((frameW - b.w) / 2),
        background: BG
      })
      .webp({ quality: 88 })
      .toBuffer()
    await writeFile(out, buf)
  }
}

if (check) {
  console.log('\n--check: nothing written.')
} else {
  const total = (
    await Promise.all(
      colourways.flatMap(c =>
        plates.map(async p => (await readFile(path.join(OUT, c, `${p}.webp`))).length)
      )
    )
  ).reduce((a, b) => a + b, 0)
  console.log(`\nWrote ${colourways.length * plates.length} files, ${Math.round(total / 1024)}KB total.`)
}

if (!existsSync(path.join(OUT, colourways[0], `${plates[0]}.webp`))) {
  console.error('Output missing. Check permissions on public/product.')
  process.exit(1)
}
