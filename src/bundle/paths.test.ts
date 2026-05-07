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
  it('uses scan label and short code with date', () => {
    expect(bundleFilename('My Library', 'abc123', '2026-05-07')).toBe(
      'my-library_abc123_2026-05-07.mbibundle.zip'
    )
  })

  it('falls back to scan ID prefix when no label', () => {
    expect(bundleFilename('', 'abc123', '2026-05-07')).toBe(
      'scan_abc123_2026-05-07.mbibundle.zip'
    )
  })

  it('strips non-filesystem-safe characters from label', () => {
    expect(bundleFilename('Borges / Café (2026)', 'abc123', '2026-05-07')).toBe(
      'borges-cafe-2026_abc123_2026-05-07.mbibundle.zip'
    )
  })
})
