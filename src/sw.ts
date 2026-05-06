import { precacheAndRoute } from 'workbox-precaching'
import { openShelfwalkDb } from './tracer/persistence'
import { drainUploadQueue } from './tracer/uploadQueue'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

interface SyncEvent extends ExtendableEvent {
  readonly tag: string
}

self.addEventListener('sync', (event) => {
  const e = event as unknown as SyncEvent
  if (e.tag === 'upload-pending') {
    e.waitUntil(drainServiceWorkerUploadQueue())
  }
})

async function drainServiceWorkerUploadQueue(): Promise<void> {
  const db = await openShelfwalkDb()
  await drainUploadQueue({
    db,
    fetch: (input, init) => globalThis.fetch(input, init),
    onRecordError: (record) => {
      console.warn('[sw] upload failed for', record.recordId, '— will retry on next sync')
    },
  })

  const clients = await self.clients.matchAll({ type: 'window' })
  for (const client of clients) {
    client.postMessage({ type: 'sync-complete' })
  }
}
