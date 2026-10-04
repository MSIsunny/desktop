/**
 * The generic build of pdf.js ships the worker as a plain ES module without
 * any type declarations. We import it purely for the side effect of
 * registering `globalThis.pdfjsWorker`, which is how pdf.js is told to run
 * its worker code on the main thread instead of spawning a nested worker
 * (the rendering process is a Node.js enabled Electron renderer, and
 * spawning a module worker from a file:// document is not reliable there).
 */
declare module 'pdfjs-dist/build/pdf.worker.mjs'

/**
 * pdf.js' type definitions reference `ImageDataArray`, which is only declared
 * by newer versions of TypeScript's DOM lib (5.9 and up) than the one this
 * project is currently built with. Remove this once TypeScript is upgraded.
 */
type ImageDataArray = Uint8ClampedArray<ArrayBuffer>
