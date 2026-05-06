import type { CaptureRecord } from './capture'
import { updateUploadState } from './persistence'

export type UploadCaptureDeps = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
  db: IDBDatabase
}

type UploadResult = {
  uploadState: 'uploaded' | 'failed'
}

export async function uploadCapture(
  record: CaptureRecord,
  imageBlob: Blob,
  thumbnailBlob: Blob,
  deps: UploadCaptureDeps
): Promise<UploadResult> {
  const body = new FormData()
  body.append('record', JSON.stringify(stripForUpload(record)))
  body.append('image', imageBlob)
  body.append('thumbnail', thumbnailBlob)

  let nextState: 'uploaded' | 'failed'

  try {
    const response = await deps.fetch('/api/upload', {
      method: 'POST',
      headers: { 'Idempotency-Key': record.recordId },
      body,
    })
    nextState = response.ok ? 'uploaded' : 'failed'
  } catch {
    nextState = 'failed'
  }

  await updateUploadState(deps.db, record.recordId, nextState)
  return { uploadState: nextState }
}

type StrippedRecord = Omit<CaptureRecord, 'uploadState'> & {
  image: Omit<CaptureRecord['image'], 'blobRef' | 'thumbnailBlobRef'>
}

function stripForUpload(record: CaptureRecord): StrippedRecord {
  const {
    image: { blobRef: _blobRef, thumbnailBlobRef: _thumbRef, ...imageRest },
    uploadState: _uploadState,
    ...rest
  } = record
  return { ...rest, image: imageRest }
}
