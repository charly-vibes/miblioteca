import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openShelfwalkDb, saveCapture, loadCaptureRecord } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import { createCaptureRecord } from '../tracer/capture'
import { mountUploadDrainFallback } from './uploadDrainFallback'

const IMAGE_INPUT = {
  size: 4096,
  thumbnailSize: 512,
  mimeType: 'image/jpeg',
  width: 1280,
  height: 720,
  thumbnailWidth: 160,
  thumbnailHeight: 90,
  sourceApi: 'CanvasSnapshot' as const,
}

function makeRecord(recordId: string) {
  return createCaptureRecord(
    { sessionId: 'sess-1', scanId: 'scan-1', userId: 'user-1', index: 0, image: IMAGE_INPUT },
    { now: () => 1746500000000, monotonic: () => 55, generateId: () => recordId }
  )
}

let db: ShelfwalkDatabase

beforeEach(async () => {
  const dbName = `shelfwalk-fallback-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(dbName)
})

describe('mountUploadDrainFallback', () => {
  it('drains pending uploads when the window comes online', async () => {
    const record = makeRecord('rec-online')
    await saveCapture(db, {
      record,
      imageBlob: new Blob(['img']),
      thumbnailBlob: new Blob(['thumb']),
    })
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))
    const unmount = mountUploadDrainFallback({ openDb: async () => db, fetch })

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(async () => {
      expect((await loadCaptureRecord(db, 'rec-online'))?.uploadState).toBe('uploaded')
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('coalesces repeated online events into one drain', async () => {
    await saveCapture(db, {
      record: makeRecord('rec-coalesce'),
      imageBlob: new Blob(['img']),
      thumbnailBlob: new Blob(['thumb']),
    })
    let release!: () => void
    const blocked = new Promise<Response>((resolve) => {
      release = () => resolve(new Response(null, { status: 200 }))
    })
    const fetch = vi.fn(() => blocked)
    const unmount = mountUploadDrainFallback({ openDb: async () => db, fetch })

    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    release()
    await vi.waitFor(async () => {
      expect((await loadCaptureRecord(db, 'rec-coalesce'))?.uploadState).toBe('uploaded')
    })

    unmount()
  })

  it('does not crash and leaves record pending when fetch throws', async () => {
    const record = makeRecord('rec-throw')
    await saveCapture(db, {
      record,
      imageBlob: new Blob(['img']),
      thumbnailBlob: new Blob(['thumb']),
    })
    const fetch = vi.fn().mockRejectedValue(new TypeError('Network error'))
    const unmount = mountUploadDrainFallback({ openDb: async () => db, fetch })

    window.dispatchEvent(new Event('online'))
    // Wait for inFlight to settle (drain should catch and not re-throw)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    // Give the catch/.finally chain a tick to complete
    await new Promise((r) => setTimeout(r, 0))

    // Record remains pending (not uploaded)
    const loaded = await loadCaptureRecord(db, 'rec-throw')
    expect(loaded?.uploadState).not.toBe('uploaded')
    unmount()
  })

  it('removes the online listener on cleanup', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))
    const unmount = mountUploadDrainFallback({ openDb: async () => db, fetch })
    unmount()

    window.dispatchEvent(new Event('online'))
    await Promise.resolve()

    expect(fetch).not.toHaveBeenCalled()
  })
})
