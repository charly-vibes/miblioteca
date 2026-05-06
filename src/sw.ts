import { precacheAndRoute } from 'workbox-precaching'
import {
  getRecordsByUploadState,
  loadBlob,
  loadThumbnail,
  openShelfwalkDb,
  updateUploadState,
} from './tracer/persistence'
import { uploadCapture } from './tracer/upload'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

interface SyncEvent extends ExtendableEvent {
  readonly tag: string
}

self.addEventListener('sync', (event) => {
  const e = event as unknown as SyncEvent
  if (e.tag === 'upload-pending') {
    e.waitUntil(drainUploadQueue())
  }
})

async function drainUploadQueue(): Promise<void> {
  const db = await openShelfwalkDb()

  // Records stuck as 'uploading' from a previous crashed session — reset so they retry
  const stuck = await getRecordsByUploadState(db, 'uploading')
  for (const r of stuck) {
    await updateUploadState(db, r.recordId, 'failed')
  }

  const toUpload = [
    ...(await getRecordsByUploadState(db, 'pending')),
    ...(await getRecordsByUploadState(db, 'failed')),
  ]

  for (const record of toUpload) {
    const imageBlob = await loadBlob(db, record.recordId)
    const thumbnailBlob = await loadThumbnail(db, record.recordId)
    if (!imageBlob || !thumbnailBlob) continue
    try {
      await uploadCapture(record, imageBlob, thumbnailBlob, {
        fetch: (input, init) => globalThis.fetch(input, init),
        db,
      })
    } catch {
      console.warn('[sw] upload failed for', record.recordId, '— will retry on next sync')
    }
  }

  const clients = await self.clients.matchAll({ type: 'window' })
  for (const client of clients) {
    client.postMessage({ type: 'sync-complete' })
  }
}
