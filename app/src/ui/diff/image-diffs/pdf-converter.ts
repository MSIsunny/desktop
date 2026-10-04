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
 * The scale (in CSS pixels, ie 1 = 72dpi) we aim to rasterize at. Papers
 * typically contain vector artwork so rendering at 2x gives a reasonably
 * crisp result without producing an unreasonably large bitmap.
 */
const RasterizationScale = 2

/**
 * A hard upper bound for the longest edge of the rasterized page. Some PDFs
 * have huge page sizes (posters, plans etc) and we don't want to allocate a
 * gigapixel canvas for those, so we scale those down.
 */
const MaxRasterDimension = 4000

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
function decodeBase64(contents: string): Uint8Array {
  const binary = atob(contents)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

async function rasterizeFirstPage(contents: string): Promise<string> {
  // Note that pdf.js v6 no longer supports evaluating the contents of a
  // document (ie the `isEvalSupported` option is gone) so a malicious PDF
  // cannot run any code in the context of the renderer.
  const loadingTask = getDocument({ data: decodeBase64(contents) })

  try {
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)
    const unscaledViewport = page.getViewport({ scale: 1 })

    const longestEdge = Math.max(
      unscaledViewport.width,
      unscaledViewport.height
    )

    const scale = Math.min(RasterizationScale, MaxRasterDimension / longestEdge)

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
