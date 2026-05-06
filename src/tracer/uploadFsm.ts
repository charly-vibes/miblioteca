import type { CaptureRecord } from './capture'

export type UploadState = CaptureRecord['uploadState']

export type HttpOutcome = 'success' | 'retryable' | 'terminal' | 'network'

export type UploadEvent =
  | { kind: 'pickup' }
  | { kind: 'retry' }
  | { kind: 'response'; outcome: HttpOutcome; attemptCount: number }

export const MAX_UPLOAD_ATTEMPTS = 5

export function classifyStatus(status: number): HttpOutcome {
  if (status === 200) return 'success'
  if (status === 400 || status === 413 || status === 422) return 'terminal'
  if (status === 429 || (status >= 500 && status < 600)) return 'retryable'
  return 'terminal'
}

export function nextUploadState(state: UploadState, event: UploadEvent): UploadState {
  if (state === 'uploaded' || state === 'rejected') return state

  switch (event.kind) {
    case 'pickup':
      return state === 'pending' ? 'uploading' : state
    case 'retry':
      return state === 'failed' ? 'uploading' : state
    case 'response':
      if (state !== 'uploading') return state
      if (event.outcome === 'success') return 'uploaded'
      if (event.outcome === 'terminal') return 'rejected'
      // retryable (429/5xx) and network errors both follow the attempt cap
      return event.attemptCount >= MAX_UPLOAD_ATTEMPTS ? 'rejected' : 'failed'
  }
}
