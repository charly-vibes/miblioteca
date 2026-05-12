import { openShelfwalkDb } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import { drainUploadQueue } from '../tracer/uploadQueue'
import { debugLogger } from '../debug/logger'

export type UploadDrainFallbackDeps = {
  openDb?: () => Promise<ShelfwalkDatabase>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
  window?: Window
  logger?: { log(...args: unknown[]): void }
}

export function mountUploadDrainFallback({
  openDb = () => openShelfwalkDb(),
  fetch = (input, init) => globalThis.fetch(input, init),
  window: targetWindow = globalThis.window,
  logger = debugLogger,
}: UploadDrainFallbackDeps = {}): () => void {
  let inFlight: Promise<unknown> | null = null

  const runDrain = () => {
    if (inFlight) return
    inFlight = openDb()
      .then((db) => drainUploadQueue({ db, fetch }))
      .catch((error: unknown) => {
        logger.log('pwa:drain-failed', { message: error instanceof Error ? error.message : String(error) })
      })
      .finally(() => {
        inFlight = null
      })
  }

  targetWindow.addEventListener('online', runDrain)

  return () => {
    targetWindow.removeEventListener('online', runDrain)
  }
}
