import 'pdfjs-dist/build/pdf.worker.mjs'

import { getDocument } from 'pdfjs-dist'

import { Image } from '../../../models/diff'

/**
 * The media type that `getMediaType` assigns to PDF files.
 *
 * Browsers can't render a PDF inside an `<img>` tag so instead of embedding
 * the file directly we rasterize the first page and present the result as a
 * regular PNG image, which lets PDFs flow through exactly the same image
 * diff (2-up, swipe, onion skin and difference blend) as any bitmap image.
 */
export const PDFMediaType = 'application/pdf'

/**
 * The scale we render at is chosen so that the longest edge of the resulting
 * bitmap covers roughly this many CSS pixels. Diff images are displayed at
 * most as wide as the diff panel, and the panel is never wider than the
 * window, so this is a comfortable upper bound that still keeps the bitmap
 * crisp on HiDPI displays (where `devicePixelRatio` multiplies it further).
 */
const TargetCssLongestEdge = 1200

/**
 * Never render below this scale. Single page paper figures are frequently
 * exported with a tiny page size (a 3.5 inch wide figure is only 252pt) so
 * rendering at 1:1 would produce an unusably small bitmap.
 */
const MinScale = 2

/** Never render above this scale, no matter how small the page is. */
const MaxScale = 12

/** Hard upper bound for the longest edge of the rasterized page, in pixels. */
const MaxRasterDimension = 4096

/**
 * Hard upper bound for the total number of pixels we're willing to
 * rasterize. A 4096x4096 RGBA canvas is already 64MB, and we need the canvas,
 * the encoded PNG and the data URL string to coexist for a moment, so this
 * keeps the worst case within a sane memory budget.
 */
const MaxRasterPixels = 8_000_000

/**
 * Rasterizing a page is relatively expensive so we cache the result per
 * `Image` instance. The diff view creates a new `ImageContainer` for every
 * presentation mode (2-up, swipe, …) and every switch between them, but the
 * underlying `Image` objects are stable for as long as the diff is displayed.
 */
const rasterizationCache = new WeakMap<Image, Promise<string>>()

/**
 * Rasterize the first page of the PDF held by `image` and return it as a PNG
 * data URL. Subsequent calls for the same `Image` resolve from the cache.
 */
export function rasterizePDF(image: Image): Promise<string> {
  let rasterized = rasterizationCache.get(image)

  if (rasterized === undefined) {
    rasterized = rasterizeFirstPage(image.contents)

    // Don't cache failures, a subsequent render should be able to retry.
    rasterized.catch(() => rasterizationCache.delete(image))

    rasterizationCache.set(image, rasterized)
  }

  return rasterized
}

/** Decode the base64 payload of an `Image` into a byte array. */
async function decodeBase64(contents: string): Promise<Uint8Array> {
  // `Uint8Array.fromBase64` is implemented natively by the engine. Decoding
  // the payload by hand (via `atob` and a character-by-character loop) is
  // dramatically slower and, for multi-megabyte payloads, reliably crashes
  // the renderer process, so we never do that here.
  const fromBase64 = (
    Uint8Array as unknown as {
      fromBase64?: (base64: string) => Uint8Array
    }
  ).fromBase64

  if (typeof fromBase64 === 'function') {
    return fromBase64(contents)
  }

  // Fallback for engines without `Uint8Array.fromBase64`: let the (native)
  // data URL loader do the decoding instead.
  const response = await fetch(
    `data:application/octet-stream;base64,${contents}`
  )

  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Pick the scale to rasterize at, taking the size of the page and the
 * display's pixel density into account while staying inside our memory
 * budget.
 */
function getRasterizationScale(width: number, height: number) {
  const longestEdge = Math.max(width, height)
  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1)

  const preferred = (TargetCssLongestEdge * devicePixelRatio) / longestEdge
  const desired = Math.min(Math.max(preferred, MinScale), MaxScale)

  const limit = Math.min(
    MaxRasterDimension / longestEdge,
    Math.sqrt(MaxRasterPixels / (width * height))
  )

  return Math.min(desired, limit)
}

async function rasterizeFirstPage(contents: string): Promise<string> {
  // Note that pdf.js v6 no longer supports evaluating the contents of a
  // document (ie the `isEvalSupported` option is gone) so a malicious PDF
  // cannot run any code in the context of the renderer.
  const loadingTask = getDocument({ data: await decodeBase64(contents) })

  try {
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)
    const unscaledViewport = page.getViewport({ scale: 1 })
    const scale = getRasterizationScale(
      unscaledViewport.width,
      unscaledViewport.height
    )
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))

    await page.render({ canvas, viewport }).promise

    return canvas.toDataURL('image/png')
  } finally {
    await loadingTask.destroy()
  }
}
