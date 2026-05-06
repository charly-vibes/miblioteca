import { openShelfwalkDb } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import { drainUploadQueue } from '../tracer/uploadQueue'

export type UploadDrainFallbackDeps = {
  openDb?: () => Promise<ShelfwalkDatabase>
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
  window?: Window
}

export function mountUploadDrainFallback({
  openDb = () => openShelfwalkDb(),
  fetch = (input, init) => globalThis.fetch(input, init),
  window: targetWindow = globalThis.window,
}: UploadDrainFallbackDeps = {}): () => void {
  let inFlight: Promise<unknown> | null = null

  const runDrain = () => {
    if (inFlight) return
    inFlight = openDb()
      .then((db) => drainUploadQueue({ db, fetch }))
      .catch((error) => {
        console.warn('[pwa] online upload drain failed', error)
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
