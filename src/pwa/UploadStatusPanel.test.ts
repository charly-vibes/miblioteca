import { screen, within } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCaptureRecord } from '../tracer/capture'
import type { CaptureRecord } from '../tracer/capture'
import { loadCaptureRecord, openShelfwalkDb, saveCapture } from '../tracer/persistence'
import type { ShelfwalkDatabase } from '../tracer/persistence'
import { mountUploadStatusPanel } from './UploadStatusPanel'

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

function makeRecord(recordId: string, uploadState: CaptureRecord['uploadState'], uploadAttempts = 0) {
  return {
    ...createCaptureRecord(
      { sessionId: 'sess-1', scanId: 'scan-1', userId: 'user-1', index: 0, image: IMAGE_INPUT },
      { now: () => 1746500000000, monotonic: () => 55, generateId: () => recordId }
    ),
    uploadState,
    uploadAttempts,
  }
}

async function save(db: ShelfwalkDatabase, record: CaptureRecord) {
  await saveCapture(db, {
    record,
    imageBlob: new Blob([`img-${record.recordId}`]),
    thumbnailBlob: new Blob([`thumb-${record.recordId}`]),
  })
}

let db: ShelfwalkDatabase
let container: HTMLDivElement

beforeEach(async () => {
  const dbName = `shelfwalk-upload-panel-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  db = await openShelfwalkDb(dbName)
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('mountUploadStatusPanel', () => {
  it('opens from the nav and shows counts plus rejected details', async () => {
    await save(db, makeRecord('rec-pending', 'pending'))
    await save(db, makeRecord('rec-failed', 'failed', 2))
    await save(db, makeRecord('rec-rejected', 'rejected', 5))
    mountUploadStatusPanel(container, { openDb: async () => db })

    await userEvent.click(screen.getByRole('button', { name: /uploads/i }))

    const panel = await screen.findByRole('region', { name: /upload status/i })
    expect(within(panel).getByText('pending').nextElementSibling).toHaveTextContent('1')
    expect(within(panel).getByText('failed').nextElementSibling).toHaveTextContent('1')
    expect(within(panel).getByText('rejected').nextElementSibling).toHaveTextContent('1')
    expect(within(panel).getByText(/rec-rejected — 5 attempts/)).toBeInTheDocument()
  })

  it('retry button moves failed records to pending and triggers the drain loop', async () => {
    await save(db, makeRecord('rec-failed', 'failed', 2))
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))
    mountUploadStatusPanel(container, { openDb: async () => db, fetch })

    await userEvent.click(screen.getByRole('button', { name: /uploads/i }))
    await userEvent.click(await screen.findByRole('button', { name: /retry failed \(1\)/i }))

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    await vi.waitFor(async () => {
      expect((await loadCaptureRecord(db, 'rec-failed'))?.uploadState).toBe('uploaded')
    })
    expect(screen.getByRole('button', { name: /retry failed \(0\)/i })).toBeDisabled()
  })
})
