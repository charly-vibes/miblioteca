import { describe, it, expect } from 'vitest'
import { classifyStatus, nextUploadState, MAX_UPLOAD_ATTEMPTS } from './uploadFsm'
import type { HttpOutcome, UploadEvent } from './uploadFsm'

describe('classifyStatus', () => {
  it('200 → success', () => expect(classifyStatus(200)).toBe('success'))
  it('400 → terminal', () => expect(classifyStatus(400)).toBe('terminal'))
  it('413 → terminal', () => expect(classifyStatus(413)).toBe('terminal'))
  it('422 → terminal', () => expect(classifyStatus(422)).toBe('terminal'))
  it('429 → retryable', () => expect(classifyStatus(429)).toBe('retryable'))
  it('500 → retryable', () => expect(classifyStatus(500)).toBe('retryable'))
  it('502 → retryable', () => expect(classifyStatus(502)).toBe('retryable'))
  it('503 → retryable', () => expect(classifyStatus(503)).toBe('retryable'))
  it('504 → retryable', () => expect(classifyStatus(504)).toBe('retryable'))
  it('401 → terminal (other 4xx)', () => expect(classifyStatus(401)).toBe('terminal'))
  it('403 → terminal (other 4xx)', () => expect(classifyStatus(403)).toBe('terminal'))
  it('404 → terminal (other 4xx)', () => expect(classifyStatus(404)).toBe('terminal'))
})

function response(outcome: HttpOutcome, attemptCount: number): UploadEvent {
  return { kind: 'response', outcome, attemptCount }
}

describe('nextUploadState — pending transitions', () => {
  it('pending + pickup → uploading', () => {
    expect(nextUploadState('pending', { kind: 'pickup' })).toBe('uploading')
  })
  it('pending ignores non-pickup events', () => {
    expect(nextUploadState('pending', response('success', 1))).toBe('pending')
  })
})

describe('nextUploadState — uploading transitions', () => {
  it('uploading + success → uploaded', () => {
    expect(nextUploadState('uploading', response('success', 1))).toBe('uploaded')
  })
  it('uploading + terminal → rejected', () => {
    expect(nextUploadState('uploading', response('terminal', 1))).toBe('rejected')
  })
  it('uploading + retryable under limit → failed', () => {
    expect(nextUploadState('uploading', response('retryable', 1))).toBe('failed')
  })
  it('uploading + network under limit → failed', () => {
    expect(nextUploadState('uploading', response('network', 1))).toBe('failed')
  })
  it('uploading + retryable at attempt 4 → failed', () => {
    expect(nextUploadState('uploading', response('retryable', 4))).toBe('failed')
  })
  it('uploading + retryable at max attempts → rejected', () => {
    expect(nextUploadState('uploading', response('retryable', MAX_UPLOAD_ATTEMPTS))).toBe('rejected')
  })
  it('uploading + network at max attempts → rejected', () => {
    expect(nextUploadState('uploading', response('network', MAX_UPLOAD_ATTEMPTS))).toBe('rejected')
  })
  it('uploading ignores pickup event', () => {
    expect(nextUploadState('uploading', { kind: 'pickup' })).toBe('uploading')
  })
})

describe('nextUploadState — failed transitions', () => {
  it('failed + retry → uploading', () => {
    expect(nextUploadState('failed', { kind: 'retry' })).toBe('uploading')
  })
  it('failed ignores response events', () => {
    expect(nextUploadState('failed', response('success', 2))).toBe('failed')
  })
})

describe('nextUploadState — terminal states', () => {
  it('uploaded + any event → uploaded', () => {
    expect(nextUploadState('uploaded', response('terminal', 1))).toBe('uploaded')
    expect(nextUploadState('uploaded', { kind: 'retry' })).toBe('uploaded')
  })
  it('rejected + any event → rejected', () => {
    expect(nextUploadState('rejected', response('success', 1))).toBe('rejected')
    expect(nextUploadState('rejected', { kind: 'retry' })).toBe('rejected')
  })
})
