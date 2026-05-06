import type { CaptureRecord } from './capture'
import { updateUploadProgress } from './persistence'
import { classifyStatus, nextUploadState } from './uploadFsm'

export type UploadCaptureDeps = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>
  db: IDBDatabase
}

type UploadResult = {
  uploadState: CaptureRecord['uploadState']
  uploadAttempts: number
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

  const attemptCount = record.uploadAttempts + 1

  // Pickup transition: pending/failed → uploading (done implicitly by uploadCapture)
  const pickupEvent = record.uploadState === 'failed' ? { kind: 'retry' as const } : { kind: 'pickup' as const }
  const uploadingState = nextUploadState(record.uploadState, pickupEvent)

  let outcome: Parameters<typeof nextUploadState>[1] & { kind: 'response' }
  try {
    const response = await deps.fetch('/api/upload', {
      method: 'POST',
      headers: { 'Idempotency-Key': record.recordId },
      body,
    })
    outcome = { kind: 'response', outcome: classifyStatus(response.status), attemptCount }
  } catch {
    outcome = { kind: 'response', outcome: 'network', attemptCount }
  }

  const nextState = nextUploadState(uploadingState, outcome)
  await updateUploadProgress(deps.db, record.recordId, nextState, attemptCount)
  return { uploadState: nextState, uploadAttempts: attemptCount }
}

type StrippedRecord = Omit<CaptureRecord, 'uploadState' | 'uploadAttempts'> & {
  image: Omit<CaptureRecord['image'], 'blobRef' | 'thumbnailBlobRef'>
}

function stripForUpload(record: CaptureRecord): StrippedRecord {
  const {
    image: { blobRef: _blobRef, thumbnailBlobRef: _thumbRef, ...imageRest },
    uploadState: _uploadState,
    uploadAttempts: _uploadAttempts,
    ...rest
  } = record
  return { ...rest, image: imageRest }
}
