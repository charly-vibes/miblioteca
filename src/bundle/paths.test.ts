import { describe, it, expect } from 'vitest'
import {
  recordImagePath,
  recordThumbnailPath,
  recordSidecarPath,
  sessionTracePath,
  sessionPreviewFramePath,
  bundleFilename,
} from './paths'

describe('recordImagePath', () => {
  it('returns deterministic path under images/', () => {
    expect(recordImagePath('session-1', 'rec-abc', 'image/jpeg')).toBe(
      'images/session-1/rec-abc.jpg'
    )
  })

  it('uses png for image/png', () => {
    expect(recordImagePath('session-1', 'rec-abc', 'image/png')).toBe(
      'images/session-1/rec-abc.png'
    )
  })

  it('uses webp for image/webp', () => {
    expect(recordImagePath('session-1', 'rec-abc', 'image/webp')).toBe(
      'images/session-1/rec-abc.webp'
    )
  })
})

describe('recordThumbnailPath', () => {
  it('returns deterministic path under thumbnails/', () => {
    expect(recordThumbnailPath('session-1', 'rec-abc', 'image/jpeg')).toBe(
      'thumbnails/session-1/rec-abc.jpg'
    )
  })
})

describe('recordSidecarPath', () => {
  it('returns deterministic path under records/', () => {
    expect(recordSidecarPath('session-1', 'rec-abc')).toBe(
      'records/session-1/rec-abc.json'
    )
  })
})

describe('sessionTracePath', () => {
  it('returns deterministic path under traces/', () => {
    expect(sessionTracePath('session-1')).toBe('traces/session-1.jsonl')
  })
})

describe('sessionPreviewFramePath', () => {
  it('returns deterministic path under previews/', () => {
    expect(sessionPreviewFramePath('session-1')).toBe('previews/session-1.jsonl')
  })
})

describe('bundleFilename', () => {
  it('includes short code, date, and HH-MM from exportedAt', () => {
    expect(bundleFilename('TB-9170', '2026-05-08T00:09:00.202Z')).toBe(
      'TB-9170_2026-05-08_00-09.mbibundle.zip'
    )
  })

  it('preserves short code casing', () => {
    expect(bundleFilename('ABC123', '2026-05-07T14:30:00.000Z')).toBe(
      'ABC123_2026-05-07_14-30.mbibundle.zip'
    )
  })
})
